/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  SplunkVersion,
  RhelVersion,
  ServerRole,
  PackageFormat,
  HardeningProfileConfig,
  calculateUpgradePath,
  generateTwoMachineScripts,
} from './utils/splunkEngine';
import { UpgradePathView } from './components/UpgradePathView';
import { AirGapWorkflowView } from './components/AirGapWorkflowView';
import { RhelHardeningView } from './components/RhelHardeningView';
import { ConfigSanitizerView } from './components/ConfigSanitizerView';
import { RunbookChecklistView } from './components/RunbookChecklistView';
import { LinuxTerminalAndDepotView } from './components/LinuxTerminalAndDepotView';
import { VisualGuideView } from './components/VisualGuideView';
import { GitHubSyncModal } from './components/GitHubSyncModal';
import { StepByStepWizardView } from './components/StepByStepWizardView';
import { CodespaceLiveTerminalDock } from './components/CodespaceLiveTerminalDock';
import { PlugZap, BookOpen, ArrowLeft, GitBranch, Download, Sparkles, CheckCircle2 } from 'lucide-react';

export type ActiveModule =
  | 'step_wizard'
  | 'visual_guide'
  | 'linux_terminal'
  | 'upgrade_path'
  | 'airgap_bundle'
  | 'rhel_hardening'
  | 'config_sanitizer';

export default function App() {
  const [activeModule, setActiveModule] = useState<ActiveModule>('step_wizard');
  const [wizardCompletedBanner, setWizardCompletedBanner] = useState<boolean>(false);
  const [wizardStepTitle, setWizardStepTitle] = useState<string>('۱. اتصال پورت Root به Codespace');
  const [wizardStepExplain, setWizardStepExplain] = useState<string>(
    'بررسی دسترسی Root (UID=0)، نام هاست سرور Codespace و ساخت دایرکتوری‌های استقرار در /opt/splunk-airgap'
  );
  const [isGithubModalOpen, setIsGithubModalOpen] = useState<boolean>(false);
  const [sourceVersion, setSourceVersion] = useState<SplunkVersion>('8.1.14');

  const [targetVersion, setTargetVersion] = useState<SplunkVersion>('9.3.2');
  const [targetRhel, setTargetRhel] = useState<RhelVersion>('RHEL 9.4');
  const [serverRole, setServerRole] = useState<ServerRole>('indexer');
  const [packageFormat, setPackageFormat] = useState<PackageFormat>('tgz');
  const [extraRpms, setExtraRpms] = useState<string[]>([]);

  const [hardening, setHardening] = useState<HardeningProfileConfig>({
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
  });

  // Sync targetRhel and serverRole into hardening profile
  const syncedHardening: HardeningProfileConfig = useMemo(
    () => ({
      ...hardening,
      targetRhel,
      serverRole,
    }),
    [hardening, targetRhel, serverRole]
  );

  const upgradePlan = useMemo(
    () => calculateUpgradePath(sourceVersion, targetVersion, targetRhel, packageFormat),
    [sourceVersion, targetVersion, targetRhel, packageFormat]
  );

  const handleDownloadMasterOfflineKit = () => {
    const enrichedPlan = {
      ...upgradePlan,
      requiredRpmPackages: [
        ...upgradePlan.requiredRpmPackages,
        ...extraRpms.map((name) => ({
          name,
          category: 'migration_ops' as const,
          mandatory: true,
          purposeFA: 'Custom RPM package',
        })),
      ],
    };

    const scripts = generateTwoMachineScripts(enrichedPlan, syncedHardening, packageFormat);
    const masterKit = `#!/usr/bin/env bash
# ==============================================================================
# MAN7 | MASTER SELF-CONTAINED AIR-GAPPED MIGRATION & RHEL SUITE
# Source Version: Splunk ${sourceVersion} -> Target Version: Splunk ${targetVersion}
# Target OS: ${targetRhel} | Role: ${serverRole.toUpperCase()}
# ==============================================================================
set -euo pipefail

mkdir -p ./man7-offline-suite

cat << 'EOF_STEP_A' > ./man7-offline-suite/step_a_online_collector.sh
${scripts.stepAOnlineBash}
EOF_STEP_A

cat << 'EOF_LEGACY' > ./man7-offline-suite/step_pre_legacy_splunk_backup.sh
${scripts.legacyBackupBash}
EOF_LEGACY

cat << 'EOF_STEP_B' > ./man7-offline-suite/step_b_offline_rhel_deployer.sh
${scripts.stepBOfflineBash}
EOF_STEP_B

chmod +x ./man7-offline-suite/*.sh
echo "MAN7 Offline Suite extracted to ./man7-offline-suite/"
`;

    const blob = new Blob([masterKit], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MAN7-master-kit-${sourceVersion}-to-${targetVersion}.sh`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-x-hidden">
      {/* Top Bar: Wordmark + 4 Sequential Calculation/Execution Steps + Separate Top Utilities (Root Port & Visual Guide) */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-slate-800 bg-slate-950">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveModule('upgrade_path');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 flex items-center gap-2"
        >
          <span className="text-emerald-400">MAN7</span>
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-normal">
            Air-Gapped Suite
          </span>
        </a>

        {/* Zone 2: Wizard + 4 Sequential Steps */}
        <nav aria-label="گام‌های چهارگانه محاسبه و استقرار" className="hidden xl:flex items-center gap-4 text-xs font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setActiveModule('step_wizard')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 flex items-center gap-1 ${
              activeModule === 'step_wizard'
                ? 'text-sky-400 border-sky-400 font-bold'
                : 'border-transparent text-sky-300 hover:text-sky-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>ویزارد گام‌به‌گام (۱۰ ریزمرحله)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('upgrade_path')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeModule === 'upgrade_path'
                ? 'text-emerald-400 border-emerald-400'
                : 'border-transparent hover:text-slate-100'
            }`}
          >
            گام ۱: محاسبه مسیر ارتقاء
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('rhel_hardening')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeModule === 'rhel_hardening'
                ? 'text-emerald-400 border-emerald-400'
                : 'border-transparent hover:text-slate-100'
            }`}
          >
            گام ۲: ایمن‌سازی کرنل RHEL
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('airgap_bundle')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeModule === 'airgap_bundle'
                ? 'text-emerald-400 border-emerald-400'
                : 'border-transparent hover:text-slate-100'
            }`}
          >
            گام ۳: اسکریپت‌ها و آپلود به سرور
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('config_sanitizer')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeModule === 'config_sanitizer'
                ? 'text-emerald-400 border-emerald-400'
                : 'border-transparent hover:text-slate-100'
            }`}
          >
            گام ۴: پالایش کانفیگ و چک‌لیست
          </button>
        </nav>

        {/* Zone 3: Separate Standalone Sections (Root Port Console + Visual Guide + GitHub/Windows + Offline Kit) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsGithubModalOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border bg-slate-900 text-emerald-300 border-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-500/10 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
            <span>اتصال GitHub و دانلود ویندوز</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModule('linux_terminal')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeModule === 'linux_terminal'
                ? 'bg-sky-500/20 text-sky-300 border-sky-400'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-sky-500/60 hover:text-sky-300'
            }`}
          >
            <PlugZap className="w-3.5 h-3.5 text-sky-400" />
            <span>آزمایشگاه Ubuntu 20.04 + Splunk 9 (پورت Root)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModule('visual_guide')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeModule === 'visual_guide'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-emerald-500/60 hover:text-emerald-300'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span>راهنمای تصویری</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadMasterOfflineKit}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-lg hover:bg-emerald-300 transition-colors whitespace-nowrap shrink-0"
          >
            دانلود کیت جامع آفلاین
          </button>
        </div>
      </header>


      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {/* Executive Context & Telemetry Strip */}
        <section className="border-b border-slate-800 pb-8">
          <div className="max-w-4xl">
            <p className="text-xs text-emerald-400 font-medium mb-2">
              پروژه MAN7 · معماری ۱۰۰٪ ایزوله (Air-Gapped) · متصل به پورت Root سرور لینوکس
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 leading-snug">
              پلتفرم مهندسی مهاجرت، ایمن‌سازی RHEL و ارتقاء خودکار نسخه به نسخه Splunk
            </h1>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              ارتقاء نسخه به نسخه Splunk، ایمن‌سازی هسته لینوکس RHEL و استقرار کاملاً آفلاین در محیط‌های ایزوله.
            </p>
          </div>

          {/* Separate Bar: Right = Wizard + 4 Sequential Calculation/Deployment Steps | Left = Separate Standalone Tools */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveModule('step_wizard')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeModule === 'step_wizard'
                    ? 'bg-sky-400 text-slate-950 font-bold'
                    : 'text-sky-300 hover:bg-slate-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>ویزارد گام‌به‌گام (۱۰ ریزمرحله)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveModule('upgrade_path')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                  activeModule === 'upgrade_path'
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                گام ۱: محاسبه مسیر ارتقاء
              </button>
              <button
                type="button"
                onClick={() => setActiveModule('rhel_hardening')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                  activeModule === 'rhel_hardening'
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                گام ۲: ایمن‌سازی کرنل RHEL
              </button>
              <button
                type="button"
                onClick={() => setActiveModule('airgap_bundle')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                  activeModule === 'airgap_bundle'
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                گام ۳: اسکریپت‌ها و آپلود به سرور
              </button>
              <button
                type="button"
                onClick={() => setActiveModule('config_sanitizer')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                  activeModule === 'config_sanitizer'
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                گام ۴: پالایش کانفیگ و چک‌لیست
              </button>
            </div>

            {/* Separate Box for Root Port Console & Visual Guide */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900/90 border border-slate-700/80 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveModule('linux_terminal')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeModule === 'linux_terminal'
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-sky-300 hover:bg-slate-800'
                }`}
              >
                <PlugZap className="w-3.5 h-3.5" />
                <span>آزمایشگاه زنده Ubuntu 20.04 + Splunk 9 (پورت Root)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveModule('visual_guide')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeModule === 'visual_guide'
                    ? 'bg-emerald-400 text-slate-950'
                    : 'text-emerald-300 hover:bg-slate-800'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>بخش مجزا: راهنمای تصویری</span>
              </button>
            </div>
          </div>

          {/* 4-Column Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-6 pt-6 border-t border-slate-800/80">
            <div>
              <div className="text-xs text-slate-400">مسیر ارتقاء محاسبه‌شده (گام ۱)</div>
              <div className="text-lg font-bold font-mono text-slate-100 mt-1 tabular-nums" dir="ltr">
                {sourceVersion} → {targetVersion}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {upgradePlan.hops.length} ایستگاه نسخه‌ای ({upgradePlan.totalIntermediateHops} ایستگاه میانی)
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">سیستم‌عامل و نقش سرور مقصد</div>
              <div className="text-lg font-bold font-mono text-emerald-400 mt-1 tabular-nums" dir="ltr">
                {targetRhel} · {serverRole.toUpperCase()}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                حالت کاملاً آفلاین با بررسی SHA-256
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">پکیج‌های پیش‌نیاز RPM در باندل</div>
              <div className="text-lg font-bold font-mono text-slate-100 mt-1 tabular-nums" dir="ltr">
                {upgradePlan.requiredRpmPackages.length + extraRpms.length} Packages
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                شامل glibc، libxcrypt-compat و policycoreutils
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">استاندارد ایمن‌سازی کرنل (گام ۲)</div>
              <div className="text-lg font-bold font-mono text-slate-100 mt-1 tabular-nums" dir="ltr">
                NOFILE={syncedHardening.nofileLimit} · THP={syncedHardening.disableThp ? 'never' : 'on'}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                منطبق با مستندات رسمی Splunk Capacity Planning
              </div>
            </div>
          </div>
        </section>

        {/* Sleek Persistent Live Codespace Terminal Mirror Panel (Always visible across every step!) */}
        <CodespaceLiveTerminalDock
          currentStepTitleFA={
            activeModule === 'step_wizard'
              ? wizardStepTitle
              : activeModule === 'upgrade_path'
              ? 'گام ۱ سامانه: محاسبه ایستگاه‌های ارتقاء و پکیج‌های RPM'
              : activeModule === 'rhel_hardening'
              ? 'گام ۲ سامانه: ایمن‌سازی کرنل لینوکس (THP=never, ulimits, SELinux)'
              : activeModule === 'airgap_bundle'
              ? 'گام ۳ سامانه: تولید اسکریپت‌های گام A و B و آپلود مستقیم روی سرور'
              : activeModule === 'config_sanitizer'
              ? 'گام ۴ سامانه: پالایش کانفیگ‌های قدیمی (.conf) و اجرای ۸ تست چک‌لیست'
              : activeModule === 'linux_terminal'
              ? 'کنسول کامل آزمایشگاه Ubuntu 20.04 + Splunk 9'
              : 'راهنمای تصویری معماری آفلاین'
          }
          currentStepExplainFA={
            activeModule === 'step_wizard'
              ? wizardStepExplain
              : activeModule === 'upgrade_path'
              ? `محاسبه زنجیره ارتقاء از Splunk ${sourceVersion} به ${targetVersion} (${upgradePlan.hops.map((h) => h.version).join(' -> ')})`
              : activeModule === 'rhel_hardening'
              ? `پیکربندی کرنل ${targetRhel} با LimitNOFILE=${syncedHardening.nofileLimit} و غیرفعال‌سازی Transparent Huge Pages`
              : activeModule === 'airgap_bundle'
              ? 'آماده‌سازی اسکریپت‌های بکاپ، گام A و گام B در مسیر /opt/splunk-airgap/scripts و اجرای واقعی آن‌ها روی سرور'
              : activeModule === 'config_sanitizer'
              ? 'حذف Python 2 و MMAPv1 از فایل‌های کانفیگ و اجرای زنده ۸ دستور ممیزی Runbook در ترمینال Codespace'
              : 'مشاهده و اجرای زنده دستورات روی سرور آزمایشگاه از طریق پورت Root (9099)'
          }
          onOpenFullTerminalTab={() => setActiveModule('linux_terminal')}
        />

        {wizardCompletedBanner && activeModule !== 'step_wizard' && (
          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong>ویزارد ۱۰ مرحله‌ای با موفقیت تکمیل شد:</strong> اکنون در محیط کامل سامانه مهندسی MAN7 هستید و تمام تنظیمات مسیر ارتقاء ({sourceVersion} → {targetVersion})، ایمن‌سازی کرنل و اسکریپت‌های تست‌شده روی سرور آماده بهره‌برداری هستند.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule('step_wizard')}
              className="px-3 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold transition-colors"
            >
              بازگشت به ویزارد گام‌به‌گام
            </button>
          </div>
        )}

        {/* Active Engineering Module */}
        {activeModule === 'step_wizard' && (
          <StepByStepWizardView
            sourceVersion={sourceVersion}
            setSourceVersion={setSourceVersion}
            targetVersion={targetVersion}
            setTargetVersion={setTargetVersion}
            targetRhel={targetRhel}
            setTargetRhel={setTargetRhel}
            serverRole={serverRole}
            setServerRole={setServerRole}
            packageFormat={packageFormat}
            setPackageFormat={setPackageFormat}
            hardening={hardening}
            setHardening={setHardening}
            plan={upgradePlan}
            extraRpms={extraRpms}
            onStepContextChange={(titleFA, explainFA) => {
              setWizardStepTitle(titleFA);
              setWizardStepExplain(explainFA);
            }}
            onFinishWizardToFullSystem={() => {
              setWizardCompletedBanner(true);
              setActiveModule('upgrade_path');
            }}
          />
        )}

        {activeModule === 'visual_guide' && (
          <VisualGuideView
            onNavigateModule={(target) => setActiveModule(target)}
          />
        )}

        {activeModule === 'linux_terminal' && (
          <LinuxTerminalAndDepotView
            plan={upgradePlan}
            hardening={syncedHardening}
            packageFormat={packageFormat}
            extraRpms={extraRpms}
          />
        )}

        {activeModule === 'upgrade_path' && (
          <div className="space-y-6">
            <UpgradePathView
              sourceVersion={sourceVersion}
              setSourceVersion={setSourceVersion}
              targetVersion={targetVersion}
              setTargetVersion={setTargetVersion}
              targetRhel={targetRhel}
              setTargetRhel={setTargetRhel}
              serverRole={serverRole}
              setServerRole={setServerRole}
              packageFormat={packageFormat}
              setPackageFormat={setPackageFormat}
              plan={upgradePlan}
              extraRpms={extraRpms}
              setExtraRpms={setExtraRpms}
              onNavigateToBundle={() => setActiveModule('rhel_hardening')}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModule('rhel_hardening')}
                className="px-5 py-2.5 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg inline-flex items-center gap-2 transition-colors"
              >
                <span>تایید محاسبات گام ۱ و ادامه به گام ۲: ایمن‌سازی کرنل RHEL</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {activeModule === 'rhel_hardening' && (
          <div className="space-y-6">
            <RhelHardeningView hardening={hardening} setHardening={setHardening} />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModule('airgap_bundle')}
                className="px-5 py-2.5 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg inline-flex items-center gap-2 transition-colors"
              >
                <span>تایید تنظیمات کرنل و ورود به گام ۳: اسکریپت‌ها و آپلود مستقیم روی سرور</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {activeModule === 'airgap_bundle' && (
          <div className="space-y-6">
            <AirGapWorkflowView
              plan={upgradePlan}
              hardening={syncedHardening}
              packageFormat={packageFormat}
              extraRpms={extraRpms}
              onOpenRootConsole={() => setActiveModule('linux_terminal')}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModule('config_sanitizer')}
                className="px-5 py-2.5 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg inline-flex items-center gap-2 transition-colors"
              >
                <span>ادامه به گام ۴: پالایش کانفیگ‌های قدیمی (.conf) و چک‌لیست تست</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {activeModule === 'config_sanitizer' && (
          <div className="space-y-10">
            <ConfigSanitizerView />
            <RunbookChecklistView onDownloadMasterKit={handleDownloadMasterOfflineKit} />
          </div>
        )}
      </main>

      {/* Quiet Functional Footer */}
      <footer className="border-t border-slate-800 px-6 py-5 mt-12 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            MAN7 — سامانه مهندسی استقرار، ایمن‌سازی و مهاجرت آفلاین Splunk Enterprise روی سرورهای Red Hat Enterprise Linux
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setIsGithubModalOpen(true)}
              className="text-sky-400 hover:text-sky-300 transition-colors font-medium inline-flex items-center gap-1"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>اتصال به GitHub</span>
            </button>
            <span aria-hidden="true">·</span>
            <a
              href="/api/release/download-windows-zip"
              download="MAN7-Windows-Portable.zip"
              className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>دانلود پکیج ویندوز (MAN7-Windows-Portable.zip)</span>
            </a>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveModule('linux_terminal')}
              className="hover:text-slate-200 transition-colors"
            >
              اتصال پورت Root و ترمینال سرور
            </button>
          </div>
        </div>
      </footer>

      <GitHubSyncModal
        isOpen={isGithubModalOpen}
        onClose={() => setIsGithubModalOpen(false)}
        onOpenLabTerminal={() => setActiveModule('linux_terminal')}
      />
    </div>
  );
}

