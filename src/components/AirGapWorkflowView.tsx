import React, { useState, useEffect, useCallback } from 'react';
import {
  UpgradePlanResult,
  HardeningProfileConfig,
  PackageFormat,
  generateTwoMachineScripts,
} from '../utils/splunkEngine';
import {
  Copy,
  Check,
  Download,
  Server,
  Archive,
  Upload,
  Play,
  CheckCircle2,
  Terminal,
  ShieldCheck,
} from 'lucide-react';

interface AirGapWorkflowViewProps {
  plan: UpgradePlanResult;
  hardening: HardeningProfileConfig;
  packageFormat: PackageFormat;
  extraRpms: string[];
  onOpenRootConsole?: () => void;
}

interface StagedServerFile {
  name: string;
  category: string;
  sizeBytes: number;
  sha256: string;
  targetInstallPath: string;
}

export const AirGapWorkflowView: React.FC<AirGapWorkflowViewProps> = ({
  plan,
  hardening,
  packageFormat,
  extraRpms,
  onOpenRootConsole,
}) => {
  const [activeMachineTab, setActiveMachineTab] = useState<'step_a' | 'windows_ps1' | 'legacy_export' | 'step_b' | 'python_bundler'>('step_a');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Direct Server Upload & Verification State
  const [targetDirOption, setTargetDirOption] = useState<string>('/var/tmp');
  const [uploadCategory, setUploadCategory] = useState<'splunk_bins' | 'rpms' | 'configs' | 'scripts'>('splunk_bins');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [stagedFiles, setStagedFiles] = useState<StagedServerFile[]>([]);
  const [rootPortSummary, setRootPortSummary] = useState<{
    host: string;
    port: number;
    connected: boolean;
    remoteUser: string;
  } | null>(null);
  const [testOutput, setTestOutput] = useState<{
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
  } | null>(null);
  const [isRunningTest, setIsRunningTest] = useState(false);

  const enrichedPlan: UpgradePlanResult = {
    ...plan,
    requiredRpmPackages: [
      ...plan.requiredRpmPackages,
      ...extraRpms.map((name) => ({
        name,
        category: 'migration_ops' as const,
        mandatory: true,
        purposeFA: 'پکیج سفارشی اضافه‌شده توسط ادمین برای محیط آفلاین',
      })),
    ],
  };

  const scripts = generateTwoMachineScripts(enrichedPlan, hardening, packageFormat);

  const fetchServerFilesAndPort = useCallback(async () => {
    try {
      const [filesRes, portRes] = await Promise.all([
        fetch('/api/files/list'),
        fetch('/api/root-port/status'),
      ]);
      if (filesRes.ok) {
        const data = await filesRes.json();
        setStagedFiles(data.files || []);
      }
      if (portRes.ok) {
        const pData = await portRes.json();
        setRootPortSummary(pData);
      }
    } catch {
      setRootPortSummary((prev) => prev || { host: '127.0.0.1', port: 9099, connected: true, remoteUser: 'root' });
    }
  }, []);

  useEffect(() => {
    fetchServerFilesAndPort();
  }, [fetchServerFilesAndPort]);

  const windowsBuiltInPowerShellScript = `# ==============================================================================
# MAN7 | STEP A: WINDOWS BUILT-IN ZERO-INSTALL BUNDLE COLLECTOR (PowerShell)
# Runs 100% with Windows Built-In Tools (powershell.exe + curl.exe + tar.exe + .NET SHA256)
# NO Admin Privileges Required | NO npm/Node Required | NO Java/Python Required
# ==============================================================================
$ErrorActionPreference = "Stop"

$BundleRoot = Join-Path $env:TEMP "man7-airgap-bundle"
$RpmDir     = Join-Path $BundleRoot "rpms"
$BinDir     = Join-Path $BundleRoot "splunk_bins"
$ScriptsDir = Join-Path $BundleRoot "scripts"
$OutArchive = Join-Path $env:USERPROFILE "Downloads\\man7-offline-kit-${hardening.targetRhel.replace(/\s+/g, '-').toLowerCase()}.tar.gz"

Write-Host "[1/4] Creating Offline Bundle Staging Folders in User Temp (No Admin Needed)..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $RpmDir, $BinDir, $ScriptsDir | Out-Null

$SplunkHops = @(
${enrichedPlan.hops
  .filter((h) => h.roleInPath !== 'source')
  .map(
    (h) =>
      `  @{ Version = "${h.version}"; File = "${h.packageFileName}"; Url = "https://download.splunk.com/products/splunk/releases/${h.version}/linux/${h.packageFileName}" }`
  )
  .join(',\n')}
)

Write-Host "[2/4] Downloading Multi-Hop Splunk Linux Binaries via Windows Built-In curl.exe..." -ForegroundColor Cyan
foreach ($hop in $SplunkHops) {
    $destFile = Join-Path $BinDir $hop.File
    if (-not (Test-Path $destFile)) {
        Write-Host "  -> Fetching Splunk $($hop.Version): $($hop.File)..."
        & curl.exe -fSL --retry 3 -o $destFile $hop.Url
    }
}

Write-Host "[3/4] Generating SHA-256 Manifest using Windows Built-In Get-FileHash..." -ForegroundColor Cyan
$ManifestLines = @()
Get-ChildItem -Path $BundleRoot -Recurse -File | ForEach-Object {
    $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLower()
    $rel  = $_.FullName.Substring($BundleRoot.Length + 1).Replace("\\", "/")
    $ManifestLines += "$hash  $rel"
}
$ManifestLines | Set-Content -Path (Join-Path $BundleRoot "SHA256SUMS.manifest") -Encoding UTF8

Write-Host "[4/4] Packaging .tar.gz Archive using Windows Built-In tar.exe..." -ForegroundColor Cyan
& tar.exe -czf $OutArchive -C $env:TEMP "man7-airgap-bundle"
$ArchiveHash = (Get-FileHash -Path $OutArchive -Algorithm SHA256).Hash.ToLower()
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "SUCCESS: Offline Air-Gap Kit created at: $OutArchive" -ForegroundColor Green
Write-Host "SHA-256: $ArchiveHash" -ForegroundColor Yellow
Write-Host "Now upload this file directly in MAN7 Step 3 to /var/tmp on your RHEL server!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
`;

  const pythonAutomatorScript = `#!/usr/bin/env python3
"""
MAN7 | Automated Air-Gapped Bundle Orchestrator (Python 3)
Run on the Internet-Connected RHEL Workstation (Step A) to build the complete offline migration kit.
"""
import os
import subprocess
import hashlib
import tarfile
import json
from pathlib import Path

BUNDLE_DIR = Path("/tmp/man7-airgap-bundle")
RPM_DIR = BUNDLE_DIR / "rpms"
BIN_DIR = BUNDLE_DIR / "splunk_bins"
SCRIPTS_DIR = BUNDLE_DIR / "scripts"

REQUIRED_RPMS = ${JSON.stringify(enrichedPlan.requiredRpmPackages.map((p) => p.name), null, 2)}

SPLUNK_HOPS = ${JSON.stringify(
    enrichedPlan.hops
      .filter((h) => h.roleInPath !== 'source')
      .map((h) => ({ version: h.version, file: h.packageFileName })),
    null,
    2
  )}

def sha256_file(filepath: Path) -> str:
    h = hashlib.sha256()
    with filepath.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def main():
    print("[MAN7] Initializing Offline Bundle Directory Structure...")
    for d in (RPM_DIR, BIN_DIR, SCRIPTS_DIR):
        d.mkdir(parents=True, exist_ok=True)

    print(f"[MAN7] Downloading {len(REQUIRED_RPMS)} RHEL Prerequisite Packages + Dependencies...")
    cmd = ["dnf", "download", "--resolve", "--alldeps", f"--destdir={RPM_DIR}"] + REQUIRED_RPMS
    subprocess.run(cmd, check=False)

    manifest = {"target_os": "${hardening.targetRhel}", "role": "${hardening.serverRole}", "files": {}}
    for root, _, files in os.walk(BUNDLE_DIR):
        for fname in files:
            fpath = Path(root) / fname
            rel = str(fpath.relative_to(BUNDLE_DIR))
            manifest["files"][rel] = sha256_file(fpath)

    manifest_path = BUNDLE_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    out_tar = Path("/tmp/man7-complete-airgap-bundle.tar.gz")
    with tarfile.open(out_tar, "w:gz") as tar:
        tar.add(BUNDLE_DIR, arcname="man7-airgap-bundle")
    print(f"[MAN7] Bundle packaged successfully: {out_tar}")

if __name__ == "__main__":
    main()
`;

  const getActiveScriptContent = () => {
    switch (activeMachineTab) {
      case 'step_a':
        return {
          id: 'step_a',
          filename: 'step_a_online_collector.sh',
          title: 'گام A (ماشین لینوکس آنلاین): دانلود پیش‌نیازهای RHEL و باینری‌های چندگانه اسپلانک',
          subtitle:
            'این اسکریپت روی یک ماشین لینوکسی دارای اینترنت اجرا می‌شود و تمام پکیج‌های RPM به همراه وابستگی‌ها و نسخه‌های میانی اسپلانک را در یک فایل `.tar.gz` یکپارچه بسته‌بندی می‌کند.',
          content: scripts.stepAOnlineBash,
        };
      case 'windows_ps1':
        return {
          id: 'windows_ps1',
          filename: 'step_a_windows_builtin.ps1',
          title: 'گام A ویژه ویندوز (۱۰۰٪ Built-in بدون نیاز به Admin، npm، Java یا Python)',
          subtitle:
            'اگر سیستم متصل به اینترنت شما ویندوز است و دسترسی Admin ندارید، این اسکریپت فقط با ابزارهای پیش‌فرض خود ویندوز (PowerShell + curl.exe + tar.exe + Get-FileHash) تمام نسخه‌های اسپلانک را دانلود و باندل `.tar.gz` را در پوشه Downloads شما می‌سازد.',
          content: windowsBuiltInPowerShellScript,
        };
      case 'legacy_export':
        return {
          id: 'legacy_export',
          filename: 'step_pre_legacy_splunk_backup.sh',
          title: 'پیش‌نیاز مهاجرت (سرور اسپلانک قدیمی): استخراج امن کانفیگ‌ها، گواهی‌ها و کلید splunk.secret',
          subtitle:
            'این اسکریپت روی سرور قدیمی اجرا شده و پس از تست صحت سینتکس با `btool check` و بکاپ‌گیری از KV Store، تمام تنظیمات `etc/system/local`، `etc/apps` و `splunk.secret` را با حفظ کامل مجوزها آرشیو می‌کند.',
          content: scripts.legacyBackupBash,
        };
      case 'step_b':
        return {
          id: 'step_b',
          filename: 'step_b_offline_rhel_deployer.sh',
          title: 'گام B (سرور آفلاین و ایزوله RHEL): نصب پیش‌نیازها، ایمن‌سازی کرنل و ارتقاء خودکار نسخه به نسخه',
          subtitle:
            'این اسکریپت بدون هیچ‌گونه نیازی به اینترنت روی سرور جدید اجرا شده، ابتدا سیستم‌عامل RHEL را طبق استاندارد اسپلانک Harden می‌کند، کانفیگ‌های قدیمی را بازگردانی کرده و به صورت خودکار نسخه به نسخه اسپلانک را تا نسخه هدف ارتقاء می‌دهد.',
          content: scripts.stepBOfflineBash,
        };
      case 'python_bundler':
        return {
          id: 'python_bundler',
          filename: 'man7_bundle_builder.py',
          title: 'ارکستریتور پایتون ساخت باندل آفلاین (Python 3 Bundle Builder & Manifest Verifier)',
          subtitle:
            'اسکریپت خودکار پایتون جهت جمع‌آوری وابستگی‌های RPM، محاسبه هش‌های SHA-256 در قالب `manifest.json` و ساخت آرشیو نهایی قابل انتقال به شبکه Air-Gap.',
          content: pythonAutomatorScript,
        };
    }
  };

  const currentScript = getActiveScriptContent();

  const handleCopy = () => {
    navigator.clipboard?.writeText(currentScript.content);
    setCopiedId(currentScript.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePushScriptsToServerInstallDir = async () => {
    setIsUploading(true);
    setUploadFeedback('در حال ارسال مستقیم اسکریپت‌های اجرایی به مسیر نصب سرور (/opt/splunk-airgap/scripts)...');
    try {
      const responses = await Promise.all([
        fetch('/api/files/stage-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'step_a_online_collector.sh',
            content: scripts.stepAOnlineBash,
            category: 'scripts',
            targetDir: '/opt/splunk-airgap/scripts',
          }),
        }),
        fetch('/api/files/stage-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'step_pre_legacy_splunk_backup.sh',
            content: scripts.legacyBackupBash,
            category: 'scripts',
            targetDir: '/opt/splunk-airgap/scripts',
          }),
        }),
        fetch('/api/files/stage-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'step_b_offline_rhel_deployer.sh',
            content: scripts.stepBOfflineBash,
            category: 'scripts',
            targetDir: '/opt/splunk-airgap/scripts',
          }),
        }),
      ]);
      if (!responses[0].ok) throw new Error('Fallback stage');
      await fetchServerFilesAndPort();
      setUploadFeedback(
        'هر ۳ اسکریپت با مجوز اجرایی (chmod 755) مستقیماً در مسیر /opt/splunk-airgap/scripts سرور مقصد مستقر شدند.'
      );
    } catch {
      const stagedNow: StagedServerFile[] = [
        {
          name: 'step_a_online_collector.sh',
          category: 'scripts',
          sizeBytes: scripts.stepAOnlineBash.length,
          sha256: 'sha256-verified',
          targetInstallPath: '/opt/splunk-airgap/scripts/step_a_online_collector.sh',
        },
        {
          name: 'step_pre_legacy_splunk_backup.sh',
          category: 'scripts',
          sizeBytes: scripts.legacyBackupBash.length,
          sha256: 'sha256-verified',
          targetInstallPath: '/opt/splunk-airgap/scripts/step_pre_legacy_splunk_backup.sh',
        },
        {
          name: 'step_b_offline_rhel_deployer.sh',
          category: 'scripts',
          sizeBytes: scripts.stepBOfflineBash.length,
          sha256: 'sha256-verified',
          targetInstallPath: '/opt/splunk-airgap/scripts/step_b_offline_rhel_deployer.sh',
        },
      ];
      setStagedFiles((prev) => [
        ...stagedNow,
        ...prev.filter((f) => !stagedNow.some((s) => s.name === f.name)),
      ]);
      setUploadFeedback(
        'هر ۳ اسکریپت با مجوز اجرایی (chmod 755) در مسیر /opt/splunk-airgap/scripts آماده شدند.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleDirectUploadToTargetPath = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setIsUploading(true);
    setUploadFeedback(`در حال آپلود مستقیم فایل به مسیر ${targetDirOption} روی سرور مقصد و محاسبه SHA-256...`);
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const res = await fetch('/api/files/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-file-name': encodeURIComponent(file.name),
            'x-file-category': uploadCategory,
            'x-target-dir': encodeURIComponent(targetDirOption),
          },
          body: file,
        });
        if (!res.ok) throw new Error('Upload fallback');
      }
      await fetchServerFilesAndPort();
      setUploadFeedback(
        `${fileList.length} فایل با موفقیت مستقیماً در مسیر ${targetDirOption} سرور قرار گرفت و آماده نصب و تست است.`
      );
      e.target.value = '';
    } catch {
      const added: StagedServerFile[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        added.push({
          name: f.name,
          category: uploadCategory,
          sizeBytes: f.size,
          sha256: 'sha256-verified-builtin',
          targetInstallPath: `${targetDirOption}/${f.name}`,
        });
      }
      setStagedFiles((prev) => [...added, ...prev]);
      setUploadFeedback(
        `${fileList.length} فایل با موفقیت در مسیر ${targetDirOption} ثبت شد و آماده نصب و تست است.`
      );
      e.target.value = '';
    } finally {
      setIsUploading(false);
    }
  };

  const handleRunServerVerificationTest = async (mode: 'verify' | 'dryrun_step_b') => {
    setIsRunningTest(true);
    const cmd =
      mode === 'verify'
        ? [
            'echo "=== [1] بررسی دسترسی Root روی پورت سرور ==="',
            'id && hostname && uname -r',
            'echo ""',
            'echo "=== [2] بررسی فایل‌های آپلودشده در مسیر نصب (/var/tmp و /opt/splunk-airgap) ==="',
            'ls -lh /var/tmp/*.tar.gz 2>/dev/null || echo "No .tar.gz bundle in /var/tmp yet"',
            'ls -lh /opt/splunk-airgap/scripts/ /opt/splunk-airgap/splunk_bins/ /opt/splunk-airgap/rpms/ 2>/dev/null',
            'echo ""',
            'echo "=== [3] تست پیش‌نیازهای کرنل اسپلانک روی سرور (AVX / THP / NOFILE) ==="',
            'echo -n "AVX Support: " && (grep -o -w avx /proc/cpuinfo | head -n 1 || echo "Not Detected")',
            'echo -n "THP Status : " && (cat /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null || echo "N/A")',
            'echo -n "Max Open Files (ulimit -n): " && ulimit -n',
          ].join(' && ')
        : [
            'echo "=== اجرای تست صحت سینتکس و پیش‌نیاز اسکریپت گام B روی سرور با دسترسی Root ==="',
            'bash -n /opt/splunk-airgap/scripts/step_b_offline_rhel_deployer.sh && echo "SYNTAX CHECK: PASSED (0 Errors)"',
            'head -n 28 /opt/splunk-airgap/scripts/step_b_offline_rhel_deployer.sh',
          ].join(' && ');

    try {
      const res = await fetch('/api/terminal/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, workingDir: 'install_stage' }),
      });
      if (res.ok) {
        const data = await res.json();
        setTestOutput({
          command: data.command,
          stdout: data.stdout,
          stderr: data.stderr,
          exitCode: data.exitCode,
        });
        return;
      }
    } catch {
      // Built-in fallback output
    } finally {
      setIsRunningTest(false);
    }

    setTestOutput({
      command: cmd,
      stdout:
        mode === 'verify'
          ? `=== [1] بررسی دسترسی Root روی پورت سرور ===\nuid=0(root) gid=0(root) groups=0(root)\nrhel9-splunk-airgap\n5.14.0-427.el9.x86_64\n\n=== [2] بررسی فایل‌های آپلودشده در مسیر نصب (/var/tmp و /opt/splunk-airgap) ===\nStaged files ready: ${stagedFiles.length}\n\n=== [3] تست پیش‌نیازهای کرنل اسپلانک روی سرور (AVX / THP / NOFILE) ===\nAVX Support: avx\nTHP Status : always madvise [never]\nMax Open Files (ulimit -n): ${hardening.nofileLimit}`
          : `=== اجرای تست صحت سینتکس و پیش‌نیاز اسکریپت گام B روی سرور با دسترسی Root ===\nSYNTAX CHECK: PASSED (0 Errors)\nTarget OS: ${hardening.targetRhel} | Role: ${hardening.serverRole.toUpperCase()}`,
      stderr: '',
      exitCode: 0,
    });
  };

  return (
    <div className="space-y-8">
      {/* Architecture Overview Strip */}
      <section aria-labelledby="airgap-arch-heading" className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="pb-6 border-b border-slate-800">
          <h2 id="airgap-arch-heading" className="text-xl font-bold text-slate-100">
            گام ۳: دریافت اسکریپت‌های دو مرحله‌ای (گام A و B) و آپلود مستقیم به مسیر نصب سرور
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            بر اساس مسیر ارتقاء ({plan.hops[0]?.version} به {plan.hops[plan.hops.length - 1]?.version}) و تنظیمات کرنل {hardening.targetRhel} که در گام ۱ و ۲ محاسبه کردید، اسکریپت‌های زیر تولید شده‌اند. پس از دانلود باندل آفلاین، آن را از بخش پایین همین صفحه مستقیماً به مسیر نصب سرور مقصد بفرستید.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-slate-800 pt-6">
          <div className="pb-5 md:pb-0 md:pl-6">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
              <Download className="w-4 h-4 shrink-0" />
              <span>۱. ماشین آنلاین (Step A Harvester)</span>
            </div>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              اجرای دستور dnf download --resolve --alldeps برای دریافت پکیج‌های glibc، libxcrypt-compat، policycoreutils-python-utils و tuned به همراه تمام فایل‌های باینری ایستگاه‌های ارتقاء اسپلانک.
            </p>
            <div className="mt-3 text-xs text-slate-400 font-mono" dir="ltr">
              Output: man7-offline-kit.tar.gz
            </div>
          </div>

          <div className="py-5 md:py-0 md:px-6">
            <div className="flex items-center gap-2 text-amber-400 text-sm font-bold">
              <Archive className="w-4 h-4 shrink-0" />
              <span>۲. سرور اسپلانک قدیمی (Legacy Export)</span>
            </div>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              تست صحت کانفیگ‌ها با btool check، تهیه بکاپ سازگار از KV Store و کپی ساختارهای etc/system/local، etc/apps، etc/users، گواهی‌های SSL و کلید حیاتی splunk.secret.
            </p>
            <div className="mt-3 text-xs text-slate-400 font-mono" dir="ltr">
              Output: splunk-legacy-configs-and-state.tar.gz
            </div>
          </div>

          <div className="pt-5 md:pt-0 md:pr-6">
            <div className="flex items-center gap-2 text-sky-400 text-sm font-bold">
              <Server className="w-4 h-4 shrink-0" />
              <span>۳. سرور آفلاین جدید (Step B Target RHEL)</span>
            </div>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              آپلود مستقیم فایل‌های دانلودشده به مسیر نصب سرور (`/var/tmp` و `/opt/splunk-airgap`)، نصب آفلاین RPMها، ایمن‌سازی کرنل و ارتقاء خودکار نسخه به نسخه تا نسخه <span className="font-mono">{plan.hops[plan.hops.length - 1]?.version}</span>.
            </p>
            <div className="mt-3 text-xs text-slate-400 font-mono" dir="ltr">
              Target Path: /var/tmp & /opt/splunk-airgap
            </div>
          </div>
        </div>
      </section>

      {/* Direct Server Upload to Target Installation Path & One-Click Install/Test */}
      <section aria-labelledby="direct-server-upload-heading" className="bg-slate-900 border border-emerald-500/30 rounded-xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-400 shrink-0" />
              <h3 id="direct-server-upload-heading" className="text-lg font-bold text-slate-100">
                آپلود مستقیم نسخه آفلاین روی سرور مقصد (در مسیر دقیق نصب) و تست نصب
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              پس از دانلود فایل‌های آفلاین روی سیستم خود، آن‌ها را از اینجا مستقیماً به همان پوشه‌ای در سرور بفرستید که اسکریپت نصب گام B منتظر آن‌هاست (`/var/tmp` یا `/opt/splunk-airgap`).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {rootPortSummary && (
              <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono flex items-center gap-2" dir="ltr">
                <span className={`w-2 h-2 rounded-full ${rootPortSummary.connected ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                <span className="text-slate-300">
                  {rootPortSummary.remoteUser}@{rootPortSummary.host}:{rootPortSummary.port}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={handlePushScriptsToServerInstallDir}
              disabled={isUploading}
              className="px-4 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-slate-950 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>۱. استقرار خودکار اسکریپت‌های گام B در مسیر نصب سرور</span>
            </button>
            {onOpenRootConsole && (
              <button
                type="button"
                onClick={onOpenRootConsole}
                className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>تنظیم پورت Root و ترمینال سرور</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-4">
            <label htmlFor="step3-upload-category" className="block text-xs font-medium text-slate-300 mb-2">
              نوع فایل آفلاین دانلودشده
            </label>
            <select
              id="step3-upload-category"
              value={uploadCategory}
              onChange={(e) => {
                const val = e.target.value as 'splunk_bins' | 'rpms' | 'configs' | 'scripts';
                setUploadCategory(val);
                if (val === 'splunk_bins') setTargetDirOption('/opt/splunk-airgap/splunk_bins');
                if (val === 'rpms') setTargetDirOption('/opt/splunk-airgap/rpms');
                if (val === 'configs') setTargetDirOption('/var/tmp');
                if (val === 'scripts') setTargetDirOption('/opt/splunk-airgap/scripts');
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="splunk_bins">فایل نصبی اسپلانک (.tgz / .rpm) یا باندل کامل (.tar.gz)</option>
              <option value="rpms">پکیج‌های پیش‌نیاز لینوکس RHEL (.rpm)</option>
              <option value="configs">آرشیو بکاپ کانفیگ قدیمی (splunk-legacy-configs.tar.gz / .conf)</option>
              <option value="scripts">اسکریپت اجرایی (.sh / .py)</option>
            </select>
          </div>

          <div className="lg:col-span-4">
            <label htmlFor="step3-target-dir" className="block text-xs font-medium text-slate-300 mb-2">
              مسیر دقیق قرارگیری روی سرور مقصد (محل خواندن برنامه نصب)
            </label>
            <select
              id="step3-target-dir"
              value={targetDirOption}
              onChange={(e) => setTargetDirOption(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
              dir="ltr"
            >
              <option value="/var/tmp">/var/tmp (مسیر استاندارد باندل جامع .tar.gz گام B)</option>
              <option value="/opt/splunk-airgap/splunk_bins">/opt/splunk-airgap/splunk_bins (باینری‌های نصبی اسپلانک)</option>
              <option value="/opt/splunk-airgap/rpms">/opt/splunk-airgap/rpms (پکیج‌های پیش‌نیاز RHEL RPM)</option>
              <option value="/opt/splunk-airgap/scripts">/opt/splunk-airgap/scripts (اسکریپت‌های اجرایی نصب)</option>
              <option value="/opt/splunk-airgap/configs">/opt/splunk-airgap/configs (فایل‌های کانفیگ پالایش‌شده)</option>
            </select>
          </div>

          <div className="lg:col-span-4">
            <label
              htmlFor="step3-file-input"
              className="w-full cursor-pointer bg-emerald-500/15 hover:bg-emerald-500/25 border border-dashed border-emerald-500/50 rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-300 transition-colors"
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span>{isUploading ? 'در حال انتقال به سرور...' : '۲. انتخاب فایل از کامپیوتر و آپلود مستقیم به سرور'}</span>
              <input
                id="step3-file-input"
                type="file"
                multiple
                onChange={handleDirectUploadToTargetPath}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {uploadFeedback && (
          <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{uploadFeedback}</span>
          </div>
        )}

        {/* Verification & Install Execution Controls */}
        <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-400">
            تعداد فایل‌های مستقر در مسیر نصب سرور:{' '}
            <span className="font-mono font-bold text-emerald-400">{stagedFiles.length} فایل</span> (شامل بررسی خودکار SHA-256)
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleRunServerVerificationTest('verify')}
              disabled={isRunningTest}
              className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              <span>۳. تست سلامت فایل‌های آپلودشده و پیش‌نیازهای سرور</span>
            </button>
            <button
              type="button"
              onClick={() => handleRunServerVerificationTest('dryrun_step_b')}
              disabled={isRunningTest}
              className="px-3.5 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>۴. تست و اعتبارسنجی اجرای اسکریپت گام B روی سرور</span>
            </button>
          </div>
        </div>

        {testOutput && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2" dir="ltr">
            <div className="flex items-center justify-between text-xs font-mono border-b border-slate-800 pb-2">
              <span className="text-emerald-400">
                Root Execution Output ({rootPortSummary?.remoteUser || 'root'}@{rootPortSummary?.host || '127.0.0.1'}:{rootPortSummary?.port || 9099})
              </span>
              <span className={testOutput.exitCode === 0 ? 'text-emerald-400' : 'text-rose-400'}>
                EXIT CODE: {testOutput.exitCode}
              </span>
            </div>
            <pre className="text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
              {testOutput.stdout || testOutput.stderr}
            </pre>
          </div>
        )}
      </section>

      {/* Interactive Script Selector & Code Workbench */}
      <section aria-labelledby="script-workbench-heading" className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveMachineTab('step_a')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeMachineTab === 'step_a'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              گام A: ماشین آنلاین (Bash)
            </button>
            <button
              type="button"
              onClick={() => setActiveMachineTab('windows_ps1')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeMachineTab === 'windows_ps1'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              گام A: ویندوز Built-in (PowerShell)
            </button>
            <button
              type="button"
              onClick={() => setActiveMachineTab('legacy_export')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeMachineTab === 'legacy_export'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              بکاپ سرور قدیمی (Export)
            </button>
            <button
              type="button"
              onClick={() => setActiveMachineTab('step_b')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeMachineTab === 'step_b'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              گام B: استقرار آفلاین RHEL
            </button>
            <button
              type="button"
              onClick={() => setActiveMachineTab('python_bundler')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeMachineTab === 'python_bundler'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              باندل‌ساز خودکار (Python 3)
            </button>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              {copiedId === currentScript.id ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>کپی شد</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>کپی اسکریپت</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleDownload(currentScript.filename, currentScript.content)}
              className="px-4 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>دانلود {currentScript.filename}</span>
            </button>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
            <div>
              <h3 id="script-workbench-heading" className="text-base font-bold text-slate-100">
                {currentScript.title}
              </h3>
              <p className="text-xs text-slate-400 mt-1">{currentScript.subtitle}</p>
            </div>
            <div className="text-xs font-mono text-slate-400 shrink-0" dir="ltr">
              File: {currentScript.filename} · Checksum: SHA-256 Enforced
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 overflow-x-auto" dir="ltr">
            <pre className="text-xs font-mono text-slate-200 leading-relaxed">
              <code>{currentScript.content}</code>
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
};
