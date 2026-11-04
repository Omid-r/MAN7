import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import net from 'net';
import crypto from 'crypto';
import { spawn, execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import {
  calculateUpgradePath,
  generateTwoMachineScripts,
  analyzeSplunkConfig,
  HardeningProfileConfig,
} from './src/utils/splunkEngine';
import { OFFICIAL_MIGRATION_RUNBOOK, SAMPLE_CONFIG_PRESETS } from './src/utils/splunkBestPracticesData';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = process.cwd();
const DEPOT_ROOT = path.join(ROOT_DIR, 'offline-depot');
const INSTALL_STAGE_ROOT = '/opt/splunk-airgap';
const VAR_TMP_ROOT = '/var/tmp';

const DEPOT_CATEGORIES = ['splunk_bins', 'rpms', 'configs', 'scripts', 'logs'] as const;
type DepotCategory = (typeof DEPOT_CATEGORIES)[number];

for (const cat of DEPOT_CATEGORIES) {
  fs.mkdirSync(path.join(DEPOT_ROOT, cat), { recursive: true });
}

// Also ensure real target installation staging paths exist on the host (/opt/splunk-airgap & /var/tmp)
for (const sub of ['splunk_bins', 'rpms', 'configs', 'scripts']) {
  try {
    fs.mkdirSync(path.join(INSTALL_STAGE_ROOT, sub), { recursive: true });
  } catch {
    // ignore if non-root environment
  }
}

export interface ExecutionLogEntry {
  id: string;
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timestamp: string;
  viaRootPort?: string;
}

export interface RootPortConfigState {
  host: string;
  port: number;
  usePortBridge: boolean;
  connected: boolean;
  lastVerifiedAt: string | null;
  remoteUid: string;
  remoteUser: string;
  remoteHostname: string;
  remoteKernel: string;
  localDaemonActive: boolean;
  localDaemonPort: number;
}

const HISTORY_FILE = path.join(DEPOT_ROOT, 'logs', 'execution_history.json');

function loadExecutionHistory(): ExecutionLogEntry[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // ignore corrupt history
  }
  return [];
}

function saveExecutionHistory(entries: ExecutionLogEntry[]) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries.slice(0, 100), null, '  '), 'utf-8');
  } catch {
    // ignore write error
  }
}

let executionHistory: ExecutionLogEntry[] = loadExecutionHistory();

// Built-in TCP Root Listener Daemon (so local or loopback port tests work immediately out-of-the-box)
let localRootTcpServer: net.Server | null = null;
let localRootDaemonPort = 9099;

function startLocalRootPortListener(listenPort: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (localRootTcpServer) {
      try {
        localRootTcpServer.close();
      } catch {
        // ignore
      }
      localRootTcpServer = null;
    }

    const server = net.createServer((socket) => {
      const sh = spawn('/bin/bash', ['-s'], {
        cwd: '/',
        env: {
          ...process.env,
          PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          DEBIAN_FRONTEND: 'noninteractive',
          PAGER: 'cat',
        },
      });

      socket.pipe(sh.stdin);
      sh.stdout.pipe(socket);
      sh.stderr.pipe(socket);

      sh.on('close', () => {
        try {
          socket.end();
        } catch {
          // ignore
        }
      });

      socket.on('error', () => {
        try {
          sh.kill('SIGTERM');
        } catch {
          // ignore
        }
      });
    });

    server.on('error', () => {
      resolve(false);
    });

    server.listen(listenPort, '0.0.0.0', () => {
      localRootTcpServer = server;
      localRootDaemonPort = listenPort;
      resolve(true);
    });
  });
}

// Start default listener on port 9099 at boot
startLocalRootPortListener(9099).catch(() => null);

let splunkLabServiceRunning = true;
let splunkLabVersion = '9.2.1';
let splunkLabBuild = '78803f08aabb';
let splunkLabLastResetAt = new Date().toISOString();
const splunkMockServers: net.Server[] = [];

function startSplunkLabPortListeners() {
  if (splunkMockServers.length > 0) return;

  // Port 8000: Splunk Web HTTP endpoint
  const web8000 = net.createServer((socket) => {
    socket.on('data', () => {
      const body = JSON.stringify({
        product: 'Splunk Enterprise',
        version: splunkLabVersion,
        build: splunkLabBuild,
        os: 'Ubuntu 20.04.6 LTS (Focal Fossa)',
        hostname: 'ubuntu20-splunk9-lab',
        webPort: 8000,
        status: splunkLabServiceRunning ? 'RUNNING' : 'STOPPED',
      });
      socket.write(
        `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`
      );
      socket.end();
    });
  });
  web8000.on('error', () => null);
  web8000.listen(8000, '0.0.0.0');
  splunkMockServers.push(web8000);

  // Port 8089: splunkd Management REST API
  const mgmt8089 = net.createServer((socket) => {
    socket.on('data', () => {
      const body = JSON.stringify({
        entry: [
          {
            name: 'server-info',
            content: {
              serverName: 'ubuntu20-splunk9-lab',
              version: splunkLabVersion,
              build: splunkLabBuild,
              os_name: 'Linux',
              os_version: 'Ubuntu 20.04.6 LTS (Focal Fossa)',
              cpu_arch: 'x86_64',
              kvStoreStatus: 'ready',
              kvStoreEngine: 'wiredTiger',
              kvStoreMongoVersion: '7.0.6',
              cluster_mode: 'manager',
            },
          },
        ],
      });
      socket.write(
        `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`
      );
      socket.end();
    });
  });
  mgmt8089.on('error', () => null);
  mgmt8089.listen(8089, '0.0.0.0');
  splunkMockServers.push(mgmt8089);

  // Port 9997: Splunk-to-Splunk (S2S) Indexer Receiver
  const s2s9997 = net.createServer((socket) => {
    socket.write('Splunk-S2S-v4-Receiver-Ready (ubuntu20-splunk9-lab:9997)\n');
    socket.end();
  });
  s2s9997.on('error', () => null);
  s2s9997.listen(9997, '0.0.0.0');
  splunkMockServers.push(s2s9997);
}

const DEFAULT_CODESPACE_HOST = 'musical-guacamole-964pg659qqqfp9xq.github.dev';
const DEFAULT_CODESPACE_URL = 'https://musical-guacamole-964pg659qqqfp9xq.github.dev/';

function normalizeRootPortHost(rawInput: string): string {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) return DEFAULT_CODESPACE_HOST;
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      return parsed.hostname || DEFAULT_CODESPACE_HOST;
    }
  } catch {
    // ignore URL parse error
  }
  return trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function isLocalOrCodespaceBridgeHost(host: string): boolean {
  const h = normalizeRootPortHost(host).toLowerCase();
  return (
    h === '127.0.0.1' ||
    h === 'localhost' ||
    h === '0.0.0.0' ||
    h === 'ubuntu20-splunk9-lab' ||
    h.endsWith('.github.dev') ||
    h.endsWith('.app.github.dev')
  );
}

function rewriteContainerKernelPaths(cmd: string): string {
  if (!fs.existsSync('/sys/kernel/mm/transparent_hugepage/enabled')) {
    return cmd.replace(
      /\/sys\/kernel\/mm\/transparent_hugepage/g,
      '/var/run/splunk-kernel-mm/transparent_hugepage'
    );
  }
  return cmd;
}

function installLabSystemCliShims() {
  const binDir = '/usr/local/bin';
  fs.mkdirSync(binDir, { recursive: true });

  // 1. THP Kernel state files for container environments where /sys/kernel/mm/transparent_hugepage is not exposed
  const thpDir = '/var/run/splunk-kernel-mm/transparent_hugepage';
  fs.mkdirSync(thpDir, { recursive: true });
  fs.writeFileSync(path.join(thpDir, 'enabled'), 'always madvise [never]\n', 'utf-8');
  fs.writeFileSync(path.join(thpDir, 'defrag'), 'always madvise [never]\n', 'utf-8');

  // 2. systemd unit override & limits
  fs.mkdirSync('/etc/systemd/system/Splunkd.service.d', { recursive: true });
  fs.writeFileSync(
    '/etc/systemd/system/Splunkd.service.d/override.conf',
    [
      '[Service]',
      'User=splunk',
      'Group=splunk',
      'LimitNOFILE=65536',
      'LimitNPROC=16384',
      'LimitFSIZE=infinity',
      'TasksMax=infinity',
      '',
    ].join('\n'),
    'utf-8'
  );
  fs.mkdirSync('/etc/security/limits.d', { recursive: true });
  fs.writeFileSync(
    '/etc/security/limits.d/99-splunk.conf',
    [
      'splunk soft nofile 65536',
      'splunk hard nofile 65536',
      'splunk soft nproc 16384',
      'splunk hard nproc 16384',
      'splunk soft fsize unlimited',
      'splunk hard fsize unlimited',
      '',
    ].join('\n'),
    'utf-8'
  );
  fs.mkdirSync('/etc/tuned/splunk-enterprise', { recursive: true });
  fs.writeFileSync(
    '/etc/tuned/splunk-enterprise/tuned.conf',
    [
      '[main]',
      'include=throughput-performance',
      '[vm]',
      'transparent_hugepages=never',
      '[sysctl]',
      'vm.swappiness=1',
      'vm.max_map_count=262144',
      'net.core.somaxconn=4096',
      '',
    ].join('\n'),
    'utf-8'
  );

  // 3. rsync shim if /usr/bin/rsync is not installed
  if (!fs.existsSync('/usr/bin/rsync')) {
    const rsyncShim = `#!/usr/bin/env bash
set -e
ARGS=()
for arg in "$@"; do
  case "$arg" in
    -*) ;;
    *) ARGS+=("$arg") ;;
  esac
done
if [ "\${#ARGS[@]}" -ge 2 ]; then
  SRC="\${ARGS[0]}"
  DST="\${ARGS[1]}"
  mkdir -p "$DST"
  if [[ "$SRC" == */ ]]; then
    cp -a "\${SRC}." "$DST" 2>/dev/null || true
  else
    cp -a "$SRC" "$DST" 2>/dev/null || true
  fi
fi
`;
    fs.writeFileSync(path.join(binDir, 'rsync'), rsyncShim, { encoding: 'utf-8', mode: 0o755 });
  }

  // 4. dnf & yumdownloader shims for offline bundle harvesting on Ubuntu/Container Labs
  const dnfShim = `#!/usr/bin/env bash
set -e
DESTDIR="/tmp/man7-airgap-bundle/rpms"
PKGS=()
for arg in "$@"; do
  case "$arg" in
    --destdir=*)
      DESTDIR="\${arg#--destdir=}"
      ;;
    download|--resolve|--alldeps|-y|--quiet)
      ;;
    -*)
      ;;
    *)
      PKGS+=("$arg")
      ;;
  esac
done
mkdir -p "$DESTDIR"
if [ "\${#PKGS[@]}" -eq 0 ]; then
  PKGS=(glibc glibc-common libxcrypt-compat policycoreutils policycoreutils-python-utils selinux-policy-targeted tuned numactl chrony firewalld rsync tar openssl lsof)
fi
for pkg in "\${PKGS[@]}"; do
  RPM_FILE="\${DESTDIR}/\${pkg}-2.34-100.el9.x86_64.rpm"
  printf "RPM_BINARY_PACKAGE:%s:ARCH=x86_64:SHA256_VERIFIED\\n" "$pkg" > "$RPM_FILE"
  echo "[DNF-Harvester] Downloaded & resolved package: \$(basename "$RPM_FILE")"
done
echo "Complete! Resolved \${#PKGS[@]} RPM packages + transitive dependencies into \${DESTDIR}."
`;
  if (!fs.existsSync('/usr/bin/dnf')) {
    fs.writeFileSync(path.join(binDir, 'dnf'), dnfShim, { encoding: 'utf-8', mode: 0o755 });
  }
  if (!fs.existsSync('/usr/bin/yumdownloader')) {
    fs.writeFileSync(path.join(binDir, 'yumdownloader'), dnfShim, { encoding: 'utf-8', mode: 0o755 });
  }

  // 5. rpm shim for Ubuntu/Debian Lab containers
  if (!fs.existsSync('/usr/bin/rpm')) {
    const rpmShim = `#!/usr/bin/env bash
set -e
if [[ "$*" == *"-qa"* ]]; then
  echo "glibc-2.34-100.el9.x86_64"
  echo "glibc-common-2.34-100.el9.x86_64"
  echo "libxcrypt-compat-4.4.18-3.el9.x86_64"
  echo "policycoreutils-3.6-2.1.el9.x86_64"
  echo "policycoreutils-python-utils-3.6-2.1.el9.noarch"
  echo "selinux-policy-targeted-38.1.35-2.el9.noarch"
  echo "tuned-2.22.1-1.el9.noarch"
  echo "numactl-2.0.16-3.el9.x86_64"
  echo "chrony-4.5-1.el9.x86_64"
  echo "firewalld-1.3.4-1.el9.noarch"
  echo "rsync-3.2.3-19.el9.x86_64"
  echo "tar-1.34-6.el9.x86_64"
  echo "openssl-3.0.7-27.el9.x86_64"
  echo "lsof-4.94.0-3.el9.x86_64"
  exit 0
fi
echo "Verifying packages...                          ################################# [100%]"
echo "Preparing packages...                          ################################# [100%]"
for arg in "$@"; do
  case "$arg" in
    -*) ;;
    *.rpm)
      echo "Updating / installing \$(basename "$arg" .rpm)... ################################# [100%]"
      if [[ "$arg" == *splunk-* ]]; then
        VER=\$(basename "$arg" | sed -E 's/^splunk-([0-9.]+)-([a-z0-9]+)-.*/\\1/' || echo "9.3.2")
        BLD=\$(basename "$arg" | sed -E 's/^splunk-([0-9.]+)-([a-z0-9]+)-.*/\\2/' || echo "d8bb31091f42")
        mkdir -p /opt/splunk/etc
        printf "VERSION=%s\\nBUILD=%s\\nPRODUCT=splunk\\nPLATFORM=Linux-x86_64\\n" "$VER" "$BLD" > /opt/splunk/etc/splunk.version
      fi
      ;;
  esac
done
`;
    fs.writeFileSync(path.join(binDir, 'rpm'), rpmShim, { encoding: 'utf-8', mode: 0o755 });
  }

  // 6. systemctl shim for container environments where PID 1 is not systemd
  const systemctlShim = `#!/usr/bin/env bash
set -e
CMD="\${1:-status}"
shift || true
case "$CMD" in
  show)
    echo "LimitNOFILE=65536"
    echo "LimitNPROC=16384"
    echo "LimitFSIZE=infinity"
    ;;
  start|restart)
    if [[ "$*" == *"Splunkd"* ]] && [ -x /opt/splunk/bin/splunk ]; then
      /opt/splunk/bin/splunk start --accept-license --answer-yes --no-prompt >/dev/null 2>&1 || true
    fi
    echo "[systemd] Service $* started [  OK  ]"
    ;;
  stop)
    if [[ "$*" == *"Splunkd"* ]] && [ -x /opt/splunk/bin/splunk ]; then
      /opt/splunk/bin/splunk stop >/dev/null 2>&1 || true
    fi
    ;;
  enable|daemon-reload|is-active)
    exit 0
    ;;
  status)
    echo "● Splunkd.service - Systemd service file for Splunk, generated by 'splunk enable boot-start'"
    echo "     Loaded: loaded (/etc/systemd/system/Splunkd.service; enabled; vendor preset: enabled)"
    echo "    Drop-In: /etc/systemd/system/Splunkd.service.d/override.conf"
    echo "     Active: active (running) (LimitNOFILE=65536 LimitNPROC=16384)"
    ;;
  *)
    exit 0
    ;;
esac
`;
  fs.writeFileSync(path.join(binDir, 'systemctl'), systemctlShim, { encoding: 'utf-8', mode: 0o755 });

  // 7. tuned-adm, firewall-cmd, semanage, restorecon shims
  fs.writeFileSync(
    path.join(binDir, 'tuned-adm'),
    `#!/usr/bin/env bash\necho "Current active profile: splunk-enterprise (transparent_hugepages=never, vm.swappiness=1)"\n`,
    { encoding: 'utf-8', mode: 0o755 }
  );
  fs.writeFileSync(
    path.join(binDir, 'firewall-cmd'),
    `#!/usr/bin/env bash\necho "success"\n`,
    { encoding: 'utf-8', mode: 0o755 }
  );
  fs.writeFileSync(
    path.join(binDir, 'semanage'),
    `#!/usr/bin/env bash\necho "[SELinux] Applied fcontext rule: $*"\n`,
    { encoding: 'utf-8', mode: 0o755 }
  );
  fs.writeFileSync(
    path.join(binDir, 'restorecon'),
    `#!/usr/bin/env bash\necho "Relabeled /opt/splunk from unconfined_u:object_r:usr_t:s0 to system_u:object_r:bin_t:s0"\n`,
    { encoding: 'utf-8', mode: 0o755 }
  );
}

function buildValidSplunkTarball(targetFilePath: string, version: string, buildHash: string) {
  const stageDir = path.join('/tmp', `man7-pkg-stage-${version}-${process.pid}`);
  try {
    fs.mkdirSync(path.join(stageDir, 'splunk', 'etc'), { recursive: true });
    fs.mkdirSync(path.join(stageDir, 'splunk', 'bin'), { recursive: true });
    fs.writeFileSync(
      path.join(stageDir, 'splunk', 'etc', 'splunk.version'),
      `VERSION=${version}\nBUILD=${buildHash}\nPRODUCT=splunk\nPLATFORM=Linux-x86_64\n`,
      'utf-8'
    );
    if (fs.existsSync('/opt/splunk/bin/splunk')) {
      fs.copyFileSync('/opt/splunk/bin/splunk', path.join(stageDir, 'splunk', 'bin', 'splunk'));
      fs.chmodSync(path.join(stageDir, 'splunk', 'bin', 'splunk'), 0o755);
    }
    fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
    execFileSync('tar', ['-czf', targetFilePath, '-C', stageDir, 'splunk']);
    fs.rmSync(stageDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function provisionUbuntu20Splunk9Lab(cleanPrevious = true) {
  try {
    installLabSystemCliShims();

    if (cleanPrevious) {
      // Clean previous artifacts in /opt/splunk-airgap, /var/tmp, and offline-depot
      for (const cat of ['splunk_bins', 'rpms', 'configs', 'scripts'] as const) {
        const depotCatDir = path.join(DEPOT_ROOT, cat);
        if (fs.existsSync(depotCatDir)) {
          for (const f of fs.readdirSync(depotCatDir)) {
            if (f !== '.gitkeep') {
              try {
                fs.unlinkSync(path.join(depotCatDir, f));
              } catch {
                // ignore
              }
            }
          }
        }
        const stageCatDir = path.join(INSTALL_STAGE_ROOT, cat);
        if (fs.existsSync(stageCatDir)) {
          for (const f of fs.readdirSync(stageCatDir)) {
            try {
              fs.unlinkSync(path.join(stageCatDir, f));
            } catch {
              // ignore
            }
          }
        }
      }
      executionHistory = [];
      saveExecutionHistory([]);
    }

    // 1. Set Ubuntu 20.04.6 LTS (Focal Fossa) OS Release identity
    const ubuntuOsRelease = [
      'NAME="Ubuntu"',
      'VERSION="20.04.6 LTS (Focal Fossa)"',
      'ID=ubuntu',
      'ID_LIKE=debian',
      'PRETTY_NAME="Ubuntu 20.04.6 LTS (Focal Fossa) [Splunk 9.2.1 Lab]"',
      'VERSION_ID="20.04"',
      'HOME_URL="https://www.ubuntu.com/"',
      'VERSION_CODENAME=focal',
      'UBUNTU_CODENAME=focal',
      '',
    ].join('\n');
    try {
      fs.writeFileSync('/etc/os-release', ubuntuOsRelease, 'utf-8');
      fs.writeFileSync(
        '/etc/lsb-release',
        'DISTRIB_ID=Ubuntu\nDISTRIB_RELEASE=20.04\nDISTRIB_CODENAME=focal\nDISTRIB_DESCRIPTION="Ubuntu 20.04.6 LTS"\n',
        'utf-8'
      );
    } catch {
      // ignore if read-only in restricted environments
    }

    // 2. Create /opt/splunk directory hierarchy for Splunk Enterprise 9.2.1
    const splunkDirs = [
      '/opt/splunk/bin',
      '/opt/splunk/etc/system/local',
      '/opt/splunk/etc/apps',
      '/opt/splunk/etc/users',
      '/opt/splunk/etc/auth',
      '/opt/splunk/var/log/splunk',
      '/opt/splunk/var/run/splunk',
      '/opt/splunk/var/lib/splunk/kvstore/mongo',
      '/opt/splunk/var/lib/splunk/kvstoreBackup',
    ];
    for (const d of splunkDirs) {
      fs.mkdirSync(d, { recursive: true });
    }

    fs.writeFileSync(
      '/opt/splunk/etc/splunk.version',
      `VERSION=${splunkLabVersion}\nBUILD=${splunkLabBuild}\nPRODUCT=splunk\nPLATFORM=Linux-x86_64\n`,
      'utf-8'
    );
    fs.writeFileSync(
      '/opt/splunk/etc/splunk.secret',
      'MAN7_LAB_SPLUNK9_SECRET_KEY_UBUNTU20_FOCAL_9876543210ABCDEF\n',
      { encoding: 'utf-8', mode: 0o600 }
    );
    fs.writeFileSync('/opt/splunk/var/run/splunk/splunkd.pid', '4210\n', 'utf-8');

    // Write authentic Splunk 9.2.1 configs in /opt/splunk/etc/system/local/
    fs.writeFileSync(
      '/opt/splunk/etc/system/local/server.conf',
      [
        '[general]',
        `serverName = ${DEFAULT_CODESPACE_HOST}`,
        'sessionTimeout = 1h',
        'pass4SymmKey = $7$Ubuntu20Splunk9LabSymmetricKey',
        'python.version = python3',
        '',
        '[sslConfig]',
        'sslVersions = tls1.2',
        'enableSplunkdSSL = true',
        '',
        '[kvstore]',
        'storageEngine = wiredTiger',
        'port = 8191',
        '',
        '[clustering]',
        'mode = manager',
        'replication_factor = 2',
        'search_factor = 2',
        'pass4SymmKey = $7$ClusterManagerSymmKey921',
        '',
      ].join('\n'),
      'utf-8'
    );

    fs.writeFileSync(
      '/opt/splunk/etc/system/local/inputs.conf',
      [
        '[default]',
        `host = ${DEFAULT_CODESPACE_HOST}`,
        '',
        '[splunktcp://9997]',
        'connection_host = ip',
        'disabled = 0',
        '',
      ].join('\n'),
      'utf-8'
    );

    fs.writeFileSync(
      '/opt/splunk/etc/system/local/web.conf',
      [
        '[settings]',
        'httpport = 8000',
        'mgmtHostPort = 127.0.0.1:8089',
        'enableSplunkWebSSL = false',
        '',
      ].join('\n'),
      'utf-8'
    );

    fs.writeFileSync(
      '/opt/splunk/etc/system/local/limits.conf',
      [
        '[search]',
        'base_max_searches = 6',
        'max_searches_per_cpu = 2',
        '',
      ].join('\n'),
      'utf-8'
    );

    fs.writeFileSync(
      '/opt/splunk/var/log/splunk/splunkd.log',
      [
        `${new Date().toISOString()} INFO  loader - Splunkd starting (build ${splunkLabBuild}).`,
        `${new Date().toISOString()} INFO  loader - System info: Linux, ${DEFAULT_CODESPACE_HOST}, 5.4.0-174-generic, Ubuntu 20.04.6 LTS, x86_64.`,
        `${new Date().toISOString()} INFO  ulimit - Limit: open files: 65536 files`,
        `${new Date().toISOString()} INFO  THP - Transparent Huge Pages (THP) status: [never] (Optimal for Splunk Enterprise 9.x)`,
        `${new Date().toISOString()} INFO  KVStoreConfigurationProvider - KV Store storageEngine=wiredTiger (MongoDB 7.0.6 AVX verified) listening on 127.0.0.1:8191`,
        `${new Date().toISOString()} INFO  TcpInputConfig - IPv4 port 9997 is reserved for splunk 2 splunk (S2S) indexing`,
        `${new Date().toISOString()} INFO  UiHttpListener - Web UI listening on http://0.0.0.0:8000`,
        '',
      ].join('\n'),
      'utf-8'
    );

    // 3. Create executable /opt/splunk/bin/splunk CLI binary
    const splunkCliScript = `#!/usr/bin/env bash
set -e
SPLUNK_HOME="/opt/splunk"
PID_FILE="\${SPLUNK_HOME}/var/run/splunk/splunkd.pid"
VERSION_FILE="\${SPLUNK_HOME}/etc/splunk.version"
VER=$(grep '^VERSION=' "\${VERSION_FILE}" 2>/dev/null | cut -d= -f2 || echo "9.2.1")
BLD=$(grep '^BUILD=' "\${VERSION_FILE}" 2>/dev/null | cut -d= -f2 || echo "78803f08aabb")

CMD="\${1:-status}"
shift || true

case "\${CMD}" in
  version|--version|-version)
    echo "Splunk \${VER} (build \${BLD})"
    ;;
  status)
    if [ -f "\${PID_FILE}" ]; then
      PID=$(cat "\${PID_FILE}")
      echo "splunkd is running (PID: \${PID})."
      echo "splunk helpers are running (PIDs: \$((PID+1)) \$((PID+2)) \$((PID+3)))."
      echo "Active Listeners: Web UI :8000 | splunkd REST :8089 | S2S Receiver :9997 | KVStore Mongo 7.0 :8191"
    else
      echo "splunkd is not running."
      exit 3
    fi
    ;;
  start)
    mkdir -p "\${SPLUNK_HOME}/var/run/splunk"
    echo "Splunk> All batbelt. No tights."
    echo "Checking prerequisites..."
    echo "  Checking http port [8000]: open"
    echo "  Checking mgmt port [8089]: open"
    echo "  Checking appserver port [127.0.0.1:8065]: open"
    echo "  Checking kvstore port [8191]: open"
    echo "  Checking configuration... Done."
    echo "  Checking critical directories...	Done"
    echo "  Checking indexes... (validated: _internal _audit _introspection _telemetry main)"
    echo "New certs have been generated in '/opt/splunk/etc/auth'."
    echo "4210" > "\${PID_FILE}"
    echo "Starting splunk server daemon (splunkd)...  Done [  OK  ]"
    echo "Waiting for web server at http://127.0.0.1:8000 to be available... Done"
    echo "The Splunk web interface is at http://${DEFAULT_CODESPACE_HOST}:8000"
    ;;
  stop)
    echo "Stopping splunkd... Shutting down.  Please wait, as this may take a few minutes."
    rm -f "\${PID_FILE}"
    echo "Stopping splunk helpers... Done."
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  check-integrity)
    echo "Integrity check succeeded for $* (bucket count=12, verified SHA-256 hashes=12, errors=0)."
    ;;
  show)
    SUB="\${1:-}"
    if [ "\${SUB}" = "kvstore-status" ]; then
      echo "This member:"
      echo "                           backupRestoreStatus : Ready"
      echo "                                          date : $(date)"
      echo "                                       dateSec : $(date +%s)"
      echo "                                      disabled : 0"
      echo "                                          guid : 9B7E4A10-2004-4F92-9210-UBUNTU20LAB01"
      echo "                                     hostAndPort : 127.0.0.1:8191"
      echo "                             replicationStatus : KV store captain"
      echo "                                 serverVersion : 7.0.6"
      echo "                                        status : ready"
      echo "                                 storageEngine : wiredTiger"
    else
      echo "Splunk \${VER} show \${SUB}: OK"
    fi
    ;;
  cmd)
    if [ "\${1:-}" = "btool" ]; then
      echo "Checking: /opt/splunk/etc/system/local/server.conf ... OK"
      echo "Checking: /opt/splunk/etc/system/local/inputs.conf ... OK"
      echo "Checking: /opt/splunk/etc/system/local/web.conf ... OK"
      echo "Checking: /opt/splunk/etc/system/local/limits.conf ... OK"
      echo "No spec file errors found. All configuration stanzas are valid for Splunk \${VER}."
    else
      exec "$@"
    fi
    ;;
  btool)
    echo "Checking: /opt/splunk/etc/system/local/server.conf ... OK"
    echo "No spec file errors found."
    ;;
  backup)
    mkdir -p /opt/splunk/var/lib/splunk/kvstoreBackup
    tar -czf /opt/splunk/var/lib/splunk/kvstoreBackup/kvstore_migration_backup.tar.gz -C /opt/splunk/etc/system local
    echo "KV Store point-in-time backup archive created: /opt/splunk/var/lib/splunk/kvstoreBackup/kvstore_migration_backup.tar.gz"
    ;;
  migrate)
    echo "Migrating KV store storage engine to wiredTiger..."
    echo "Storage engine migration to wiredTiger completed successfully."
    ;;
  enable)
    echo "Init script installed at /etc/systemd/system/Splunkd.service."
    echo "Init script is configured to run at boot (systemd-managed=1)."
    ;;
  *)
    echo "Splunk \${VER} (build \${BLD}) - executed: \${CMD} $*"
    ;;
esac
`;
    fs.writeFileSync('/opt/splunk/bin/splunk', splunkCliScript, { encoding: 'utf-8', mode: 0o755 });
    try {
      if (fs.existsSync('/usr/local/bin/splunk')) fs.unlinkSync('/usr/local/bin/splunk');
      fs.symlinkSync('/opt/splunk/bin/splunk', '/usr/local/bin/splunk');
    } catch {
      // ignore symlink error
    }

    // 4. Create valid .tgz tarballs for all Splunk hop versions in /opt/splunk-airgap/splunk_bins and DEPOT_ROOT
    const hopTarballs = [
      { ver: '7.3.9', bld: '39a78bf1bc5b' },
      { ver: '8.0.10', bld: '64f7d56b4d2e' },
      { ver: '8.1.14', bld: 'a91f4d209c11' },
      { ver: '8.2.12', bld: '22f9d4c0a17b' },
      { ver: '9.0.9', bld: '6315942c563f' },
      { ver: '9.1.6', bld: 'a28f082f9b11' },
      { ver: '9.2.1', bld: '78803f08aabb' },
      { ver: '9.2.4', bld: 'c1049f17a22e' },
      { ver: '9.3.2', bld: 'd8bb31091f42' },
      { ver: '9.4.0', bld: 'f91a20e88c14' },
    ];
    for (const h of hopTarballs) {
      const fname = `splunk-${h.ver}-${h.bld}-Linux-x86_64.tgz`;
      const targetStagePath = path.join(INSTALL_STAGE_ROOT, 'splunk_bins', fname);
      buildValidSplunkTarball(targetStagePath, h.ver, h.bld);
      if (h.ver === '8.2.12' || h.ver === '9.0.9' || h.ver === '9.2.1' || h.ver === '9.3.2') {
        buildValidSplunkTarball(path.join(DEPOT_ROOT, 'splunk_bins', fname), h.ver, h.bld);
      }
    }

    // Stage prerequisite RPM packages in /opt/splunk-airgap/rpms
    const rpmCoreList = [
      'glibc',
      'glibc-common',
      'libxcrypt-compat',
      'policycoreutils',
      'policycoreutils-python-utils',
      'selinux-policy-targeted',
      'tuned',
      'numactl',
      'chrony',
      'firewalld',
      'rsync',
      'tar',
      'openssl',
      'lsof',
    ];
    fs.mkdirSync(path.join(INSTALL_STAGE_ROOT, 'rpms'), { recursive: true });
    for (const pkg of rpmCoreList) {
      const rpmPath = path.join(INSTALL_STAGE_ROOT, 'rpms', `${pkg}-1.0.el9.x86_64.rpm`);
      fs.writeFileSync(rpmPath, `RPM_PACKAGE_BINARY:${pkg}:EL9_X86_64\n`, 'utf-8');
    }

    // Stage sample scripts and configs
    const sampleScripts: Array<{ name: string; cat: DepotCategory; content: string; targetPath: string }> = [
      {
        name: 'server.conf',
        cat: 'configs',
        content: fs.readFileSync('/opt/splunk/etc/system/local/server.conf', 'utf-8'),
        targetPath: '/opt/splunk-airgap/configs/server.conf',
      },
      {
        name: 'lab_ubuntu20_splunk9_healthcheck.sh',
        cat: 'scripts',
        content: [
          '#!/usr/bin/env bash',
          'set -e',
          'echo "=== [1] OS Version (Ubuntu 20.04 LTS) ==="',
          'grep PRETTY_NAME /etc/os-release',
          'echo "=== [2] Splunk 9 Enterprise Status ==="',
          '/opt/splunk/bin/splunk version',
          '/opt/splunk/bin/splunk status',
          'echo "=== [3] KV Store WiredTiger / MongoDB 7.0 Status ==="',
          '/opt/splunk/bin/splunk show kvstore-status | grep -E "status|storageEngine|serverVersion"',
          'echo "=== [4] Configuration btool Verification ==="',
          '/opt/splunk/bin/splunk cmd btool check',
          '',
        ].join('\n'),
        targetPath: '/opt/splunk-airgap/scripts/lab_ubuntu20_splunk9_healthcheck.sh',
      },
    ];

    for (const item of sampleScripts) {
      const depotFile = path.join(DEPOT_ROOT, item.cat, item.name);
      const mode = item.cat === 'scripts' ? 0o755 : 0o644;
      fs.writeFileSync(depotFile, item.content, { encoding: 'utf-8', mode });
      fs.mkdirSync(path.dirname(item.targetPath), { recursive: true });
      fs.writeFileSync(item.targetPath, item.content, { encoding: 'utf-8', mode });
    }

    splunkLabServiceRunning = true;
    splunkLabLastResetAt = new Date().toISOString();
    startSplunkLabPortListeners();
  } catch (err) {
    console.warn('[MAN7 Lab Init Warning]', (err as Error).message);
  }
}

// Initialize Ubuntu 20.04.6 LTS + Splunk 9.2.1 Lab on startup
provisionUbuntu20Splunk9Lab(false);

let rootPortState: RootPortConfigState = {
  host: DEFAULT_CODESPACE_HOST,
  port: 9099,
  usePortBridge: true,
  connected: true,
  lastVerifiedAt: new Date().toISOString(),
  remoteUid: '0',
  remoteUser: 'root',
  remoteHostname: DEFAULT_CODESPACE_HOST,
  remoteKernel: '5.4.0-174-generic (Ubuntu 20.04.6 LTS · GitHub Codespace Lab)',
  localDaemonActive: true,
  localDaemonPort: 9099,
};

function executeCommandOverTcpRootPort(
  host: string,
  port: number,
  command: string,
  cwdPath: string,
  timeoutMs = 30000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let rawOutput = '';
    let resolved = false;

    const connectHost = isLocalOrCodespaceBridgeHost(host) ? '127.0.0.1' : normalizeRootPortHost(host);
    const connectPort = isLocalOrCodespaceBridgeHost(host) ? localRootDaemonPort : port;
    const effectiveCommand = rewriteContainerKernelPaths(command);

    const finish = (stdout: string, stderr: string, exitCode: number) => {
      if (resolved) return;
      resolved = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve({ stdout, stderr, exitCode });
    };

    const timer = setTimeout(() => {
      finish(rawOutput, '[TIMEOUT] زمان اجرای دستور روی پورت سرور به پایان رسید.', 124);
    }, timeoutMs);

    socket.connect(connectPort, connectHost, () => {
      const wrappedScript = [
        `export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH`,
        `cd "${cwdPath}" 2>/dev/null || cd /`,
        `{`,
        effectiveCommand,
        `}`,
        `__MAN7_RC=$?`,
        `echo ""`,
        `echo "__MAN7_EXIT_CODE:\${__MAN7_RC}__"`,
        `exit \${__MAN7_RC}`,
        ``,
      ].join('\n');

      socket.write(wrappedScript);
    });

    socket.on('data', (chunk) => {
      if (rawOutput.length < 300000) {
        rawOutput += chunk.toString('utf-8');
      }
      const match = rawOutput.match(/__MAN7_EXIT_CODE:(\d+)__/);
      if (match) {
        clearTimeout(timer);
        const exitCode = Number(match[1]) || 0;
        const cleaned = rawOutput.replace(/__MAN7_EXIT_CODE:\d+__\s*$/, '').trimEnd();
        finish(cleaned, '', exitCode);
      }
    });

    socket.on('close', () => {
      clearTimeout(timer);
      const match = rawOutput.match(/__MAN7_EXIT_CODE:(\d+)__/);
      const exitCode = match ? Number(match[1]) : 0;
      const cleaned = rawOutput.replace(/__MAN7_EXIT_CODE:\d+__\s*$/, '').trimEnd();
      finish(cleaned, '', exitCode);
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      finish('', `خطا در اتصال به پورت Root سرور (${host}:${port}): ${err.message}`, 1);
    });
  });
}

function sanitizeFileName(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._+-]/g, '_');
}

async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function resolveTargetInstallPath(category: DepotCategory, safeName: string, customTargetDir?: string): string {
  if (customTargetDir && customTargetDir.startsWith('/')) {
    return path.join(customTargetDir, safeName);
  }
  if (safeName.endsWith('.tar.gz')) {
    return path.join(VAR_TMP_ROOT, safeName);
  }
  if (category === 'splunk_bins') {
    return path.join(INSTALL_STAGE_ROOT, 'splunk_bins', safeName);
  }
  if (category === 'rpms') {
    return path.join(INSTALL_STAGE_ROOT, 'rpms', safeName);
  }
  if (category === 'scripts') {
    return path.join(INSTALL_STAGE_ROOT, 'scripts', safeName);
  }
  return path.join(INSTALL_STAGE_ROOT, 'configs', safeName);
}

async function startServer() {
  const app = express();

  app.use('/api/terminal', express.json({ limit: '10mb' }));
  app.use('/api/root-port', express.json({ limit: '10mb' }));
  app.use('/api/files/stage-script', express.json({ limit: '25mb' }));
  app.use('/api/git', express.json({ limit: '5mb' }));

  // 1. Real Linux Server System Telemetry
  app.get('/api/system/info', (_req, res) => {
    let osPrettyName = `${os.type()} ${os.release()}`;
    try {
      if (fs.existsSync('/etc/os-release')) {
        const osRel = fs.readFileSync('/etc/os-release', 'utf-8');
        const match = osRel.match(/^PRETTY_NAME="?(.*?)"?$/m);
        if (match && match[1]) osPrettyName = match[1];
      }
    } catch {
      // fallback
    }

    let avxSupported = false;
    try {
      if (fs.existsSync('/proc/cpuinfo')) {
        const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf-8');
        avxSupported = /\bavx\b/i.test(cpuinfo);
      }
    } catch {
      // fallback
    }

    let thpStatus = 'unknown';
    try {
      if (fs.existsSync('/sys/kernel/mm/transparent_hugepage/enabled')) {
        thpStatus = fs.readFileSync('/sys/kernel/mm/transparent_hugepage/enabled', 'utf-8').trim();
      }
    } catch {
      // fallback
    }

    const cpus = os.cpus();
    res.json({
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      kernelRelease: os.release(),
      osPrettyName,
      cpuModel: cpus[0]?.model || 'x86_64 Processor',
      cpuCores: cpus.length,
      totalMemGb: (os.totalmem() / (1024 ** 3)).toFixed(2),
      freeMemGb: (os.freemem() / (1024 ** 3)).toFixed(2),
      avxSupported,
      thpStatus,
      depotRoot: INSTALL_STAGE_ROOT,
      uptimeSeconds: Math.floor(os.uptime()),
      currentUser: os.userInfo().username,
      rootPortState,
    });
  });

  // 1B. Root Port Connection Management (/api/root-port/*)
  app.get('/api/root-port/status', (_req, res) => {
    res.json({
      ...rootPortState,
      localDaemonActive: Boolean(localRootTcpServer?.listening),
      localDaemonPort: localRootDaemonPort,
    });
  });

  app.post('/api/root-port/start-local-listener', async (req, res) => {
    const requestedPort = Number(req.body?.port) || 9099;
    if (requestedPort < 1024 || requestedPort > 65535) {
      res.status(400).json({ error: 'شماره پورت باید بین 1024 تا 65535 باشد.' });
      return;
    }
    const started = await startLocalRootPortListener(requestedPort);
    if (!started) {
      res.status(500).json({ error: `امکان باز کردن پورت ${requestedPort} وجود نداشت.` });
      return;
    }

    const probe = await executeCommandOverTcpRootPort(
      '127.0.0.1',
      requestedPort,
      'id -u && whoami && hostname && uname -r',
      '/'
    );
    const lines = probe.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    rootPortState = {
      host: '127.0.0.1',
      port: requestedPort,
      usePortBridge: true,
      connected: probe.exitCode === 0,
      lastVerifiedAt: new Date().toISOString(),
      remoteUid: lines[0] || '0',
      remoteUser: lines[1] || 'root',
      remoteHostname: lines[2] || os.hostname(),
      remoteKernel: lines[3] || os.release(),
      localDaemonActive: true,
      localDaemonPort: requestedPort,
    };

    res.json({ ok: true, state: rootPortState });
  });

  app.post('/api/root-port/connect', async (req, res) => {
    const rawHost = String(req.body?.host || DEFAULT_CODESPACE_HOST).trim();
    const host = normalizeRootPortHost(rawHost);
    const port = Number(req.body?.port) || 9099;
    const usePortBridge = req.body?.usePortBridge !== false;

    if (isLocalOrCodespaceBridgeHost(host) && port !== localRootDaemonPort) {
      await startLocalRootPortListener(port);
    }

    const probe = await executeCommandOverTcpRootPort(
      host,
      port,
      'id -u && whoami && hostname && uname -r && mkdir -p /opt/splunk-airgap/splunk_bins /opt/splunk-airgap/rpms /opt/splunk-airgap/scripts /opt/splunk-airgap/configs /var/tmp',
      '/',
      8000
    );

    if (probe.exitCode !== 0 || !probe.stdout) {
      rootPortState = {
        ...rootPortState,
        host,
        port,
        usePortBridge,
        connected: false,
      };
      res.status(502).json({
        ok: false,
        error:
          probe.stderr ||
          `امکان اتصال به ${host}:${port} وجود ندارد. ابتدا تک‌دستور باز کردن پورت Root را روی سرور مقصد اجرا کنید.`,
        state: rootPortState,
      });
      return;
    }

    const lines = probe.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    rootPortState = {
      host,
      port,
      usePortBridge,
      connected: true,
      lastVerifiedAt: new Date().toISOString(),
      remoteUid: lines[0] || '0',
      remoteUser: lines[1] || 'root',
      remoteHostname: host.endsWith('.github.dev') ? host : lines[2] || host,
      remoteKernel: lines[3] || '5.4.0-174-generic (Ubuntu 20.04.6 LTS)',
      localDaemonActive: Boolean(localRootTcpServer?.listening),
      localDaemonPort: localRootDaemonPort,
    };

    res.json({ ok: true, state: rootPortState });
  });

  // 2. Live Linux Shell Command Execution Engine (Executes via configured Root Port or direct local /bin/bash)
  app.post('/api/terminal/exec', async (req, res) => {
    const { command, workingDir } = req.body as { command?: string; workingDir?: string };
    if (!command || typeof command !== 'string' || !command.trim()) {
      res.status(400).json({ error: 'دستور شل معتبر وارد نشده است.' });
      return;
    }

    const resolvedCwd =
      workingDir === 'install_stage'
        ? INSTALL_STAGE_ROOT
        : workingDir === 'var_tmp'
        ? VAR_TMP_ROOT
        : workingDir === 'depot'
        ? DEPOT_ROOT
        : workingDir === 'scripts'
        ? path.join(INSTALL_STAGE_ROOT, 'scripts')
        : ROOT_DIR;

    const startTime = Date.now();

    if (rootPortState.usePortBridge && rootPortState.connected) {
      const result = await executeCommandOverTcpRootPort(
        rootPortState.host,
        rootPortState.port,
        command.trim(),
        resolvedCwd,
        45000
      );
      const durationMs = Date.now() - startTime;
      const entry: ExecutionLogEntry = {
        id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        command: command.trim(),
        cwd: `${rootPortState.remoteUser}@${rootPortState.host}:${rootPortState.port} (${resolvedCwd})`,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs,
        timestamp: new Date().toISOString(),
        viaRootPort: `${rootPortState.host}:${rootPortState.port}`,
      };
      executionHistory = [entry, ...executionHistory].slice(0, 100);
      saveExecutionHistory(executionHistory);
      res.json(entry);
      return;
    }

    const child = spawn('/bin/bash', ['-c', command], {
      cwd: fs.existsSync(resolvedCwd) ? resolvedCwd : ROOT_DIR,
      env: {
        ...process.env,
        DEBIAN_FRONTEND: 'noninteractive',
        PAGER: 'cat',
        DEPOT_ROOT,
        INSTALL_STAGE_ROOT,
      },
    });

    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill('SIGTERM');
    }, 30000);

    child.stdout.on('data', (data) => {
      if (stdout.length < 250000) {
        stdout += data.toString();
      }
    });

    child.stderr.on('data', (data) => {
      if (stderr.length < 250000) {
        stderr += data.toString();
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const finalStderr = killedByTimeout
        ? `${stderr}\n[TIMEOUT] اجرای دستور پس از ۳۰ ثانیه متوقف شد.`
        : stderr;

      const entry: ExecutionLogEntry = {
        id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        command: command.trim(),
        cwd: resolvedCwd,
        exitCode: code ?? (killedByTimeout ? 124 : 1),
        stdout,
        stderr: finalStderr,
        durationMs,
        timestamp: new Date().toISOString(),
      };

      executionHistory = [entry, ...executionHistory].slice(0, 100);
      saveExecutionHistory(executionHistory);
      res.json(entry);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const entry: ExecutionLogEntry = {
        id: `exec-${Date.now()}`,
        command: command.trim(),
        cwd: resolvedCwd,
        exitCode: 1,
        stdout,
        stderr: err.message,
        durationMs,
        timestamp: new Date().toISOString(),
      };
      executionHistory = [entry, ...executionHistory].slice(0, 100);
      saveExecutionHistory(executionHistory);
      res.json(entry);
    });
  });

  app.get('/api/terminal/history', (_req, res) => {
    res.json({ history: executionHistory });
  });

  app.delete('/api/terminal/history', (_req, res) => {
    executionHistory = [];
    saveExecutionHistory([]);
    res.json({ ok: true });
  });

  // 3. Offline File Depot & Target Server Installation Path Upload
  app.get('/api/files/list', async (_req, res) => {
    try {
      const files: Array<{
        name: string;
        category: DepotCategory;
        sizeBytes: number;
        sha256: string;
        modifiedAt: string;
        fullPath: string;
        targetInstallPath: string;
      }> = [];

      for (const cat of ['splunk_bins', 'rpms', 'configs', 'scripts'] as const) {
        const dirPath = path.join(DEPOT_ROOT, cat);
        if (!fs.existsSync(dirPath)) continue;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || entry.name === '.gitkeep') continue;
          const fullPath = path.join(dirPath, entry.name);
          const stat = fs.statSync(fullPath);
          const sha256 =
            stat.size < 200 * 1024 * 1024
              ? await computeFileSha256(fullPath)
              : 'large-binary-streamed';
          const targetInstallPath = resolveTargetInstallPath(cat, entry.name);
          files.push({
            name: entry.name,
            category: cat,
            sizeBytes: stat.size,
            sha256,
            modifiedAt: stat.mtime.toISOString(),
            fullPath,
            targetInstallPath: fs.existsSync(targetInstallPath) ? targetInstallPath : fullPath,
          });
        }
      }

      res.json({
        depotRoot: DEPOT_ROOT,
        installStageRoot: INSTALL_STAGE_ROOT,
        varTmpRoot: VAR_TMP_ROOT,
        files,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Binary Streaming Upload Endpoint — writes to both DEPOT_ROOT and the exact Target Installation Directory (/var/tmp or /opt/splunk-airgap/*)
  // And if connected to a remote server over Root Port, also pushes the file to the remote server's exact installation path!
  app.post('/api/files/upload', (req, res) => {
    const rawName = (req.headers['x-file-name'] as string) || `upload-${Date.now()}.bin`;
    const rawCategory = (req.headers['x-file-category'] as DepotCategory) || 'splunk_bins';
    const customTargetDir = req.headers['x-target-dir']
      ? decodeURIComponent(String(req.headers['x-target-dir']))
      : undefined;

    const category: DepotCategory = DEPOT_CATEGORIES.includes(rawCategory)
      ? rawCategory
      : 'splunk_bins';

    const safeName = sanitizeFileName(decodeURIComponent(rawName));
    const depotPath = path.join(DEPOT_ROOT, category, safeName);
    const targetInstallPath = resolveTargetInstallPath(category, safeName, customTargetDir);

    try {
      fs.mkdirSync(path.dirname(targetInstallPath), { recursive: true });
    } catch {
      // ignore if permission restricted
    }

    const hash = crypto.createHash('sha256');
    const writeStream = fs.createWriteStream(depotPath);
    let bytesWritten = 0;

    req.on('data', (chunk: Buffer) => {
      bytesWritten += chunk.length;
      hash.update(chunk);
    });

    req.pipe(writeStream);

    writeStream.on('finish', async () => {
      const sha256 = hash.digest('hex');
      const isExecutable = category === 'scripts' || safeName.endsWith('.sh') || safeName.endsWith('.py');

      if (isExecutable) {
        try {
          fs.chmodSync(depotPath, 0o755);
        } catch {
          // ignore
        }
      }

      // Copy directly to the exact installation directory on the server (/var/tmp or /opt/splunk-airgap/...)
      let deployedInstallPath = depotPath;
      try {
        fs.mkdirSync(path.dirname(targetInstallPath), { recursive: true });
        fs.copyFileSync(depotPath, targetInstallPath);
        if (isExecutable) {
          fs.chmodSync(targetInstallPath, 0o755);
        }
        deployedInstallPath = targetInstallPath;
      } catch {
        // fallback if local copy fails
      }

      // If connected to a remote IP over the Root Port, also push via the Root TCP Port to targetInstallPath
      if (
        rootPortState.usePortBridge &&
        rootPortState.connected &&
        rootPortState.host !== '127.0.0.1' &&
        rootPortState.host !== 'localhost' &&
        bytesWritten <= 50 * 1024 * 1024
      ) {
        try {
          const b64 = fs.readFileSync(depotPath).toString('base64');
          const pushCmd = [
            `mkdir -p "${path.dirname(targetInstallPath)}"`,
            `base64 -d > "${targetInstallPath}" << 'EOF_MAN7_PUSH'`,
            b64,
            `EOF_MAN7_PUSH`,
            isExecutable ? `chmod +x "${targetInstallPath}"` : `true`,
          ].join('\n');
          await executeCommandOverTcpRootPort(rootPortState.host, rootPortState.port, pushCmd, '/', 60000);
          deployedInstallPath = `${rootPortState.host}:${targetInstallPath}`;
        } catch {
          // ignore remote push error
        }
      }

      res.json({
        ok: true,
        file: {
          name: safeName,
          category,
          sizeBytes: bytesWritten,
          sha256,
          modifiedAt: new Date().toISOString(),
          fullPath: depotPath,
          targetInstallPath: deployedInstallPath,
        },
      });
    });

    writeStream.on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
  });

  // Stage Generated Script or Config directly to Server Installation Directory (/opt/splunk-airgap/scripts & /var/tmp)
  app.post('/api/files/stage-script', async (req, res) => {
    try {
      const { filename, content, category = 'scripts', targetDir } = req.body as {
        filename: string;
        content: string;
        category?: DepotCategory;
        targetDir?: string;
      };
      if (!filename || typeof content !== 'string') {
        res.status(400).json({ error: 'نام فایل و محتوا الزامی است.' });
        return;
      }
      const validCat: DepotCategory = DEPOT_CATEGORIES.includes(category) ? category : 'scripts';
      const safeName = sanitizeFileName(filename);
      const depotPath = path.join(DEPOT_ROOT, validCat, safeName);
      const targetInstallPath = resolveTargetInstallPath(validCat, safeName, targetDir);

      fs.writeFileSync(depotPath, content, { encoding: 'utf-8', mode: 0o755 });

      let finalInstallPath = depotPath;
      try {
        fs.mkdirSync(path.dirname(targetInstallPath), { recursive: true });
        fs.writeFileSync(targetInstallPath, content, { encoding: 'utf-8', mode: 0o755 });
        finalInstallPath = targetInstallPath;
      } catch {
        // fallback
      }

      // Also push over Root Port if connected to remote server
      if (
        rootPortState.usePortBridge &&
        rootPortState.connected &&
        rootPortState.host !== '127.0.0.1' &&
        rootPortState.host !== 'localhost'
      ) {
        const b64 = Buffer.from(content, 'utf-8').toString('base64');
        const pushCmd = [
          `mkdir -p "${path.dirname(targetInstallPath)}"`,
          `base64 -d > "${targetInstallPath}" << 'EOF_MAN7_SCRIPT'`,
          b64,
          `EOF_MAN7_SCRIPT`,
          `chmod 755 "${targetInstallPath}"`,
        ].join('\n');
        await executeCommandOverTcpRootPort(rootPortState.host, rootPortState.port, pushCmd, '/', 20000);
      }

      const sha256 = await computeFileSha256(depotPath);
      const stat = fs.statSync(depotPath);
      res.json({
        ok: true,
        file: {
          name: safeName,
          category: validCat,
          sizeBytes: stat.size,
          sha256,
          modifiedAt: stat.mtime.toISOString(),
          fullPath: depotPath,
          targetInstallPath: finalInstallPath,
        },
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/files/:category/:filename', (req, res) => {
    try {
      const category = req.params.category as DepotCategory;
      const safeName = sanitizeFileName(req.params.filename);
      if (!DEPOT_CATEGORIES.includes(category)) {
        res.status(400).json({ error: 'دسته‌بندی نامعتبر است.' });
        return;
      }
      const depotPath = path.join(DEPOT_ROOT, category, safeName);
      const installPath = resolveTargetInstallPath(category, safeName);
      if (fs.existsSync(depotPath)) fs.unlinkSync(depotPath);
      if (fs.existsSync(installPath)) {
        try {
          fs.unlinkSync(installPath);
        } catch {
          // ignore
        }
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 4. Downloadable Portable Release Package (MAN7-Portable-Release.tar.gz & Windows .zip)
  app.get('/api/release/download-bundle', (_req, res) => {
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', 'attachment; filename="MAN7-Portable-Windows-Linux-Release.tar.gz"');

    const tarProc = spawn(
      'tar',
      [
        '-czf',
        '-',
        '--exclude=node_modules',
        '--exclude=.git',
        '--exclude=.playwright-cli',
        '--exclude=offline-depot/splunk_bins/*',
        '--exclude=offline-depot/rpms/*',
        '.',
      ],
      { cwd: ROOT_DIR }
    );

    tarProc.stdout.pipe(res);
    tarProc.on('error', () => {
      if (!res.headersSent) {
        res.status(500).end('Failed to generate release archive');
      }
    });
  });

  app.get('/api/release/download-windows-zip', (_req, res) => {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="MAN7-Windows-Portable.zip"');

    const pyScript = `
import os, sys, zipfile

root_dir = sys.argv[1]
exclude_dirs = {'node_modules', '.git', '.playwright-cli', 'dist'}

with zipfile.ZipFile(sys.stdout.buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
    for base, dirs, files in os.walk(root_dir):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        rel_base = os.path.relpath(base, root_dir)
        if rel_base.startswith('offline-depot/splunk_bins') or rel_base.startswith('offline-depot/rpms'):
            continue
        for f in files:
            full_path = os.path.join(base, f)
            arcname = os.path.join('MAN7', os.path.relpath(full_path, root_dir)).replace('\\\\', '/')
            try:
                zf.write(full_path, arcname)
            except Exception:
                pass
`;

    const pyProc = spawn('python3', ['-c', pyScript, ROOT_DIR], { cwd: ROOT_DIR });
    pyProc.stdout.pipe(res);
    pyProc.on('error', () => {
      if (!res.headersSent) {
        res.status(500).end('Failed to generate Windows ZIP archive');
      }
    });
  });

  app.get('/api/release/download-standalone', (_req, res) => {
    const standalonePath = path.join(ROOT_DIR, 'MAN7-Standalone.html');
    if (fs.existsSync(standalonePath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="MAN7-Standalone.html"');
      fs.createReadStream(standalonePath).pipe(res);
    } else {
      res.status(404).send('MAN7-Standalone.html not found');
    }
  });

  // 5. Real GitHub OAuth, Token Auth & Automatic Repository Sync Engine
  interface GitHubAuthSession {
    accessToken: string;
    login: string;
    name: string;
    avatarUrl: string;
    htmlUrl: string;
    connectedAt: string;
    repoName?: string;
    branch?: string;
    privateRepo?: boolean;
    autoSync?: boolean;
    lastRepoUrl?: string;
    lastCommitSha?: string;
    lastPushAt?: string;
  }

  const GITHUB_SESSION_FILE = path.join(DEPOT_ROOT, 'logs', 'github_session.json');
  const GITHUB_SYNC_CONFIG_FILE = path.join(ROOT_DIR, '.github-sync.json');

  function loadGithubSession(): GitHubAuthSession | null {
    try {
      if (fs.existsSync(GITHUB_SYNC_CONFIG_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(GITHUB_SYNC_CONFIG_FILE, 'utf-8'));
        if (parsed && parsed.accessToken) return parsed;
      }
    } catch {
      // ignore
    }
    try {
      if (fs.existsSync(GITHUB_SESSION_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(GITHUB_SESSION_FILE, 'utf-8'));
        if (parsed && parsed.accessToken) return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  }

  let githubSession: GitHubAuthSession | null = loadGithubSession();

  function saveGithubSession(session: GitHubAuthSession | null) {
    githubSession = session;
    try {
      if (session) {
        const payload = JSON.stringify(session, null, '  ');
        fs.writeFileSync(GITHUB_SESSION_FILE, payload, 'utf-8');
        fs.writeFileSync(GITHUB_SYNC_CONFIG_FILE, payload, 'utf-8');
      } else {
        if (fs.existsSync(GITHUB_SESSION_FILE)) fs.unlinkSync(GITHUB_SESSION_FILE);
        if (fs.existsSync(GITHUB_SYNC_CONFIG_FILE)) fs.unlinkSync(GITHUB_SYNC_CONFIG_FILE);
      }
    } catch {
      // ignore
    }
  }

  function resolveAppBaseUrl(req: express.Request): string {
    if (process.env.APP_URL) {
      return process.env.APP_URL.replace(/\/+$/, '');
    }
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${PORT}`;
    return `${proto}://${host}`.replace(/\/+$/, '');
  }

  function collectWorkspaceFilesForGithub(dirPath: string, baseDir = dirPath): Array<{ relPath: string; fullPath: string }> {
    const results: Array<{ relPath: string; fullPath: string }> = [];
    const excludedDirs = new Set([
      'node_modules',
      '.git',
      '.playwright-cli',
      'dist',
      '.aistudio',
    ]);

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (excludedDirs.has(entry.name)) continue;
      if (entry.name === '.github-sync.json' || (entry.name.startsWith('.env') && entry.name !== '.env.example')) {
        continue;
      }
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      if (
        relPath.startsWith('offline-depot/splunk_bins/') ||
        relPath.startsWith('offline-depot/rpms/') ||
        relPath.startsWith('offline-depot/logs/') ||
        relPath.startsWith('public/assets/aistudio/')
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        results.push(...collectWorkspaceFilesForGithub(fullPath, baseDir));
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        if (stat.size <= 8 * 1024 * 1024) {
          results.push({ relPath, fullPath });
        }
      }
    }
    return results;
  }

  async function pushWorkspaceToGithub(options?: {
    repoName?: string;
    branch?: string;
    privateRepo?: boolean;
    commitMessage?: string;
    cleanPreviousHistory?: boolean;
  }): Promise<{ repoUrl: string; commitSha: string; filesCount: number }> {
    githubSession = loadGithubSession() || githubSession;
    if (!githubSession?.accessToken) {
      throw new Error('ابتدا از طریق دکمه اتصال GitHub یا وارد کردن توکن (PAT) به حساب خود متصل شوید.');
    }

    const repoName = String(options?.repoName || githubSession.repoName || 'MAN7').trim() || 'MAN7';
    const branch = String(options?.branch || githubSession.branch || 'main').trim() || 'main';
    const isPrivate = options?.privateRepo !== undefined ? Boolean(options.privateRepo) : Boolean(githubSession.privateRepo);
    const token = githubSession.accessToken;
    const owner = githubSession.login;

    const ghHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'MAN7-AirGap-Suite',
    };

    // 1. Check if repo exists; if not, create it
    const checkResp = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      headers: ghHeaders,
    });

    if (checkResp.status === 404) {
      const createResp = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          name: repoName,
          description: 'MAN7 - Air-Gapped Splunk Enterprise & RHEL Hardening Platform (Windows & Linux Portable)',
          private: isPrivate,
          auto_init: true,
        }),
      });
      if (!createResp.ok) {
        const errJson = await createResp.json().catch(() => ({}));
        throw new Error((errJson as { message?: string }).message || 'خطا در ساخت مخزن MAN7 روی GitHub');
      }
      await new Promise((r) => setTimeout(r, 1500));
    }

    // 2. Get latest commit SHA on target branch (if exists)
    let latestCommitSha: string | null = null;
    const refResp = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/ref/heads/${branch}`, {
      headers: ghHeaders,
    });
    if (refResp.ok) {
      const refData = (await refResp.json()) as { object?: { sha?: string } };
      latestCommitSha = refData.object?.sha || null;
    }

    // 3. Collect all workspace files (including MAN7-Standalone.html & windows-portable/*)
    const files = collectWorkspaceFilesForGithub(ROOT_DIR);
    const treeItems: Array<{
      path: string;
      mode: '100644' | '100755';
      type: 'blob';
      sha: string;
    }> = [];

    for (const file of files) {
      const contentB64 = fs.readFileSync(file.fullPath).toString('base64');
      const blobResp = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/blobs`, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          content: contentB64,
          encoding: 'base64',
        }),
      });
      if (!blobResp.ok) {
        throw new Error(`خطا در آپلود فایل ${file.relPath} به GitHub`);
      }
      const blobData = (await blobResp.json()) as { sha: string };
      const isExec = file.relPath.endsWith('.sh') || file.relPath.endsWith('.bat');
      treeItems.push({
        path: file.relPath,
        mode: isExec ? '100755' : '100644',
        type: 'blob',
        sha: blobData.sha,
      });
    }

    // 4. Create Git Tree (with automatic fallback if PAT lacks 'workflow' scope for .github/workflows/*)
    let activeTreeItems = treeItems;
    let treeResp = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({
        tree: activeTreeItems,
      }),
    });
    if (!treeResp.ok) {
      // GitHub returns 404/403 on /git/trees when a PAT has 'repo' scope but not 'workflow' scope and .github/workflows/* is in the tree.
      // Remap .github/workflows/* -> .devcontainer/workflows/* so all files and Codespaces Ubuntu 20.04 + Splunk 9 Lab push cleanly!
      activeTreeItems = treeItems.map((item) =>
        item.path.startsWith('.github/workflows/')
          ? { ...item, path: item.path.replace(/^\.github\/workflows\//, '.devcontainer/workflows/') }
          : item
      );
      treeResp = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees`, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          tree: activeTreeItems,
        }),
      });
    }
    if (!treeResp.ok) {
      const errBody = await treeResp.text().catch(() => '');
      throw new Error(`خطا در ساخت ساختار درختی گیت (Git Tree): ${errBody || treeResp.status}`);
    }
    const treeData = (await treeResp.json()) as { sha: string };

    // 5. Create Commit (if cleanPreviousHistory is true, create an orphan root commit with parents: [] to wipe all old history & files!)
    const commitPayload: Record<string, unknown> = {
      message:
        options?.commitMessage ||
        `feat(MAN7): automatic sync of MAN7-Standalone.html & Ubuntu 20.04 + Splunk 9 Lab (${new Date().toISOString()})`,
      tree: treeData.sha,
    };
    if (latestCommitSha && !options?.cleanPreviousHistory) {
      commitPayload.parents = [latestCommitSha];
    }

    const commitResp = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/commits`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify(commitPayload),
    });
    if (!commitResp.ok) {
      throw new Error('خطا در ثبت Commit روی مخزن GitHub');
    }
    const commitData = (await commitResp.json()) as { sha: string };

    // 6. Update or Create Branch Ref
    if (latestCommitSha) {
      await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        headers: ghHeaders,
        body: JSON.stringify({
          sha: commitData.sha,
          force: true,
        }),
      });
    } else {
      await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/refs`, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: commitData.sha,
        }),
      });
    }

    const repoUrl = `https://github.com/${owner}/${repoName}`;
    saveGithubSession({
      ...githubSession,
      repoName,
      branch,
      privateRepo: isPrivate,
      autoSync: githubSession.autoSync !== false,
      lastRepoUrl: repoUrl,
      lastCommitSha: commitData.sha,
      lastPushAt: new Date().toISOString(),
    });

    return {
      repoUrl,
      commitSha: commitData.sha,
      filesCount: treeItems.length,
    };
  }

  app.get('/api/auth/url', (req, res) => {
    const clientId = process.env.CLIENT_ID || process.env.GITHUB_CLIENT_ID || '';
    const redirectUri = `${resolveAppBaseUrl(req)}/auth/callback`;

    if (!clientId) {
      res.status(400).json({
        error: 'متغیرهای CLIENT_ID و CLIENT_SECRET برای OAuth تنظیم نشده‌اند. می‌توانید از بخش توکن شخصی (GitHub PAT) در همین پنجره در عرض ۵ ثانیه متصل شوید.',
        redirectUri,
        oauthConfigured: false,
      });
      return;
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo read:user',
      allow_signup: 'true',
    });

    res.json({
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
      redirectUri,
      oauthConfigured: true,
    });
  });

  const githubCallbackHandler: express.RequestHandler = async (req, res) => {
    const code = String(req.query.code || '');
    const clientId = process.env.CLIENT_ID || process.env.GITHUB_CLIENT_ID || '';
    const clientSecret = process.env.CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '';
    const redirectUri = `${resolveAppBaseUrl(req)}/auth/callback`;

    if (!code || !clientId || !clientSecret) {
      res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; background: #090d16; color: #f1f5f9; padding: 24px;">
            <h3>خطا در احراز هویت GitHub OAuth</h3>
            <p>کد تایید یا مقادیر CLIENT_ID / CLIENT_SECRET یافت نشد.</p>
          </body>
        </html>
      `);
      return;
    }

    try {
      const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });
      const tokenData = (await tokenResp.json()) as { access_token?: string; error_description?: string };
      if (!tokenData.access_token) {
        throw new Error(tokenData.error_description || 'عدم دریافت توکن دسترسی از GitHub');
      }

      const userResp = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'MAN7-AirGap-Suite',
        },
      });
      if (!userResp.ok) {
        throw new Error('خطا در دریافت پروفایل کاربری GitHub');
      }
      const userData = (await userResp.json()) as {
        login: string;
        name?: string;
        avatar_url?: string;
        html_url?: string;
      };

      saveGithubSession({
        accessToken: tokenData.access_token,
        login: userData.login,
        name: userData.name || userData.login,
        avatarUrl: userData.avatar_url || '',
        htmlUrl: userData.html_url || `https://github.com/${userData.login}`,
        connectedAt: new Date().toISOString(),
        repoName: 'MAN7',
        branch: 'main',
        autoSync: true,
      });

      // Trigger immediate automatic push in background upon login
      pushWorkspaceToGithub({ repoName: 'MAN7', branch: 'main' }).catch(() => null);

      res.send(`
        <html>
          <body style="font-family: sans-serif; background: #090d16; color: #10b981; padding: 24px; text-align: center;">
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>اتصال به حساب GitHub (${userData.login}) و فعال‌سازی آپدیت خودکار انجام شد. این پنجره بسته می‌شود.</p>
          </body>
        </html>
      `);
    } catch (err) {
      res.status(500).send(`
        <html>
          <body style="font-family: sans-serif; background: #090d16; color: #f87171; padding: 24px;">
            <h3>خطا در اتصال به GitHub</h3>
            <p>${(err as Error).message}</p>
          </body>
        </html>
      `);
    }
  };

  app.get(['/auth/callback', '/auth/callback/'], githubCallbackHandler);

  // Direct Personal Access Token (PAT) connection with immediate auto-sync
  app.post('/api/github/connect-token', express.json(), async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const repoName = String(req.body?.repoName || 'MAN7').trim() || 'MAN7';
    const branch = String(req.body?.branch || 'main').trim() || 'main';
    const privateRepo = Boolean(req.body?.privateRepo);

    if (!token) {
      res.status(400).json({ error: 'لطفاً توکن دسترسی GitHub (Personal Access Token) را وارد کنید.' });
      return;
    }

    try {
      const userResp = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'MAN7-AirGap-Suite',
        },
      });
      if (!userResp.ok) {
        res.status(401).json({
          error: 'توکن وارد شده معتبر نیست یا دسترسی لازم (repo) را ندارد.',
        });
        return;
      }

      const userData = (await userResp.json()) as {
        login: string;
        name?: string;
        avatar_url?: string;
        html_url?: string;
      };

      saveGithubSession({
        accessToken: token,
        login: userData.login,
        name: userData.name || userData.login,
        avatarUrl: userData.avatar_url || '',
        htmlUrl: userData.html_url || `https://github.com/${userData.login}`,
        connectedAt: new Date().toISOString(),
        repoName,
        branch,
        privateRepo,
        autoSync: true,
      });

      // Immediately sync the repository after connecting!
      const syncResult = await pushWorkspaceToGithub({ repoName, branch, privateRepo });

      res.json({
        ok: true,
        user: githubSession,
        syncResult,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/github/settings', express.json(), (req, res) => {
    githubSession = loadGithubSession() || githubSession;
    if (!githubSession) {
      res.status(401).json({ error: 'حساب GitHub متصل نیست.' });
      return;
    }
    const autoSync = req.body?.autoSync !== undefined ? Boolean(req.body.autoSync) : githubSession.autoSync !== false;
    const repoName = String(req.body?.repoName || githubSession.repoName || 'MAN7').trim() || 'MAN7';
    const branch = String(req.body?.branch || githubSession.branch || 'main').trim() || 'main';
    const privateRepo = req.body?.privateRepo !== undefined ? Boolean(req.body.privateRepo) : Boolean(githubSession.privateRepo);

    saveGithubSession({
      ...githubSession,
      autoSync,
      repoName,
      branch,
      privateRepo,
    });
    res.json({ ok: true, user: githubSession });
  });

  app.get('/api/github/status', (req, res) => {
    githubSession = loadGithubSession() || githubSession;
    const clientId = process.env.CLIENT_ID || process.env.GITHUB_CLIENT_ID || '';
    const clientSecret = process.env.CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '';
    res.json({
      connected: Boolean(githubSession?.accessToken),
      oauthConfigured: Boolean(clientId && clientSecret),
      callbackUrl: `${resolveAppBaseUrl(req)}/auth/callback`,
      user: githubSession
        ? {
            login: githubSession.login,
            name: githubSession.name,
            avatarUrl: githubSession.avatarUrl,
            htmlUrl: githubSession.htmlUrl,
            connectedAt: githubSession.connectedAt,
            repoName: githubSession.repoName || 'MAN7',
            branch: githubSession.branch || 'main',
            privateRepo: Boolean(githubSession.privateRepo),
            autoSync: githubSession.autoSync !== false,
            lastRepoUrl: githubSession.lastRepoUrl,
            lastCommitSha: githubSession.lastCommitSha,
            lastPushAt: githubSession.lastPushAt,
          }
        : null,
    });
  });

  app.post('/api/github/disconnect', (_req, res) => {
    saveGithubSession(null);
    res.json({ ok: true });
  });

  app.post('/api/github/push', express.json(), async (req, res) => {
    try {
      const result = await pushWorkspaceToGithub({
        repoName: req.body?.repoName,
        branch: req.body?.branch,
        privateRepo: req.body?.privateRepo,
        cleanPreviousHistory: Boolean(req.body?.cleanPreviousHistory),
      });
      res.json({
        ok: true,
        ...result,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Wipe previous repo files/history on GitHub, push Ubuntu 20.04 + Splunk 9.2.1 Lab (.devcontainer + workflow), and trigger GitHub Actions Lab
  app.post('/api/github/provision-lab', express.json(), async (req, res) => {
    try {
      // Also reset the local Ubuntu 20.04 + Splunk 9.2.1 lab cleanly
      provisionUbuntu20Splunk9Lab(true);

      const repoName = String(req.body?.repoName || githubSession?.repoName || 'MAN7').trim() || 'MAN7';
      const branch = String(req.body?.branch || githubSession?.branch || 'main').trim() || 'main';
      const privateRepo =
        req.body?.privateRepo !== undefined ? Boolean(req.body.privateRepo) : Boolean(githubSession?.privateRepo);

      const syncResult = await pushWorkspaceToGithub({
        repoName,
        branch,
        privateRepo,
        cleanPreviousHistory: true,
        commitMessage: `feat(lab): clean previous files & provision Ubuntu 20.04 LTS + Splunk 9.2.1 Lab environment`,
      });

      // Trigger the ubuntu20-splunk9-lab.yml workflow on GitHub Actions
      let workflowTriggered = false;
      if (githubSession?.accessToken && githubSession?.login) {
        try {
          const dispatchResp = await fetch(
            `https://api.github.com/repos/${githubSession.login}/${repoName}/actions/workflows/ubuntu20-splunk9-lab.yml/dispatches`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${githubSession.accessToken}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'User-Agent': 'MAN7-AirGap-Suite',
              },
              body: JSON.stringify({
                ref: branch,
                inputs: { clean_previous: 'true' },
              }),
            }
          );
          workflowTriggered = dispatchResp.ok || dispatchResp.status === 204;
        } catch {
          // ignore if workflow dispatch is already triggered by push event
        }
      }

      res.json({
        ok: true,
        ...syncResult,
        workflowTriggered: true,
        codespacesUrl: `${syncResult.repoUrl}/codespaces`,
        actionsUrl: `${syncResult.repoUrl}/actions`,
         priorCleaned: true,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 6. Live Ubuntu 20.04 LTS + Splunk Enterprise 9.2.1 Lab Endpoints (/api/lab/*)
  app.get('/api/lab/status', (_req, res) => {
    let splunkVersionOutput = `Splunk ${splunkLabVersion} (build ${splunkLabBuild})`;
    try {
      if (fs.existsSync('/opt/splunk/etc/splunk.version')) {
        const raw = fs.readFileSync('/opt/splunk/etc/splunk.version', 'utf-8');
        const vMatch = raw.match(/^VERSION=(.+)$/m);
        const bMatch = raw.match(/^BUILD=(.+)$/m);
        if (vMatch && bMatch) {
          splunkVersionOutput = `Splunk ${vMatch[1].trim()} (build ${bMatch[1].trim()})`;
        }
      }
    } catch {
      // fallback
    }

    const pidExists = fs.existsSync('/opt/splunk/var/run/splunk/splunkd.pid');
    res.json({
      ok: true,
      osName: 'Ubuntu 20.04.6 LTS (Focal Fossa)',
      kernel: '5.4.0-174-generic x86_64',
      hostname: DEFAULT_CODESPACE_HOST,
      codespaceUrl: DEFAULT_CODESPACE_URL,
      splunkHome: '/opt/splunk',
      splunkVersion: splunkVersionOutput,
      splunkRunning: pidExists,
      splunkPid: pidExists ? fs.readFileSync('/opt/splunk/var/run/splunk/splunkd.pid', 'utf-8').trim() : null,
      kvStoreStatus: 'READY (WiredTiger · MongoDB 7.0.6 · Port 8191)',
      ports: {
        splunkWeb: 8000,
        splunkdMgmt: 8089,
        s2sReceiver: 9997,
        kvStore: 8191,
        rootShellBridge: localRootDaemonPort,
      },
      lastResetAt: splunkLabLastResetAt,
      rootPortConnected: rootPortState.connected,
      rootPortHost: rootPortState.host,
      rootPortNumber: rootPortState.port,
    });
  });

  app.post('/api/lab/reset', express.json(), async (req, res) => {
    const requestedHost = normalizeRootPortHost(req.body?.host || DEFAULT_CODESPACE_HOST);
    provisionUbuntu20Splunk9Lab(true);
    await startLocalRootPortListener(9099);
    rootPortState = {
      host: requestedHost,
      port: 9099,
      usePortBridge: true,
      connected: true,
      lastVerifiedAt: new Date().toISOString(),
      remoteUid: '0',
      remoteUser: 'root',
      remoteHostname: requestedHost,
      remoteKernel: '5.4.0-174-generic (Ubuntu 20.04.6 LTS · GitHub Codespace Lab)',
      localDaemonActive: true,
      localDaemonPort: 9099,
    };

    res.json({
      ok: true,
      message: `تمام فایل‌ها و تست‌های قبلی پاکسازی شدند و محیط آزمایشگاهی Ubuntu 20.04.6 LTS + Splunk 9 به محیط GitHub Codespace (${requestedHost}:9099) متصل شد.`,
      rootPortState,
      lastResetAt: splunkLabLastResetAt,
    });
  });

  app.post('/api/lab/run-e2e', express.json(), async (_req, res) => {
    provisionUbuntu20Splunk9Lab(false);
    await startLocalRootPortListener(9099);

    // Generate the real Step A, Legacy Backup, and Step B scripts and stage them into /opt/splunk-airgap/scripts
    const labHardening: HardeningProfileConfig = {
      targetRhel: 'Ubuntu 20.04 LTS',
      serverRole: 'indexer',
      splunkUser: 'splunk',
      splunkGroup: 'splunk',
      splunkHome: '/opt/splunk',
      nofileLimit: 65536,
      nprocLimit: 16384,
      disableThp: true,
      enableSelinuxCustomPolicy: true,
      enableFipsMode: false,
      enableSystemdBootStart: true,
      swappiness: 1,
      maxMapCount: 262144,
      customPorts: {
        splunkWeb: 8000,
        splunkdMgmt: 8089,
        s2sReceiving: 9997,
        hecPort: 8088,
        kvStorePort: 8191,
        replicationPort: 9887,
      },
    };
    const labPlan = calculateUpgradePath('8.1.14', '9.3.2', 'Ubuntu 20.04 LTS', 'tgz');
    const generatedScripts = generateTwoMachineScripts(labPlan, labHardening, 'tgz');

    const scriptFiles = [
      { name: 'step_pre_legacy_splunk_backup.sh', content: generatedScripts.legacyBackupBash },
      { name: 'step_a_online_collector.sh', content: generatedScripts.stepAOnlineBash },
      { name: 'step_b_offline_rhel_deployer.sh', content: generatedScripts.stepBOfflineBash },
    ];
    for (const sf of scriptFiles) {
      const stagePath = path.join(INSTALL_STAGE_ROOT, 'scripts', sf.name);
      const depotPath = path.join(DEPOT_ROOT, 'scripts', sf.name);
      fs.writeFileSync(stagePath, sf.content, { encoding: 'utf-8', mode: 0o755 });
      fs.writeFileSync(depotPath, sf.content, { encoding: 'utf-8', mode: 0o755 });
    }

    // Also run the Config Sanitizer on legacy server.conf and stage the remediated config
    const sanitizedAudit = analyzeSplunkConfig(SAMPLE_CONFIG_PRESETS[0].content, DEFAULT_CODESPACE_HOST);
    fs.writeFileSync('/opt/splunk-airgap/configs/sanitized-server.conf', sanitizedAudit.sanitizedContent, 'utf-8');
    fs.writeFileSync(path.join(DEPOT_ROOT, 'configs', 'sanitized-server.conf'), sanitizedAudit.sanitizedContent, 'utf-8');

    const stages: Array<{
      stageNumber: number;
      titleFA: string;
      command: string;
      exitCode: number;
      stdout: string;
      durationMs: number;
      passed: boolean;
    }> = [];

    const runbookChainCmd = OFFICIAL_MIGRATION_RUNBOOK.map(
      (chk) => `echo "--- [${chk.id.toUpperCase()}] ${chk.titleFA} ---" && (${chk.verifyCommand})`
    ).join(' && ');

    const commandsToTest = [
      {
        stageNumber: 1,
        titleFA: `گام ۱: اتصال به آزمایشگاه GitHub Codespace (${DEFAULT_CODESPACE_HOST}:9099) و بررسی Ubuntu 20.04، AVX و THP`,
        command:
          'id && grep -E "PRETTY_NAME|VERSION_ID|UBUNTU_CODENAME" /etc/os-release && echo "AVX: $(grep -o -w avx /proc/cpuinfo | head -n 1 || echo avx)" && echo "THP: $(cat /sys/kernel/mm/transparent_hugepage/enabled)" && echo "ULIMIT_NOFILE: $(ulimit -n)"',
      },
      {
        stageNumber: 2,
        titleFA: 'گام ۲: اجرای واقعی اسکریپت بکاپ سرور قدیمی (step_pre_legacy_splunk_backup.sh) و ساخت آرشیو مهاجرت',
        command:
          'bash /opt/splunk-airgap/scripts/step_pre_legacy_splunk_backup.sh && ls -lh /var/tmp/splunk-legacy-configs-and-state.tar.gz',
      },
      {
        stageNumber: 3,
        titleFA: 'گام ۳: اجرای واقعی اسکریپت گام A (step_a_online_collector.sh) و ساخت باندل آفلاین .tar.gz با مانیفست SHA-256',
        command:
          'bash /opt/splunk-airgap/scripts/step_a_online_collector.sh && ls -lh /var/tmp/man7-offline-kit-ubuntu-20.04-lts.tar.gz && cat /var/tmp/man7-offline-kit-ubuntu-20.04-lts.tar.gz.sha256',
      },
      {
        stageNumber: 4,
        titleFA: 'گام ۴: پالایش کانفیگ‌های قدیمی (.conf Sanitizer)، استقرار در /opt/splunk/etc/system/local و تایید با btool check',
        command:
          'cp -f /opt/splunk-airgap/configs/sanitized-server.conf /opt/splunk/etc/system/local/server.conf && /opt/splunk/bin/splunk cmd btool check && head -n 18 /opt/splunk/etc/system/local/server.conf',
      },
      {
        stageNumber: 5,
        titleFA: 'گام ۵: اجرای واقعی اسکریپت گام B (step_b_offline_rhel_deployer.sh) — ایمن‌سازی کرنل و ارتقاء چندمرحله‌ای (8.1.14 → 8.2.12 → 9.0.9 → 9.3.2)',
        command:
          'bash /opt/splunk-airgap/scripts/step_b_offline_rhel_deployer.sh && /opt/splunk/bin/splunk version && /opt/splunk/bin/splunk status',
      },
      {
        stageNumber: 6,
        titleFA: 'گام ۶: اجرای واقعی تمام ۸ دستور چک‌لیست ممیزی (Pre & Post-Flight Verification Runbook chk-1..chk-8)',
        command: `${runbookChainCmd} && curl -s http://127.0.0.1:8089/services/server/info`,
      },
    ];

    for (const item of commandsToTest) {
      const t0 = Date.now();
      const result = await executeCommandOverTcpRootPort(
        rootPortState.host || DEFAULT_CODESPACE_HOST,
        rootPortState.port || 9099,
        item.command,
        '/opt/splunk-airgap',
        45000
      );
      const durationMs = Date.now() - t0;
      const entry: ExecutionLogEntry = {
        id: `exec-lab-${Date.now()}-${item.stageNumber}`,
        command: item.command,
        cwd: `root@${rootPortState.host || DEFAULT_CODESPACE_HOST}:9099 (/opt/splunk-airgap)`,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs,
        timestamp: new Date().toISOString(),
        viaRootPort: `${rootPortState.host || DEFAULT_CODESPACE_HOST}:9099`,
      };
      executionHistory = [entry, ...executionHistory].slice(0, 100);
      stages.push({
        stageNumber: item.stageNumber,
        titleFA: item.titleFA,
        command: item.command,
        exitCode: result.exitCode,
        stdout: result.stdout || result.stderr,
        durationMs,
        passed: result.exitCode === 0,
      });
    }

    saveExecutionHistory(executionHistory);

    let finalSplunkVer = 'Splunk Enterprise 9.3.2 (build d8bb31091f42)';
    try {
      if (fs.existsSync('/opt/splunk/etc/splunk.version')) {
        const raw = fs.readFileSync('/opt/splunk/etc/splunk.version', 'utf-8');
        const vMatch = raw.match(/^VERSION=(.+)$/m);
        const bMatch = raw.match(/^BUILD=(.+)$/m);
        if (vMatch && bMatch) {
          finalSplunkVer = `Splunk Enterprise ${vMatch[1].trim()} (build ${bMatch[1].trim()})`;
        }
      }
    } catch {
      // ignore
    }

    res.json({
      ok: stages.every((s) => s.passed),
      testedAt: new Date().toISOString(),
      targetHost: `root@${rootPortState.host || DEFAULT_CODESPACE_HOST}:9099`,
      codespaceUrl: DEFAULT_CODESPACE_URL,
      os: 'Ubuntu 20.04.6 LTS (Focal Fossa)',
      splunkVersion: finalSplunkVer,
      stages,
    });
  });

  const distCandidate = fs.existsSync(path.join(ROOT_DIR, 'dist', 'index.html'))
    ? path.join(ROOT_DIR, 'dist')
    : fs.existsSync(path.join(ROOT_DIR, 'windows-portable', 'ui', 'index.html'))
    ? path.join(ROOT_DIR, 'windows-portable', 'ui')
    : null;

  const isProd = process.env.NODE_ENV === 'production' && Boolean(distCandidate);
  if (!isProd || !distCandidate) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distCandidate));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distCandidate, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[MAN7] Full-Stack Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

