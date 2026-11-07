import React, { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  X,
  FileArchive,
  FileCode2,
  KeyRound,
  Zap,
} from 'lucide-react';

interface GitHubUser {
  login: string;
  name: string;
  avatarUrl: string;
  htmlUrl: string;
  connectedAt: string;
  repoName?: string;
  branch?: string;
  privateRepo?: boolean;
  autoSync?: boolean;
  lastRepoUrl?: string;
  lastCommitSha?: string;
  lastPushAt?: string;
}

interface GitHubStatusResponse {
  connected: boolean;
  oauthConfigured: boolean;
  callbackUrl: string;
  user: GitHubUser | null;
}

interface GitHubSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLabTerminal?: () => void;
}

export const GitHubSyncModal: React.FC<GitHubSyncModalProps> = ({
  isOpen,
  onClose,
  onOpenLabTerminal,
}) => {
  const [status, setStatus] = useState<GitHubStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [repoName, setRepoName] = useState('MAN7');
  const [privateRepo, setPrivateRepo] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [patInput, setPatInput] = useState('');
  const [connectingPat, setConnectingPat] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [provisioningLab, setProvisioningLab] = useState(false);
  const [pushResult, setPushResult] = useState<{
    ok: boolean;
    repoUrl?: string;
    commitSha?: string;
    filesCount?: number;
    codespacesUrl?: string;
    actionsUrl?: string;
    priorCleaned?: boolean;
    error?: string;
  } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const resp = await fetch('/api/github/status');
      if (resp.ok) {
        const data = (await resp.json()) as GitHubStatusResponse;
        setStatus(data);
        if (data.user) {
          if (data.user.repoName) setRepoName(data.user.repoName);
          if (data.user.privateRepo !== undefined) setPrivateRepo(data.user.privateRepo);
          if (data.user.autoSync !== undefined) setAutoSync(data.user.autoSync);
        }
      }
    } catch {
      // ignore offline standalone mode
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen, fetchStatus]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setAuthError(null);
        fetchStatus();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fetchStatus]);

  if (!isOpen) return null;

  const handleConnectToken = async () => {
    if (!patInput.trim()) {
      setAuthError('لطفاً توکن دسترسی GitHub (Personal Access Token) را وارد نمایید.');
      return;
    }
    setConnectingPat(true);
    setAuthError(null);
    setPushResult(null);
    try {
      const resp = await fetch('/api/github/connect-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: patInput.trim(),
          repoName,
          branch: 'main',
          privateRepo,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setAuthError(data.error || 'خطا در اتصال با توکن GitHub');
      } else {
        setPatInput('');
        if (data.syncResult) {
          setPushResult({
            ok: true,
            repoUrl: data.syncResult.repoUrl,
            commitSha: data.syncResult.commitSha,
            filesCount: data.syncResult.filesCount,
          });
        }
        await fetchStatus();
      }
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setConnectingPat(false);
    }
  };

  const handleConnectOAuth = async () => {
    setAuthError(null);
    try {
      const response = await fetch('/api/auth/url');
      const data = await response.json();
      if (!response.ok || !data.url) {
        setAuthError(
          data.error ||
            'برای اتصال بدون نیاز به CLIENT_ID، کافیست یک توکن شخصی (PAT) از لینک زیر بسازید و در کادر بالا وارد کنید.'
        );
        return;
      }

      const authWindow = window.open(data.url, 'oauth_popup', 'width=600,height=700');
      if (!authWindow) {
        setAuthError('پنجره پاپ‌آپ توسط مرورگر مسدود شد. لطفاً اجازه باز شدن Popup را برای این سایت فعال کنید.');
      }
    } catch (err) {
      setAuthError((err as Error).message);
    }
  };

  const handleToggleAutoSync = async (nextAutoSync: boolean) => {
    setAutoSync(nextAutoSync);
    try {
      await fetch('/api/github/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoSync: nextAutoSync,
          repoName,
          branch: 'main',
          privateRepo,
        }),
      });
      fetchStatus();
    } catch {
      // ignore
    }
  };

  const handleDisconnect = async () => {
    await fetch('/api/github/disconnect', { method: 'POST' });
    setPushResult(null);
    fetchStatus();
  };

  const handlePushToGithub = async () => {
    setPushing(true);
    setPushResult(null);
    try {
      const resp = await fetch('/api/github/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName, branch: 'main', privateRepo }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setPushResult({ ok: false, error: data.error || 'خطا در آپلود پروژه روی GitHub' });
      } else {
        setPushResult({
          ok: true,
          repoUrl: data.repoUrl,
          commitSha: data.commitSha,
          filesCount: data.filesCount,
        });
        fetchStatus();
      }
    } catch (err) {
      setPushResult({ ok: false, error: (err as Error).message });
    } finally {
      setPushing(false);
    }
  };

  const handleProvisionGithubLab = async () => {
    setProvisioningLab(true);
    setPushResult(null);
    try {
      const resp = await fetch('/api/github/provision-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName, branch: 'main', privateRepo }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setPushResult({ ok: false, error: data.error || 'خطا در ساخت محیط آزمایشگاهی GitHub' });
      } else {
        setPushResult({
          ok: true,
          repoUrl: data.repoUrl,
          commitSha: data.commitSha,
          filesCount: data.filesCount,
          codespacesUrl: data.codespacesUrl,
          actionsUrl: data.actionsUrl,
          priorCleaned: true,
        });
        fetchStatus();
      }
    } catch (err) {
      setPushResult({ ok: false, error: (err as Error).message });
    } finally {
      setProvisioningLab(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <GitBranch className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-slate-100">
              آپدیت خودکار GitHub در هر تغییر (Auto-Sync) و دانلود پکیج ویندوز
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Auto-Sync Pipeline Status Banner */}
        <div className="p-3.5 rounded-xl bg-sky-950/30 border border-sky-500/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="text-xs text-slate-200 leading-relaxed">
              <span className="font-bold text-sky-300">سیستم آپدیت خودکار در هر تغییر و بیلد فعال است: </span>
              به محض اتصال حساب GitHub، بعد از هر تغییر در کد یا اجرای بیلد، فایل‌های{' '}
              <code className="font-mono text-emerald-300">MAN7-Standalone.html</code> و{' '}
              <code className="font-mono text-emerald-300">windows-portable</code> به صورت خودکار به مخزن GitHub شما Push می‌شوند.
            </div>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded bg-sky-500/20 text-sky-300 font-mono shrink-0">
            Auto-Build & Push
          </span>
        </div>

        {/* Immediate Direct Windows Download Box */}
        <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-emerald-300">
              ۱. دانلود مستقیم نسخه آماده ویندوز (شامل MAN7-Standalone.html و اسکریپت بدون خطای PowerShell)
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
              Ready-to-Run
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href="/api/release/download-windows-zip"
              download="MAN7-Windows-Portable.zip"
              className="px-4 py-2 text-xs font-bold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg inline-flex items-center gap-2 transition-colors"
            >
              <FileArchive className="w-4 h-4" />
              <span>دانلود پکیج کامل ویندوز (MAN7-Windows-Portable.zip)</span>
            </a>
            <a
              href="/api/release/download-standalone"
              download="MAN7-Standalone.html"
              className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 rounded-lg inline-flex items-center gap-2 transition-colors"
            >
              <FileCode2 className="w-4 h-4" />
              <span>دانلود تک‌فایل MAN7-Standalone.html</span>
            </a>
          </div>
        </div>

        {/* GitHub Auto-Sync & Connection Section */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-sky-400" />
              <span>۲. اتصال به GitHub برای آپدیت خودکار بعد از هر تغییر</span>
            </h3>
            {loadingStatus && <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
          </div>

          {status?.connected && status.user ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div className="flex items-center gap-3">
                  {status.user.avatarUrl && (
                    <img
                      src={status.user.avatarUrl}
                      alt={status.user.login}
                      className="w-8 h-8 rounded-full border border-emerald-500/40"
                    />
                  )}
                  <div>
                    <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <span>متصل به حساب: {status.user.login}</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono" dir="ltr">
                      {status.user.lastRepoUrl || status.user.htmlUrl}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-500/10 rounded border border-rose-500/30 transition-colors"
                >
                  قطع اتصال
                </button>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/90 border border-emerald-500/30 flex items-center justify-between">
                <label className="flex items-center gap-2.5 text-xs font-semibold text-emerald-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => handleToggleAutoSync(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                  />
                  <span>آپدیت خودکار مخزن GitHub بلافاصله پس از هر تغییر و بیلد (Auto-Sync)</span>
                </label>
                <span className="text-[11px] font-mono text-emerald-400">
                  {autoSync ? 'ACTIVE' : 'PAUSED'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">نام مخزن در GitHub (Repository Name)</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={privateRepo}
                      onChange={(e) => setPrivateRepo(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                    />
                    <span>مخزن خصوصی (Private)</span>
                  </label>
                </div>
              </div>

              {status.user.lastCommitSha && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
                  <span>
                    آخرین سینک خودکار: <code className="font-mono text-emerald-400">{status.user.lastCommitSha.slice(0, 8)}</code>
                  </span>
                  {status.user.lastRepoUrl && (
                    <a
                      href={status.user.lastRepoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 hover:underline inline-flex items-center gap-1 font-mono"
                      dir="ltr"
                    >
                      <span>{status.user.lastRepoUrl}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={pushing || provisioningLab}
                  onClick={handlePushToGithub}
                  className="py-2.5 px-4 text-xs font-bold bg-sky-400 hover:bg-sky-300 disabled:opacity-50 text-slate-950 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  {pushing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>در حال سینک با GitHub...</span>
                    </>
                  ) : (
                    <>
                      <GitBranch className="w-4 h-4" />
                      <span>سینک فوری دستی در مخزن {repoName}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={provisioningLab || pushing}
                  onClick={handleProvisionGithubLab}
                  className="py-2.5 px-4 text-xs font-bold bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-slate-950 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  {provisioningLab ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>در حال پاکسازی و ساخت Lab...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>پاکسازی قبلی‌ها + ساخت Lab Ubuntu 20.04 & Splunk 9</span>
                    </>
                  )}
                </button>
              </div>

              {pushResult && (
                <div
                  className={`p-3 rounded-lg border text-xs ${
                    pushResult.ok
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  }`}
                >
                  {pushResult.ok ? (
                    <div className="space-y-1.5">
                      <div className="font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>پروژه MAN7 با موفقیت روی GitHub آپدیت شد! ({pushResult.filesCount} فایل)</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[11px]" dir="ltr">
                        <span>Commit: {pushResult.commitSha?.slice(0, 8)}</span>
                        {pushResult.repoUrl && (
                          <a
                            href={pushResult.repoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 underline inline-flex items-center gap-1"
                          >
                            <span>{pushResult.repoUrl}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{pushResult.error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Quick 5-Second Personal Access Token Connection */}
              <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>روش سریع (پیشنهادی): اتصال ۵ ثانیه‌ای با توکن GitHub و فعال‌سازی آپدیت خودکار</span>
                  </span>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=MAN7-Auto-Sync"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-sky-400 hover:underline inline-flex items-center gap-1"
                  >
                    <span>ساخت توکن ۱-کلیکی در GitHub</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <input
                      type="password"
                      dir="ltr"
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={patInput}
                      onChange={(e) => setPatInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-slate-100"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      dir="ltr"
                      placeholder="نام مخزن (مثلاً MAN7)"
                      value={repoName}
                      onChange={(e) => setRepoName(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-slate-100"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={connectingPat}
                  onClick={handleConnectToken}
                  className="w-full py-2 px-4 text-xs font-bold bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-slate-950 rounded-lg inline-flex items-center justify-center gap-2 transition-colors"
                >
                  {connectingPat ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>در حال اتصال و آپلود خودکار پروژه روی GitHub...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>اتصال، آپلود فوری و فعال‌سازی آپدیت خودکار در هر تغییر</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  یا اتصال از طریق OAuth App (در صورت تنظیم CLIENT_ID):
                </span>
                <button
                  type="button"
                  onClick={handleConnectOAuth}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg inline-flex items-center gap-1.5 transition-colors"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Connect with GitHub OAuth</span>
                </button>
              </div>

              {authError && (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Ubuntu 20.04 LTS + Splunk 9.2.1 Live Lab & GitHub Codespaces/Actions Sandbox */}
        <div className="p-4 rounded-xl bg-slate-950 border border-sky-500/40 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-sky-300">
              ۳. آزمایشگاه Ubuntu 20.04 LTS + Splunk Enterprise 9.2.1 (داخل برنامه + فضای ابری GitHub Codespaces)
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
              Ubuntu 20.04 + Splunk 9.2.1
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            علاوه بر پیکربندی خودکار <code className="font-mono text-emerald-300">.devcontainer</code> (برای اجرای Ubuntu 20.04 و Splunk 9 در GitHub Codespaces) و <code className="font-mono text-emerald-300">ubuntu20-splunk9-lab.yml</code> (در GitHub Actions)، همین الان یک سرور آزمایشگاهی زنده Ubuntu 20.04.6 LTS + Splunk 9.2.1 روی پورت <code className="font-mono text-sky-300">127.0.0.1:9099</code> داخل برنامه آماده و متصل است.
          </p>
          {onOpenLabTerminal && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenLabTerminal();
              }}
              className="w-full py-2.5 px-4 text-xs font-bold bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Zap className="w-4 h-4" />
              <span>ورود به آزمایشگاه زنده Ubuntu 20.04 + Splunk 9.2.1 و اجرای تست صفر تا صد</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
