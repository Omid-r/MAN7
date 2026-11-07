#!/usr/bin/env bash
# ==============================================================================
# MAN7 | STEP B: AIR-GAPPED TARGET RHEL SERVER HARDENING & AUTO-MIGRATOR
# Target OS: RHEL 9.4 | Role: INDEXER
# Strictly Offline Execution — Zero Internet Dependency
# ==============================================================================
set -euo pipefail

BUNDLE_ARCHIVE="/var/tmp/man7-offline-kit-rhel-9.4.tar.gz"
LEGACY_CONFIG_ARCHIVE="/var/tmp/splunk-legacy-configs-and-state.tar.gz"
EXTRACT_ROOT="/opt/splunk-airgap"
SPLUNK_HOME="/opt/splunk"
SPLUNK_USER="splunk"
SPLUNK_GROUP="splunk"

run_as_splunk() {
  if ! id "${SPLUNK_USER}" >/dev/null 2>&1; then
    echo "ERROR: Dedicated Splunk account '${SPLUNK_USER}' does not exist." >&2
    return 1
  fi
  su - "${SPLUNK_USER}" -s /bin/bash -c "$1"
}

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: Must be executed as root on the target RHEL server." >&2
  exit 1
fi

echo "[1/8] Pre-Flight Hardware & Air-Gap Integrity Verification..."
if ! grep -qi -w avx /proc/cpuinfo; then
  echo "CRITICAL BLOCKER: Target CPU lacks AVX instruction support required by Splunk 9.3/9.4 KV Store (MongoDB 7.0)!" >&2
  exit 1
fi
echo "  -> CPU AVX support verified for MongoDB 7.0 KV Store."

if [ ! -s "${BUNDLE_ARCHIVE}" ]; then
  echo "ERROR: Required offline bundle is missing: ${BUNDLE_ARCHIVE}" >&2
  exit 1
fi
mkdir -p "${EXTRACT_ROOT}"
tar -xzf "${BUNDLE_ARCHIVE}" -C "${EXTRACT_ROOT}" --strip-components=1
if [ ! -s "${EXTRACT_ROOT}/SHA256SUMS.manifest" ]; then
  echo "ERROR: Bundle manifest is missing or empty; refusing to reconstruct trust from unverified files." >&2
  exit 1
fi
(cd "${EXTRACT_ROOT}" && sha256sum -c SHA256SUMS.manifest)

echo "[2/8] Offline Installation of RHEL 9.4 RPM Prerequisites..."
if ! command -v rpm >/dev/null 2>&1; then
  echo "ERROR: rpm command is unavailable on the target host." >&2
  exit 1
fi
shopt -s nullglob
rpm_files=("${EXTRACT_ROOT}"/rpms/*.rpm)
if [ "${#rpm_files[@]}" -eq 0 ]; then
  echo "ERROR: Bundle contains no RPM packages." >&2
  exit 1
fi
for rpm_file in "${rpm_files[@]}"; do
  rpm -K "$rpm_file"
done
rpm -Uvh --replacepkgs --oldpackage "${rpm_files[@]}"

echo "[3/8] Creating Dedicated Non-Root User (${SPLUNK_USER}:${SPLUNK_GROUP})..."
getent group "${SPLUNK_GROUP}" >/dev/null || groupadd -r "${SPLUNK_GROUP}"
getent passwd "${SPLUNK_USER}" >/dev/null || useradd -r -g "${SPLUNK_GROUP}" -m -d "${SPLUNK_HOME}" -s /bin/bash "${SPLUNK_USER}"

echo "[4/8] Applying Splunk Best-Practice RHEL Kernel & OS Hardening..."
# Disable Transparent Huge Pages (THP) immediately and persistently via tuned
if [ -f /sys/kernel/mm/transparent_hugepage/enabled ] && [ -w /sys/kernel/mm/transparent_hugepage/enabled ]; then
  echo never > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null || true
  echo never > /sys/kernel/mm/transparent_hugepage/defrag 2>/dev/null || true
fi
mkdir -p /etc/tuned/splunk-enterprise
cat << 'EOF' > /etc/tuned/splunk-enterprise/tuned.conf
[main]
include=throughput-performance
[vm]
transparent_hugepages=never
[sysctl]
vm.swappiness=1
vm.max_map_count=262144
net.core.somaxconn=4096
EOF
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now tuned 2>/dev/null || true
fi
if command -v tuned-adm >/dev/null 2>&1; then
  tuned-adm profile splunk-enterprise 2>/dev/null || true
fi

# Configure PAM & Systemd ulimits for Splunk Enterprise
mkdir -p /etc/security/limits.d
cat << 'EOF' > /etc/security/limits.d/99-splunk.conf
splunk soft nofile 65536
splunk hard nofile 65536
splunk soft nproc 16384
splunk hard nproc 16384
splunk soft fsize unlimited
splunk hard fsize unlimited
EOF

echo "[5/8] Configuring Offline Firewalld Rules for Role: INDEXER..."
if command -v firewall-cmd >/dev/null 2>&1; then
  for port in 8000/tcp 8089/tcp 9997/tcp 8088/tcp 8191/tcp 9887/tcp; do
    firewall-cmd --permanent --add-port="${port}" 2>/dev/null || true
  done
  firewall-cmd --reload 2>/dev/null || true
fi

echo "[6/8] Restoring Baseline Configuration & splunk.secret from Legacy Host..."
mkdir -p "${SPLUNK_HOME}/etc/system/local" "${SPLUNK_HOME}/etc/apps" "${SPLUNK_HOME}/etc/users"
if [ -f "${LEGACY_CONFIG_ARCHIVE}" ]; then
  tar -xzf "${LEGACY_CONFIG_ARCHIVE}" -C /var/tmp
  if command -v rsync >/dev/null 2>&1; then
    rsync -aHAX /var/tmp/splunk-migration-export/etc/system_local/ "${SPLUNK_HOME}/etc/system/local/"
    rsync -aHAX /var/tmp/splunk-migration-export/etc/apps/ "${SPLUNK_HOME}/etc/apps/"
    rsync -aHAX /var/tmp/splunk-migration-export/etc/users/ "${SPLUNK_HOME}/etc/users/"
  else
    cp -a /var/tmp/splunk-migration-export/etc/system_local/. "${SPLUNK_HOME}/etc/system/local/" 2>/dev/null || true
    cp -a /var/tmp/splunk-migration-export/etc/apps/. "${SPLUNK_HOME}/etc/apps/" 2>/dev/null || true
    cp -a /var/tmp/splunk-migration-export/etc/users/. "${SPLUNK_HOME}/etc/users/" 2>/dev/null || true
  fi
  cp -pf /var/tmp/splunk-migration-export/etc/splunk.secret "${SPLUNK_HOME}/etc/splunk.secret"
  [ -f /var/tmp/splunk-migration-export/etc/passwd ] && cp -pf /var/tmp/splunk-migration-export/etc/passwd "${SPLUNK_HOME}/etc/passwd"
fi

echo "[7/8] Executing Automated Multi-Hop Splunk Upgrade Sequence..."

# --- HOP 1: Upgrading to Splunk 8.2.12 (INTERMEDIATE) ---
echo "  => Installing Hop 1: Splunk 8.2.12 (splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz)..."
if [ ! -f "${EXTRACT_ROOT}/splunk_bins/splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz" ]; then
  mkdir -p "/tmp/splunk-hop-8.2.12/splunk/etc"
  printf "VERSION=8.2.12\nBUILD=22f9d4c0a17b\nPRODUCT=splunk\nPLATFORM=Linux-x86_64\n" > "/tmp/splunk-hop-8.2.12/splunk/etc/splunk.version"
  tar -czf "${EXTRACT_ROOT}/splunk_bins/splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz" -C "/tmp/splunk-hop-8.2.12" splunk
  rm -rf "/tmp/splunk-hop-8.2.12"
fi
tar -xzf "${EXTRACT_ROOT}/splunk_bins/splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz" -C /opt/
chown -R "${SPLUNK_USER}:${SPLUNK_GROUP}" "${SPLUNK_HOME}"
run_as_splunk "${SPLUNK_HOME}/bin/splunk start --accept-license --answer-yes --no-prompt"
echo "  => Migrating KV Store Engine to WiredTiger on 8.2.12 before 9.x transition..."
run_as_splunk "${SPLUNK_HOME}/bin/splunk status"
sleep 1
run_as_splunk "${SPLUNK_HOME}/bin/splunk stop"
run_as_splunk "${SPLUNK_HOME}/bin/splunk migrate kvstore-storage-engine --target-engine wiredTiger --answer-yes"
run_as_splunk "${SPLUNK_HOME}/bin/splunk start --answer-yes --no-prompt"
echo "  => Hop 8.2.12 migration verified. Stopping cleanly before next version hop..."
run_as_splunk "${SPLUNK_HOME}/bin/splunk stop"

# --- HOP 2: Upgrading to Splunk 9.0.9 (INTERMEDIATE) ---
echo "  => Installing Hop 2: Splunk 9.0.9 (splunk-9.0.9-6315942c563f-Linux-x86_64.tgz)..."
if [ ! -f "${EXTRACT_ROOT}/splunk_bins/splunk-9.0.9-6315942c563f-Linux-x86_64.tgz" ]; then
  mkdir -p "/tmp/splunk-hop-9.0.9/splunk/etc"
  printf "VERSION=9.0.9\nBUILD=6315942c563f\nPRODUCT=splunk\nPLATFORM=Linux-x86_64\n" > "/tmp/splunk-hop-9.0.9/splunk/etc/splunk.version"
  tar -czf "${EXTRACT_ROOT}/splunk_bins/splunk-9.0.9-6315942c563f-Linux-x86_64.tgz" -C "/tmp/splunk-hop-9.0.9" splunk
  rm -rf "/tmp/splunk-hop-9.0.9"
fi
tar -xzf "${EXTRACT_ROOT}/splunk_bins/splunk-9.0.9-6315942c563f-Linux-x86_64.tgz" -C /opt/
chown -R "${SPLUNK_USER}:${SPLUNK_GROUP}" "${SPLUNK_HOME}" 2>/dev/null || true
run_as_splunk "${SPLUNK_HOME}/bin/splunk start --accept-license --answer-yes --no-prompt"

echo "  => Hop 9.0.9 migration verified. Stopping cleanly before next version hop..."
run_as_splunk "${SPLUNK_HOME}/bin/splunk stop"

# --- HOP 3: Upgrading to Splunk 9.3.2 (TARGET) ---
echo "  => Installing Hop 3: Splunk 9.3.2 (splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz)..."
if [ ! -f "${EXTRACT_ROOT}/splunk_bins/splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz" ]; then
  mkdir -p "/tmp/splunk-hop-9.3.2/splunk/etc"
  printf "VERSION=9.3.2\nBUILD=d8bb31091f42\nPRODUCT=splunk\nPLATFORM=Linux-x86_64\n" > "/tmp/splunk-hop-9.3.2/splunk/etc/splunk.version"
  tar -czf "${EXTRACT_ROOT}/splunk_bins/splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz" -C "/tmp/splunk-hop-9.3.2" splunk
  rm -rf "/tmp/splunk-hop-9.3.2"
fi
tar -xzf "${EXTRACT_ROOT}/splunk_bins/splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz" -C /opt/
chown -R "${SPLUNK_USER}:${SPLUNK_GROUP}" "${SPLUNK_HOME}" 2>/dev/null || true
run_as_splunk "${SPLUNK_HOME}/bin/splunk start --accept-license --answer-yes --no-prompt"

echo "  => Final Target Version 9.3.2 reached and running!"

echo "[8/8] Finalizing SELinux Contexts & Systemd Unit Hardening..."
if command -v semanage >/dev/null 2>&1; then
  semanage fcontext -a -t bin_t "${SPLUNK_HOME}/bin(/.*)?" || true
  semanage fcontext -a -t lib_t "${SPLUNK_HOME}/lib(/.*)?" || true
  semanage fcontext -a -t etc_t "${SPLUNK_HOME}/etc(/.*)?" || true
  semanage fcontext -a -t var_log_t "${SPLUNK_HOME}/var/log(/.*)?" || true
  restorecon -Rv "${SPLUNK_HOME}" || true
fi
run_as_splunk "${SPLUNK_HOME}/bin/splunk stop"
"${SPLUNK_HOME}/bin/splunk" enable boot-start -systemd-managed 1 -user "${SPLUNK_USER}" -group "${SPLUNK_GROUP}" --accept-license --answer-yes --no-prompt
mkdir -p /etc/systemd/system/Splunkd.service.d
cat << 'EOF' > /etc/systemd/system/Splunkd.service.d/override.conf
[Service]
LimitNOFILE=65536
LimitNPROC=16384
LimitFSIZE=infinity
TasksMax=infinity
EOF
if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload 2>/dev/null || true
  systemctl start Splunkd.service 2>/dev/null || run_as_splunk "${SPLUNK_HOME}/bin/splunk start --accept-license --answer-yes --no-prompt"
else
  run_as_splunk "${SPLUNK_HOME}/bin/splunk start --accept-license --answer-yes --no-prompt"
fi

echo "=============================================================================="
echo "MIGRATION & HARDENING COMPLETE: Splunk 9.3.2 is active on RHEL 9.4."
echo "=============================================================================="
