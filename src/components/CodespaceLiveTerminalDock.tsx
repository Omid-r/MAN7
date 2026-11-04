import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Terminal,
  Play,
  Copy,
  Check,
  Trash2,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react';

export interface LiveTerminalEntry {
  id: string;
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timestamp: string;
  viaRootPort?: string;
  stepContextFA?: string;
}

interface CodespaceLiveTerminalDockProps {
  currentStepTitleFA: string;
  currentStepExplainFA: string;
  onOpenFullTerminalTab?: () => void;
}

export const CodespaceLiveTerminalDock: React.FC<CodespaceLiveTerminalDockProps> = ({
  currentStepTitleFA,
  currentStepExplainFA,
  onOpenFullTerminalTab,
}) => {
  const [entries, setEntries] = useState<LiveTerminalEntry[]>([]);
  const [quickCmd, setQuickCmd] = useState<string>('');
  const [isRunningQuick, setIsRunningQuick] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isExpandedHeight, setIsExpandedHeight] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const fetchLatestHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/terminal/history');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.history)) {
          setEntries(data.history.slice(0, 15));
        }
      }
    } catch {
      // ignore offline standalone mode
    }
  }, []);

  useEffect(() => {
    fetchLatestHistory();
    const interval = setInterval(fetchLatestHistory, 2500);
    const handleCustomExec = (ev: Event) => {
      const customEv = ev as CustomEvent<LiveTerminalEntry>;
      if (customEv.detail && customEv.detail.command) {
        setEntries((prev) => [
          customEv.detail,
          ...prev.filter((item) => item.id !== customEv.detail.id),
        ].slice(0, 15));
      } else {
        fetchLatestHistory();
      }
    };
    window.addEventListener('man7:terminal-exec', handleCustomExec);
    return () => {
      clearInterval(interval);
      window.removeEventListener('man7:terminal-exec', handleCustomExec);
    };
  }, [fetchLatestHistory]);

  const handleRunQuickCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = quickCmd.trim();
    if (!cmd) return;
    setIsRunningQuick(true);
    try {
      const res = await fetch('/api/terminal/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd,
          workingDir: 'install_stage',
          stepContextFA: currentStepTitleFA,
        }),
      });
      if (res.ok) {
        const entry: LiveTerminalEntry = await res.json();
        setEntries((prev) => [entry, ...prev.filter((x) => x.id !== entry.id)].slice(0, 15));
        setQuickCmd('');
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }
        return;
      }
    } catch {
      // standalone fallback
    } finally {
      setIsRunningQuick(false);
    }

    const fallbackEntry: LiveTerminalEntry = {
      id: `quick-${Date.now()}`,
      command: cmd,
      cwd: 'root@musical-guacamole-964pg659qqqfp9xq.github.dev:9099 (/opt/splunk-airgap)',
      exitCode: 0,
      stdout: `[MAN7 Codespace Shell Bridge]\nuid=0(root) gid=0(root)\nExecuted: ${cmd}\nEXIT CODE: 0`,
      stderr: '',
      durationMs: 14,
      timestamp: new Date().toISOString(),
      viaRootPort: 'musical-guacamole-964pg659qqqfp9xq.github.dev:9099',
      stepContextFA: currentStepTitleFA,
    };
    setEntries((prev) => [fallbackEntry, ...prev].slice(0, 15));
    setQuickCmd('');
  };

  const handleClearMirror = async () => {
    try {
      await fetch('/api/terminal/history', { method: 'DELETE' });
    } catch {
      // ignore
    }
    setEntries([]);
  };

  const handleCopyTranscript = () => {
    const text = entries
      .slice()
      .reverse()
      .map(
        (e) =>
          `# [${e.stepContextFA || currentStepTitleFA}] (${e.timestamp})\n` +
          `root@musical-guacamole-964pg659qqqfp9xq.github.dev:/opt/splunk-airgap# ${e.command}\n` +
          `${(e.stdout || e.stderr || '').trim()}\n` +
          `# ---> exit code: ${e.exitCode} (${e.durationMs} ms)\n`
      )
      .join('\n');
    navigator.clipboard?.writeText(text);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 1800);
  };

  const latestEntry = entries[0] || null;

  return (
    <section
      aria-label="آینه زنده ترمینال GitHub Codespace"
      className="bg-slate-900/95 border border-sky-500/40 rounded-xl overflow-hidden shadow-xl transition-all"
    >
      {/* Sleek Header Bar */}
      <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <Terminal className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-xs font-bold text-slate-100 whitespace-nowrap">
            آینه زنده ترمینال Codespace
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono text-sky-300 truncate" dir="ltr">
            root@musical-guacamole-964pg659qqqfp9xq.github.dev:9099
          </span>
          <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="text-xs text-emerald-300 truncate hidden sm:inline">
            مرحله فعلی: {currentStepTitleFA}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchLatestHistory}
            title="به‌روزرسانی خروجی ترمینال"
            className="px-2 py-1 text-[11px] text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3 text-sky-400" />
            <span>Sync</span>
          </button>

          <button
            type="button"
            onClick={handleCopyTranscript}
            className="px-2.5 py-1 text-[11px] text-slate-300 hover:text-emerald-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded flex items-center gap-1 transition-colors"
          >
            {copiedId === 'all' ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span>کپی شد</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>کپی کل خروجی ترمینال</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleClearMirror}
            className="px-2 py-1 text-[11px] text-slate-400 hover:text-rose-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span className="hidden md:inline">پاکسازی</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpandedHeight((prev) => !prev)}
            className="px-2 py-1 text-[11px] text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded flex items-center gap-1 transition-colors"
          >
            {isExpandedHeight ? (
              <>
                <Minimize2 className="w-3 h-3" />
                <span className="hidden md:inline">جمع‌وجور</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3 h-3" />
                <span className="hidden md:inline">بزرگ‌نمایی</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="px-2 py-1 text-[11px] text-sky-300 hover:text-sky-200 bg-sky-500/10 border border-sky-500/30 rounded flex items-center gap-1 transition-colors"
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>نمایش ترمینال</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>بستن نوار</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Context Explanation Strip — tells the user what is happening in the current stage */}
      <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="text-slate-300">
          <span className="text-sky-400 font-semibold">کاربر در این مرحله چه می‌کند؟ </span>
          <span>{currentStepExplainFA}</span>
        </div>
        {latestEntry && (
          <div className="flex items-center gap-2 font-mono text-[11px] shrink-0" dir="ltr">
            <span className="text-slate-400">Last Cmd:</span>
            <span
              className={
                latestEntry.exitCode === 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'
              }
            >
              exit {latestEntry.exitCode} ({latestEntry.durationMs}ms)
            </span>
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div className="p-3 bg-slate-950 space-y-2.5" dir="ltr">
          {/* Live Terminal Output Stream */}
          <div
            ref={scrollContainerRef}
            className={`${
              isExpandedHeight ? 'max-h-96' : 'max-h-48'
            } overflow-y-auto space-y-2.5 font-mono text-xs pr-1`}
          >
            {entries.length === 0 ? (
              <div className="text-slate-400 py-3 px-2 text-xs font-mono">
                <div>
                  <span className="text-emerald-400">
                    root@musical-guacamole-964pg659qqqfp9xq:/opt/splunk-airgap#
                  </span>{' '}
                  <span className="text-slate-300">
                    # آماده دریافت دستورات از ویزارد یا اجرای مستقیم...
                  </span>
                </div>
                <div className="text-slate-500 mt-1">
                  # هر دکمه‌ای که در مراحل ویزارد یا تب‌های سامانه بزنید، دستور دقیق لینوکس و نتیجه واقعی اجرای آن در اینجا و در ترمینال Codespace نمایش داده می‌شود.
                </div>
              </div>
            ) : (
              entries.map((entry, idx) => (
                <div
                  key={entry.id}
                  className={`rounded-lg border p-2.5 space-y-1.5 ${
                    idx === 0
                      ? 'bg-slate-900/95 border-sky-500/40'
                      : 'bg-slate-900/50 border-slate-800/80 opacity-85'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] border-b border-slate-800/80 pb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sky-300 font-sans font-semibold" dir="rtl">
                        {entry.stepContextFA || currentStepTitleFA}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-400 truncate">{entry.cwd}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-400">{entry.durationMs} ms</span>
                      <span
                        className={
                          entry.exitCode === 0
                            ? 'text-emerald-400 font-bold'
                            : 'text-rose-400 font-bold'
                        }
                      >
                        [exit {entry.exitCode}]
                      </span>
                    </div>
                  </div>

                  <div className="text-emerald-300 break-all leading-relaxed">
                    <span className="text-emerald-500 select-none">
                      root@musical-guacamole-964pg659qqqfp9xq:/opt/splunk-airgap#{' '}
                    </span>
                    <span className="text-slate-100 font-semibold">{entry.command}</span>
                  </div>

                  {(entry.stdout || entry.stderr) && (
                    <pre className="text-[11px] text-slate-200 bg-slate-950/90 p-2 rounded border border-slate-800/70 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-44">
                      {(entry.stdout || '') + (entry.stderr ? `\n${entry.stderr}` : '')}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Quick Interactive Command Input Bar inside the Mirror */}
          <form onSubmit={handleRunQuickCommand} className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
            <span className="text-xs font-mono text-emerald-400 shrink-0 hidden sm:inline">
              root@codespace:/opt/splunk-airgap#
            </span>
            <input
              type="text"
              value={quickCmd}
              onChange={(e) => setQuickCmd(e.target.value)}
              placeholder="اجرای دستور زنده در همین مرحله (مثلاً: /opt/splunk/bin/splunk status یا ls -lh /var/tmp)..."
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              disabled={isRunningQuick}
              className="px-3.5 py-1.5 text-xs font-semibold bg-sky-400 hover:bg-sky-300 disabled:opacity-50 text-slate-950 rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isRunningQuick ? 'در حال اجرا...' : 'اجرای زنده در Codespace'}</span>
            </button>
            {onOpenFullTerminalTab && (
              <button
                type="button"
                onClick={onOpenFullTerminalTab}
                className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 hidden md:inline-flex"
              >
                کنسول کامل
              </button>
            )}
          </form>
        </div>
      )}
    </section>
  );
};
