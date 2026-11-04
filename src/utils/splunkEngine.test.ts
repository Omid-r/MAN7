import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateUpgradePath,
  analyzeSplunkConfig,
  generateTwoMachineScripts,
  getRhelDependencies,
  HardeningProfileConfig,
} from './splunkEngine';

test('calculateUpgradePath calculates multi-hop path from 7.2.10 to 9.3.2 accurately', () => {
  const plan = calculateUpgradePath('7.2.10', '9.3.2', 'RHEL 9.4', 'tgz');
  assert.equal(plan.isValid, true);
  const versions = plan.hops.map((h) => h.version);
  // Official path: 7.2.10 -> 7.3.9 -> 8.0.10 -> 8.2.12 -> 9.0.9 -> 9.3.2
  assert.deepEqual(versions, ['7.2.10', '7.3.9', '8.0.10', '8.2.12', '9.0.9', '9.3.2']);
  assert.equal(plan.totalIntermediateHops, 4);
  assert.equal(plan.requiresKvStoreWiredTigerMigration, true);
  assert.equal(plan.requiresAvxInstructionCheck, true);
  assert.equal(plan.requiresPython2Remediation, true);
});

test('calculateUpgradePath enforces 8.2.12 and 9.0.9 hops when upgrading from 8.1.14 to 9.4.0', () => {
  const plan = calculateUpgradePath('8.1.14', '9.4.0', 'RHEL 9.4', 'rpm');
  assert.equal(plan.isValid, true);
  const versions = plan.hops.map((h) => h.version);
  assert.deepEqual(versions, ['8.1.14', '8.2.12', '9.0.9', '9.2.4', '9.4.0']);
  assert.ok(plan.hops[1].packageFileName.endsWith('.rpm'));
});

test('calculateUpgradePath rejects downgrade or equal version', () => {
  const downgrade = calculateUpgradePath('9.2.4', '8.2.12', 'RHEL 8.10');
  assert.equal(downgrade.isValid, false);
  assert.ok(downgrade.errorMessageFA);
});

test('calculateUpgradePath warns when target Splunk 9.4.0 is paired with legacy RHEL 7.9', () => {
  const plan = calculateUpgradePath('8.2.12', '9.4.0', 'RHEL 7.9');
  assert.equal(plan.isValid, true);
  assert.ok(plan.osCompatibilityWarningFA !== null);
});

test('analyzeSplunkConfig detects and remediates python2, mmapv1, weak TLS, and master/slave mode', () => {
  const sampleConf = `
[general]
serverName = splunk-rhel7-legacy01
python.version = python2

[kvstore]
storageEngine = mmapv1

[sslConfig]
sslVersions = ssl3, tls1.0, tls1.2

[clustering]
mode = master
`;

  const result = analyzeSplunkConfig(sampleConf, 'splunk-rhel9-idx01');
  assert.equal(result.criticalCount, 3);
  assert.equal(result.highCount, 1);
  assert.equal(result.mediumCount, 1);
  assert.equal(result.isReadyFor9x, false);
  assert.ok(result.sanitizedContent.includes('python.version = python3'));
  assert.ok(result.sanitizedContent.includes('storageEngine = wiredTiger'));
  assert.ok(result.sanitizedContent.includes('sslVersions = tls1.2'));
  assert.ok(result.sanitizedContent.includes('mode = manager'));
  assert.ok(result.sanitizedContent.includes('serverName = splunk-rhel9-idx01'));

  // Re-running audit on sanitized output should yield 0 findings and be ready for 9.x
  const reAudit = analyzeSplunkConfig(result.sanitizedContent, 'splunk-rhel9-idx01');
  assert.equal(reAudit.findings.length, 0);
  assert.equal(reAudit.isReadyFor9x, true);
});

test('generateTwoMachineScripts produces strictly air-gapped Step A and Step B scripts', () => {
  const plan = calculateUpgradePath('8.1.14', '9.3.2', 'RHEL 9.4', 'tgz');
  const hardening: HardeningProfileConfig = {
    targetRhel: 'RHEL 9.4',
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

  const scripts = generateTwoMachineScripts(plan, hardening, 'tgz');
  assert.ok(scripts.stepAOnlineBash.includes('dnf download --resolve --alldeps'));
  assert.ok(scripts.stepAOnlineBash.includes('libxcrypt-compat'));
  assert.ok(scripts.stepBOfflineBash.includes('rpm -Uvh --replacepkgs'));
  assert.ok(scripts.stepBOfflineBash.includes('transparent_hugepages=never'));
  assert.ok(scripts.stepBOfflineBash.includes('migrate kvstore-storage-engine --target-engine wiredTiger'));
  assert.ok(scripts.legacyBackupBash.includes('backup kvstore -archiveName'));
});

test('getRhelDependencies includes mandatory air-gap packages', () => {
  const deps = getRhelDependencies('RHEL 9.4');
  const names = deps.map((d) => d.name);
  assert.ok(names.includes('glibc'));
  assert.ok(names.includes('libxcrypt-compat'));
  assert.ok(names.includes('policycoreutils-python-utils'));
  assert.ok(names.includes('tuned'));
});

test('calculateUpgradePath supports Ubuntu 20.04 LTS (Focal) with Splunk 9.x without OS warning', () => {
  const plan = calculateUpgradePath('9.0.9', '9.3.2', 'Ubuntu 20.04 LTS', 'tgz');
  assert.equal(plan.isValid, true);
  assert.equal(plan.osCompatibilityWarningFA, null);
  assert.deepEqual(plan.hops.map((h) => h.version), ['9.0.9', '9.3.2']);
});

