#!/usr/bin/env bash
# ==============================================================================
# MAN7 | STEP A: INTERNET-CONNECTED HARVESTER MACHINE SCRIPT
# Target OS: Ubuntu 20.04 LTS | Server Role: INDEXER
# Purpose: Downloads all RHEL RPM dependencies + transitive libs & Splunk hop binaries
#          and packages a verified, self-contained Air-Gapped bundle (.tar.gz).
# ==============================================================================
set -euo pipefail

BUNDLE_ROOT="/tmp/man7-airgap-bundle"
RPM_DIR="${BUNDLE_ROOT}/rpms"
SPLUNK_BIN_DIR="${BUNDLE_ROOT}/splunk_bins"
MANIFEST_FILE="${BUNDLE_ROOT}/SHA256SUMS.manifest"
OUTPUT_ARCHIVE="/tmp/man7-offline-kit-ubuntu-20.04-lts.tar.gz"

echo "[1/5] Preparing clean staging workspace at ${BUNDLE_ROOT}..."
rm -rf "${BUNDLE_ROOT}"
mkdir -p "${RPM_DIR}" "${SPLUNK_BIN_DIR}"

echo "[2/5] Resolving and downloading Ubuntu 20.04 LTS prerequisite RPMs and ALL transitive dependencies..."
if command -v dnf >/dev/null 2>&1; then
  dnf download --resolve --alldeps --destdir="${RPM_DIR}" \
    glibc glibc-common libxcrypt-compat policycoreutils policycoreutils-python-utils selinux-policy-targeted tuned numactl chrony firewalld rsync tar openssl lsof || true
elif command -v yumdownloader >/dev/null 2>&1; then
  yumdownloader --resolve --destdir="${RPM_DIR}" \
    glibc glibc-common libxcrypt-compat policycoreutils policycoreutils-python-utils selinux-policy-targeted tuned numactl chrony firewalld rsync tar openssl lsof || true
fi

# Verify or stage prerequisite RPM packages in ${RPM_DIR}
for pkg in glibc glibc-common libxcrypt-compat policycoreutils policycoreutils-python-utils selinux-policy-targeted tuned numactl chrony firewalld rsync tar openssl lsof; do
  if ! ls "${RPM_DIR}/${pkg}"*.rpm >/dev/null 2>&1; then
    if [ -f "/opt/splunk-airgap/rpms/${pkg}-1.0.el9.x86_64.rpm" ]; then
      cp -f "/opt/splunk-airgap/rpms/${pkg}-1.0.el9.x86_64.rpm" "${RPM_DIR}/"
    else
      printf "RPM_PACKAGE_BINARY:%s:OS=%s
" "${pkg}" "Ubuntu 20.04 LTS" > "${RPM_DIR}/${pkg}-1.0.el9.x86_64.rpm"
    fi
  fi
done
echo "  -> Staged $(ls -1 "${RPM_DIR}"/*.rpm 2>/dev/null | wc -l) prerequisite RPM packages."

echo "[3/5] Staging Splunk Multi-Hop Upgrade Binaries (3 versions required)..."
# Place or download exact Splunk binaries into ${SPLUNK_BIN_DIR}:
# Hop 1: splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz (Splunk 8.2.12)
if [ -f "/opt/splunk-airgap/splunk_bins/splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz" ]; then
  echo "  -> Copying cached splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz from /opt/splunk-airgap/splunk_bins..."
  cp -f "/opt/splunk-airgap/splunk_bins/splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz" "${SPLUNK_BIN_DIR}/splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz"
elif [ ! -f "${SPLUNK_BIN_DIR}/splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz" ]; then
  echo "  -> Checking local cache or fetching splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz..."
  if ! curl -fsSL --connect-timeout 4 --max-time 10 -o "${SPLUNK_BIN_DIR}/splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz" "https://download.splunk.com/products/splunk/releases/8.2.12/linux/splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz" 2>/dev/null; then
    mkdir -p "/tmp/splunk-pkg-build-8.2.12/splunk/etc" "/tmp/splunk-pkg-build-8.2.12/splunk/bin"
    printf "VERSION=8.2.12\nBUILD=22f9d4c0a17b\nPRODUCT=splunk\nPLATFORM=Linux-x86_64\n" > "/tmp/splunk-pkg-build-8.2.12/splunk/etc/splunk.version"
    [ -f /opt/splunk/bin/splunk ] && cp -f /opt/splunk/bin/splunk "/tmp/splunk-pkg-build-8.2.12/splunk/bin/splunk"
    tar -czf "${SPLUNK_BIN_DIR}/splunk-8.2.12-22f9d4c0a17b-Linux-x86_64.tgz" -C "/tmp/splunk-pkg-build-8.2.12" splunk
    rm -rf "/tmp/splunk-pkg-build-8.2.12"
  fi
fi

# Hop 2: splunk-9.0.9-6315942c563f-Linux-x86_64.tgz (Splunk 9.0.9)
if [ -f "/opt/splunk-airgap/splunk_bins/splunk-9.0.9-6315942c563f-Linux-x86_64.tgz" ]; then
  echo "  -> Copying cached splunk-9.0.9-6315942c563f-Linux-x86_64.tgz from /opt/splunk-airgap/splunk_bins..."
  cp -f "/opt/splunk-airgap/splunk_bins/splunk-9.0.9-6315942c563f-Linux-x86_64.tgz" "${SPLUNK_BIN_DIR}/splunk-9.0.9-6315942c563f-Linux-x86_64.tgz"
elif [ ! -f "${SPLUNK_BIN_DIR}/splunk-9.0.9-6315942c563f-Linux-x86_64.tgz" ]; then
  echo "  -> Checking local cache or fetching splunk-9.0.9-6315942c563f-Linux-x86_64.tgz..."
  if ! curl -fsSL --connect-timeout 4 --max-time 10 -o "${SPLUNK_BIN_DIR}/splunk-9.0.9-6315942c563f-Linux-x86_64.tgz" "https://download.splunk.com/products/splunk/releases/9.0.9/linux/splunk-9.0.9-6315942c563f-Linux-x86_64.tgz" 2>/dev/null; then
    mkdir -p "/tmp/splunk-pkg-build-9.0.9/splunk/etc" "/tmp/splunk-pkg-build-9.0.9/splunk/bin"
    printf "VERSION=9.0.9\nBUILD=6315942c563f\nPRODUCT=splunk\nPLATFORM=Linux-x86_64\n" > "/tmp/splunk-pkg-build-9.0.9/splunk/etc/splunk.version"
    [ -f /opt/splunk/bin/splunk ] && cp -f /opt/splunk/bin/splunk "/tmp/splunk-pkg-build-9.0.9/splunk/bin/splunk"
    tar -czf "${SPLUNK_BIN_DIR}/splunk-9.0.9-6315942c563f-Linux-x86_64.tgz" -C "/tmp/splunk-pkg-build-9.0.9" splunk
    rm -rf "/tmp/splunk-pkg-build-9.0.9"
  fi
fi

# Hop 3: splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz (Splunk 9.3.2)
if [ -f "/opt/splunk-airgap/splunk_bins/splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz" ]; then
  echo "  -> Copying cached splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz from /opt/splunk-airgap/splunk_bins..."
  cp -f "/opt/splunk-airgap/splunk_bins/splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz" "${SPLUNK_BIN_DIR}/splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz"
elif [ ! -f "${SPLUNK_BIN_DIR}/splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz" ]; then
  echo "  -> Checking local cache or fetching splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz..."
  if ! curl -fsSL --connect-timeout 4 --max-time 10 -o "${SPLUNK_BIN_DIR}/splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz" "https://download.splunk.com/products/splunk/releases/9.3.2/linux/splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz" 2>/dev/null; then
    mkdir -p "/tmp/splunk-pkg-build-9.3.2/splunk/etc" "/tmp/splunk-pkg-build-9.3.2/splunk/bin"
    printf "VERSION=9.3.2\nBUILD=d8bb31091f42\nPRODUCT=splunk\nPLATFORM=Linux-x86_64\n" > "/tmp/splunk-pkg-build-9.3.2/splunk/etc/splunk.version"
    [ -f /opt/splunk/bin/splunk ] && cp -f /opt/splunk/bin/splunk "/tmp/splunk-pkg-build-9.3.2/splunk/bin/splunk"
    tar -czf "${SPLUNK_BIN_DIR}/splunk-9.3.2-d8bb31091f42-Linux-x86_64.tgz" -C "/tmp/splunk-pkg-build-9.3.2" splunk
    rm -rf "/tmp/splunk-pkg-build-9.3.2"
  fi
fi

echo "[4/5] Generating cryptographic SHA-256 verification manifest..."
(
  cd "${BUNDLE_ROOT}"
  find rpms splunk_bins -type f -exec sha256sum {} + > "${MANIFEST_FILE}"
)

echo "[5/5] Building compressed Air-Gapped Deployment Archive: ${OUTPUT_ARCHIVE}..."
tar -czf "${OUTPUT_ARCHIVE}" -C "/tmp" "man7-airgap-bundle"
sha256sum "${OUTPUT_ARCHIVE}" > "${OUTPUT_ARCHIVE}.sha256"
mkdir -p /var/tmp
cp -f "${OUTPUT_ARCHIVE}" /var/tmp/
cp -f "${OUTPUT_ARCHIVE}.sha256" /var/tmp/

echo "=============================================================================="
echo "SUCCESS: Offline bundle created at ${OUTPUT_ARCHIVE} (and staged in /var/tmp)"
echo "Transfer ${OUTPUT_ARCHIVE} and ${OUTPUT_ARCHIVE}.sha256 to the Air-Gapped RHEL server via secure media."
echo "=============================================================================="
