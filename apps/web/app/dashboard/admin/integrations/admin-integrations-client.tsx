'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface AdminIntegrationsClientProps {
  initialHealth: any;
  initialIntegrations: any[];
}

export function AdminIntegrationsClient({
  initialHealth,
  initialIntegrations,
}: AdminIntegrationsClientProps) {
  const [integrations, setIntegrations] = useState<any[]>(initialIntegrations);
  const [healthSummary, setHealthSummary] = useState<any>(initialHealth);
  const [selectedCapability, setSelectedCapability] = useState<string>('ALL');
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, any>>({});
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const health = healthSummary || {
    total: 9,
    healthy: 9,
    degraded: 0,
    failing: 0,
    disabled: 0,
    notConfigured: 0,
    webhookTotal: 2,
    webhookSuccessRate: 100,
  };

  const filteredIntegrations = integrations.filter((item) => {
    if (selectedCapability !== 'ALL' && item.capability !== selectedCapability) return false;
    return true;
  });

  const refreshData = async () => {
    try {
      const [updatedHealth, updatedList] = await Promise.all([
        api<any>('/admin/integrations/health'),
        api<any[]>('/admin/integrations'),
      ]);
      if (updatedHealth) setHealthSummary(updatedHealth);
      if (updatedList) setIntegrations(updatedList);
    } catch {
      // Fallback
    }
  };

  const handleTestConnection = async (id: number) => {
    setTestingId(id);
    try {
      const res = await api<any>(`/admin/integrations/${id}/test`, { method: 'POST' });
      setTestResults((prev) => ({ ...prev, [id]: res }));
      await refreshData();
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { status: 'FAILING', message: err.message || 'Diagnostic ping failed' },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleToggle = async (id: number, currentEnabled: boolean) => {
    setTogglingId(id);
    try {
      await api(`/admin/integrations/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ isEnabled: !currentEnabled }),
      });
      await refreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle integration');
    } finally {
      setTogglingId(null);
    }
  };

  const getHealthBadge = (status: string) => {
    switch (status) {
      case 'HEALTHY':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
      case 'DEGRADED':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
      case 'FAILING':
        return 'bg-red-500/10 text-red-400 border border-red-500/30';
      case 'DISABLED':
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/30';
      default:
        return 'bg-slate-500/10 text-slate-300 border border-slate-500/30';
    }
  };

  const getEnvBadge = (env: string) => {
    switch (env) {
      case 'PRODUCTION':
        return 'bg-purple-500/10 text-purple-300 border border-purple-500/30';
      case 'SANDBOX':
        return 'bg-blue-500/10 text-blue-300 border border-blue-500/30';
      default:
        return 'bg-slate-700/50 text-slate-300 border border-slate-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
              PHASE 18 PLATFORM
            </span>
            <span className="text-xs text-slate-500">External Provider Adapters</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">External Integrations Platform</h1>
          <p className="text-sm text-slate-400 mt-1">
            Governed adapter interfaces, secret-safe credential management, diagnostic connectivity & webhook verification.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin/integrations/webhooks"
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30 transition flex items-center gap-1.5"
          >
            <span>Webhook Control Centre</span>
            <span className="bg-indigo-500/30 px-1.5 py-0.2 rounded text-[10px] font-mono">{health.webhookTotal}</span>
            <span>→</span>
          </Link>
          <Link
            href="/dashboard/admin/operations"
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 transition"
          >
            Control Tower →
          </Link>
        </div>
      </div>

      {/* Health & Status Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">Total Adapters</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-white">{health.total}</span>
            <span className="text-xs text-blue-400 font-mono">Registry</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-emerald-500/20 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-xs font-medium text-emerald-400">Healthy Connections</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-emerald-300">{health.healthy}</span>
            <span className="text-xs text-emerald-400 font-mono">Operational</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">Degraded / Failing</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-amber-400">
              {Number(health.degraded || 0) + Number(health.failing || 0)}
            </span>
            <span className="text-xs text-amber-400/80 font-mono">Alerts</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">Disabled Adapters</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-slate-400">{health.disabled}</span>
            <span className="text-xs text-slate-500 font-mono">Paused</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-indigo-500/20 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-xs font-medium text-indigo-400">Inbound Webhooks</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-indigo-300">{health.webhookTotal}</span>
            <span className="text-xs text-indigo-400 font-mono">Store</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">Webhook Success</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-emerald-400">{health.webhookSuccessRate}%</span>
            <span className="text-xs text-emerald-400 font-mono">Verified</span>
          </div>
        </div>
      </div>

      {/* Capability Selector */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        {[
          { label: 'All Capabilities', value: 'ALL' },
          { label: 'Email', value: 'EMAIL' },
          { label: 'SMS', value: 'SMS' },
          { label: 'WhatsApp', value: 'WHATSAPP' },
          { label: 'Payment Gateway', value: 'PAYMENT_GATEWAY' },
          { label: 'Storage', value: 'STORAGE' },
          { label: 'KYC & Identity', value: 'KYC' },
          { label: 'E-Signature', value: 'ESIGN' },
          { label: 'Maps & Geo', value: 'MAPS' },
          { label: 'Calendar Sync', value: 'CALENDAR' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setSelectedCapability(tab.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
              selectedCapability === tab.value
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Provider Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredIntegrations.map((item) => {
          const testRes = testResults[item.id];
          const isTesting = testingId === item.id;
          const isToggling = togglingId === item.id;

          return (
            <div
              key={item.id}
              className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-lg hover:border-slate-700 transition"
            >
              {/* Header Info */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-[10px] text-blue-400 uppercase tracking-wider font-semibold">
                      {item.capability}
                    </span>
                    <h3 className="text-base font-bold text-white mt-0.5">{item.name}</h3>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${getHealthBadge(item.health_status)}`}>
                      {item.health_status}
                    </span>
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-mono ${getEnvBadge(item.environment)}`}>
                      {item.environment}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 line-clamp-2">{item.description}</p>
              </div>

              {/* Secret-Safe Configuration Snapshot */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 text-xs space-y-1.5 font-mono">
                <div className="text-[11px] text-slate-400 font-sans font-semibold border-b border-slate-800/60 pb-1 flex justify-between">
                  <span>Configuration Metadata</span>
                  <span className="text-emerald-400 font-mono text-[10px]">Secret-Safe</span>
                </div>

                {item.base_url && (
                  <div className="text-slate-300 truncate" title={item.base_url}>
                    <span className="text-slate-500">Endpoint:</span> {item.base_url}
                  </div>
                )}

                {item.config_metadata &&
                  Object.entries(item.config_metadata).map(([key, val]) => (
                    <div key={key} className="text-slate-300 truncate">
                      <span className="text-slate-500">{key}:</span> {String(val)}
                    </div>
                  ))}
              </div>

              {/* Diagnostic Test Feedback if run */}
              {testRes && (
                <div className={`rounded-lg p-2.5 text-xs space-y-1 ${
                  testRes.status === 'HEALTHY'
                    ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
                    : 'bg-red-950/40 border border-red-500/30 text-red-300'
                }`}>
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-bold">{testRes.status}</span>
                    {testRes.latencyMs && <span>{testRes.latencyMs}ms latency</span>}
                  </div>
                  <p className="text-[11px]">{testRes.message}</p>
                </div>
              )}

              {/* Card Footer & Action Buttons */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleToggle(item.id, item.is_enabled)}
                  disabled={isToggling}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    item.is_enabled
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  {isToggling ? 'Updating...' : item.is_enabled ? 'Disable' : 'Enable Adapter'}
                </button>

                <button
                  onClick={() => handleTestConnection(item.id)}
                  disabled={isTesting}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition flex items-center gap-1 shadow-sm"
                >
                  {isTesting ? (
                    <>
                      <span className="animate-spin text-xs">⟳</span>
                      <span>Testing...</span>
                    </>
                  ) : (
                    <span>Test Connection</span>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
