import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

type RemoteTarget = {
  id: string;
  host: string;
  port: number;
  user: string;
  identityFile: string;
  knownHostsFile: string;
};

type PreflightResult = {
  ok: true;
  targetId: string;
  host: string;
  durationMs: number;
  report: Record<string, unknown>;
};

const MAX_OUTPUT_BYTES = 64 * 1024;
const SSH_TIMEOUT_MS = 15_000;
const REMOTE_PREFLIGHT_COMMAND = 'man7-remote-agent preflight';
const activeTargets = new Set<string>();

function parseTargets(): RemoteTarget[] {
  const raw = process.env.MAN7_SSH_TARGETS_JSON;
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('MAN7_SSH_TARGETS_JSON is not valid JSON.');
  }
  if (!Array.isArray(parsed) || parsed.length > 100) {
    throw new Error('MAN7_SSH_TARGETS_JSON must be an array containing at most 100 targets.');
  }

  const ids = new Set<string>();
  return parsed.map((item): RemoteTarget => {
    if (!item || typeof item !== 'object') throw new Error('Invalid SSH target entry.');
    const value = item as Record<string, unknown>;
    const { id, host, user, identityFile, knownHostsFile } = value;
    const port = value.port === undefined ? 22 : Number(value.port);
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id) || ids.has(id)) {
      throw new Error('SSH target IDs must be unique and use only letters, numbers, underscore, or hyphen.');
    }
    if (typeof host !== 'string' || host.length > 253 ||
        !/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/.test(host)) {
      throw new Error(`SSH target ${id} has an invalid DNS hostname.`);
    }
    if (user !== 'man7-remote') {
      throw new Error(`SSH target ${id} must use the dedicated man7-remote account.`);
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`SSH target ${id} has an invalid port.`);
    }
    for (const [label, file] of [['identityFile', identityFile], ['knownHostsFile', knownHostsFile]] as const) {
      if (typeof file !== 'string' || !path.isAbsolute(file) || /[\\0\\r\\n]/.test(file) ||
          (label === 'knownHostsFile' && file.includes(','))) {
        throw new Error(`SSH target ${id} requires an absolute ${label} path.`);
      }
    }
    ids.add(id);
    return { id, host, user, port, identityFile: identityFile as string, knownHostsFile: knownHostsFile as string };
  });
}

function assertProtectedFile(filePath: string, label: string, privateKey: boolean): void {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular, non-symlink file.`);
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new Error(`${label} must be owned by the MAN7 service account.`);
  }
  const mode = stat.mode & 0o777;
  if (privateKey ? (mode & 0o077) !== 0 : (mode & 0o022) !== 0) {
    throw new Error(privateKey
      ? `${label} permissions are too broad; use chmod 600.`
      : `${label} must not be group/world writable.`);
  }
}

function assertExactHostPin(target: RemoteTarget): void {
  const expected = target.port === 22 ? target.host : `[${target.host}]:${target.port}`;
  const lines = fs.readFileSync(target.knownHostsFile, 'utf8').split(/\r?\n/);
  const exactMatch = lines.some((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return false;
    const fields = trimmed.split(/\s+/);
    if (fields.length < 3 || fields[0].startsWith('@')) return false;
    const names = fields[0].split(',');
    if (names.some((name) => name.includes('*') || name.includes('?') || name.startsWith('|'))) {
      throw new Error('known_hosts must use exact, unhashed host entries without wildcards.');
    }
    return names.includes(expected);
  });
  if (!exactMatch) throw new Error(`known_hosts has no exact pinned key entry for ${expected}.`);
}

function appendAudit(entry: Record<string, unknown>): void {
  const auditPath = process.env.MAN7_SSH_AUDIT_LOG;
  if (!auditPath || !path.isAbsolute(auditPath)) {
    throw new Error('MAN7_SSH_AUDIT_LOG must be configured as an absolute path.');
  }
  const parent = path.dirname(auditPath);
  const parentStat = fs.lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() ||
      (typeof process.getuid === 'function' && parentStat.uid !== process.getuid()) ||
      ((parentStat.mode & 0o022) !== 0)) {
    throw new Error('SSH audit log directory must exist and must not be group/world writable.');
  }
  if (fs.existsSync(auditPath)) {
    const existing = fs.lstatSync(auditPath);
    if (!existing.isFile() || existing.isSymbolicLink() ||
        (typeof process.getuid === 'function' && existing.uid !== process.getuid()) ||
        (existing.mode & 0o077) !== 0) {
      throw new Error('SSH audit log must be a regular file with mode 600 or stricter.');
    }
  }
  fs.appendFileSync(auditPath, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(auditPath, 0o600);
}

function runPreflight(target: RemoteTarget): Promise<{ report: Record<string, unknown>; exitCode: number; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const args = [
      '-F', '/dev/null',
      '-T',
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=yes',
      '-o', `UserKnownHostsFile=${target.knownHostsFile}`,
      '-o', 'GlobalKnownHostsFile=/dev/null',
      '-o', 'IdentitiesOnly=yes',
      '-o', 'PasswordAuthentication=no',
      '-o', 'KbdInteractiveAuthentication=no',
      '-o', 'PubkeyAuthentication=yes',
      '-o', 'ClearAllForwardings=yes',
      '-o', 'ForwardAgent=no',
      '-o', 'PermitLocalCommand=no',
      '-o', 'ProxyCommand=none',
      '-o', 'ProxyJump=none',
      '-o', 'ControlMaster=no',
      '-o', 'ControlPath=none',
      '-o', 'ControlPersist=no',
      '-o', 'HostbasedAuthentication=no',
      '-o', 'GSSAPIAuthentication=no',
      '-o', 'UpdateHostKeys=no',
      '-o', 'VerifyHostKeyDNS=no',
      '-o', 'ConnectTimeout=8',
      '-o', 'ConnectionAttempts=1',
      '-p', String(target.port),
      '-i', target.identityFile,
      `${target.user}@${target.host}`,
      REMOTE_PREFLIGHT_COMMAND,
    ];
    const child = spawn('/usr/bin/ssh', args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin' } });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;
    const finish = (error?: Error, value?: { report: Record<string, unknown>; exitCode: number; durationMs: number }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value!);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('SSH preflight timed out.'));
    }, SSH_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        finish(new Error('SSH preflight output exceeded the configured limit.'));
        return;
      }
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4096) stderr += chunk.toString('utf8').slice(0, 4096 - stderr.length);
    });
    child.on('error', (error) => finish(error));
    child.on('close', (code) => {
      const durationMs = Date.now() - startedAt;
      if (code !== 0) {
        finish(new Error(`SSH preflight failed (exit ${code ?? 'unknown'}): ${stderr.trim().slice(0, 1000)}`));
        return;
      }
      try {
        const parsed: unknown = JSON.parse(stdout);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Remote agent response must be a JSON object.');
        }
        const report = parsed as Record<string, unknown>;
        if (report.ok !== true || report.schemaVersion !== 1) {
          throw new Error('Remote agent returned an unsupported or unsuccessful preflight report.');
        }
        finish(undefined, { report, exitCode: 0, durationMs });
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Invalid remote preflight response.'));
      }
    });
  });
}

export function createRemoteExecutionRouter(): express.Router {
  const router = express.Router();

  router.post('/preflight', express.json({ limit: '4kb' }), async (req, res) => {
    const targetId = req.body?.targetId;
    if (typeof targetId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(targetId)) {
      res.status(400).json({ error: 'targetId is required.' });
      return;
    }

    let target: RemoteTarget | undefined;
    let lockAcquired = false;
    const startedAt = Date.now();
    try {
      const targets = parseTargets();
      target = targets.find((candidate) => candidate.id === targetId);
      if (!target) {
        res.status(404).json({ error: 'SSH target is not present in the server-side allowlist.' });
        return;
      }
      if (activeTargets.has(target.id)) {
        res.status(409).json({ error: 'A preflight is already running for this target.' });
        return;
      }
      activeTargets.add(target.id);
      lockAcquired = true;
      if (process.getuid && process.getuid() === 0) {
        throw new Error('MAN7 must run as a dedicated non-root service account.');
      }
      assertProtectedFile(target.identityFile, 'SSH private key', true);
      assertProtectedFile(target.knownHostsFile, 'SSH known_hosts file', false);
      assertExactHostPin(target);
      const result = await runPreflight(target);
      const response: PreflightResult = {
        ok: true,
        targetId,
        host: target.host,
        durationMs: result.durationMs,
        report: result.report,
      };
      appendAudit({
        timestamp: new Date().toISOString(),
        action: 'remote.preflight',
        targetId,
        host: target.host,
        success: true,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
      });
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SSH preflight failed.';
      try {
        appendAudit({
          timestamp: new Date().toISOString(),
          action: 'remote.preflight',
          targetId,
          host: target?.host || null,
          success: false,
          durationMs: Date.now() - startedAt,
          error: message.slice(0, 1000),
        });
      } catch (auditError) {
        res.status(503).json({ error: message, auditError: auditError instanceof Error ? auditError.message : 'Audit logging failed.' });
        return;
      }
      res.status(502).json({ error: message });
    } finally {
      if (target && lockAcquired) activeTargets.delete(target.id);
    }
  });

  return router;
}
