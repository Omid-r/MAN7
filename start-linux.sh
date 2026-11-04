#!/usr/bin/env bash
# ==============================================================================
# MAN7 | Offline Air-Gapped RHEL & Splunk Platform Launcher (Linux)
# Zero npm install required — runs pre-built bundle from windows-portable/
# ==============================================================================
set -euo pipefail

cd "$(dirname "$0")"
echo "=============================================================================="
echo "  MAN7 | Air-Gapped RHEL Hardening & Splunk Migration Platform"
echo "=============================================================================="

mkdir -p offline-depot/splunk_bins offline-depot/rpms offline-depot/configs offline-depot/scripts offline-depot/logs

if command -v node >/dev/null 2>&1 && [ -f "windows-portable/man7-server.cjs" ]; then
  echo "[MAN7] Starting Pre-Built Standalone Production Server on http://0.0.0.0:3000 ..."
  NODE_ENV=production node windows-portable/man7-server.cjs
elif command -v node >/dev/null 2>&1 && [ -f "dist/man7-server.cjs" ]; then
  echo "[MAN7] Starting Pre-Built Standalone Production Server on http://0.0.0.0:3000 ..."
  NODE_ENV=production node dist/man7-server.cjs
elif command -v python3 >/dev/null 2>&1 && [ -d "windows-portable/ui" ]; then
  echo "[MAN7] Starting Built-In Python3 HTTP Server on http://0.0.0.0:3000 ..."
  python3 -m http.server 3000 --directory windows-portable/ui
else
  echo "[MAN7] Starting Development Server on http://0.0.0.0:3000 ..."
  npm run dev
fi
