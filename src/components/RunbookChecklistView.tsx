import React, { useState } from 'react';
import { OFFICIAL_MIGRATION_RUNBOOK } from '../utils/splunkBestPracticesData';
import { CheckSquare, Square, Copy, Check, Download, RotateCcw } from 'lucide-react';

interface RunbookChecklistViewProps {
  onDownloadMasterKit: () => void;
}

export const RunbookChecklistView: React.FC<RunbookChecklistViewProps> = ({
  onDownloadMasterKit,
}) => {
  const [checkedIds, setCheckedIds] = useState<string[]>(['chk-1', 'chk-2']);
  const [activePhaseFilter, setActivePhaseFilter] = useState<string>('all');
  const [copiedCmdId, setCopiedCmdId] = useState<string | null>(null);

  const toggleItem = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCheckAll = () => {
    setCheckedIds(OFFICIAL_MIGRATION_RUNBOOK.map((i) => i.id));
  };

  const handleResetAll = () => {
    setCheckedIds([]);
  };

  const handleCopyCmd = (id: string, cmd: string) => {
    navigator.clipboard?.writeText(cmd);
    setCopiedCmdId(id);
    setTimeout(() => setCopiedCmdId(null), 1800);
  };

  const filteredItems =
    activePhaseFilter === 'all'
      ? OFFICIAL_MIGRATION_RUNBOOK
      : OFFICIAL_MIGRATION_RUNBOOK.filter((item) => item.phase === activePhaseFilter);

  const completionPercent = Math.round(
    (checkedIds.length / OFFICIAL_MIGRATION_RUNBOOK.length) * 100
  );

  return (
    <div className="space-y-8">
      <section aria-labelledby="runbook-heading" className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h2 id="runbook-heading" className="text-xl font-bold text-slate-100">
              چک‌لیست عملیاتی و اعتبارسنجی مهاجرت آفلاین (Pre & Post-Flight Verification Runbook)
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              پیشرفت ممیزی مهندسی: <span className="font-mono text-emerald-400 font-bold tabular-nums">{checkedIds.length} / {OFFICIAL_MIGRATION_RUNBOOK.length}</span> گام تکمیل‌شده (<span className="font-mono tabular-nums">{completionPercent}%</span>)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCheckAll}
              className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              تکمیل تمام مراحل
            </button>
            <button
              type="button"
              onClick={handleResetAll}
              className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>بازنشانی چک‌لیست</span>
            </button>
            <button
              type="button"
              onClick={onDownloadMasterKit}
              className="px-4 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>دانلود باندل جامع خودکار (.sh)</span>
            </button>
          </div>
        </div>

        {/* Phase Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg mt-6 w-fit">
          <button
            type="button"
            onClick={() => setActivePhaseFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activePhaseFilter === 'all'
                ? 'bg-emerald-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            همه فازها ({OFFICIAL_MIGRATION_RUNBOOK.length})
          </button>
          <button
            type="button"
            onClick={() => setActivePhaseFilter('phase1_legacy')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activePhaseFilter === 'phase1_legacy'
                ? 'bg-emerald-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            فاز ۱: سرور قدیمی
          </button>
          <button
            type="button"
            onClick={() => setActivePhaseFilter('phase2_online_harvest')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activePhaseFilter === 'phase2_online_harvest'
                ? 'bg-emerald-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            فاز ۲: ماشین آنلاین (Step A)
          </button>
          <button
            type="button"
            onClick={() => setActivePhaseFilter('phase3_rhel_hardening')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activePhaseFilter === 'phase3_rhel_hardening'
                ? 'bg-emerald-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            فاز ۳: ایمن‌سازی RHEL جدید
          </button>
          <button
            type="button"
            onClick={() => setActivePhaseFilter('phase4_splunk_migration')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activePhaseFilter === 'phase4_splunk_migration'
                ? 'bg-emerald-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            فاز ۴: ارتقاء نسخه به نسخه
          </button>
        </div>

        {/* Checklist Items */}
        <div className="divide-y divide-slate-800 mt-6">
          {filteredItems.map((item) => {
            const isChecked = checkedIds.includes(item.id);
            return (
              <div key={item.id} className="py-5 flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="flex items-start gap-3.5 max-w-3xl">
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    aria-label={item.titleFA}
                    className="mt-0.5 text-emerald-400 hover:text-emerald-300 transition-colors shrink-0"
                  >
                    {isChecked ? (
                      <CheckSquare className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-500" />
                    )}
                  </button>
                  <div className="space-y-1.5">
                    <div className="text-xs text-slate-400">
                      <span>{item.phaseLabelFA}</span>
                      <span className="mx-2 text-slate-600">·</span>
                      <span className="font-mono" dir="ltr">{item.splunkBestPracticeRef}</span>
                    </div>
                    <h3
                      className={`text-sm font-bold ${
                        isChecked ? 'line-through text-slate-400' : 'text-slate-100'
                      }`}
                    >
                      {item.titleFA}
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {item.rationaleFA}
                    </p>
                    <p className="text-xs text-slate-400 pt-1">
                      <span className="text-slate-200 font-medium">خروجی مورد انتظار: </span>
                      <span className="font-mono" dir="ltr">{item.expectedOutput}</span>
                    </p>
                  </div>
                </div>

                <div className="lg:w-96 shrink-0 bg-slate-950 border border-slate-800 rounded-lg p-3" dir="ltr">
                  <div className="flex items-center justify-between text-xs text-slate-400 pb-2 mb-2 border-b border-slate-800">
                    <span className="font-mono">Verification Command</span>
                    <button
                      type="button"
                      onClick={() => handleCopyCmd(item.id, item.verifyCommand)}
                      className="text-xs text-slate-300 hover:text-emerald-400 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                    >
                      {copiedCmdId === item.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all">
                    {item.verifyCommand}
                  </pre>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
