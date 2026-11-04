export interface SampleConfigPreset {
  id: string;
  titleFA: string;
  fileName: string;
  descriptionFA: string;
  content: string;
}

export interface RunbookCheckItem {
  id: string;
  phase: 'phase1_legacy' | 'phase2_online_harvest' | 'phase3_rhel_hardening' | 'phase4_splunk_migration';
  phaseLabelFA: string;
  titleFA: string;
  rationaleFA: string;
  verifyCommand: string;
  expectedOutput: string;
  splunkBestPracticeRef: string;
}

export const SAMPLE_CONFIG_PRESETS: SampleConfigPreset[] = [
  {
    id: 'server_conf_legacy',
    titleFA: 'server.conf (کلاستر و KV Store)',
    fileName: '$SPLUNK_HOME/etc/system/local/server.conf',
    descriptionFA: 'شامل تنظیمات قدیمی Python 2، موتور MMAPv1 در KV Store، پروتکل‌های ضعیف SSLv3/TLS1.0 و مد کلاستر Master',
    content: `# Legacy Splunk 8.1 Enterprise server.conf
[general]
serverName = splunk-rhel7-legacy-idx01
pass4SymmKey = $7$a9K2mP8xQ1vR4tY7wZ0bN3cM6vB9nX2zL5kJ8hG1fD4sA7
python.version = python2

[sslConfig]
enableSplunkdSSL = true
sslVersions = ssl3, tls1.0, tls1.1, tls1.2
cipherSuite = ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384

[kvstore]
disabled = false
storageEngine = mmapv1
port = 8191

[clustering]
mode = master
replication_factor = 3
search_factor = 2
pass4SymmKey = $7$xK9mN2pQ5vR8tY1wZ4bC7vB0nM3lK6jH9gF2dS5aP8oI1u
`,
  },
  {
    id: 'inputs_outputs_legacy',
    titleFA: 'inputs.conf (فورواردر و ورودی)',
    fileName: '$SPLUNK_HOME/etc/system/local/inputs.conf',
    descriptionFA: 'شامل تنظیمات دریافت لاگ S2S، اسکریپت‌های مانیتورینگ لینوکس با مفسر قدیمی و نام سرور قدیمی',
    content: `[default]
host = splunk-centos7-old-hf01

[splunktcp-ssl:9997]
disabled = 0
compressed = true

[SSL]
serverCert = /opt/splunk/etc/auth/server.pem
sslVersions = tls1.0, tls1.2
requireClientCert = true

[script:///opt/splunk/etc/apps/TA-linux-audit/bin/rlog.sh]
disabled = false
interval = 60
sourcetype = linux:audit
python.version = python2
`,
  },
  {
    id: 'web_conf_legacy',
    titleFA: 'web.conf (رابط Splunk Web)',
    fileName: '$SPLUNK_HOME/etc/system/local/web.conf',
    descriptionFA: 'تنظیمات رمزنگاری رابط وب، نشست‌های کاربری و نسخه مفسر پایتون در Splunk Web',
    content: `[settings]
enableSplunkWebSSL = true
httpport = 8000
sslVersions = tls1.1, tls1.2
python.version = default
tools.sessions.timeout = 60
x_frame_options_sameorigin = true
`,
  },
];

export const OFFICIAL_MIGRATION_RUNBOOK: RunbookCheckItem[] = [
  {
    id: 'chk-1',
    phase: 'phase1_legacy',
    phaseLabelFA: 'فاز ۱: ممیزی و پشتیبان‌گیری سرور قدیمی',
    titleFA: 'بررسی سلامت سینتکس تمام فایل‌های کانفیگ با btool',
    rationaleFA: 'قبل از هرگونه کپی کانفیگ یا ارتقاء نسخه، باید خطاهای تایپی و پارامترهای نامعتبر در فایل‌های `.conf` شناسایی شوند.',
    verifyCommand: '/opt/splunk/bin/splunk cmd btool check',
    expectedOutput: 'خروجی خالی (کد بازگشت 0 به معنای عدم وجود خطای سینتکس است)',
    splunkBestPracticeRef: 'Splunk Enterprise Admin Manual: Use btool to troubleshoot configurations',
  },
  {
    id: 'chk-2',
    phase: 'phase1_legacy',
    phaseLabelFA: 'فاز ۱: ممیزی و پشتیبان‌گیری سرور قدیمی',
    titleFA: 'پشتیبان‌گیری یکپارچه از KV Store و کلید رمزنگاری splunk.secret',
    rationaleFA: 'حفظ فایل `splunk.secret` برای رمزگشایی پسوردهای هش‌شده (`$7$...`) در سرور جدید حیاتی است. بدون آن تمام پسوردهای LDAP، SSL و `pass4SymmKey` از کار می‌افتند.',
    verifyCommand: '/opt/splunk/bin/splunk show kvstore-status && ls -l /opt/splunk/etc/splunk.secret',
    expectedOutput: 'status : ready | storageEngine : wiredTiger | -r-------- 1 splunk splunk 255 splunk.secret',
    splunkBestPracticeRef: 'Splunk Docs: Back up and restore KV store / Migrate a Splunk instance',
  },
  {
    id: 'chk-3',
    phase: 'phase2_online_harvest',
    phaseLabelFA: 'فاز ۲: ماشین آنلاین و ساخت باندل Air-Gap',
    titleFA: 'دانلود کامل وابستگی‌های RPM لینوکس RHEL با فلگ --resolve --alldeps',
    rationaleFA: 'در محیط ایزوله (Air-Gapped)، نبودن پکیج‌هایی مانند `libxcrypt-compat` در RHEL 9 یا `policycoreutils-python-utils` باعث شکست نصب و خطای SELinux می‌شود.',
    verifyCommand: 'dnf download --resolve --alldeps --destdir=/tmp/man7-airgap-bundle/rpms glibc libxcrypt-compat policycoreutils-python-utils tuned rsync chrony',
    expectedOutput: 'تکمیل دانلود تمامی فایل‌های .rpm و وابستگی‌های سطح دوم همراه با مانیفست SHA256',
    splunkBestPracticeRef: 'Red Hat Knowledgebase: Installing packages offline on Air-Gapped RHEL 8/9',
  },
  {
    id: 'chk-4',
    phase: 'phase3_rhel_hardening',
    phaseLabelFA: 'فاز ۳: ایمن‌سازی و بهینه‌سازی کرنل RHEL جدید',
    titleFA: 'بررسی پشتیبانی پردازنده از دستورالعمل AVX برای Splunk 9.3/9.4',
    rationaleFA: 'موتور KV Store در Splunk 9.3 و 9.4 به MongoDB 7.0 ارتقاء یافته که بدون فلگ سخت‌افزاری AVX در پردازنده (یا VMware/KVM CPU passthrough) اجرا نمی‌شود.',
    verifyCommand: 'grep -o -w avx /proc/cpuinfo | head -n 1',
    expectedOutput: 'avx',
    splunkBestPracticeRef: 'Splunk 9.3/9.4 Release Notes: KV Store Server Version 7.0 Hardware Requirements',
  },
  {
    id: 'chk-5',
    phase: 'phase3_rhel_hardening',
    phaseLabelFA: 'فاز ۳: ایمن‌سازی و بهینه‌سازی کرنل RHEL جدید',
    titleFA: 'غیرفعال‌سازی دائمی Transparent Huge Pages (THP) در کرنل RHEL',
    rationaleFA: 'فعال بودن THP در لینوکس باعث افت شدید ۳۰ تا ۴۰ درصدی کارایی I/O در ایندکسرها و تاخیر بالا در جستجوهای اسپلانک می‌شود.',
    verifyCommand: 'cat /sys/kernel/mm/transparent_hugepage/enabled && cat /sys/kernel/mm/transparent_hugepage/defrag',
    expectedOutput: 'always madvise [never]',
    splunkBestPracticeRef: 'Splunk Capacity Planning Manual: Transparent huge pages (THP) and Splunk performance',
  },
  {
    id: 'chk-6',
    phase: 'phase3_rhel_hardening',
    phaseLabelFA: 'فاز ۳: ایمن‌سازی و بهینه‌سازی کرنل RHEL جدید',
    titleFA: 'تنظیم محدودیت‌های Systemd (LimitNOFILE=65536 و LimitNPROC=16384)',
    rationaleFA: 'در RHEL 8/9 سرویس‌های مدیریت‌شده با systemd فایل `/etc/security/limits.conf` را نادیده می‌گیرند و مقادیر باید در واحد `Splunkd.service` ثبت شوند.',
    verifyCommand: 'systemctl show Splunkd.service -p LimitNOFILE -p LimitNPROC -p LimitFSIZE',
    expectedOutput: 'LimitNOFILE=65536 | LimitNPROC=16384 | LimitFSIZE=infinity',
    splunkBestPracticeRef: 'Splunk Admin Manual: Configure systemd using enable boot-start',
  },
  {
    id: 'chk-7',
    phase: 'phase4_splunk_migration',
    phaseLabelFA: 'فاز ۴: ارتقاء گام‌به‌گام نسخه و اعتبارسنجی نهایی',
    titleFA: 'مهاجرت موتور KV Store به WiredTiger در ایستگاه ۸.۲ قبل از عبور به ۹.x',
    rationaleFA: 'ارتقاء مستقیم به Splunk 9.x در حالی که KV Store هنوز روی موتور قدیمی MMAPv1 است باعث از کار افتادن کامل Search Head و پنل‌های Enterprise Security می‌شود.',
    verifyCommand: '/opt/splunk/bin/splunk show kvstore-status | grep -E "status|storageEngine|serverVersion"',
    expectedOutput: 'status : ready | storageEngine : wiredTiger | serverVersion : 4.2.x (or 7.0.x)',
    splunkBestPracticeRef: 'Splunk Enterprise Upgrade Manual: Migrate the KV store storage engine',
  },
  {
    id: 'chk-8',
    phase: 'phase4_splunk_migration',
    phaseLabelFA: 'فاز ۴: ارتقاء گام‌به‌گام نسخه و اعتبارسنجی نهایی',
    titleFA: 'بررسی عدم وجود خطای Integrity و تست نهایی سلامت سرویس‌ها',
    rationaleFA: 'پس از رسیدن به آخرین نسخه هدف در سرور جدید، یکپارچگی باینری‌ها و ارتباط پورت‌های مدیریتی و ایندکسینگ بررسی می‌شود.',
    verifyCommand: '/opt/splunk/bin/splunk check-integrity -index _internal && /opt/splunk/bin/splunk status',
    expectedOutput: 'splunkd is running (PID: ...)',
    splunkBestPracticeRef: 'Splunk Post-Upgrade Validation Checklist',
  },
];
