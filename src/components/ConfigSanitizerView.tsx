import React, { useState, useMemo } from 'react';
import { analyzeSplunkConfig } from '../utils/splunkEngine';
import { SAMPLE_CONFIG_PRESETS } from '../utils/splunkBestPracticesData';
import { CheckCircle2, AlertTriangle, Wand2, Download, Copy, Check, Upload, Server } from 'lucide-react';

export const ConfigSanitizerView: React.FC = () => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(SAMPLE_CONFIG_PRESETS[0].id);
  const [rawConfText, setRawConfText] = useState<string>(SAMPLE_CONFIG_PRESETS[0].content);
  const [uploadedFileName, setUploadedFileName] = useState<string>('server.conf');
  const [newHostname, setNewHostname] = useState<string>('splunk-rhel9-prod01');
  const [copiedSanitized, setCopiedSanitized] = useState(false);
  const [serverSaveMsg, setServerSaveMsg] = useState<string | null>(null);

  const auditResult = useMemo(
    () => analyzeSplunkConfig(rawConfText, newHostname),
    [rawConfText, newHostname]
  );

  const handleSelectPreset = (presetId: string) => {
    const found = SAMPLE_CONFIG_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setSelectedPresetId(found.id);
      setRawConfText(found.content);
      const base = found.fileName.split('/').pop() || 'server.conf';
      setUploadedFileName(base);
      setServerSaveMsg(null);
    }
  };

  const handleUploadLocalConfFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawConfText(text);
    setUploadedFileName(file.name);
    setSelectedPresetId('custom_uploaded');
    setServerSaveMsg(`فایل ${file.name} از سیستم شما بارگذاری شد و مورد ممیزی قرار گرفت.`);
    e.target.value = '';
  };

  const handleStageSanitizedToServer = async () => {
    try {
      const targetName = uploadedFileName.endsWith('.conf')
        ? `sanitized-${uploadedFileName}`
        : `sanitized-${uploadedFileName}.conf`;
      const res = await fetch('/api/files/stage-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: targetName,
          content: auditResult.sanitizedContent,
          category: 'configs',
        }),
      });
      if (res.ok) {
        setServerSaveMsg(`فایل اصلاح‌شده با نام ${targetName} در مسیر offline-depot/configs سرور ذخیره شد.`);
      }
    } catch {
      setServerSaveMsg('خطا در ذخیره فایل روی سرور.');
    }
  };

  const handleApplyAutoRemediation = () => {
    setRawConfText(auditResult.sanitizedContent);
  };

  const handleCopySanitized = () => {
    navigator.clipboard?.writeText(auditResult.sanitizedContent);
    setCopiedSanitized(true);
    setTimeout(() => setCopiedSanitized(false), 1800);
  };

  const handleDownloadSanitized = () => {
    const blob = new Blob([auditResult.sanitizedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sanitized-${uploadedFileName}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header & Preset Selector */}
      <section aria-labelledby="config-auditor-heading" className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h2 id="config-auditor-heading" className="text-xl font-bold text-slate-100">
              ممیز هوشمند و بازنویسی کانفیگ‌های قدیمی برای Splunk 9.x (.conf Sanitizer)
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              فایل‌های server.conf، inputs.conf یا web.conf سرور قدیمی را آپلود یا وارد کنید تا پارامترهای منسوخ (python2، mmapv1، SSLv3/TLS1.0 و mode = master) شناسایی و برای سرور جدید بازنویسی شوند.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label
              htmlFor="conf-file-upload-btn"
              className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>آپلود فایل .conf از سیستم</span>
              <input
                id="conf-file-upload-btn"
                type="file"
                accept=".conf,.txt,.cfg"
                onChange={handleUploadLocalConfFile}
                className="sr-only"
              />
            </label>

            <button
              type="button"
              onClick={handleStageSanitizedToServer}
              className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Server className="w-3.5 h-3.5" />
              <span>ذخیره در مخزن آفلاین سرور</span>
            </button>

            <button
              type="button"
              onClick={handleApplyAutoRemediation}
              disabled={auditResult.findings.length === 0}
              className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                auditResult.findings.length > 0
                  ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>اعمال خودکار اصلاحات استاندارد Splunk 9.x</span>
            </button>
          </div>
        </div>

        {serverSaveMsg && (
          <div className="mt-4 p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{serverSaveMsg}</span>
          </div>
        )}

        {/* Preset Buttons & Target Hostname Input */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6 items-end">
          <div className="lg:col-span-2">
            <span className="block text-xs font-medium text-slate-300 mb-2">
              بارگذاری نمونه فایل کانفیگ سرور قدیمی (یا آپلود فایل .conf خودتان):
            </span>
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg w-fit">
              {SAMPLE_CONFIG_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    selectedPresetId === preset.id
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {preset.titleFA}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="target-hostname-input" className="block text-xs font-medium text-slate-300 mb-2">
              نام میزبان سرور جدید (Target RHEL Hostname)
            </label>
            <input
              id="target-hostname-input"
              type="text"
              dir="ltr"
              value={newHostname}
              onChange={(e) => setNewHostname(e.target.value || 'splunk-rhel9-prod01')}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Two-Column Editor & Sanitized Output */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <label htmlFor="raw-conf-textarea" className="font-medium text-slate-200">
                محتوای فایل {uploadedFileName} سرور قدیمی (قابل ویرایش):
              </label>
              <span className="font-mono" dir="ltr">
                Findings: {auditResult.findings.length}
              </span>
            </div>
            <textarea
              id="raw-conf-textarea"
              dir="ltr"
              rows={14}
              value={rawConfText}
              onChange={(e) => setRawConfText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-100 leading-relaxed focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-medium text-emerald-400">
                خروجی استاندارد و ایمن‌شده برای سرور جدید (Splunk 9.x Ready):
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopySanitized}
                  className="text-slate-300 hover:text-emerald-400 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                >
                  {copiedSanitized ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSanitized ? 'کپی شد' : 'کپی خروجی'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSanitized}
                  className="text-slate-300 hover:text-emerald-400 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود .conf</span>
                </button>
              </div>
            </div>
            <pre
              dir="ltr"
              className="w-full h-[318px] bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-emerald-200 leading-relaxed overflow-y-auto"
            >
              <code>{auditResult.sanitizedContent}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Audit Findings Table */}
      <section aria-labelledby="findings-table-heading" className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h3 id="findings-table-heading" className="text-lg font-bold text-slate-100">
              گزارش ممیزی ناسازگاری‌ها و ریسک‌های امنیتی کانفیگ
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              خطاهای بحرانی (Critical): <span className="font-mono text-red-400 tabular-nums">{auditResult.criticalCount}</span>
              <span className="mx-2 text-slate-600">·</span>
              هشدارهای مهم (High): <span className="font-mono text-amber-400 tabular-nums">{auditResult.highCount}</span>
              <span className="mx-2 text-slate-600">·</span>
              توصیه‌های مهاجرت (Medium): <span className="font-mono text-sky-400 tabular-nums">{auditResult.mediumCount}</span>
            </p>
          </div>

          <div className="text-xs">
            {auditResult.isReadyFor9x ? (
              <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                کانفیگ کاملا با Splunk 9.x و استانداردهای امنیتی RHEL سازگار است
              </span>
            ) : (
              <span className="text-amber-300 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                نیازمند اصلاح موارد شناسایی‌شده قبل از استارت سرویس روی سرور جدید
              </span>
            )}
          </div>
        </div>

        {auditResult.findings.length === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-200">
              هیچ پارامتر منسوخ یا ناامنی در این فایل کانفیگ یافت نشد.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              تمامی استانزاها آماده انتقال به $SPLUNK_HOME/etc/system/local/ در سرور جدید هستند.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-400">
                  <th className="py-3 px-4 font-medium">خط / استانزا</th>
                  <th className="py-3 px-4 font-medium">شدت ریسک</th>
                  <th className="py-3 px-4 font-medium">مقدار قدیمی</th>
                  <th className="py-3 px-4 font-medium">مقدار اصلاح‌شده</th>
                  <th className="py-3 px-4 font-medium">تحلیل فنی و مرجع مستندات اسپلانک</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-sm">
                {auditResult.findings.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-950/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-300 tabular-nums" dir="ltr">
                      Line {f.lineNumber} · {f.stanza}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium">
                      {f.severity === 'critical' ? (
                        <span className="text-red-400">بحرانی (Blocker)</span>
                      ) : f.severity === 'high' ? (
                        <span className="text-amber-400">مهم (Deprecated)</span>
                      ) : (
                        <span className="text-sky-400">پرتابیلیتی (Host)</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-red-300" dir="ltr">
                      {f.directive} = {f.currentValue}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-emerald-400" dir="ltr">
                      {f.directive} = {f.remediatedValue}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300 leading-relaxed">
                      <div>{f.reasonFA}</div>
                      <div className="text-slate-500 font-mono mt-0.5" dir="ltr">
                        Ref: {f.splunkDocRef}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
