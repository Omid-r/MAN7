#!/usr/bin/env bash
set -e
echo "=== [1] OS Version (Ubuntu 20.04 LTS) ==="
grep PRETTY_NAME /etc/os-release
echo "=== [2] Splunk 9 Enterprise Status ==="
/opt/splunk/bin/splunk version
/opt/splunk/bin/splunk status
echo "=== [3] KV Store WiredTiger / MongoDB 7.0 Status ==="
/opt/splunk/bin/splunk show kvstore-status | grep -E "status|storageEngine|serverVersion"
echo "=== [4] Configuration btool Verification ==="
/opt/splunk/bin/splunk cmd btool check
