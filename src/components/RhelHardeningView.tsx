import React, { useState } from 'react';
import { HardeningProfileConfig } from '../utils/splunkEngine';
import { Shield, Copy, Check, RotateCcw } from 'lucide-react';

interface RhelHardeningViewProps {
  hardening: HardeningProfileConfig;
  setHardening: React.Dispatch<React.SetStateAction<HardeningProfileConfig>>;
}

export const RhelHardeningView: React.FC<RhelHardeningViewProps> = ({
  hardening,
  setHardening,
}) => {
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  const handleCopySnippet = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedFile(id);
    setTimeout(() => setCopiedFile(null), 1800);
  };

  const handleResetDefaults = () => {
    setHardening((prev) => ({
      ...prev,
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
    }));
  };

  const tunedConfSnippet = `# /etc/tuned/splunk-enterprise/tuned.conf
# Official Splunk Capacity Planning & RHEL Kernel Tuning Profile
[main]
summary=Splunk Enterprise High-Throughput & Low-Latency Profile (${hardening.targetRhel})
include=throughput-performance

[vm]
transparent_hugepages=${hardening.disableThp ? 'never' : 'madvise'}

[sysctl]
vm.swappiness=${hardening.swappiness}
vm.max_map_count=${hardening.maxMapCount}
vm.overcommit_memory=0
net.core.somaxconn=4096
net.ipv4.tcp_fin_timeout=30
net.ipv4.tcp_keepalive_intvl=15
net.ipv4.tcp_keepalive_probes=5`;

  const systemdUnitSnippet = `# /etc/systemd/system/Splunkd.service.d/override.conf
# Enforces non-root execution, ulimits, and cgroup v2 resource controls
[Service]
User=${hardening.splunkUser}
Group=${hardening.splunkGroup}
LimitNOFILE=${hardening.nofileLimit}
LimitNPROC=${hardening.nprocLimit}
LimitFSIZE=infinity
LimitCORE=infinity
TasksMax=infinity
TimeoutStopSec=300
KillMode=mixed
PermissionsStartOnly=true
${
  hardening.disableThp
    ? `ExecStartPre=/bin/sh -c "echo never > /sys/kernel/mm/transparent_hugepage/enabled && echo never > /sys/kernel/mm/transparent_hugepage/defrag"`
    : ''
}`;

  const selinuxAndFirewallSnippet = `# Offline SELinux Context Labeling & Firewalld Port Hardening
# 1. Apply SELinux file contexts in Enforcing mode
semanage fcontext -a -t bin_t "${hardening.splunkHome}/bin(/.*)?"
semanage fcontext -a -t lib_t "${hardening.splunkHome}/lib(/.*)?"
semanage fcontext -a -t etc_t "${hardening.splunkHome}/etc(/.*)?"
semanage fcontext -a -t var_log_t "${hardening.splunkHome}/var/log(/.*)?"
semanage fcontext -a -t var_run_t "${hardening.splunkHome}/var/run(/.*)?"
restorecon -Rv "${hardening.splunkHome}"

# 2. Configure Offline Firewalld Rules (${hardening.serverRole.toUpperCase()})
firewall-cmd --permanent --add-port=${hardening.customPorts.splunkWeb}/tcp   # Splunk Web HTTPS
firewall-cmd --permanent --add-port=${hardening.customPorts.splunkdMgmt}/tcp # splunkd REST Management
firewall-cmd --permanent --add-port=${hardening.customPorts.s2sReceiving}/tcp # Forwarder S2S TLS Input
firewall-cmd --permanent --add-port=${hardening.customPorts.hecPort}/tcp     # HTTP Event Collector
firewall-cmd --permanent --add-port=${hardening.customPorts.kvStorePort}/tcp # KV Store WiredTiger/Mongo
firewall-cmd --permanent --add-port=${hardening.customPorts.replicationPort}/tcp # Cluster Replication
firewall-cmd --reload`;

  return (
    <div className="space-y-8">
      {/* Configuration Controls */}
      <section aria-labelledby="hardening-controls-heading" className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h2 id="hardening-controls-heading" className="text-xl font-bold text-slate-100">
              ایمن‌سازی لینوکس {hardening.targetRhel} بر اساس Best Practices اسپلانک و CIS
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              هر تغییری در این پنل به صورت آنی در اسکریپت گام B (نصب آفلاین) و فایل‌های پیکربندی کرنل، `systemd` و `firewalld` اعمال می‌شود.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>بازنشانی به مقادیر استاندارد Splunk</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
          {/* Identity & Paths */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-200">۱. کاربر غیر ریشه (Least Privilege) و مسیر نصب</h3>
            <div>
              <label htmlFor="splunk-user-input" className="block text-xs text-slate-400 mb-1.5">
                کاربر اختصاصی سرویس (Service User)
              </label>
              <input
                id="splunk-user-input"
                type="text"
                dir="ltr"
                value={hardening.splunkUser}
                onChange={(e) => setHardening((p) => ({ ...p, splunkUser: e.target.value || 'splunk' }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="splunk-home-input" className="block text-xs text-slate-400 mb-1.5">
                مسیر نصب اسپلانک (`$SPLUNK_HOME`)
              </label>
              <input
                id="splunk-home-input"
                type="text"
                dir="ltr"
                value={hardening.splunkHome}
                onChange={(e) => setHardening((p) => ({ ...p, splunkHome: e.target.value || '/opt/splunk' }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Resource & Kernel Limits */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-200">۲. محدودیت‌های کرنل و Systemd ulimits</h3>
            <div>
              <label htmlFor="nofile-limit-input" className="block text-xs text-slate-400 mb-1.5">
                حداکثر فایل‌های باز (`LimitNOFILE` — حداقل استاندارد: 65536)
              </label>
              <input
                id="nofile-limit-input"
                type="number"
                dir="ltr"
                min={8192}
                step={1024}
                value={hardening.nofileLimit}
                onChange={(e) => setHardening((p) => ({ ...p, nofileLimit: Number(e.target.value) || 65536 }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 tabular-nums focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="nproc-limit-input" className="block text-xs text-slate-400 mb-1.5">
                حداکثر پردازش‌ها (`LimitNPROC` — حداقل استاندارد: 16384)
              </label>
              <input
                id="nproc-limit-input"
                type="number"
                dir="ltr"
                min={4096}
                step={1024}
                value={hardening.nprocLimit}
                onChange={(e) => setHardening((p) => ({ ...p, nprocLimit: Number(e.target.value) || 16384 }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 tabular-nums focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="swappiness-input" className="block text-xs text-slate-400 mb-1.5">
                  `vm.swappiness`
                </label>
                <input
                  id="swappiness-input"
                  type="number"
                  dir="ltr"
                  min={1}
                  max={100}
                  value={hardening.swappiness}
                  onChange={(e) => setHardening((p) => ({ ...p, swappiness: Number(e.target.value) || 1 }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 tabular-nums focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="maxmap-input" className="block text-xs text-slate-400 mb-1.5">
                  `vm.max_map_count`
                </label>
                <input
                  id="maxmap-input"
                  type="number"
                  dir="ltr"
                  value={hardening.maxMapCount}
                  onChange={(e) => setHardening((p) => ({ ...p, maxMapCount: Number(e.target.value) || 262144 }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 tabular-nums focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Security & Performance Policies */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-200">۳. سیاست‌های امنیتی و پایداری سرویس</h3>
            <label className="flex items-start gap-3 p-3 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.disableThp}
                onChange={(e) => setHardening((p) => ({ ...p, disableThp: e.target.checked }))}
                className="mt-1 accent-emerald-500"
              />
              <span className="text-xs text-slate-300 leading-relaxed">
                <strong className="text-slate-100 block">غیرفعال‌سازی Transparent Huge Pages (THP)</strong>
                ایجاد پروفایل `tuned` اختصاصی جهت جلوگیری از قفل شدن صفحات حافظه در ایندکسر و KV Store
              </span>
            </label>

            <label className="flex items-start gap-3 p-3 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.enableSelinuxCustomPolicy}
                onChange={(e) => setHardening((p) => ({ ...p, enableSelinuxCustomPolicy: e.target.checked }))}
                className="mt-1 accent-emerald-500"
              />
              <span className="text-xs text-slate-300 leading-relaxed">
                <strong className="text-slate-100 block">حفظ SELinux در وضعیت Enforcing</strong>
                تنظیم برچسب‌های `semanage fcontext` روی دایرکتوری‌های `bin`، `lib` و `var/log` بدون غیرفعال کردن SELinux
              </span>
            </label>

            <label className="flex items-start gap-3 p-3 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.enableSystemdBootStart}
                onChange={(e) => setHardening((p) => ({ ...p, enableSystemdBootStart: e.target.checked }))}
                className="mt-1 accent-emerald-500"
              />
              <span className="text-xs text-slate-300 leading-relaxed">
                <strong className="text-slate-100 block">فعال‌سازی سرویس بومی Systemd (`Splunkd.service`)</strong>
                استفاده از `-systemd-managed 1` در RHEL 8/9 به جای اسکریپت‌های منسوخ `/etc/init.d/splunk`
              </span>
            </label>
          </div>
        </div>

        {/* Network Port Matrix */}
        <div className="mt-6 pt-6 border-t border-slate-800">
          <h3 className="text-sm font-bold text-slate-200 mb-3">
            ۴. ماتریس پورت‌های فایروال آفلاین (`firewalld` Port Allowance Matrix)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4" dir="ltr">
            <div>
              <label htmlFor="port-web" className="block text-xs font-mono text-slate-400 mb-1">
                Splunk Web (HTTPS)
              </label>
              <input
                id="port-web"
                type="number"
                value={hardening.customPorts.splunkWeb}
                onChange={(e) =>
                  setHardening((p) => ({
                    ...p,
                    customPorts: { ...p.customPorts, splunkWeb: Number(e.target.value) || 8000 },
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-mono text-emerald-400 tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="port-mgmt" className="block text-xs font-mono text-slate-400 mb-1">
                splunkd Mgmt Port
              </label>
              <input
                id="port-mgmt"
                type="number"
                value={hardening.customPorts.splunkdMgmt}
                onChange={(e) =>
                  setHardening((p) => ({
                    ...p,
                    customPorts: { ...p.customPorts, splunkdMgmt: Number(e.target.value) || 8089 },
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-mono text-emerald-400 tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="port-s2s" className="block text-xs font-mono text-slate-400 mb-1">
                S2S Receiving (TLS)
              </label>
              <input
                id="port-s2s"
                type="number"
                value={hardening.customPorts.s2sReceiving}
                onChange={(e) =>
                  setHardening((p) => ({
                    ...p,
                    customPorts: { ...p.customPorts, s2sReceiving: Number(e.target.value) || 9997 },
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-mono text-emerald-400 tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="port-hec" className="block text-xs font-mono text-slate-400 mb-1">
                HEC Input Port
              </label>
              <input
                id="port-hec"
                type="number"
                value={hardening.customPorts.hecPort}
                onChange={(e) =>
                  setHardening((p) => ({
                    ...p,
                    customPorts: { ...p.customPorts, hecPort: Number(e.target.value) || 8088 },
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-mono text-emerald-400 tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="port-kv" className="block text-xs font-mono text-slate-400 mb-1">
                KV Store Mongo Port
              </label>
              <input
                id="port-kv"
                type="number"
                value={hardening.customPorts.kvStorePort}
                onChange={(e) =>
                  setHardening((p) => ({
                    ...p,
                    customPorts: { ...p.customPorts, kvStorePort: Number(e.target.value) || 8191 },
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-mono text-emerald-400 tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="port-rep" className="block text-xs font-mono text-slate-400 mb-1">
                Cluster Replication
              </label>
              <input
                id="port-rep"
                type="number"
                value={hardening.customPorts.replicationPort}
                onChange={(e) =>
                  setHardening((p) => ({
                    ...p,
                    customPorts: { ...p.customPorts, replicationPort: Number(e.target.value) || 9887 },
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-mono text-emerald-400 tabular-nums"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Generated Configuration Artifacts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>پروفایل کرنل و THP (`tuned.conf`)</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopySnippet('tuned', tunedConfSnippet)}
                className="text-xs text-slate-300 hover:text-emerald-400 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedFile === 'tuned' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedFile === 'tuned' ? 'کپی شد' : 'کپی'}</span>
              </button>
            </div>
            <pre className="text-xs font-mono text-slate-200 bg-slate-950 border border-slate-800 rounded-lg p-3.5 overflow-x-auto leading-relaxed" dir="ltr">
              {tunedConfSnippet}
            </pre>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>واحد سرویس `Splunkd.service`</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopySnippet('systemd', systemdUnitSnippet)}
                className="text-xs text-slate-300 hover:text-emerald-400 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedFile === 'systemd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedFile === 'systemd' ? 'کپی شد' : 'کپی'}</span>
              </button>
            </div>
            <pre className="text-xs font-mono text-slate-200 bg-slate-950 border border-slate-800 rounded-lg p-3.5 overflow-x-auto leading-relaxed" dir="ltr">
              {systemdUnitSnippet}
            </pre>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>قوانین SELinux و `firewalld`</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopySnippet('selinux', selinuxAndFirewallSnippet)}
                className="text-xs text-slate-300 hover:text-emerald-400 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedFile === 'selinux' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedFile === 'selinux' ? 'کپی شد' : 'کپی'}</span>
              </button>
            </div>
            <pre className="text-xs font-mono text-slate-200 bg-slate-950 border border-slate-800 rounded-lg p-3.5 overflow-x-auto leading-relaxed" dir="ltr">
              {selinuxAndFirewallSnippet}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
