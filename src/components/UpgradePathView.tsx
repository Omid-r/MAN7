import React, { useState } from 'react';
import {
  ORDERED_SPLUNK_VERSIONS,
  SPLUNK_VERSIONS_METADATA,
  SplunkVersion,
  RhelVersion,
  ServerRole,
  PackageFormat,
  UpgradePlanResult,
} from '../utils/splunkEngine';
import { ArrowLeft, CheckCircle2, AlertTriangle, Terminal, Copy, Check, Plus, Trash2 } from 'lucide-react';

interface UpgradePathViewProps {
  sourceVersion: SplunkVersion;
  setSourceVersion: (v: SplunkVersion) => void;
  targetVersion: SplunkVersion;
  setTargetVersion: (v: SplunkVersion) => void;
  targetRhel: RhelVersion;
  setTargetRhel: (r: RhelVersion) => void;
  serverRole: ServerRole;
  setServerRole: (role: ServerRole) => void;
  packageFormat: PackageFormat;
  setPackageFormat: (fmt: PackageFormat) => void;
  plan: UpgradePlanResult;
  extraRpms: string[];
  setExtraRpms: React.Dispatch<React.SetStateAction<string[]>>;
  onNavigateToBundle: () => void;
}

const ROLE_LABELS: Record<ServerRole, string> = {
  indexer: 'Indexer / Cluster Peer',
  search_head: 'Search Head / ES',
  heavy_forwarder: 'Heavy Forwarder',
  cluster_manager: 'Cluster Manager',
  deployment_server: 'Deployment Server',
};

const CATEGORY_LABELS: Record<string, string> = {
  core_prereq: 'پیش‌نیاز پایه سیستم‌عامل',
  selinux_security: 'امنیت و سیاست SELinux',
  performance_tuning: 'بهینه‌سازی کرنل و کارایی',
  migration_ops: 'ابزار انتقال و یکپارچگی',
};

export const UpgradePathView: React.FC<UpgradePathViewProps> = ({
  sourceVersion,
  setSourceVersion,
  targetVersion,
  setTargetVersion,
  targetRhel,
  setTargetRhel,
  serverRole,
  setServerRole,
  packageFormat,
  setPackageFormat,
  plan,
  extraRpms,
  setExtraRpms,
  onNavigateToBundle,
}) => {
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [newRpmInput, setNewRpmInput] = useState('');
  const [rpmError, setRpmError] = useState<string | null>(null);

  const handleCopyCommand = (stepNumber: number, cmd: string) => {
    navigator.clipboard?.writeText(cmd);
    setCopiedStep(stepNumber);
    setTimeout(() => setCopiedStep(null), 1800);
  };

  const handleAddCustomRpm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newRpmInput.trim();
    if (!cleaned) {
      setRpmError('لطفا نام پکیج RPM معتبر وارد کنید (مثال: net-tools یا tmux).');
      return;
    }
    if (!/^[a-zA-Z0-9._+-]+$/.test(cleaned)) {
      setRpmError('نام پکیج فقط می‌تواند شامل حروف انگلیسی، اعداد، خط تیره و نقطه باشد.');
      return;
    }
    if (extraRpms.includes(cleaned) || plan.requiredRpmPackages.some((p) => p.name === cleaned)) {
      setRpmError('این پکیج قبلا در لیست پیش‌نیازهای آفلاین ثبت شده است.');
      return;
    }
    setExtraRpms((prev) => [...prev, cleaned]);
    setNewRpmInput('');
    setRpmError(null);
  };

  const handleRemoveCustomRpm = (pkg: string) => {
    setExtraRpms((prev) => prev.filter((item) => item !== pkg));
  };

  return (
    <div className="space-y-10">
      {/* Parameter Selection Panel */}
      <section aria-labelledby="planner-heading" className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h2 id="planner-heading" className="text-xl font-bold text-slate-100">
              ۰۱. محاسبه‌گر هوشمند مسیر ارتقاء نسخه به نسخه (Multi-Hop Upgrade Matrix)
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              بر اساس مستندات رسمی Splunk Enterprise Upgrade Path، پرش مستقیم بین شاخه‌های اصلی مجاز نیست و ایستگاه‌های میانی به صورت خودکار محاسبه می‌شوند.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateToBundle}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            ادامه به گام ۲: ایمن‌سازی کرنل RHEL ←
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 pt-6">
          <div>
            <label htmlFor="source-splunk-select" className="block text-xs font-medium text-slate-300 mb-2">
              نسخه فعلی اسپلانک (سرور مبدا)
            </label>
            <select
              id="source-splunk-select"
              value={sourceVersion}
              onChange={(e) => setSourceVersion(e.target.value as SplunkVersion)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              dir="ltr"
            >
              {ORDERED_SPLUNK_VERSIONS.slice(0, -1).map((ver) => (
                <option key={ver} value={ver}>
                  Splunk {ver}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="target-splunk-select" className="block text-xs font-medium text-slate-300 mb-2">
              نسخه هدف اسپلانک (سرور مقصد)
            </label>
            <select
              id="target-splunk-select"
              value={targetVersion}
              onChange={(e) => setTargetVersion(e.target.value as SplunkVersion)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              dir="ltr"
            >
              {ORDERED_SPLUNK_VERSIONS.map((ver) => (
                <option key={ver} value={ver}>
                  Splunk {ver} ({SPLUNK_VERSIONS_METADATA[ver].kvStoreMongoVersion})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="target-rhel-select" className="block text-xs font-medium text-slate-300 mb-2">
              سیستم‌عامل سرور جدید (Air-Gapped OS)
            </label>
            <select
              id="target-rhel-select"
              value={targetRhel}
              onChange={(e) => setTargetRhel(e.target.value as RhelVersion)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              dir="ltr"
            >
              <option value="Ubuntu 20.04 LTS">Ubuntu 20.04 LTS (Focal Fossa - Lab)</option>
              <option value="RHEL 9.4">RHEL 9.4 (Kernel 5.14)</option>
              <option value="RHEL 8.10">RHEL 8.10 (Kernel 4.18)</option>
              <option value="RHEL 7.9">RHEL 7.9 (Kernel 3.10)</option>
            </select>
          </div>

          <div>
            <label htmlFor="server-role-select" className="block text-xs font-medium text-slate-300 mb-2">
              نقش سرور اسپلانک در شبکه
            </label>
            <select
              id="server-role-select"
              value={serverRole}
              onChange={(e) => setServerRole(e.target.value as ServerRole)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              dir="ltr"
            >
              {(Object.keys(ROLE_LABELS) as ServerRole[]).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-300 mb-2">
              فرمت بسته نصبی آفلاین
            </span>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg" dir="ltr">
              <button
                type="button"
                onClick={() => setPackageFormat('tgz')}
                className={`py-1.5 px-3 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  packageFormat === 'tgz'
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                .tgz Tarball
              </button>
              <button
                type="button"
                onClick={() => setPackageFormat('rpm')}
                className={`py-1.5 px-3 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  packageFormat === 'rpm'
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                .rpm Package
              </button>
            </div>
          </div>
        </div>

        {/* Validation or OS Compatibility Notice */}
        {!plan.isValid && plan.errorMessageFA && (
          <div role="alert" className="mt-6 p-4 bg-red-950/50 border border-red-800/80 rounded-lg flex items-center gap-3 text-sm text-red-200">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{plan.errorMessageFA}</span>
          </div>
        )}

        {plan.isValid && plan.osCompatibilityWarningFA && (
          <div role="alert" className="mt-6 p-4 bg-amber-950/40 border border-amber-800/80 rounded-lg flex items-center gap-3 text-sm text-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <span>{plan.osCompatibilityWarningFA}</span>
          </div>
        )}
      </section>

      {/* Multi-Hop Chain Visualization & Technical Milestones */}
      {plan.isValid && (
        <section aria-labelledby="hops-heading" className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div>
              <h3 id="hops-heading" className="text-lg font-bold text-slate-100">
                ۰۲. زنجیره دقیق ارتقاء گام‌به‌گام ({plan.hops.length} ایستگاه نسخه‌ای)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                تعداد ایستگاه‌های میانی الزامی: <span className="font-mono text-emerald-400 tabular-nums">{plan.totalIntermediateHops}</span> نسخه
                <span className="mx-2 text-slate-600">·</span>
                مهاجرت موتور KV Store به WiredTiger: <span className="text-slate-200">{plan.requiresKvStoreWiredTigerMigration ? 'الزامی در ایستگاه 8.2.12' : 'نیاز ندارد'}</span>
                <span className="mx-2 text-slate-600">·</span>
                بررسی دستورالعمل پردازنده AVX: <span className="text-slate-200">{plan.requiresAvxInstructionCheck ? 'الزامی (MongoDB 7.0)' : 'عدم نیاز'}</span>
              </p>
            </div>
          </div>

          {/* Visual Chain Flow (Hairline separated, no nested bordered boxes) */}
          <div className="flex flex-wrap items-center gap-6 py-5 border-b border-slate-800" dir="ltr">
            {plan.hops.map((hop, idx) => (
              <React.Fragment key={hop.version}>
                <div>
                  <div className="text-xs text-slate-400 font-mono">
                    Step 0{hop.stepNumber} ·{' '}
                    {hop.roleInPath === 'source'
                      ? 'Legacy Source'
                      : hop.roleInPath === 'target'
                      ? 'Final Target'
                      : 'Mandatory Hop'}
                  </div>
                  <div
                    className={`text-base font-bold font-mono mt-0.5 tabular-nums ${
                      hop.roleInPath === 'source'
                        ? 'text-slate-200'
                        : hop.roleInPath === 'target'
                        ? 'text-emerald-400'
                        : 'text-amber-300'
                    }`}
                  >
                    Splunk {hop.version}
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    {SPLUNK_VERSIONS_METADATA[hop.version].kvStoreMongoVersion}
                  </div>
                </div>
                {idx < plan.hops.length - 1 && (
                  <ArrowLeft className="w-4 h-4 text-slate-500 rotate-180 shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Detailed Table of Hops */}
          <div className="divide-y divide-slate-800 mt-2">
            {plan.hops.map((hop) => (
              <div key={hop.version} className="py-5 flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="space-y-2 max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-bold text-emerald-400 tabular-nums">
                      گام {hop.stepNumber}: Splunk {hop.version}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-300 font-medium">
                      {hop.roleInPath === 'source'
                        ? 'نسخه مبدا فعلی (آماده‌سازی و بررسی btool)'
                        : hop.roleInPath === 'target'
                        ? 'ایستگاه نهایی هدف در سرور جدید'
                        : 'ایستگاه میانی اجباری جهت مهاجرت اسکیما و KV Store'}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="font-mono text-xs text-slate-400" dir="ltr">
                      {hop.packageFileName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {hop.criticalPreCheckFA}
                  </p>
                  <div className="text-xs text-slate-400 space-y-1 pt-1">
                    <div>
                      <span className="text-slate-200 font-medium">وضعیت KV Store: </span>
                      {hop.kvStoreActionFA}
                    </div>
                    <div>
                      <span className="text-slate-200 font-medium">وضعیت مفسر Python: </span>
                      {hop.pythonActionFA}
                    </div>
                  </div>
                </div>

                <div className="lg:w-96 shrink-0 bg-slate-950 border border-slate-800 rounded-lg p-3" dir="ltr">
                  <div className="flex items-center justify-between text-xs text-slate-400 pb-2 mb-2 border-b border-slate-800">
                    <span className="font-mono flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                      CLI Execution
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyCommand(hop.stepNumber, hop.cliCommand)}
                      className="text-xs text-slate-300 hover:text-emerald-400 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                    >
                      {copiedStep === hop.stepNumber ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Command</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                    {hop.cliCommand}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Prerequisite RHEL RPM Packages for Air-Gapped Bundle */}
      <section aria-labelledby="rpms-heading" className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h3 id="rpms-heading" className="text-lg font-bold text-slate-100">
              ۰۳. فهرست پکیج‌های پیش‌نیاز سیستم‌عامل {targetRhel} (جهت دانلود در ماشین آنلاین)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              این پکیج‌ها به همراه تمام وابستگی‌های سطح دوم (`--resolve --alldeps`) در گام A دانلود و داخل فایل نصبی آفلاین قرار می‌گیرند.
            </p>
          </div>

          <form onSubmit={handleAddCustomRpm} className="flex items-center gap-2">
            <label htmlFor="custom-rpm-input" className="sr-only">
              افزودن پکیج RPM سفارشی
            </label>
            <input
              id="custom-rpm-input"
              type="text"
              dir="ltr"
              value={newRpmInput}
              onChange={(e) => {
                setNewRpmInput(e.target.value);
                if (rpmError) setRpmError(null);
              }}
              placeholder="e.g. net-tools, tmux"
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 w-48"
            />
            <button
              type="submit"
              className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>افزودن پکیج به باندل</span>
            </button>
          </form>
        </div>

        {rpmError && (
          <p role="alert" className="text-xs text-red-400 mt-3">
            {rpmError}
          </p>
        )}

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-3 px-4 font-medium">نام پکیج RPM</th>
                <th className="py-3 px-4 font-medium">دسته‌بندی</th>
                <th className="py-3 px-4 font-medium">وضعیت ضرورت</th>
                <th className="py-3 px-4 font-medium">کاربرد فنی در محیط ایزوله RHEL و Splunk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-sm">
              {plan.requiredRpmPackages.map((pkg) => (
                <tr key={pkg.name} className="hover:bg-slate-950/60 transition-colors">
                  <td className="py-3 px-4 font-mono text-emerald-400 font-medium" dir="ltr">
                    {pkg.name}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-300">
                    {CATEGORY_LABELS[pkg.category]}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      {pkg.mandatory ? 'اجباری (Critical)' : 'توصیه‌شده'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-400">
                    {pkg.purposeFA}
                  </td>
                </tr>
              ))}
              {extraRpms.map((customPkg) => (
                <tr key={customPkg} className="hover:bg-slate-950/60 transition-colors">
                  <td className="py-3 px-4 font-mono text-amber-300 font-medium" dir="ltr">
                    {customPkg}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-300">
                    پکیج سفارشی مهندس زیرساخت
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-300">
                    افزوده‌شده به لیست دانلود
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-400 flex items-center justify-between gap-4">
                    <span>پکیج انتخابی جهت قرارگیری در مخزن آفلاین `/opt/splunk-airgap/rpms`</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomRpm(customPkg)}
                      aria-label={`حذف پکیج ${customPkg}`}
                      className="text-red-400 hover:text-red-300 p-1 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
