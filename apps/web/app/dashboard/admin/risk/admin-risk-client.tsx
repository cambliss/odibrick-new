'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface AdminRiskClientProps {
  initialOverview: any;
  initialCases: any[];
  initialCasesTotal: number;
  initialSignals: any[];
  initialEvents: any[];
  initialPayments: any[];
  initialAccounts: any[];
  initialListings: any[];
}

export function AdminRiskClient({
  initialOverview,
  initialCases,
  initialCasesTotal,
  initialSignals,
  initialEvents,
  initialPayments,
  initialAccounts,
  initialListings,
}: AdminRiskClientProps) {
  const [activeTab, setActiveTab] = useState<'cases' | 'signals' | 'events' | 'suspicious'>('cases');
  const [cases] = useState<any[]>(initialCases);
  const [signals] = useState<any[]>(initialSignals);
  const [events] = useState<any[]>(initialEvents);
  const [payments] = useState<any[]>(initialPayments);
  const [accounts] = useState<any[]>(initialAccounts);
  const [listings] = useState<any[]>(initialListings);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [riskLevelFilter, setRiskLevelFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const overview = initialOverview || {
    openCases: 0,
    criticalRisks: 0,
    highRisks: 0,
    mediumRisks: 0,
    unresolvedSecurityEvents: 0,
    suspiciousPaymentsCount: 0,
    suspiciousAccountsCount: 0,
    suspiciousListingsCount: 0,
    failedAuthSpikes: 0,
    activeSignalsCount: 0,
    avgResolutionHours: 0,
  };

  const filteredCases = cases.filter((c) => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    if (riskLevelFilter !== 'ALL' && c.risk_level !== riskLevelFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchNum = c.case_number?.toLowerCase().includes(q);
      const matchSum = c.summary?.toLowerCase().includes(q);
      const matchUser = c.subject_name?.toLowerCase().includes(q);
      if (!matchNum && !matchSum && !matchUser) return false;
    }
    return true;
  });

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-500/10 text-red-400 border border-red-500/30';
      case 'HIGH':
        return 'bg-orange-500/10 text-orange-400 border border-orange-500/30';
      case 'MEDIUM':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
      default:
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'UNDER_REVIEW':
        return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'EVIDENCE_REQUESTED':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'ESCALATED':
        return 'bg-red-500/20 text-red-300 font-semibold border border-red-500/40';
      case 'RESOLVED':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'FALSE_POSITIVE':
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
      default:
        return 'bg-slate-500/10 text-slate-300 border border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
              PHASE 17 GOVERNANCE
            </span>
            <span className="text-xs text-slate-500">Security & Trust Engine</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">Trust & Risk Control Centre</h1>
          <p className="text-sm text-slate-400 mt-1">
            Governed fraud detection, factual risk signals, security event telemetry & management review workflows.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin/operations"
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 transition"
          >
            Operations Control Tower →
          </Link>
          <Link
            href="/dashboard/admin/analytics"
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 transition"
          >
            Executive Analytics →
          </Link>
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">Open Risk Cases</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-white">{overview.openCases}</span>
            <span className="text-xs text-blue-400 font-mono">Queue</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-red-500/20 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-xs font-medium text-red-400">Critical / High Threats</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-red-300">
              {Number(overview.criticalRisks || 0) + Number(overview.highRisks || 0)}
            </span>
            <span className="text-xs text-red-400 font-mono">Priority</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">Active Risk Signals</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-amber-400">{overview.activeSignalsCount}</span>
            <span className="text-xs text-amber-400/80 font-mono">Signals</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">Suspicious Payments</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-orange-400">{overview.suspiciousPaymentsCount}</span>
            <span className="text-xs text-orange-400/80 font-mono">Finance</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">Auth Spikes (24h)</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-purple-400">{overview.failedAuthSpikes}</span>
            <span className="text-xs text-purple-400/80 font-mono">Security</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">Avg Resolution</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-emerald-400">{overview.avgResolutionHours}h</span>
            <span className="text-xs text-emerald-400 font-mono">SLA</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 space-x-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('cases')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'cases'
              ? 'border-red-500 text-red-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Fraud & Risk Cases ({cases.length})
        </button>

        <button
          onClick={() => setActiveTab('signals')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'signals'
              ? 'border-red-500 text-red-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Risk Signals Engine ({signals.length})
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'events'
              ? 'border-red-500 text-red-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Security Telemetry & Events ({events.length})
        </button>

        <button
          onClick={() => setActiveTab('suspicious')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'suspicious'
              ? 'border-red-500 text-red-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Suspicious Activity Watchlist
        </button>
      </div>

      {/* TAB 1: RISK CASES */}
      {activeTab === 'cases' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search case #, summary, user..."
                className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 w-60 focus:outline-none focus:border-red-500"
              />

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                <option value="EVIDENCE_REQUESTED">EVIDENCE_REQUESTED</option>
                <option value="ESCALATED">ESCALATED</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
              </select>

              <select
                value={riskLevelFilter}
                onChange={(e) => setRiskLevelFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
              >
                <option value="ALL">All Severity Levels</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>

            <div className="text-xs text-slate-400">
              Showing <span className="text-white font-semibold">{filteredCases.length}</span> of {initialCasesTotal} cases
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Case ID</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Case Type</th>
                    <th className="px-4 py-3">Subject / Entity</th>
                    <th className="px-4 py-3">Summary</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assignee</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-normal">
                  {filteredCases.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        No fraud or risk cases match active filters.
                      </td>
                    </tr>
                  ) : (
                    filteredCases.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3 font-mono font-medium text-white whitespace-nowrap">
                          {c.case_number}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${getRiskBadge(c.risk_level)}`}>
                            {c.risk_level}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-200">
                          {c.case_type}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div>
                            <span className="text-white font-medium">{c.subject_name || 'System / Direct'}</span>
                            {c.subject_email && (
                              <div className="text-[10px] text-slate-400 font-mono">{c.subject_email}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300 max-w-xs truncate" title={c.summary}>
                          {c.summary}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] ${getStatusBadge(c.status)}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                          {c.assigned_name || <span className="text-slate-600 italic">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <Link
                            href={`/dashboard/admin/risk/${c.id}`}
                            className="px-2.5 py-1 text-[11px] font-medium rounded bg-red-600/20 text-red-300 hover:bg-red-600/30 border border-red-500/30 transition"
                          >
                            Investigate →
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RISK SIGNALS */}
      {activeTab === 'signals' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-300">
            Factual signals detected deterministically by the risk engine. Every signal includes observed values, configured thresholds, and auditable reasons.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {signals.map((sig) => (
              <div key={sig.id} className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs text-slate-400">{sig.public_id}</span>
                    <h3 className="text-sm font-semibold text-white mt-0.5">{sig.signal_type}</h3>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${getRiskBadge(sig.severity)}`}>
                    {sig.severity}
                  </span>
                </div>

                <p className="text-xs text-slate-300 bg-slate-950/40 border border-slate-800/80 rounded-lg p-2.5">
                  {sig.explanation}
                </p>

                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-800/40 rounded-lg p-2 font-mono">
                  <div>
                    <span className="text-slate-400">Observed:</span>{' '}
                    <span className="text-red-400 font-semibold">{sig.detected_value}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Threshold:</span>{' '}
                    <span className="text-slate-300">{sig.threshold_value}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
                  <span>Domain: {sig.source_domain} ({sig.source_entity_type} #{sig.source_entity_id})</span>
                  <span>{new Date(sig.created_at).toLocaleString('en-IN')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SECURITY EVENTS */}
      {activeTab === 'events' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Event ID</th>
                  <th className="px-4 py-3">Event Type</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Actor / IP</th>
                  <th className="px-4 py-3">Summary</th>
                  <th className="px-4 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 font-mono font-medium text-slate-400 whitespace-nowrap">{evt.public_id}</td>
                    <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">{evt.event_type}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${getRiskBadge(evt.severity)}`}>
                        {evt.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-slate-200">{evt.actor_role || 'SYSTEM'}</span>
                      {evt.actor_ip && <div className="text-[10px] text-slate-500 font-mono">{evt.actor_ip}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-md">{evt.summary}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                      {new Date(evt.created_at).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: SUSPICIOUS ACTIVITY WATCHLIST */}
      {activeTab === 'suspicious' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Suspicious Payments */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-semibold text-white">Suspicious Payments</h3>
              <span className="text-xs text-orange-400 font-mono">{payments.length} items</span>
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {payments.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">No payment anomalies flagged.</div>
              ) : (
                payments.map((p) => (
                  <div key={p.paymentId} className="bg-slate-950/40 border border-slate-800 rounded-lg p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium text-white">{p.referenceCode}</span>
                      <span className="font-semibold text-orange-400">INR {p.amount.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="text-slate-400">{p.payerName} ({p.payerEmail})</div>
                    <div className="text-[11px] text-red-400">{p.riskReason}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Suspicious Accounts */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-semibold text-white">Suspicious Accounts</h3>
              <span className="text-xs text-purple-400 font-mono">{accounts.length} items</span>
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {accounts.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">No account anomalies flagged.</div>
              ) : (
                accounts.map((a) => (
                  <div key={a.userId} className="bg-slate-950/40 border border-slate-800 rounded-lg p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">{a.userName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">{a.role}</span>
                    </div>
                    <div className="text-slate-400 font-mono text-[11px]">{a.userEmail}</div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-red-400 font-medium">Failed: {a.failedAttempts} attempts</span>
                      <span className="text-slate-500">{a.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Suspicious Listings */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-semibold text-white">Suspicious Listings</h3>
              <span className="text-xs text-amber-400 font-mono">{listings.length} items</span>
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {listings.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">No listing anomalies flagged.</div>
              ) : (
                listings.map((l) => (
                  <div key={l.propertyId} className="bg-slate-950/40 border border-slate-800 rounded-lg p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-400">{l.propertyCode}</span>
                      <span className="font-medium text-slate-200">{l.city}</span>
                    </div>
                    <div className="font-medium text-white truncate" title={l.title}>{l.title}</div>
                    <div className="text-[11px] text-amber-400">{l.riskReason}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
