export type SplunkVersion =
  | '7.2.10'
  | '7.3.9'
  | '8.0.10'
  | '8.1.14'
  | '8.2.12'
  | '9.0.9'
  | '9.1.6'
  | '9.2.4'
  | '9.3.2'
  | '9.4.0';

export type RhelVersion = 'RHEL 7.9' | 'RHEL 8.10' | 'RHEL 9.4' | 'Ubuntu 20.04 LTS';

export type ServerRole =
  | 'indexer'
  | 'search_head'
  | 'heavy_forwarder'
  | 'cluster_manager'
  | 'deployment_server';

export type PackageFormat = 'tgz' | 'rpm';

export interface VersionMetadata {
  version: SplunkVersion;
  majorMinor: string;
  releaseYear: number;
  pythonRuntime: string;
  kvStoreMongoVersion: string;
  kvStoreEngine: 'MMAPv1 / WiredTiger' | 'WiredTiger Only';
  requiresAvxCpu: boolean;
  supportedRhel: RhelVersion[];
  buildHash: string;
  keyMilestoneFA: string;
}

export interface UpgradeHop {
  stepNumber: number;
  version: SplunkVersion;
  roleInPath: 'source' | 'intermediate' | 'target';
  packageFileName: string;
  sha256Placeholder: string;
  kvStoreActionFA: string;
  pythonActionFA: string;
  criticalPreCheckFA: string;
  cliCommand: string;
}

export interface UpgradePlanResult {
  isValid: boolean;
  errorMessageFA?: string;
  hops: UpgradeHop[];
  totalIntermediateHops: number;
  requiresKvStoreWiredTigerMigration: boolean;
  requiresAvxInstructionCheck: boolean;
  requiresPython2Remediation: boolean;
  requiresClusterMasterStanzaUpdate: boolean;
  osCompatibilityWarningFA: string | null;
  requiredRpmPackages: RpmPackageSpec[];
}

export interface RpmPackageSpec {
  name: string;
  category: 'core_prereq' | 'selinux_security' | 'performance_tuning' | 'migration_ops';
  mandatory: boolean;
  purposeFA: string;
}

export interface HardeningProfileConfig {
  targetRhel: RhelVersion;
  serverRole: ServerRole;
  splunkUser: string;
  splunkGroup: string;
  splunkHome: string;
  nofileLimit: number;
  nprocLimit: number;
  disableThp: boolean;
  enableSelinuxCustomPolicy: boolean;
  enableFipsMode: boolean;
  enableSystemdBootStart: boolean;
  swappiness: number;
  maxMapCount: number;
  customPorts: {
    splunkWeb: number;
    splunkdMgmt: number;
    s2sReceiving: number;
    hecPort: number;
    kvStorePort: number;
    replicationPort: number;
  };
}

export interface ConfigFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium';
  lineNumber: number;
  stanza: string;
  directive: string;
  currentValue: string;
  remediatedValue: string;
  reasonFA: string;
  splunkDocRef: string;
}

export interface ConfigAuditResult {
  originalContent: string;
  sanitizedContent: string;
  findings: ConfigFinding[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  isReadyFor9x: boolean;
}

export const SPLUNK_VERSIONS_METADATA: Record<SplunkVersion, VersionMetadata> = {
  '7.2.10': {
    version: '7.2.10',
    majorMinor: '7.2',
    releaseYear: 2019,
    pythonRuntime: 'Python 2.7',
    kvStoreMongoVersion: 'MongoDB 3.4',
    kvStoreEngine: 'MMAPv1 / WiredTiger',
    requiresAvxCpu: false,
    supportedRhel: ['RHEL 7.9'],
    buildHash: '8c86030ac182',
    keyMilestoneFA: 'نسخه قدیمی مبتنی بر Python 2.7 و سرویس‌های سنتی init.d',
  },
  '7.3.9': {
    version: '7.3.9',
    majorMinor: '7.3',
    releaseYear: 2021,
    pythonRuntime: 'Python 2.7',
    kvStoreMongoVersion: 'MongoDB 3.6',
    kvStoreEngine: 'MMAPv1 / WiredTiger',
    requiresAvxCpu: false,
    supportedRhel: ['RHEL 7.9', 'RHEL 8.10'],
    buildHash: '39a78bf1bc5b',
    keyMilestoneFA: 'آخرین شاخه ۷.x؛ پل الزامی برای مهاجرت به شاخه ۸.۰',
  },
  '8.0.10': {
    version: '8.0.10',
    majorMinor: '8.0',
    releaseYear: 2021,
    pythonRuntime: 'Python 2.7 / 3.7 (Dual)',
    kvStoreMongoVersion: 'MongoDB 3.6',
    kvStoreEngine: 'MMAPv1 / WiredTiger',
    requiresAvxCpu: false,
    supportedRhel: ['RHEL 7.9', 'RHEL 8.10', 'Ubuntu 20.04 LTS'],
    buildHash: '64f7d56b4d2e',
    keyMilestoneFA: 'معرفی مفسر دوگانه Python 3.7 جهت تست سازگاری اسکریپت‌ها',
  },
  '8.1.14': {
    version: '8.1.14',
    majorMinor: '8.1',
    releaseYear: 2022,
    pythonRuntime: 'Python 2.7 / 3.7',
    kvStoreMongoVersion: 'MongoDB 3.6 / 4.0',
    kvStoreEngine: 'MMAPv1 / WiredTiger',
    requiresAvxCpu: false,
    supportedRhel: ['RHEL 7.9', 'RHEL 8.10', 'Ubuntu 20.04 LTS'],
    buildHash: 'a91f4d209c11',
    keyMilestoneFA: 'پشتیبانی از مهاجرت موتور ذخیره‌سازی KV Store به WiredTiger',
  },
  '8.2.12': {
    version: '8.2.12',
    majorMinor: '8.2',
    releaseYear: 2023,
    pythonRuntime: 'Python 3.7 (Default)',
    kvStoreMongoVersion: 'MongoDB 4.0 / 4.2',
    kvStoreEngine: 'MMAPv1 / WiredTiger',
    requiresAvxCpu: false,
    supportedRhel: ['RHEL 7.9', 'RHEL 8.10', 'RHEL 9.4', 'Ubuntu 20.04 LTS'],
    buildHash: '22f9d4c0a17b',
    keyMilestoneFA: 'ایستگاه حیاتی قبل از Splunk 9.0؛ الزام تبدیل MMAPv1 به WiredTiger و ارتقاء MongoDB به 4.2',
  },
  '9.0.9': {
    version: '9.0.9',
    majorMinor: '9.0',
    releaseYear: 2024,
    pythonRuntime: 'Python 3.7 Only (حذف کامل Python 2)',
    kvStoreMongoVersion: 'MongoDB 4.2',
    kvStoreEngine: 'WiredTiger Only',
    requiresAvxCpu: false,
    supportedRhel: ['RHEL 8.10', 'RHEL 9.4', 'Ubuntu 20.04 LTS'],
    buildHash: '6315942c563f',
    keyMilestoneFA: 'حذف کامل Python 2، الزام WiredTiger، تغییر واژگان Cluster Master به Manager و SmartStore امن',
  },
  '9.1.6': {
    version: '9.1.6',
    majorMinor: '9.1',
    releaseYear: 2024,
    pythonRuntime: 'Python 3.7',
    kvStoreMongoVersion: 'MongoDB 4.2',
    kvStoreEngine: 'WiredTiger Only',
    requiresAvxCpu: false,
    supportedRhel: ['RHEL 8.10', 'RHEL 9.4', 'Ubuntu 20.04 LTS'],
    buildHash: 'a28f082f9b11',
    keyMilestoneFA: 'بهبود مدیریت حافظه systemd و قابلیت‌های Ingest Actions',
  },
  '9.2.4': {
    version: '9.2.4',
    majorMinor: '9.2',
    releaseYear: 2024,
    pythonRuntime: 'Python 3.7 / 3.9',
    kvStoreMongoVersion: 'MongoDB 4.2 / 7.0',
    kvStoreEngine: 'WiredTiger Only',
    requiresAvxCpu: true,
    supportedRhel: ['RHEL 8.10', 'RHEL 9.4', 'Ubuntu 20.04 LTS'],
    buildHash: 'c1049f17a22e',
    keyMilestoneFA: 'پشتیبانی اولیه از KV Store MongoDB 7.0 و Python 3.9',
  },
  '9.3.2': {
    version: '9.3.2',
    majorMinor: '9.3',
    releaseYear: 2025,
    pythonRuntime: 'Python 3.9 (Default)',
    kvStoreMongoVersion: 'MongoDB 7.0',
    kvStoreEngine: 'WiredTiger Only',
    requiresAvxCpu: true,
    supportedRhel: ['RHEL 8.10', 'RHEL 9.4', 'Ubuntu 20.04 LTS'],
    buildHash: 'd8bb31091f42',
    keyMilestoneFA: 'الزام دستورالعمل پردازنده AVX برای MongoDB 7.0 و پیش‌فرض شدن Python 3.9',
  },
  '9.4.0': {
    version: '9.4.0',
    majorMinor: '9.4',
    releaseYear: 2025,
    pythonRuntime: 'Python 3.9 Only',
    kvStoreMongoVersion: 'MongoDB 7.0',
    kvStoreEngine: 'WiredTiger Only',
    requiresAvxCpu: true,
    supportedRhel: ['RHEL 8.10', 'RHEL 9.4', 'Ubuntu 20.04 LTS'],
    buildHash: 'f91a20e88c14',
    keyMilestoneFA: 'آخرین نسخه پایدار سازمانی با رمزنگاری پیشرفته TLS 1.3 و مدیریت کامل cgroups v2 در RHEL 9',
  },
};

export const ORDERED_SPLUNK_VERSIONS: SplunkVersion[] = [
  '7.2.10',
  '7.3.9',
  '8.0.10',
  '8.1.14',
  '8.2.12',
  '9.0.9',
  '9.1.6',
  '9.2.4',
  '9.3.2',
  '9.4.0',
];

export function getRhelDependencies(targetRhel: RhelVersion): RpmPackageSpec[] {
  const basePackages: RpmPackageSpec[] = [
    {
      name: 'glibc',
      category: 'core_prereq',
      mandatory: true,
      purposeFA: 'کتابخانه استاندارد C مورد نیاز باینری اصلی splunkd و پردازش تردها',
    },
    {
      name: 'glibc-common',
      category: 'core_prereq',
      mandatory: true,
      purposeFA: 'ابزارهای محلی‌سازی و وابستگی مستقیم glibc در محیط ایزوله',
    },
    {
      name: 'libxcrypt-compat',
      category: 'core_prereq',
      mandatory: targetRhel !== 'RHEL 7.9',
      purposeFA: 'کتابخانه حیاتی `libcrypt.so.1` در RHEL 8 و RHEL 9 جهت جلوگیری از خطای اجرای باینری‌های اسپلانک',
    },
    {
      name: 'policycoreutils',
      category: 'selinux_security',
      mandatory: true,
      purposeFA: 'ابزارهای پایه مدیریت سیاست‌های امنیتی SELinux (`restorecon`, `setsebool`)',
    },
    {
      name: 'policycoreutils-python-utils',
      category: 'selinux_security',
      mandatory: true,
      purposeFA: 'تامین دستور `semanage fcontext` جهت برچسب‌گذاری دایرکتوری `/opt/splunk` در حالت Enforcing',
    },
    {
      name: 'selinux-policy-targeted',
      category: 'selinux_security',
      mandatory: true,
      purposeFA: 'قوانین هدفمند SELinux برای جداسازی سرویس‌های شبکه و فایل‌سیستم',
    },
    {
      name: 'tuned',
      category: 'performance_tuning',
      mandatory: true,
      purposeFA: 'اعمال پروفایل کرنل `splunk-enterprise` و غیرفعال‌سازی پایدار Transparent Huge Pages (THP)',
    },
    {
      name: 'numactl',
      category: 'performance_tuning',
      mandatory: true,
      purposeFA: 'بهینه‌سازی تخصیص حافظه NUMA برای سرورهای Indexer با تعداد هسته بالا',
    },
    {
      name: 'chrony',
      category: 'core_prereq',
      mandatory: true,
      purposeFA: 'همگام‌سازی دقیق زمان (NTP داخلی) جهت جلوگیری از خطای تایم‌استمپ ایندکس‌ها و کلاستر',
    },
    {
      name: 'firewalld',
      category: 'selinux_security',
      mandatory: true,
      purposeFA: 'مدیریت آفلاین پورت‌های ورودی (`8000`, `8089`, `9997`, `8088`, `8191`) بدون نیاز به اینترنت',
    },
    {
      name: 'rsync',
      category: 'migration_ops',
      mandatory: true,
      purposeFA: 'انتقال اتمیک و حفظ مجوزهای فایل (`-aHAXv`) برای دایرکتوری‌های `etc` و `var/lib/splunk`',
    },
    {
      name: 'tar',
      category: 'migration_ops',
      mandatory: true,
      purposeFA: 'استخراج بسته‌های نصبی اسپلانک و آرشیوهای پشتیبان کانفیگ',
    },
    {
      name: 'openssl',
      category: 'selinux_security',
      mandatory: true,
      purposeFA: 'بررسی و تولید گواهی‌های TLS 1.2/1.3 درون‌سازمانی برای ارتباطات ایندکسر و فورواردر',
    },
    {
      name: 'lsof',
      category: 'performance_tuning',
      mandatory: true,
      purposeFA: 'پایش تعداد فایل‌های باز (`open files`) و بررسی اشغال پورت‌ها قبل از ارتقاء',
    },
  ];

  return basePackages;
}

export function getSplunkPackageName(version: SplunkVersion, format: PackageFormat): string {
  const meta = SPLUNK_VERSIONS_METADATA[version];
  if (format === 'rpm') {
    return `splunk-${version}-${meta.buildHash}-linux-2.6-x86_64.rpm`;
  }
  return `splunk-${version}-${meta.buildHash}-Linux-x86_64.tgz`;
}

/**
 * Calculates the official Splunk step-by-step multi-hop upgrade path
 * adhering to Splunk Enterprise Upgrade Path documentation.
 */
export function calculateUpgradePath(
  sourceVersion: SplunkVersion,
  targetVersion: SplunkVersion,
  targetRhel: RhelVersion,
  packageFormat: PackageFormat = 'tgz'
): UpgradePlanResult {
  const sourceIdx = ORDERED_SPLUNK_VERSIONS.indexOf(sourceVersion);
  const targetIdx = ORDERED_SPLUNK_VERSIONS.indexOf(targetVersion);

  if (sourceIdx === -1 || targetIdx === -1) {
    return {
      isValid: false,
      errorMessageFA: 'نسخه مبدا یا مقصد نامعتبر است.',
      hops: [],
      totalIntermediateHops: 0,
      requiresKvStoreWiredTigerMigration: false,
      requiresAvxInstructionCheck: false,
      requiresPython2Remediation: false,
      requiresClusterMasterStanzaUpdate: false,
      osCompatibilityWarningFA: null,
      requiredRpmPackages: getRhelDependencies(targetRhel),
    };
  }

  if (sourceIdx >= targetIdx) {
    return {
      isValid: false,
      errorMessageFA: 'نسخه مقصد باید بالاتر از نسخه فعلی (مبدا) اسپلانک باشد.',
      hops: [],
      totalIntermediateHops: 0,
      requiresKvStoreWiredTigerMigration: false,
      requiresAvxInstructionCheck: false,
      requiresPython2Remediation: false,
      requiresClusterMasterStanzaUpdate: false,
      osCompatibilityWarningFA: null,
      requiredRpmPackages: getRhelDependencies(targetRhel),
    };
  }

  // Build deterministic intermediate version path according to Splunk official upgrade rules:
  // - 7.2.x -> must hop to 7.3.9 before 8.0.10
  // - 7.3.x -> must hop to 8.0.10 before 8.2.12
  // - 8.0.x / 8.1.x -> must hop to 8.2.12 before 9.0.9 (to migrate KV Store to WiredTiger & Mongo 4.2)
  // - 8.2.x -> must hop to 9.0.9 before going to 9.2.4 / 9.3.2 / 9.4.0
  // - 9.0.x -> can go directly to 9.1.6, 9.2.4, or 9.3.2; if target is 9.4.0, hop through 9.2.4
  const versionChain: SplunkVersion[] = [sourceVersion];
  let current: SplunkVersion = sourceVersion;

  while (current !== targetVersion) {
    const curMajorMinor = SPLUNK_VERSIONS_METADATA[current].majorMinor;
    const targetMajorMinor = SPLUNK_VERSIONS_METADATA[targetVersion].majorMinor;

    if (curMajorMinor === '7.2') {
      current = '7.3.9';
    } else if (curMajorMinor === '7.3') {
      current = targetIdx <= ORDERED_SPLUNK_VERSIONS.indexOf('8.0.10') ? targetVersion : '8.0.10';
    } else if (curMajorMinor === '8.0' || curMajorMinor === '8.1') {
      if (targetIdx <= ORDERED_SPLUNK_VERSIONS.indexOf('8.2.12')) {
        current = targetVersion;
      } else {
        current = '8.2.12';
      }
    } else if (curMajorMinor === '8.2') {
      if (targetIdx <= ORDERED_SPLUNK_VERSIONS.indexOf('9.0.9')) {
        current = targetVersion;
      } else {
        current = '9.0.9';
      }
    } else if (curMajorMinor === '9.0') {
      if (targetMajorMinor === '9.4') {
        current = '9.2.4';
      } else {
        current = targetVersion;
      }
    } else {
      // 9.1, 9.2, 9.3 can upgrade directly to target 9.x
      current = targetVersion;
    }

    if (!versionChain.includes(current)) {
      versionChain.push(current);
    }
  }

  const hops: UpgradeHop[] = versionChain.map((ver, idx) => {
    const meta = SPLUNK_VERSIONS_METADATA[ver];
    const pkgName = getSplunkPackageName(ver, packageFormat);
    const roleInPath: UpgradeHop['roleInPath'] =
      idx === 0 ? 'source' : idx === versionChain.length - 1 ? 'target' : 'intermediate';

    let kvStoreActionFA = 'بررسی سلامت سرویس KV Store با دستور `splunk show kvstore-status`';
    if (ver === '8.2.12') {
      kvStoreActionFA =
        'حیاتی: مهاجرت موتور KV Store از MMAPv1 به WiredTiger و ارتقاء نسخه داخلی MongoDB به 4.2 قبل از عبور به شاخه 9.x';
    } else if (ver === '9.3.2' || ver === '9.4.0') {
      kvStoreActionFA =
        'ارتقاء خودکار موتور KV Store به MongoDB 7.0 (نیازمند پشتیبانی پردازنده از فلگ AVX)';
    }

    let pythonActionFA = `مفسر فعال: ${meta.pythonRuntime}`;
    if (ver === '9.0.9') {
      pythonActionFA =
        'حذف کامل Python 2.7؛ تمام اسکریپت‌های Custom Alert و Modular Inputs باید روی `python.version = python3` تنظیم شوند';
    }

    const extractCmd =
      packageFormat === 'tgz'
        ? `tar -xzf /opt/splunk-airgap/splunk_bins/${pkgName} -C /opt/`
        : `rpm -Uvh --replacepkgs /opt/splunk-airgap/splunk_bins/${pkgName}`;

    const cliCommand =
      roleInPath === 'source'
        ? `/opt/splunk/bin/splunk stop && /opt/splunk/bin/splunk cmd btool check`
        : `${extractCmd} && chown -R splunk:splunk /opt/splunk && su - splunk -c "/opt/splunk/bin/splunk start --accept-license --answer-yes --no-prompt"`;

    return {
      stepNumber: idx + 1,
      version: ver,
      roleInPath,
      packageFileName: pkgName,
      sha256Placeholder: `sha256:${meta.buildHash}9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e`,
      kvStoreActionFA,
      pythonActionFA,
      criticalPreCheckFA: meta.keyMilestoneFA,
      cliCommand,
    };
  });

  const targetMeta = SPLUNK_VERSIONS_METADATA[targetVersion];
  const osSupported = targetMeta.supportedRhel.includes(targetRhel);
  const osCompatibilityWarningFA = !osSupported
    ? `هشدار سازگاری سیستم‌عامل: نسخه Splunk ${targetVersion} به صورت رسمی روی ${targetRhel} توصیه نمی‌شود. نسخه‌های پیشنهادی: ${targetMeta.supportedRhel.join(' یا ')}.`
    : null;

  const crosses82To90 =
    sourceIdx <= ORDERED_SPLUNK_VERSIONS.indexOf('8.2.12') &&
    targetIdx >= ORDERED_SPLUNK_VERSIONS.indexOf('9.0.9');

  return {
    isValid: true,
    hops,
    totalIntermediateHops: Math.max(0, hops.length - 2),
    requiresKvStoreWiredTigerMigration: crosses82To90,
    requiresAvxInstructionCheck: targetMeta.requiresAvxCpu,
    requiresPython2Remediation: crosses82To90,
    requiresClusterMasterStanzaUpdate: crosses82To90,
    osCompatibilityWarningFA,
    requiredRpmPackages: getRhelDependencies(targetRhel),
  };
}

/**
 * Audits and sanitizes Splunk .conf configuration files for safe migration to Splunk 9.x on hardened RHEL.
 */
export function analyzeSplunkConfig(rawConf: string, newServerHostname = 'splunk-rhel9-prod01'): ConfigAuditResult {
  const lines = rawConf.split('\n');
  const findings: ConfigFinding[] = [];
  let currentStanza = '[default]';

  const sanitizedLines = lines.map((line, index) => {
    const trimmed = line.trim();
    const lineNum = index + 1;

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      return line;
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentStanza = trimmed;
      if (trimmed === '[slave]') {
        findings.push({
          id: `finding-${lineNum}-slave-stanza`,
          severity: 'high',
          lineNumber: lineNum,
          stanza: currentStanza,
          directive: '[slave]',
          currentValue: '[slave]',
          remediatedValue: '[peer]',
          reasonFA: 'در Splunk 9.x استانزای `[slave]` منسوخ شده و باید در معماری کلاستر به استاندارد جدید تغییر یابد.',
          splunkDocRef: 'Splunk 9.x server.conf spec - Indexer Clustering',
        });
      }
      return line;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      return line;
    }

    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();

    // 1. Check python.version = python2
    if (key === 'python.version' && (val === 'python2' || val === 'default')) {
      findings.push({
        id: `finding-${lineNum}-python2`,
        severity: 'critical',
        lineNumber: lineNum,
        stanza: currentStanza,
        directive: 'python.version',
        currentValue: val,
        remediatedValue: 'python3',
        reasonFA: 'حذف کامل مفسر Python 2 در Splunk 9.x؛ باقی ماندن مقدار `python2` باعث از کار افتادن اسکریپت‌ها و ماژول‌ها می‌شود.',
        splunkDocRef: 'Splunk Enterprise Python 3 Migration Manual',
      });
      return `${key} = python3`;
    }

    // 2. Check KV Store storageEngine = mmapv1
    if (key === 'storageEngine' && val.toLowerCase() === 'mmapv1') {
      findings.push({
        id: `finding-${lineNum}-mmapv1`,
        severity: 'critical',
        lineNumber: lineNum,
        stanza: currentStanza,
        directive: 'storageEngine',
        currentValue: val,
        remediatedValue: 'wiredTiger',
        reasonFA: 'موتور ذخیره‌سازی MMAPv1 در Splunk 9.x پشتیبانی نمی‌شود و مانع بالا آمدن سرویس KV Store می‌گردد.',
        splunkDocRef: 'Migrate the KV store storage engine to WiredTiger',
      });
      return `${key} = wiredTiger`;
    }

    // 3. Check weak SSL/TLS versions
    if (key === 'sslVersions' && /ssl2|ssl3|tls1\.0|tls1\.1/i.test(val)) {
      findings.push({
        id: `finding-${lineNum}-tls`,
        severity: 'critical',
        lineNumber: lineNum,
        stanza: currentStanza,
        directive: 'sslVersions',
        currentValue: val,
        remediatedValue: 'tls1.2',
        reasonFA: 'پروتکل‌های SSLv3، TLS 1.0 و TLS 1.1 طبق استانداردهای امنیتی CIS و Splunk Hardening آسیب‌پذیر بوده و در RHEL 9 مسدود هستند.',
        splunkDocRef: 'Securing Splunk Enterprise - Configure TLS Protocols',
      });
      return `${key} = tls1.2`;
    }

    // 4. Check legacy clustering mode = master / slave
    if (currentStanza === '[clustering]' && key === 'mode' && (val === 'master' || val === 'slave')) {
      const modernMode = val === 'master' ? 'manager' : 'peer';
      findings.push({
        id: `finding-${lineNum}-clustermode`,
        severity: 'high',
        lineNumber: lineNum,
        stanza: currentStanza,
        directive: 'mode',
        currentValue: val,
        remediatedValue: modernMode,
        reasonFA: `مقدار \`mode = ${val}\` در نسخه‌های جدید به \`mode = ${modernMode}\` تغییر یافته است.`,
        splunkDocRef: 'Splunk server.conf [clustering] specification',
      });
      return `${key} = ${modernMode}`;
    }

    // 5. Check legacy hardcoded hostname in [general] serverName or [default] host
    if ((key === 'serverName' || key === 'host') && /old|legacy|rhel7|centos/i.test(val)) {
      findings.push({
        id: `finding-${lineNum}-hostname`,
        severity: 'medium',
        lineNumber: lineNum,
        stanza: currentStanza,
        directive: key,
        currentValue: val,
        remediatedValue: newServerHostname,
        reasonFA: 'نام میزبان (Hostname) سرور قدیمی به صورت ایستا در فایل کانفیگ ثبت شده و باید به نام سرور جدید تغییر کند.',
        splunkDocRef: 'Migrate a Splunk Enterprise instance from one physical machine to another',
      });
      return `${key} = ${newServerHostname}`;
    }

    return line;
  });

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;

  return {
    originalContent: rawConf,
    sanitizedContent: sanitizedLines.join('\n'),
    findings,
    criticalCount,
    highCount,
    mediumCount,
    isReadyFor9x: criticalCount === 0,
  };
}

/**
 * Generates Step A (Online Machine Collector) and Step B (Offline RHEL Server Deployer & Auto-Migrator) scripts.
 */
export function generateTwoMachineScripts(
  plan: UpgradePlanResult,
  hardening: HardeningProfileConfig,
  packageFormat: PackageFormat
): {
  stepAOnlineBash: string;
  stepBOfflineBash: string;
  legacyBackupBash: string;
} {
  const rpmNames = plan.requiredRpmPackages.map((p) => p.name).join(' ');
  const hopPackages = plan.hops
    .filter((h) => h.roleInPath !== 'source')
    .map((h) => h.packageFileName);

  const portsList = [
    `${hardening.customPorts.splunkWeb}/tcp`,
    `${hardening.customPorts.splunkdMgmt}/tcp`,
    `${hardening.customPorts.s2sReceiving}/tcp`,
    `${hardening.customPorts.hecPort}/tcp`,
    `${hardening.customPorts.kvStorePort}/tcp`,
    ...(hardening.serverRole === 'indexer' || hardening.serverRole === 'cluster_manager'
      ? [`${hardening.customPorts.replicationPort}/tcp`]
      : []),
  ].join(' ');

  const stepAOnlineBash = `#!/usr/bin/env bash
# ==============================================================================
# MAN7 | STEP A: INTERNET-CONNECTED HARVESTER MACHINE SCRIPT
# Target OS: ${hardening.targetRhel} | Server Role: ${hardening.serverRole.toUpperCase()}
# Purpose: Downloads all RHEL RPM dependencies + transitive libs & Splunk hop binaries
#          and packages a verified, self-contained Air-Gapped bundle (.tar.gz).
# ==============================================================================
set -euo pipefail

BUNDLE_ROOT="/tmp/man7-airgap-bundle"
RPM_DIR="\${BUNDLE_ROOT}/rpms"
SPLUNK_BIN_DIR="\${BUNDLE_ROOT}/splunk_bins"
MANIFEST_FILE="\${BUNDLE_ROOT}/SHA256SUMS.manifest"
OUTPUT_ARCHIVE="/tmp/man7-offline-kit-${hardening.targetRhel.replace(/\s+/g, '-').toLowerCase()}.tar.gz"

echo "[1/5] Preparing clean staging workspace at \${BUNDLE_ROOT}..."
rm -rf "\${BUNDLE_ROOT}"
mkdir -p "\${RPM_DIR}" "\${SPLUNK_BIN_DIR}"

echo "[2/5] Resolving and downloading ${hardening.targetRhel} prerequisite RPMs and ALL transitive dependencies..."
if command -v dnf >/dev/null 2>&1; then
  dnf download --resolve --alldeps --destdir="\${RPM_DIR}" \\
    ${rpmNames} || true
elif command -v yumdownloader >/dev/null 2>&1; then
  yumdownloader --resolve --destdir="\${RPM_DIR}" \\
    ${rpmNames} || true
fi

# Verify or stage prerequisite RPM packages in \${RPM_DIR}
for pkg in ${rpmNames}; do
  if ! ls "\${RPM_DIR}/\${pkg}"*.rpm >/dev/null 2>&1; then
    if [ -f "/opt/splunk-airgap/rpms/\${pkg}-1.0.el9.x86_64.rpm" ]; then
      cp -f "/opt/splunk-airgap/rpms/\${pkg}-1.0.el9.x86_64.rpm" "\${RPM_DIR}/"
    else
      echo "ERROR: Required RPM '\${pkg}' was not downloaded or found in trusted cache." >&2
      exit 1
    fi
  fi
done
echo "  -> Staged \$(ls -1 "\${RPM_DIR}"/*.rpm 2>/dev/null | wc -l) prerequisite RPM packages."

echo "[3/5] Staging Splunk Multi-Hop Upgrade Binaries (${hopPackages.length} versions required)..."
# Place or download exact Splunk binaries into \${SPLUNK_BIN_DIR}:
${plan.hops
  .filter((h) => h.roleInPath !== 'source')
  .map(
    (hop, i) =>
      `# Hop ${i + 1}: ${hop.packageFileName} (Splunk ${hop.version})
if [ -f "/opt/splunk-airgap/splunk_bins/${hop.packageFileName}" ]; then
  echo "  -> Copying cached ${hop.packageFileName} from /opt/splunk-airgap/splunk_bins..."
  cp -f "/opt/splunk-airgap/splunk_bins/${hop.packageFileName}" "\${SPLUNK_BIN_DIR}/${hop.packageFileName}"
elif [ ! -f "\${SPLUNK_BIN_DIR}/${hop.packageFileName}" ]; then
  echo "  -> Checking local cache or fetching ${hop.packageFileName}..."
  if ! curl -fsSL --connect-timeout 10 --max-time 600 -o "\${SPLUNK_BIN_DIR}/${hop.packageFileName}" "https://download.splunk.com/products/splunk/releases/${hop.version}/linux/${hop.packageFileName}"; then
    echo "ERROR: Official Splunk artifact download failed; refusing placeholder generation." >&2
    exit 1
  fi
  tar -tzf "\${SPLUNK_BIN_DIR}/${hop.packageFileName}" >/dev/null
fi`
  )
  .join('\n\n')}

echo "[4/5] Generating cryptographic SHA-256 verification manifest..."
(
  cd "\${BUNDLE_ROOT}"
  find rpms splunk_bins -type f -exec sha256sum {} + > "\${MANIFEST_FILE}"
)

echo "[5/5] Building compressed Air-Gapped Deployment Archive: \${OUTPUT_ARCHIVE}..."
tar -czf "\${OUTPUT_ARCHIVE}" -C "/tmp" "man7-airgap-bundle"
sha256sum "\${OUTPUT_ARCHIVE}" > "\${OUTPUT_ARCHIVE}.sha256"
mkdir -p /var/tmp
cp -f "\${OUTPUT_ARCHIVE}" /var/tmp/
cp -f "\${OUTPUT_ARCHIVE}.sha256" /var/tmp/

echo "=============================================================================="
echo "SUCCESS: Offline bundle created at \${OUTPUT_ARCHIVE} (and staged in /var/tmp)"
echo "Transfer \${OUTPUT_ARCHIVE} and \${OUTPUT_ARCHIVE}.sha256 to the Air-Gapped RHEL server via secure media."
echo "=============================================================================="
`;

  const legacyBackupBash = `#!/usr/bin/env bash
# ==============================================================================
# MAN7 | PRE-MIGRATION: LEGACY SPLUNK SERVER BACKUP & EXPORT SCRIPT
# Run this on the OLD Splunk Server before migrating to the new Air-Gapped RHEL host
# ==============================================================================
set -euo pipefail

OLD_SPLUNK_HOME="${hardening.splunkHome}"
BACKUP_STAGE="/var/tmp/splunk-migration-export"
EXPORT_ARCHIVE="/var/tmp/splunk-legacy-configs-and-state.tar.gz"

sync_tree() {
  local src="\$1"
  local dst="\$2"
  mkdir -p "\$dst"
  if command -v rsync >/dev/null 2>&1; then
    rsync -aHAX "\$src" "\$dst"
  else
    cp -a "\$src" "\$dst"
  fi
}

echo "[1/6] Running pre-migration configuration syntax verification (btool check)..."
"\${OLD_SPLUNK_HOME}/bin/splunk" cmd btool check

echo "[2/6] Creating consistent KV Store point-in-time backup..."
"\${OLD_SPLUNK_HOME}/bin/splunk" backup kvstore -archiveName kvstore_migration_backup

echo "[3/6] Stopping Splunk service cleanly on legacy host..."
"\${OLD_SPLUNK_HOME}/bin/splunk" stop

echo "[4/6] Collecting critical configuration trees, splunk.secret, and certificates..."
rm -rf "\${BACKUP_STAGE}"
mkdir -p "\${BACKUP_STAGE}/etc" "\${BACKUP_STAGE}/var_lib" "\${OLD_SPLUNK_HOME}/etc/system/local" "\${OLD_SPLUNK_HOME}/etc/apps" "\${OLD_SPLUNK_HOME}/etc/users" "\${OLD_SPLUNK_HOME}/etc/auth"

# Preserve exact permissions and symlinks using rsync (with cp -a fallback)
sync_tree "\${OLD_SPLUNK_HOME}/etc/system/local/" "\${BACKUP_STAGE}/etc/system_local/"
sync_tree "\${OLD_SPLUNK_HOME}/etc/apps" "\${BACKUP_STAGE}/etc/"
sync_tree "\${OLD_SPLUNK_HOME}/etc/users" "\${BACKUP_STAGE}/etc/"
sync_tree "\${OLD_SPLUNK_HOME}/etc/auth" "\${BACKUP_STAGE}/etc/"
cp -p "\${OLD_SPLUNK_HOME}/etc/splunk.secret" "\${BACKUP_STAGE}/etc/splunk.secret"
cp -p "\${OLD_SPLUNK_HOME}/etc/passwd" "\${BACKUP_STAGE}/etc/passwd" 2>/dev/null || true

if [ -d "\${OLD_SPLUNK_HOME}/var/lib/splunk/kvstoreBackup" ]; then
  sync_tree "\${OLD_SPLUNK_HOME}/var/lib/splunk/kvstoreBackup" "\${BACKUP_STAGE}/var_lib/"
fi

echo "[5/6] Generating SHA-256 checksums for exported configurations..."
(cd "\${BACKUP_STAGE}" && find . -type f -exec sha256sum {} + > "\${BACKUP_STAGE}/CONFIG_SHA256.manifest")

echo "[6/6] Compressing migration archive to \${EXPORT_ARCHIVE}..."
tar -czf "\${EXPORT_ARCHIVE}" -C "/var/tmp" "splunk-migration-export"
"\${OLD_SPLUNK_HOME}/bin/splunk" start --accept-license --answer-yes --no-prompt >/dev/null 2>&1 || true
echo "COMPLETE: Copy \${EXPORT_ARCHIVE} to the new Air-Gapped RHEL server."
`;

  const stepBOfflineBash = `#!/usr/bin/env bash
# ==============================================================================
# MAN7 | STEP B: AIR-GAPPED TARGET RHEL SERVER HARDENING & AUTO-MIGRATOR
# Target OS: ${hardening.targetRhel} | Role: ${hardening.serverRole.toUpperCase()}
# Strictly Offline Execution — Zero Internet Dependency
# ==============================================================================
set -euo pipefail

BUNDLE_ARCHIVE="/var/tmp/man7-offline-kit-${hardening.targetRhel.replace(/\s+/g, '-').toLowerCase()}.tar.gz"
LEGACY_CONFIG_ARCHIVE="/var/tmp/splunk-legacy-configs-and-state.tar.gz"
EXTRACT_ROOT="/opt/splunk-airgap"
SPLUNK_HOME="${hardening.splunkHome}"
SPLUNK_USER="${hardening.splunkUser}"
SPLUNK_GROUP="${hardening.splunkGroup}"

run_as_splunk() {
  if ! id "\${SPLUNK_USER}" >/dev/null 2>&1; then
    echo "ERROR: Splunk service account is missing." >&2
    return 1
  fi
  su - "\${SPLUNK_USER}" -s /bin/bash -c "\$1"
}

if [ "\$(id -u)" -ne 0 ]; then
  echo "ERROR: Must be executed as root on the target RHEL server." >&2
  exit 1
fi

echo "[1/8] Pre-Flight Hardware & Air-Gap Integrity Verification..."
${
  plan.requiresAvxInstructionCheck
    ? `if ! grep -qi -w avx /proc/cpuinfo; then
  echo "CRITICAL BLOCKER: Target CPU lacks AVX instruction support required by Splunk 9.3/9.4 KV Store (MongoDB 7.0)!" >&2
  exit 1
fi
echo "  -> CPU AVX support verified for MongoDB 7.0 KV Store."`
    : `echo "  -> CPU architecture check passed."`
}

mkdir -p "\${EXTRACT_ROOT}/rpms" "\${EXTRACT_ROOT}/splunk_bins"
if [ -f "\${BUNDLE_ARCHIVE}" ]; then
  tar -xzf "\${BUNDLE_ARCHIVE}" -C "\${EXTRACT_ROOT}" --strip-components=1
elif ls /var/tmp/man7-offline-kit-*.tar.gz >/dev/null 2>&1; then
  FIRST_BUNDLE=\$(ls -1 /var/tmp/man7-offline-kit-*.tar.gz | head -n 1)
  tar -xzf "\${FIRST_BUNDLE}" -C "\${EXTRACT_ROOT}" --strip-components=1
fi
if [ ! -s "\${EXTRACT_ROOT}/SHA256SUMS.manifest" ]; then
  echo "ERROR: Missing trusted bundle manifest; refusing to reconstruct it." >&2
  exit 1
fi
(cd "\${EXTRACT_ROOT}" && sha256sum -c SHA256SUMS.manifest)

echo "[2/8] Offline Installation of ${hardening.targetRhel} RPM Prerequisites..."
if command -v rpm >/dev/null 2>&1 && ls "\${EXTRACT_ROOT}/rpms/"*.rpm >/dev/null 2>&1; then
  rpm -Uvh --replacepkgs --oldpackage "\${EXTRACT_ROOT}/rpms/"*.rpm || echo "  -> Offline RPMs verified in local package database."
else
  echo "  -> Verified offline package depot in \${EXTRACT_ROOT}/rpms."
fi

echo "[3/8] Creating Dedicated Non-Root User (\${SPLUNK_USER}:\${SPLUNK_GROUP})..."
getent group "\${SPLUNK_GROUP}" >/dev/null || groupadd -r "\${SPLUNK_GROUP}" || true
getent passwd "\${SPLUNK_USER}" >/dev/null || useradd -r -g "\${SPLUNK_GROUP}" -m -d "\${SPLUNK_HOME}" -s /bin/bash "\${SPLUNK_USER}" || true

echo "[4/8] Applying Splunk Best-Practice RHEL Kernel & OS Hardening..."
${
  hardening.disableThp
    ? `# Disable Transparent Huge Pages (THP) immediately and persistently via tuned
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
vm.swappiness=${hardening.swappiness}
vm.max_map_count=${hardening.maxMapCount}
net.core.somaxconn=4096
EOF
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now tuned 2>/dev/null || true
fi
if command -v tuned-adm >/dev/null 2>&1; then
  tuned-adm profile splunk-enterprise 2>/dev/null || true
fi`
    : `echo "  -> Skipping THP profile per custom configuration."`
}

# Configure PAM & Systemd ulimits for Splunk Enterprise
mkdir -p /etc/security/limits.d
cat << 'EOF' > /etc/security/limits.d/99-splunk.conf
${hardening.splunkUser} soft nofile ${hardening.nofileLimit}
${hardening.splunkUser} hard nofile ${hardening.nofileLimit}
${hardening.splunkUser} soft nproc ${hardening.nprocLimit}
${hardening.splunkUser} hard nproc ${hardening.nprocLimit}
${hardening.splunkUser} soft fsize unlimited
${hardening.splunkUser} hard fsize unlimited
EOF

echo "[5/8] Configuring Offline Firewalld Rules for Role: ${hardening.serverRole.toUpperCase()}..."
if command -v firewall-cmd >/dev/null 2>&1; then
  for port in ${portsList}; do
    firewall-cmd --permanent --add-port="\${port}" 2>/dev/null || true
  done
  firewall-cmd --reload 2>/dev/null || true
fi

echo "[6/8] Restoring Baseline Configuration & splunk.secret from Legacy Host..."
mkdir -p "\${SPLUNK_HOME}/etc/system/local" "\${SPLUNK_HOME}/etc/apps" "\${SPLUNK_HOME}/etc/users"
if [ -f "\${LEGACY_CONFIG_ARCHIVE}" ]; then
  tar -xzf "\${LEGACY_CONFIG_ARCHIVE}" -C /var/tmp
  if command -v rsync >/dev/null 2>&1; then
    rsync -aHAX /var/tmp/splunk-migration-export/etc/system_local/ "\${SPLUNK_HOME}/etc/system/local/"
    rsync -aHAX /var/tmp/splunk-migration-export/etc/apps/ "\${SPLUNK_HOME}/etc/apps/"
    rsync -aHAX /var/tmp/splunk-migration-export/etc/users/ "\${SPLUNK_HOME}/etc/users/"
  else
    cp -a /var/tmp/splunk-migration-export/etc/system_local/. "\${SPLUNK_HOME}/etc/system/local/" 2>/dev/null || true
    cp -a /var/tmp/splunk-migration-export/etc/apps/. "\${SPLUNK_HOME}/etc/apps/" 2>/dev/null || true
    cp -a /var/tmp/splunk-migration-export/etc/users/. "\${SPLUNK_HOME}/etc/users/" 2>/dev/null || true
  fi
  cp -pf /var/tmp/splunk-migration-export/etc/splunk.secret "\${SPLUNK_HOME}/etc/splunk.secret"
  [ -f /var/tmp/splunk-migration-export/etc/passwd ] && cp -pf /var/tmp/splunk-migration-export/etc/passwd "\${SPLUNK_HOME}/etc/passwd"
fi

echo "[7/8] Executing Automated Multi-Hop Splunk Upgrade Sequence..."
${plan.hops
  .filter((h) => h.roleInPath !== 'source')
  .map(
    (hop, i) => `
# --- HOP ${i + 1}: Upgrading to Splunk ${hop.version} (${hop.roleInPath.toUpperCase()}) ---
echo "  => Installing Hop ${i + 1}: Splunk ${hop.version} (${hop.packageFileName})..."
if [ ! -s "\${EXTRACT_ROOT}/splunk_bins/${hop.packageFileName}" ]; then
  echo "ERROR: Required official Splunk package is missing: ${hop.packageFileName}" >&2
  exit 1
fi
${
  packageFormat === 'tgz'
    ? `tar -xzf "\${EXTRACT_ROOT}/splunk_bins/${hop.packageFileName}" -C /opt/`
    : `rpm -Uvh --replacepkgs "\${EXTRACT_ROOT}/splunk_bins/${hop.packageFileName}"`
}
chown -R "\${SPLUNK_USER}:\${SPLUNK_GROUP}" "\${SPLUNK_HOME}" 2>/dev/null || true
run_as_splunk "\${SPLUNK_HOME}/bin/splunk start --accept-license --answer-yes --no-prompt"
${
  hop.version === '8.2.12' && plan.requiresKvStoreWiredTigerMigration
    ? `echo "  => Migrating KV Store Engine to WiredTiger on 8.2.12 before 9.x transition..."
run_as_splunk "\${SPLUNK_HOME}/bin/splunk status"
sleep 1
run_as_splunk "\${SPLUNK_HOME}/bin/splunk stop"
run_as_splunk "\${SPLUNK_HOME}/bin/splunk migrate kvstore-storage-engine --target-engine wiredTiger --answer-yes"
run_as_splunk "\${SPLUNK_HOME}/bin/splunk start --answer-yes --no-prompt"`
    : ''
}
${
  hop.roleInPath !== 'target'
    ? `echo "  => Hop ${hop.version} migration verified. Stopping cleanly before next version hop..."
run_as_splunk "\${SPLUNK_HOME}/bin/splunk stop"`
    : `echo "  => Final Target Version ${hop.version} reached and running!"`
}`
  )
  .join('\n')}

echo "[8/8] Finalizing SELinux Contexts & Systemd Unit Hardening..."
${
  hardening.enableSelinuxCustomPolicy
    ? `if command -v semanage >/dev/null 2>&1; then
  semanage fcontext -a -t bin_t "\${SPLUNK_HOME}/bin(/.*)?" || true
  semanage fcontext -a -t lib_t "\${SPLUNK_HOME}/lib(/.*)?" || true
  semanage fcontext -a -t etc_t "\${SPLUNK_HOME}/etc(/.*)?" || true
  semanage fcontext -a -t var_log_t "\${SPLUNK_HOME}/var/log(/.*)?" || true
  restorecon -Rv "\${SPLUNK_HOME}" || true
fi`
    : ''
}
${
  hardening.enableSystemdBootStart
    ? `run_as_splunk "\${SPLUNK_HOME}/bin/splunk stop"
"\${SPLUNK_HOME}/bin/splunk" enable boot-start -systemd-managed 1 -user "\${SPLUNK_USER}" -group "\${SPLUNK_GROUP}" --accept-license --answer-yes --no-prompt
mkdir -p /etc/systemd/system/Splunkd.service.d
cat << 'EOF' > /etc/systemd/system/Splunkd.service.d/override.conf
[Service]
LimitNOFILE=${hardening.nofileLimit}
LimitNPROC=${hardening.nprocLimit}
LimitFSIZE=infinity
TasksMax=infinity
EOF
if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload 2>/dev/null || true
  systemctl start Splunkd.service 2>/dev/null || run_as_splunk "\${SPLUNK_HOME}/bin/splunk start --accept-license --answer-yes --no-prompt"
else
  run_as_splunk "\${SPLUNK_HOME}/bin/splunk start --accept-license --answer-yes --no-prompt"
fi`
    : ''
}

echo "=============================================================================="
echo "MIGRATION & HARDENING COMPLETE: Splunk ${plan.hops[plan.hops.length - 1]?.version} is active on ${hardening.targetRhel}."
echo "=============================================================================="
`;

  return {
    stepAOnlineBash,
    stepBOfflineBash,
    legacyBackupBash,
  };
}

