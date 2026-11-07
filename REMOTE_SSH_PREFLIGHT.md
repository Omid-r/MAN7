# MAN7 SSH remote preflight (phase 1)

This phase adds a narrowly scoped, read-only SSH preflight. It does **not** enable arbitrary remote commands, file transfer, sudo, package installation, Splunk upgrades, or rollback.

## Security model

- MAN7 accepts only a server-side target ID. Hosts, ports, usernames, private-key paths, and `known_hosts` paths are never accepted from the browser.
- `MAN7_SSH_TARGETS_JSON` is configured in the server secret/environment configuration.
- The SSH client runs with `shell: false`, an empty SSH config (`-F /dev/null`), password authentication disabled, agent forwarding disabled, all forwarding disabled, and strict host-key checking.
- A private key must be a regular non-symlink file owned by the MAN7 service account with mode `0600` or stricter.
- The target's `known_hosts` file must be a regular non-symlink file owned by the MAN7 service account and not group/world writable. Unknown or changed host keys fail closed.
- MAN7 refuses this operation when its own process is running as root.
- Every preflight attempt is written to the configured JSONL audit log. The log directory must already exist, be owned by the MAN7 service account, and not be group/world writable; the log file is enforced as mode `0600`.
- The remote account is fixed as `man7-remote`; it must not be root and the agent has no sudo requirement.

## Server configuration

Create a dedicated OS account for MAN7 itself and run the Node service as that non-root account. Install OpenSSH client (`ssh`) on the MAN7 host.

Create a private key and pinned host-key file owned by the MAN7 service account. Do not populate `known_hosts` using an unauthenticated first connection. Obtain the target host key fingerprint from a trusted out-of-band source, verify it with the infrastructure owner, then add the verified key to the file using the exact target hostname (or `[hostname]:port` for non-default ports). The current implementation deliberately rejects wildcard and hashed host entries so each configured target has an explicit, exact pin. A changed key must trigger investigation, not automatic replacement.

Example server-side environment (replace every example value):

```bash
MAN7_SSH_TARGETS_JSON='[
  {
    "id": "splunk-prod-indexer-01",
    "host": "splunk-indexer-01.example.internal",
    "port": 22,
    "user": "man7-remote",
    "identityFile": "/etc/man7/ssh/id_ed25519",
    "knownHostsFile": "/etc/man7/ssh/known_hosts"
  }
]'
MAN7_SSH_AUDIT_LOG=/var/log/man7/ssh-audit.jsonl
```

The parent directory `/var/log/man7` and `/etc/man7/ssh` must already exist and be owned by the MAN7 service account. Protect the private key with `chmod 600`. Keep this configuration out of source control and never use a `VITE_` variable.

The API endpoint is:

```http
POST /api/remote/preflight
Content-Type: application/json

{"targetId":"splunk-prod-indexer-01"}
```

It requires the existing authenticated MAN7 administrator session. A browser cannot provide or override target connection details.

## Target-side forced command

Create the dedicated `man7-remote` account on the target. Install `remote-agent/man7-remote-agent` as `/usr/local/libexec/man7-remote-agent`, owned by root and not writable by `man7-remote`:

```bash
sudo install -o root -g root -m 0755 remote-agent/man7-remote-agent /usr/local/libexec/man7-remote-agent
```

Create `/home/man7-remote/.ssh/authorized_keys` owned by `man7-remote`, mode `0600`. Prefix the MAN7 public key with a forced command and restrictions:

```text
restrict,command="/usr/local/libexec/man7-remote-agent" ssh-ed25519 AAAA... man7-controller
```

The target agent accepts only the exact original SSH command `man7-remote-agent preflight`; every other command is rejected. The forced command overrides any client-supplied command. The agent checks that it is running as the non-root `man7-remote` account and only reads basic OS, CPU, memory, disk, Splunk version-file, and systemd service-state information. It does not invoke a shell, use sudo, or modify the target.

Ensure the account's shell permits the forced command to run, but do not grant interactive shell access or sudo. Review the account's SSHD policy and test restrictions in a disposable VM before adding production hosts.

## Response and limitations

A successful response requires the target agent to return JSON with `ok: true` and `schemaVersion: 1`. The output is capped at 64 KiB and the SSH operation has a 15-second timeout. KV Store health is deliberately reported as `not_checked`; this preflight is not a Splunk readiness or migration approval.

This is an initial transport/security boundary, not a production remote migration engine. Before adding uploads or mutation:
1. design a signed, content-addressed transfer protocol and verify signatures on the target;
2. define a root-owned, narrowly scoped privileged helper with typed operations (never arbitrary shell strings);
3. require explicit operator confirmation for each destructive stage;
4. add immutable per-stage audit records, cancellation semantics, and bounded retries;
5. implement backup/restore rehearsal and integration tests on supported RHEL-compatible VMs.
