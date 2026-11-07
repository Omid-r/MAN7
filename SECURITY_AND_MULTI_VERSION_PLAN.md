# MAN7 security remediation and multi-version migration plan

## Scope and release policy

This branch is a remediation baseline, not a production release. The existing implementation contains dangerous assumptions in generated and checked-in scripts, a privileged shell bridge, and a fixed-version migration design. Do not run the current migration workflow against production systems until every P0/P1 item below is closed and a restore rehearsal has passed.

## Confirmed defects addressed in this branch

- Legacy backup now refuses to invent a replacement `splunk.secret`; it requires the original non-empty key and verifies the resulting archive.
- The checked-in online collector no longer manufactures fake RPM or Splunk TGZ artifacts when downloads fail.
- The checked-in offline deployer refuses to reconstruct a missing SHA-256 manifest, verifies RPM signatures/checksums through RPM tooling, and stops on critical execution failures.
- The fallback from a failed `su` command to `eval` was removed from the checked-in deployer.
- The local TCP shell bridge is no longer started automatically, requires explicit `MAN7_ENABLE_ROOT_SHELL_BRIDGE=true`, and binds to loopback only. The reported connection state no longer starts as connected.


## API authentication and remote execution safeguards

- All `/api/*` routes are private by default. The only unauthenticated API routes are the explicit admin login endpoint and GitHub OAuth bootstrap/callback routes.
- Configure `MAN7_ADMIN_PASSWORD` as a server-side secret of at least 24 characters (generate it with `openssl rand -base64 36`). If it is absent or too short, privileged API access fails closed with HTTP 503. Never expose it through a `VITE_*` variable or commit a real secret.
- Admin login uses an HttpOnly, SameSite=Strict session cookie with a 30-minute lifetime, constant-time password comparison, in-memory session expiry, and a per-IP login attempt limit. Mutating API requests require a same-origin Origin header.
- Use HTTPS in production. The management listener binds to `127.0.0.1` by default for local deployments. On Cloud Run, the server detects `K_SERVICE` and binds to `0.0.0.0` as required by the managed ingress; keep `APP_URL` set to the canonical HTTPS service URL and rely on the platform TLS ingress plus the admin session. For other deployments, expose it only behind a trusted TLS ingress/reverse proxy.
- GitHub OAuth uses a short-lived, browser-bound state cookie to mitigate login CSRF. GitHub credential files are written with owner-only permissions, remain excluded from Git, and access tokens are never returned in API responses.
- The arbitrary TCP-to-`/bin/bash` bridge and the TCP command transport have been removed. Remote execution is intentionally unavailable until authenticated SSH with pinned host keys, a dedicated least-privilege account, narrowly scoped sudo, and auditable command policy are implemented.
- Local terminal execution remains an administrator-only capability behind the private API session. It is still arbitrary shell execution; apply OS-level least privilege and do not run the MAN7 service as root.

### Operational setup

1. Set `MAN7_ADMIN_PASSWORD` to a generated high-entropy secret in the deployment secret manager.
2. For local deployments, keep `MAN7_BIND_HOST=127.0.0.1`. On Cloud Run, the platform-managed `K_SERVICE` detection binds to `0.0.0.0`; keep `APP_URL` set to the canonical HTTPS URL. For other deployments, set `MAN7_BIND_HOST=127.0.0.1` and use a trusted TLS reverse proxy.
3. Open `/login` and authenticate before using the application.
4. Treat the in-memory session as ephemeral; restarting the server invalidates all sessions.
5. Do not enable remote shell compatibility flags. The old TCP bridge is removed, not merely disabled.

## Critical remaining work — release blockers

1. **Implement secure remote execution.** The raw TCP shell bridge has been removed. Remote execution remains unavailable until SSH with pinned host keys, a dedicated least-privilege account, narrowly scoped sudo commands, explicit operator authorization, command audit logs, timeouts, and no arbitrary shell input is implemented.
2. **Protect every privileged API.** Add authenticated operator sessions, CSRF protection where cookie auth is used, request size limits, rate limits, authorization checks, and secure defaults to terminal execution, file upload/deploy, lab reset, GitHub operations, and all state-changing endpoints. Do not expose the app's API on an untrusted interface without this work.
3. **Synchronize generated and checked-in artifacts.** `src/utils/splunkEngine.ts` is the script generator; checked-in `offline-depot/scripts/*.sh` must be byte-for-byte generated from tested profiles or CI must fail on drift. No generated output may contain placeholder packages, fabricated hashes, or silent success fallbacks.
4. **Authenticity, not just integrity.** SHA-256 manifests detect accidental corruption only when the manifest itself is trusted. Sign manifests with a release key; verify signatures using a pinned public key on the offline target. Verify Splunk vendor package signatures/checksums against trusted vendor-published metadata.
5. **Real multi-version catalog.** Replace the hard-coded version chain with a data-driven, reviewed compatibility catalog. Every entry must contain exact version/build, package URL/name, SHA-256, signature metadata, supported OS/architecture, upgrade edges, KV Store transition, CPU features, and app compatibility constraints. Missing metadata means the target is unsupported and must fail closed.
6. **KV Store transitions are version-specific.** Do not run a generic WiredTiger migration command for every target. Splunk 10.6 introduces a cohosted PostgreSQL-backed KV Store; the migration requires a readiness check, supported source state, disk-space validation, and post-migration status verification.
7. **Back up data, not just configuration.** Build role-aware plans for standalone, indexer cluster, search head cluster, cluster manager, deployment server, license manager, heavy forwarder, and universal forwarder. Include index volumes, app state, KV Store, certificates, secrets, ownership, ACLs, extended attributes, and external storage mappings as applicable. Never assume copying `etc/` is a complete migration.
8. **Rollback is not a package downgrade.** Splunk documentation states there is no supported rollback method for an installation upgrade. Recovery must restore a verified, immutable pre-upgrade backup or a parallel target, with tested DNS/VIP/forwarder cutover procedures.
9. **Hardening must be role- and environment-aware.** Firewall openings require source CIDRs and deployment topology; SELinux labels must use vendor-supported policy/types; FIPS changes need an explicit compatibility assessment; systemd changes require validation against the installed Splunk service unit.
10. **Test on real supported OS images.** Use disposable RHEL-compatible VMs and licensed Splunk packages. CI shell syntax and TypeScript tests do not prove migration correctness.

## Multi-version support model

"Multi" means the operator can select a source and target from a curated, validated support matrix. It does not mean any version string or an automatically guessed path is supported.

The currently inspected engine's static catalog ends at 9.4.0 and its scripts hard-code 9.3.2 in places. Therefore this branch does **not** claim 10.x support yet. Add a target only after its exact official upgrade path, package artifact, operating-system matrix, KV Store prerequisites, and app compatibility have been reviewed and tested.

Official Splunk 10.6 guidance currently states:
- 9.4.x can first upgrade to 10.0.x or 10.2.x, then follow the corresponding row.
- 10.0.x can upgrade to 10.2.x, 10.4.x, or 10.6.x.
- 10.2.x can upgrade to 10.4.x or 10.6.x.
- 10.4.x can upgrade to 10.6.x.
- If a source version is absent from the published table, do not infer a direct supported path.
- Splunk 10.6 uses a cohosted KV Store backed by PostgreSQL. Deployments on KV Store 4.2 must first move to version 7.0 or higher before 10.6; deployments on 10.2/10.4 with KV Store 7.0+ are ready for the 10.6 transition, subject to the official readiness steps.
- Splunk 9.4 and later require AVX, SSE4.2, and AES-NI on supported x86-64 systems.

## Validation gates before production

- TypeScript unit tests and coverage for all upgrade-path edges.
- Golden tests for generated scripts for every supported OS, architecture, role, source, target, and package format.
- ShellCheck and shell syntax checks.
- Negative tests: missing/altered archive, missing manifest, invalid signature, wrong build, unsupported CPU, insufficient disk, failed KV Store migration, failed service start, and interrupted transfer.
- Restore rehearsal from backup on a clean target, with event-count/search validation and app/KV Store checks.
- RHEL integration tests for SELinux enforcing, firewalld, systemd, FIPS where applicable, and offline repositories.
- Human-reviewed pull request and release artifact provenance.

## Official references

- [How to upgrade Splunk Enterprise 10.6](https://help.splunk.com/en/splunk-enterprise/administer/install-and-upgrade/10.6/upgrade-or-migrate-splunk-enterprise/how-to-upgrade-splunk-enterprise)
- [Upgrade to a cohosted KV Store](https://help.splunk.com/en/splunk-enterprise/administer/admin-manual/10.6/administer-the-app-key-value-store/upgrade-to-a-cohosted-kv-store)
- [Upgrade the KV Store server version](https://help.splunk.com/en/splunk-enterprise/administer/admin-manual/10.6/administer-the-app-key-value-store/upgrade-the-kv-store-server-version)
- [About upgrading to 10.6 — read first](https://help.splunk.com/en/splunk-enterprise/get-started/install-and-upgrade/10.6/upgrade-or-migrate-splunk-enterprise/about-upgrading-to-10.6-read-this-first)


## Additional containment changes in the follow-up commits

- Removed automatic destructive lab provisioning from server startup. The provisioning routine now requires the explicit `MAN7_ENABLE_DESTRUCTIVE_LAB_PROVISIONING=true` opt-in and is intended only for a disposable isolated VM. This is still a legacy simulator, not a supported production deployment mechanism.
- Mock Splunk listeners bind to `127.0.0.1`, not all interfaces.
- The management server binds to `127.0.0.1` by default. Setting `MAN7_BIND_HOST=0.0.0.0` is an explicit network exposure decision; it does **not** make the API safe to expose. Complete API authentication, authorization, and CSRF controls remain mandatory before any untrusted-network exposure.
- GitHub OAuth/PAT connection no longer triggers an implicit repository push. Repository writes must be initiated explicitly by the operator; the default connection branch is the MAN7 security work branch rather than `main`.
- These changes reduce accidental/destructive behavior but do not close the privileged API authorization release blocker.
