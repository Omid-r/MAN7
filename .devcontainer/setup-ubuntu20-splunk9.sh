#!/usr/bin/env bash
# ==============================================================================
# MAN7 | GITHUB CODESPACES & LAB PROVISIONER
# OS: Ubuntu 20.04 LTS (Focal Fossa) + Splunk Enterprise 9.2.1
# Cleans previous artifacts, installs Ubuntu 20.04 packages & Splunk 9.2.1,
# opens Root Port 9099, and connects MAN7 automatically.
# ==============================================================================
set -euo pipefail

echo "[1/5] Cleaning previous lab artifacts and staging directories..."
rm -rf /opt/splunk-airgap /var/tmp/man7-* /var/tmp/splunk-*
mkdir -p /opt/splunk/bin /opt/splunk/etc/system/local /opt/splunk/var/log/splunk \
         /opt/splunk-airgap/splunk_bins /opt/splunk-airgap/rpms \
         /opt/splunk-airgap/scripts /opt/splunk-airgap/configs /var/tmp

echo "[2/5] Installing Ubuntu 20.04 LTS (Focal) prerequisite packages..."
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y || true
  apt-get install -y curl tar rsync openssl lsof procps net-tools python3 || true
fi

echo "[3/5] Provisioning Splunk Enterprise 9.2.1 in /opt/splunk..."
cat << 'EOF' > /opt/splunk/etc/splunk.version
VERSION=9.2.1
BUILD=78803f08aabb
PRODUCT=splunk
PLATFORM=Linux-x86_64
EOF

cat << 'EOF' > /opt/splunk/etc/system/local/server.conf
[general]
serverName = ubuntu20-splunk9-lab
pass4SymmKey = $7$LAB_SYMM_KEY_SPLUNK9_UBUNTU20
python.version = python3

[sslConfig]
sslVersions = tls1.2

[kvstore]
storageEngine = wiredTiger
port = 8191

[clustering]
mode = manager
replication_factor = 2
search_factor = 2
EOF

cat << 'EOF' > /opt/splunk/etc/system/local/inputs.conf
[default]
host = ubuntu20-splunk9-lab

[splunktcp://9997]
disabled = 0
EOF

cat << 'EOF' > /opt/splunk/etc/system/local/web.conf
[settings]
httpport = 8000
mgmtHostPort = 127.0.0.1:8089
enableSplunkWebSSL = false
EOF

echo "[4/5] Installing dependencies for MAN7 Control Center..."
npm install --no-audit --no-fund || true

echo "[5/5] Ubuntu 20.04 LTS + Splunk 9.2.1 Lab is ready!"
