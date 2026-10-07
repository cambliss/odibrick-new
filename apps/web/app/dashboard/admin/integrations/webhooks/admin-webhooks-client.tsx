'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface AdminWebhooksClientProps {
  initialWebhooks: any[];
  initialTotal: number;
}

export function AdminWebhooksClient({
  initialWebhooks,
  initialTotal,
}: AdminWebhooksClientProps) {
  const [webhooks, setWebhooks] = useState<any[]>(initialWebhooks);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [providerFilter, setProviderFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedWebhook, setSelectedWebhook] = useState<any | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const filteredWebhooks = webhooks.filter((wh) => {
    if (statusFilter !== 'ALL' && wh.processing_status !== statusFilter) return false;
    if (providerFilter !== 'ALL' && wh.provider !== providerFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchId = wh.public_id?.toLowerCase().includes(q);
      const matchExt = wh.external_event_id?.toLowerCase().includes(q);
      const matchType = wh.event_type?.toLowerCase().includes(q);
      if (!matchId && !matchExt && !matchType) return false;
    }
    return true;
  });

  const refreshData = async () => {
    try {
      const updated = await api<any>('/admin/integrations/webhooks?pageSize=50');
      if (updated?.data) setWebhooks(updated.data);
    } catch {
      // Fallback
    }
  };

  const handleRetry = async (id: number) => {
    setRetryingId(id);
    try {
      await api(`/admin/integrations/webhooks/${id}/retry`, { method: 'POST' });
      await refreshData();
      if (selectedWebhook?.id === id) {
        const updated = await api<any>(`/admin/integrations/webhooks/${id}`);
        setSelectedWebhook(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to retry webhook processing');
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PROCESSED':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold';
      case 'PROCESSING':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/30';
      case 'FAILED':
        return 'bg-red-500/10 text-red-400 border border-red-500/30 font-semibold';
      case 'SKIPPED':
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/30';
      default:
        return 'bg-slate-500/10 text-slate-300 border border-slate-500/30';
    }
  };

  const getSigBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
      case 'INVALID':
        return 'bg-red-500/20 text-red-400 border border-red-500/40 font-bold';
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Link href="/dashboard/admin/integrations" className="hover:text-white transition">
              ← External Integrations
            </Link>
            <span>/</span>
            <span className="text-slate-200">Webhook Management</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">Inbound Webhook Control Centre</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time callback telemetry, signature verification logs, deduplication engine, and failure recovery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshData}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 transition"
          >
            ⟳ Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search webhook #, event, external ID..."
            className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 w-64 focus:outline-none focus:border-blue-500"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="ALL">All Processing Statuses</option>
            <option value="PROCESSED">PROCESSED</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="FAILED">FAILED</option>
            <option value="RECEIVED">RECEIVED</option>
            <option value="SKIPPED">SKIPPED</option>
          </select>

          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="ALL">All Providers</option>
            <option value="razorpay">Razorpay / Stripe</option>
            <option value="leegality_esign">Leegality E-Sign</option>
            <option value="hyperverge_kyc">HyperVerge KYC</option>
            <option value="twilio">Twilio SMS</option>
            <option value="meta_whatsapp">Meta WhatsApp</option>
            <option value="resend">Resend Email</option>
          </select>
        </div>

        <div className="text-xs text-slate-400">
          Showing <span className="text-white font-semibold">{filteredWebhooks.length}</span> of {initialTotal} webhooks
        </div>
      </div>

      {/* Webhooks Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Webhook ID</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Event Type</th>
                <th className="px-4 py-3">External Event ID</th>
                <th className="px-4 py-3">Signature</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Received At</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredWebhooks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No webhook events match the active filters.
                  </td>
                </tr>
              ) : (
                filteredWebhooks.map((wh) => (
                  <tr key={wh.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 font-mono font-medium text-white whitespace-nowrap">
                      {wh.public_id}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-200">
                      {wh.provider}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-300">
                      {wh.event_type}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-400">
                      {wh.external_event_id}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] ${getSigBadge(wh.signature_status)}`}>
                        {wh.signature_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] ${getStatusBadge(wh.processing_status)}`}>
                        {wh.processing_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-400">
                      {new Date(wh.received_at).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                      <button
                        onClick={() => setSelectedWebhook(wh)}
                        className="px-2.5 py-1 text-[11px] font-medium rounded bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 transition"
                      >
                        Inspect
                      </button>

                      {wh.processing_status === 'FAILED' && wh.signature_status !== 'INVALID' && (
                        <button
                          onClick={() => handleRetry(wh.id)}
                          disabled={retryingId === wh.id}
                          className="px-2.5 py-1 text-[11px] font-medium rounded bg-blue-600 text-white hover:bg-blue-500 transition"
                        >
                          {retryingId === wh.id ? 'Retrying...' : 'Retry'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAYLOAD INSPECTOR MODAL */}
      {selectedWebhook && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="font-mono text-xs text-blue-400 font-semibold">{selectedWebhook.public_id}</span>
                <h3 className="text-sm font-bold text-white mt-0.5">Webhook Payload & Verification Details</h3>
              </div>
              <button onClick={() => setSelectedWebhook(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800 font-mono">
              <div>
                <span className="text-slate-500">Provider:</span> <span className="text-white">{selectedWebhook.provider}</span>
              </div>
              <div>
                <span className="text-slate-500">Event:</span> <span className="text-white">{selectedWebhook.event_type}</span>
              </div>
              <div>
                <span className="text-slate-500">Signature:</span>{' '}
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${getSigBadge(selectedWebhook.signature_status)}`}>
                  {selectedWebhook.signature_status}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>{' '}
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${getStatusBadge(selectedWebhook.processing_status)}`}>
                  {selectedWebhook.processing_status}
                </span>
              </div>
              <div className="col-span-2 truncate">
                <span className="text-slate-500">SHA256 Payload Hash:</span>{' '}
                <span className="text-slate-400">{selectedWebhook.payload_hash}</span>
              </div>
            </div>

            {selectedWebhook.error_message && (
              <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-xs text-red-300 space-y-1">
                <span className="font-semibold">Processing Failure:</span>
                <p>{selectedWebhook.error_message}</p>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Inbound Payload (JSON)
              </label>
              <pre className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs text-emerald-400 font-mono max-h-60 overflow-y-auto">
                {JSON.stringify(selectedWebhook.payload, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedWebhook(null)}
                className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>

              {selectedWebhook.processing_status === 'FAILED' && selectedWebhook.signature_status !== 'INVALID' && (
                <button
                  onClick={() => handleRetry(selectedWebhook.id)}
                  disabled={retryingId === selectedWebhook.id}
                  className="px-4 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500"
                >
                  {retryingId === selectedWebhook.id ? 'Retrying...' : 'Retry Processing'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
