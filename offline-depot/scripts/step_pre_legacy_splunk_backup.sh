#!/usr/bin/env bash
# ==============================================================================
# MAN7 | PRE-MIGRATION: LEGACY SPLUNK SERVER BACKUP & EXPORT SCRIPT
# Run this on the OLD Splunk Server before migrating to the new Air-Gapped RHEL host
# ==============================================================================
set -euo pipefail

OLD_SPLUNK_HOME="${SPLUNK_HOME:-/opt/splunk}"
BACKUP_STAGE="/var/tmp/splunk-migration-export"
EXPORT_ARCHIVE="/var/tmp/splunk-legacy-configs-and-state.tar.gz"

sync_tree() {
  local src="$1"
  local dst="$2"
  mkdir -p "$dst"
  if command -v rsync >/dev/null 2>&1; then
    rsync -aHAX "$src" "$dst"
  else
    cp -a "$src" "$dst"
  fi
}

if [ ! -x "${OLD_SPLUNK_HOME}/bin/splunk" ]; then
  echo "ERROR: Splunk binary not found at ${OLD_SPLUNK_HOME}/bin/splunk" >&2
  exit 1
fi
if [ ! -s "${OLD_SPLUNK_HOME}/etc/splunk.secret" ]; then
  echo "ERROR: Original splunk.secret is missing or empty; refusing to generate a replacement key." >&2
  exit 1
fi

${old1}
"${OLD_SPLUNK_HOME}/bin/splunk" cmd btool check

echo "[2/6] Creating consistent KV Store point-in-time backup..."
"${OLD_SPLUNK_HOME}/bin/splunk" backup kvstore -archiveName kvstore_migration_backup

echo "[3/6] Stopping Splunk service cleanly on legacy host..."
"${OLD_SPLUNK_HOME}/bin/splunk" stop

echo "[4/6] Collecting critical configuration trees, splunk.secret, and certificates..."
rm -rf "${BACKUP_STAGE}"
mkdir -p "${BACKUP_STAGE}/etc" "${BACKUP_STAGE}/var_lib" "${OLD_SPLUNK_HOME}/etc/system/local" "${OLD_SPLUNK_HOME}/etc/apps" "${OLD_SPLUNK_HOME}/etc/users" "${OLD_SPLUNK_HOME}/etc/auth"

# Preserve exact permissions and symlinks using rsync (with cp -a fallback)
sync_tree "${OLD_SPLUNK_HOME}/etc/system/local/" "${BACKUP_STAGE}/etc/system_local/"
sync_tree "${OLD_SPLUNK_HOME}/etc/apps" "${BACKUP_STAGE}/etc/"
sync_tree "${OLD_SPLUNK_HOME}/etc/users" "${BACKUP_STAGE}/etc/"
sync_tree "${OLD_SPLUNK_HOME}/etc/auth" "${BACKUP_STAGE}/etc/"
cp -p "${OLD_SPLUNK_HOME}/etc/splunk.secret" "${BACKUP_STAGE}/etc/splunk.secret"
cp -p "${OLD_SPLUNK_HOME}/etc/passwd" "${BACKUP_STAGE}/etc/passwd" 2>/dev/null || true

if [ -d "${OLD_SPLUNK_HOME}/var/lib/splunk/kvstoreBackup" ]; then
  sync_tree "${OLD_SPLUNK_HOME}/var/lib/splunk/kvstoreBackup" "${BACKUP_STAGE}/var_lib/"
fi

echo "[5/6] Generating SHA-256 checksums for exported configurations..."
(cd "${BACKUP_STAGE}" && find . -type f -exec sha256sum {} + > "${BACKUP_STAGE}/CONFIG_SHA256.manifest")

echo "[6/6] Compressing migration archive to ${EXPORT_ARCHIVE}..."
tar -czf "${EXPORT_ARCHIVE}" -C "/var/tmp" "splunk-migration-export"
"${OLD_SPLUNK_HOME}/bin/splunk" start --accept-license --answer-yes --no-prompt >/dev/null 2>&1
tar -tzf "${EXPORT_ARCHIVE}" >/dev/null
sha256sum "${EXPORT_ARCHIVE}" > "${EXPORT_ARCHIVE}.sha256"
echo "COMPLETE: Archive integrity checked. Transfer ${EXPORT_ARCHIVE} and its .sha256 sidecar securely."
