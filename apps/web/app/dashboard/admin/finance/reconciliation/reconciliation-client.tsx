'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardHeader, EmptyState, StatTile, StatusChip, Badge, Button } from '@/components/ui';
import { inr, shortDate, titleCase } from '@/lib/format';

interface ReconciliationClientProps {
  initialOverview?: any;
}

export function ReconciliationClient({ initialOverview }: ReconciliationClientProps) {
  const [overview, setOverview] = useState<any>(initialOverview || null);
  const [activeTab, setActiveTab] = useState<'runs' | 'exceptions' | 'periods' | 'coverage' | 'revenue'>('exceptions');
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Reconciliation Runs state
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  const [runStartPeriod, setRunStartPeriod] = useState<string>('2026-10-01');
  const [runEndPeriod, setRunEndPeriod] = useState<string>('2026-10-31');

  // Exceptions state
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [selectedException, setSelectedException] = useState<any | null>(null);

  // Modals state
  const [showRunModal, setShowRunModal] = useState<boolean>(false);
  const [showResolveModal, setShowResolveModal] = useState<boolean>(false);
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
  const [showPeriodModal, setShowPeriodModal] = useState<boolean>(false);
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [assigneeUserId, setAssigneeUserId] = useState<string>('1');
  const [periodCode, setPeriodCode] = useState<string>('2026-10');
  const [periodStart, setPeriodStart] = useState<string>('2026-10-01');
  const [periodEnd, setPeriodEnd] = useState<string>('2026-10-31');
  const [periodNotes, setPeriodNotes] = useState<string>('');

  // Periods state
  const [periods, setPeriods] = useState<any[]>([]);

  // Coverage state
  const [coverageData, setCoverageData] = useState<any | null>(null);
  const [coverageFilter, setCoverageFilter] = useState<string>('ALL');

  // Revenue Breakdown state
  const [revenueData, setRevenueData] = useState<any | null>(null);

  // Load Overview
  const loadOverview = useCallback(async () => {
    try {
      const res = await api<any>('/admin/finance/control-overview');
      setOverview(res);
    } catch (err) {
      console.error('Failed to load control overview:', err);
    }
  }, []);

  // Load Runs
  const loadRuns = useCallback(async () => {
    try {
      const res = await api<any>('/admin/finance/reconciliation/runs', {
        query: { page: 1, pageSize: 20 },
      });
      setRuns(res.items || []);
    } catch (err) {
      console.error('Failed to load reconciliation runs:', err);
    }
  }, []);

  // Load Exceptions
  const loadExceptions = useCallback(async () => {
    try {
      const query: Record<string, string | number> = { page: 1, pageSize: 50 };
      if (statusFilter !== 'ALL') query.status = statusFilter;
      if (severityFilter !== 'ALL') query.severity = severityFilter;
      if (categoryFilter !== 'ALL') query.category = categoryFilter;
      const res = await api<any>('/admin/finance/exceptions', { query });
      setExceptions(res.items || []);
    } catch (err) {
      console.error('Failed to load exceptions:', err);
    }
  }, [statusFilter, severityFilter, categoryFilter]);

  // Load Periods
  const loadPeriods = useCallback(async () => {
    try {
      const res = await api<any>('/admin/finance/periods', {
        query: { page: 1, pageSize: 20 },
      });
      setPeriods(res.items || []);
    } catch (err) {
      console.error('Failed to load periods:', err);
    }
  }, []);

  // Load Coverage
  const loadCoverage = useCallback(async () => {
    try {
      const query: Record<string, string> = {};
      if (coverageFilter !== 'ALL') query.coverageStatus = coverageFilter;
      const res = await api<any>('/admin/finance/source-coverage', { query });
      setCoverageData(res);
    } catch (err) {
      console.error('Failed to load coverage:', err);
    }
  }, [coverageFilter]);

  // Load Revenue Breakdown
  const loadRevenue = useCallback(async () => {
    try {
      const res = await api<any>('/admin/finance/revenue-breakdown');
      setRevenueData(res);
    } catch (err) {
      console.error('Failed to load revenue breakdown:', err);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    loadExceptions();
  }, [loadOverview, loadExceptions]);

  useEffect(() => {
    if (activeTab === 'runs') loadRuns();
    if (activeTab === 'exceptions') loadExceptions();
    if (activeTab === 'periods') loadPeriods();
    if (activeTab === 'coverage') loadCoverage();
    if (activeTab === 'revenue') loadRevenue();
  }, [activeTab, loadRuns, loadExceptions, loadPeriods, loadCoverage, loadRevenue]);

  // Trigger Reconciliation Run
  const handleTriggerRun = async () => {
    setActionLoading(true);
    try {
      const res = await api<any>('/admin/finance/reconciliation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodStart: runStartPeriod,
          periodEnd: runEndPeriod,
          notes: 'Manual reconciliation run from control centre',
        }),
      });
      setShowRunModal(false);
      setSelectedRun(res);
      await loadOverview();
      await loadRuns();
      await loadExceptions();
      setActiveTab('runs');
    } catch (err: any) {
      alert(err.message || 'Failed to trigger reconciliation run');
    } finally {
      setActionLoading(false);
    }
  };

  // Acknowledge Exception
  const handleAcknowledge = async (id: number) => {
    setActionLoading(true);
    try {
      await api<any>(`/admin/finance/exceptions/${id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Acknowledged via UI' }),
      });
      await loadExceptions();
      await loadOverview();
    } catch (err: any) {
      alert(err.message || 'Failed to acknowledge exception');
    } finally {
      setActionLoading(false);
    }
  };

  // Resolve Exception
  const handleResolve = async () => {
    if (!selectedException || !resolutionNotes.trim()) return;
    setActionLoading(true);
    try {
      await api<any>(`/admin/finance/exceptions/${selectedException.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolutionNotes: resolutionNotes.trim(),
          resolutionType: 'MANUAL_AUDIT_RESOLUTION',
        }),
      });
      setShowResolveModal(false);
      setSelectedException(null);
      setResolutionNotes('');
      await loadExceptions();
      await loadOverview();
    } catch (err: any) {
      alert(err.message || 'Failed to resolve exception');
    } finally {
      setActionLoading(false);
    }
  };

  // Assign Exception
  const handleAssign = async () => {
    if (!selectedException) return;
    setActionLoading(true);
    try {
      await api<any>(`/admin/finance/exceptions/${selectedException.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedTo: Number(assigneeUserId),
          notes: 'Assigned for investigation',
        }),
      });
      setShowAssignModal(false);
      setSelectedException(null);
      await loadExceptions();
    } catch (err: any) {
      alert(err.message || 'Failed to assign exception');
    } finally {
      setActionLoading(false);
    }
  };

  // Reopen Exception
  const handleReopen = async (id: number) => {
    const reason = prompt('Reason for reopening exception:');
    if (!reason) return;
    setActionLoading(true);
    try {
      await api<any>(`/admin/finance/exceptions/${id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: reason }),
      });
      await loadExceptions();
      await loadOverview();
    } catch (err: any) {
      alert(err.message || 'Failed to reopen exception');
    } finally {
      setActionLoading(false);
    }
  };

  // Create Period
  const handleCreatePeriod = async () => {
    setActionLoading(true);
    try {
      await api<any>('/admin/finance/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodCode,
          periodStart,
          periodEnd,
          notes: periodNotes,
        }),
      });
      setShowPeriodModal(false);
      await loadPeriods();
      await loadOverview();
    } catch (err: any) {
      alert(err.message || 'Failed to create financial period');
    } finally {
      setActionLoading(false);
    }
  };

  // Review Period
  const handleReviewPeriod = async (id: number) => {
    setActionLoading(true);
    try {
      await api<any>(`/admin/finance/periods/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Placed into management review' }),
      });
      await loadPeriods();
    } catch (err: any) {
      alert(err.message || 'Failed to review period');
    } finally {
      setActionLoading(false);
    }
  };

  // Close Period
  const handleClosePeriod = async (id: number) => {
    if (!confirm('Are you sure you want to CLOSE this financial period? This protects the period from unauthorized mutations.')) return;
    setActionLoading(true);
    try {
      await api<any>(`/admin/finance/periods/${id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Formally closed by management' }),
      });
      await loadPeriods();
      await loadOverview();
    } catch (err: any) {
      alert(err.message || 'Failed to close period');
    } finally {
      setActionLoading(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">CRITICAL</span>;
      case 'WARNING':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">WARNING</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">INFO</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">OPEN</span>;
      case 'ACKNOWLEDGED':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">ACKNOWLEDGED</span>;
      case 'INVESTIGATING':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">INVESTIGATING</span>;
      case 'RESOLVED':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">RESOLVED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-neutral-800 text-neutral-400">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
            <Link href="/dashboard/admin" className="hover:text-neutral-300">Admin</Link>
            <span>/</span>
            <Link href="/dashboard/admin/finance" className="hover:text-neutral-300">Finance Control Centre</Link>
            <span>/</span>
            <span className="text-neutral-300">Reconciliation & Operations</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Financial Operations, Reconciliation & Accounting Control
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Autonomous discrepancy detection, source coverage validation, and auditable accounting period close.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => setShowPeriodModal(true)}
            className="text-xs"
          >
            + New Financial Period
          </Button>
          <Button
            variant="primary"
            onClick={() => setShowRunModal(true)}
            disabled={actionLoading}
            className="text-xs bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/20"
          >
            Run Reconciliation Engine
          </Button>
        </div>
      </div>

      {/* Control Overview Stat Grid */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-lg bg-neutral-900/60 border border-neutral-800">
            <p className="text-xs text-neutral-400 font-medium">Gross Volume</p>
            <p className="text-lg font-bold text-white mt-1">{inr(overview.volume.grossVolume)}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">{overview.volume.paidCount} settled payments</p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-900/60 border border-neutral-800">
            <p className="text-xs text-neutral-400 font-medium">Platform Revenue</p>
            <p className="text-lg font-bold text-emerald-400 mt-1">{inr(overview.platformRevenue.grossRevenue)}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">GST: {inr(overview.platformRevenue.gstCollected)}</p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-900/60 border border-neutral-800">
            <p className="text-xs text-neutral-400 font-medium">Invoiced Revenue</p>
            <p className="text-lg font-bold text-sky-400 mt-1">{inr(overview.platformRevenue.invoicedGrossRevenue)}</p>
            <p className="text-[11px] text-amber-400/80 mt-0.5">Uninvoiced: {inr(overview.platformRevenue.uninvoicedEligibleRevenue)}</p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-900/60 border border-neutral-800">
            <p className="text-xs text-neutral-400 font-medium">Owner Payouts Settled</p>
            <p className="text-lg font-bold text-white mt-1">{inr(overview.ownerPayouts.totalSettled)}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">Pipeline: {inr(overview.ownerPayouts.inPipeline)}</p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-900/60 border border-neutral-800">
            <p className="text-xs text-neutral-400 font-medium">Disputed / Held</p>
            <p className="text-lg font-bold text-amber-400 mt-1">{inr(overview.obligations.disputedHeldAmount)}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">{overview.obligations.activeDisputesCount} active disputes</p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-900/60 border border-neutral-800">
            <p className="text-xs text-neutral-400 font-medium">Open Exceptions</p>
            <p className={`text-lg font-bold mt-1 ${overview.exceptions.critical > 0 ? 'text-rose-400' : overview.exceptions.open > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {overview.exceptions.open}
            </p>
            <p className="text-[11px] text-rose-400/80 mt-0.5">{overview.exceptions.critical} critical issues</p>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-neutral-800 gap-2">
        <button
          onClick={() => setActiveTab('exceptions')}
          className={`pb-3 px-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'exceptions'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Financial Exceptions ({overview?.exceptions?.open || 0})
        </button>
        <button
          onClick={() => setActiveTab('runs')}
          className={`pb-3 px-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'runs'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Reconciliation Runs
        </button>
        <button
          onClick={() => setActiveTab('periods')}
          className={`pb-3 px-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'periods'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Accounting Periods & Close
        </button>
        <button
          onClick={() => setActiveTab('coverage')}
          className={`pb-3 px-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'coverage'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Source Coverage Matrix
        </button>
        <button
          onClick={() => setActiveTab('revenue')}
          className={`pb-3 px-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'revenue'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Platform Revenue Ledger
        </button>
      </div>

      {/* TAB 1: FINANCIAL EXCEPTIONS */}
      {activeTab === 'exceptions' && (
        <Card>
          <div className="p-4 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-400 font-medium mr-1">Filter:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-neutral-900 border border-neutral-700 text-xs text-neutral-200 rounded px-2.5 py-1.5"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
                <option value="INVESTIGATING">INVESTIGATING</option>
                <option value="RESOLVED">RESOLVED</option>
              </select>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-neutral-900 border border-neutral-700 text-xs text-neutral-200 rounded px-2.5 py-1.5"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="WARNING">WARNING</option>
                <option value="INFO">INFO</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-neutral-900 border border-neutral-700 text-xs text-neutral-200 rounded px-2.5 py-1.5"
              >
                <option value="ALL">All Categories</option>
                <option value="PAYMENT">PAYMENT</option>
                <option value="TRANSACTION">TRANSACTION</option>
                <option value="PAYOUT">PAYOUT</option>
                <option value="INVOICE">INVOICE</option>
                <option value="DISPUTE">DISPUTE</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
                <option value="DUPLICATE">DUPLICATE</option>
                <option value="RECONCILIATION">RECONCILIATION</option>
              </select>
            </div>

            <Button variant="secondary" onClick={loadExceptions} className="text-xs">
              Refresh
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-neutral-900/80 text-neutral-400 uppercase text-[10px] tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Exception #</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Title & Description</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Assigned / Resolved</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {exceptions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-neutral-500">
                      No financial exceptions found for the selected filter.
                    </td>
                  </tr>
                ) : (
                  exceptions.map((exc) => (
                    <tr key={exc.id} className="hover:bg-neutral-900/40">
                      <td className="py-3 px-4 font-mono font-medium text-white">
                        {exc.exception_number}
                      </td>
                      <td className="py-3 px-4">
                        {getSeverityBadge(exc.severity)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-300">
                          {exc.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <p className="font-medium text-white truncate">{exc.title}</p>
                        <p className="text-[11px] text-neutral-400 line-clamp-1">{exc.description}</p>
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(exc.status)}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-neutral-400">
                        {exc.resolver_name ? (
                          <span className="text-emerald-400">Resolved by {exc.resolver_name}</span>
                        ) : exc.assignee_name ? (
                          <span>Assigned: {exc.assignee_name}</span>
                        ) : (
                          <span className="text-neutral-500">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {exc.status === 'OPEN' && (
                            <button
                              onClick={() => handleAcknowledge(exc.id)}
                              disabled={actionLoading}
                              className="px-2 py-1 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded text-[11px]"
                            >
                              Acknowledge
                            </button>
                          )}
                          {exc.status !== 'RESOLVED' && (
                            <button
                              onClick={() => {
                                setSelectedException(exc);
                                setShowResolveModal(true);
                              }}
                              disabled={actionLoading}
                              className="px-2 py-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded text-[11px]"
                            >
                              Resolve
                            </button>
                          )}
                          {exc.status === 'RESOLVED' && (
                            <button
                              onClick={() => handleReopen(exc.id)}
                              disabled={actionLoading}
                              className="px-2 py-1 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 rounded text-[11px]"
                            >
                              Reopen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 2: RECONCILIATION RUNS */}
      {activeTab === 'runs' && (
        <Card>
          <CardHeader title="Reconciliation Run History" note="Chronological audit records of all autonomous financial inspection runs." />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-neutral-900/80 text-neutral-400 uppercase text-[10px] tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Run #</th>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Scanned</th>
                  <th className="py-3 px-4">Issues Found</th>
                  <th className="py-3 px-4">Critical</th>
                  <th className="py-3 px-4">Operator</th>
                  <th className="py-3 px-4">Executed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-neutral-500">
                      No reconciliation runs recorded yet. Click &quot;Run Reconciliation Engine&quot; to execute your first scan.
                    </td>
                  </tr>
                ) : (
                  runs.map((r) => (
                    <tr key={r.id} className="hover:bg-neutral-900/40">
                      <td className="py-3 px-4 font-mono font-medium text-white">{r.run_number}</td>
                      <td className="py-3 px-4 text-neutral-400">
                        {r.period_start ? `${r.period_start} to ${r.period_end}` : 'All Time'}
                      </td>
                      <td className="py-3 px-4">
                        {r.status === 'COMPLETED' ? (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400">COMPLETED</span>
                        ) : r.status === 'COMPLETED_WITH_EXCEPTIONS' ? (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400">EXCEPTIONS FOUND</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-neutral-800 text-neutral-400">{r.status}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">{r.records_scanned}</td>
                      <td className="py-3 px-4 font-semibold text-white">{r.issues_found}</td>
                      <td className="py-3 px-4 text-rose-400 font-semibold">{r.critical_issues}</td>
                      <td className="py-3 px-4 text-neutral-400">{r.operator_name || r.operator_email}</td>
                      <td className="py-3 px-4 text-neutral-400">{shortDate(r.started_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 3: ACCOUNTING PERIODS & CLOSE */}
      {activeTab === 'periods' && (
        <Card>
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Financial Periods & Close Management</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Control operational accounting cycles and enforce closed-period mutation protection.</p>
            </div>
            <Button variant="secondary" onClick={() => setShowPeriodModal(true)} className="text-xs">
              + Open Period
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-neutral-900/80 text-neutral-400 uppercase text-[10px] tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Period Code</th>
                  <th className="py-3 px-4">Date Range</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Opened By</th>
                  <th className="py-3 px-4">Reviewed By</th>
                  <th className="py-3 px-4">Closed By</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {periods.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-neutral-500">
                      No financial periods defined. Create a new period to begin close governance.
                    </td>
                  </tr>
                ) : (
                  periods.map((p) => (
                    <tr key={p.id} className="hover:bg-neutral-900/40">
                      <td className="py-3 px-4 font-mono font-medium text-white">{p.period_code}</td>
                      <td className="py-3 px-4 text-neutral-400">{p.period_start} to {p.period_end}</td>
                      <td className="py-3 px-4">
                        {p.status === 'OPEN' ? (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">OPEN</span>
                        ) : p.status === 'REVIEWING' ? (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">REVIEWING</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">CLOSED</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-neutral-400">{p.opener_name || 'System'}</td>
                      <td className="py-3 px-4 text-neutral-400">{p.reviewer_name || '—'}</td>
                      <td className="py-3 px-4 text-neutral-400">{p.closer_name || '—'}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {p.status === 'OPEN' && (
                            <button
                              onClick={() => handleReviewPeriod(p.id)}
                              disabled={actionLoading}
                              className="px-2 py-1 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded text-[11px]"
                            >
                              Place in Review
                            </button>
                          )}
                          {p.status !== 'CLOSED' && (
                            <button
                              onClick={() => handleClosePeriod(p.id)}
                              disabled={actionLoading}
                              className="px-2 py-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded text-[11px]"
                            >
                              Close Period
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 4: SOURCE COVERAGE MATRIX */}
      {activeTab === 'coverage' && coverageData && (
        <Card>
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Owner Payout Source Coverage Matrix</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Categorization of every candidate payment into payout states.</p>
            </div>
            <select
              value={coverageFilter}
              onChange={(e) => setCoverageFilter(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-xs text-neutral-200 rounded px-2.5 py-1.5"
            >
              <option value="ALL">All Categories ({coverageData.totalCount})</option>
              <option value="ELIGIBLE_NOT_PAID_OUT">ELIGIBLE_NOT_PAID_OUT ({coverageData.summary.ELIGIBLE_NOT_PAID_OUT || 0})</option>
              <option value="IN_ACTIVE_PAYOUT">IN_ACTIVE_PAYOUT ({coverageData.summary.IN_ACTIVE_PAYOUT || 0})</option>
              <option value="PAID_OUT">PAID_OUT ({coverageData.summary.PAID_OUT || 0})</option>
              <option value="DISPUTED">DISPUTED ({coverageData.summary.DISPUTED || 0})</option>
              <option value="EXCLUDED">EXCLUDED ({coverageData.summary.EXCLUDED || 0})</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-neutral-900/80 text-neutral-400 uppercase text-[10px] tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Payment Ref</th>
                  <th className="py-3 px-4">Purpose</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Payer / Payee</th>
                  <th className="py-3 px-4">Coverage Status</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {coverageData.items.map((item: any) => (
                  <tr key={item.paymentId} className="hover:bg-neutral-900/40">
                    <td className="py-3 px-4 font-mono font-medium text-white">{item.referenceCode}</td>
                    <td className="py-3 px-4">{item.purpose}</td>
                    <td className="py-3 px-4 font-semibold text-white">{inr(item.amount)}</td>
                    <td className="py-3 px-4 text-neutral-400">
                      {item.payerName} → {item.payeeName || 'Platform'}
                    </td>
                    <td className="py-3 px-4">
                      {item.coverageStatus === 'PAID_OUT' ? (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400">PAID_OUT</span>
                      ) : item.coverageStatus === 'IN_ACTIVE_PAYOUT' ? (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-sky-500/10 text-sky-400">IN_ACTIVE_PAYOUT</span>
                      ) : item.coverageStatus === 'DISPUTED' ? (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400">DISPUTED</span>
                      ) : item.coverageStatus === 'ELIGIBLE_NOT_PAID_OUT' ? (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-500/10 text-indigo-400">ELIGIBLE_NOT_PAID_OUT</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-neutral-800 text-neutral-400">{item.coverageStatus}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-neutral-400 text-[11px]">
                      {item.coverageDetails?.payoutNumber || item.coverageDetails?.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 5: PLATFORM REVENUE LEDGER */}
      {activeTab === 'revenue' && revenueData && (
        <Card>
          <CardHeader title="Platform Revenue Breakdown" note="Detailed audit of brokerage commissions, property management fees, legal, and marketing revenue." />
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-neutral-800 bg-neutral-900/30">
            <div>
              <p className="text-xs text-neutral-400">Commission Revenue</p>
              <p className="text-lg font-bold text-white mt-0.5">{inr(revenueData.byCategory.COMMISSION.paid)}</p>
              <p className="text-[11px] text-neutral-500">{revenueData.byCategory.COMMISSION.count} transactions</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Service Fee Revenue</p>
              <p className="text-lg font-bold text-white mt-0.5">{inr(revenueData.byCategory.SERVICE_FEE.paid)}</p>
              <p className="text-[11px] text-neutral-500">{revenueData.byCategory.SERVICE_FEE.count} transactions</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Legal Fee Revenue</p>
              <p className="text-lg font-bold text-white mt-0.5">{inr(revenueData.byCategory.LEGAL_FEE.paid)}</p>
              <p className="text-[11px] text-neutral-500">{revenueData.byCategory.LEGAL_FEE.count} transactions</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Marketing Package</p>
              <p className="text-lg font-bold text-white mt-0.5">{inr(revenueData.byCategory.MARKETING_PACKAGE.paid)}</p>
              <p className="text-[11px] text-neutral-500">{revenueData.byCategory.MARKETING_PACKAGE.count} transactions</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-neutral-900/80 text-neutral-400 uppercase text-[10px] tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Ref Code</th>
                  <th className="py-3 px-4">Purpose</th>
                  <th className="py-3 px-4">Payer</th>
                  <th className="py-3 px-4">Subtotal</th>
                  <th className="py-3 px-4">GST (18%)</th>
                  <th className="py-3 px-4">Total Amount</th>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {revenueData.transactions.map((t: any) => (
                  <tr key={t.id} className="hover:bg-neutral-900/40">
                    <td className="py-3 px-4 font-mono font-medium text-white">{t.reference_code}</td>
                    <td className="py-3 px-4">{t.purpose}</td>
                    <td className="py-3 px-4 text-neutral-400">{t.payer_name}</td>
                    <td className="py-3 px-4">{inr(t.amount)}</td>
                    <td className="py-3 px-4 text-neutral-400">{inr(t.tax_amount)}</td>
                    <td className="py-3 px-4 font-semibold text-emerald-400">{inr(t.total_amount)}</td>
                    <td className="py-3 px-4 font-mono text-sky-400">
                      {t.invoice_number ? (
                        <Link href={`/dashboard/admin/invoices/${t.invoice_id}`} className="hover:underline">
                          {t.invoice_number}
                        </Link>
                      ) : (
                        <span className="text-amber-400/70">Uninvoiced</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {t.status === 'PAID' ? (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400">PAID</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-neutral-800 text-neutral-400">{t.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* MODAL: RUN RECONCILIATION */}
      {showRunModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Execute Reconciliation Engine</h3>
            <p className="text-xs text-neutral-400">
              Scans all underlying financial transactions, invoices, payouts, and disputes to detect discrepancies.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Period Start</label>
                <input
                  type="date"
                  value={runStartPeriod}
                  onChange={(e) => setRunStartPeriod(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Period End</label>
                <input
                  type="date"
                  value={runEndPeriod}
                  onChange={(e) => setRunEndPeriod(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <Button variant="secondary" onClick={() => setShowRunModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleTriggerRun}
                disabled={actionLoading}
                className="bg-brand-500 hover:bg-brand-600 text-white"
              >
                {actionLoading ? 'Scanning...' : 'Execute Scan'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESOLVE EXCEPTION */}
      {showResolveModal && selectedException && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Resolve Financial Exception</h3>
            <div className="p-3 rounded bg-neutral-950 border border-neutral-800 text-xs text-neutral-300">
              <p className="font-semibold text-white">{selectedException.exception_number}: {selectedException.title}</p>
              <p className="text-neutral-400 mt-1">{selectedException.description}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">
                Resolution Rationale & Action Taken (Required for Audit)
              </label>
              <textarea
                rows={3}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Explain the investigative findings and financial remedy applied..."
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <Button variant="secondary" onClick={() => setShowResolveModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleResolve}
                disabled={!resolutionNotes.trim() || actionLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {actionLoading ? 'Saving...' : 'Mark as Resolved'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NEW PERIOD */}
      {showPeriodModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Open New Accounting Period</h3>
            <p className="text-xs text-neutral-400">
              Establish an operational financial period container for tracking and closing cycles.
            </p>

            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Period Code</label>
              <input
                type="text"
                value={periodCode}
                onChange={(e) => setPeriodCode(e.target.value)}
                placeholder="e.g. 2026-10"
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Start Date</label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">End Date</label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Notes (Optional)</label>
              <input
                type="text"
                value={periodNotes}
                onChange={(e) => setPeriodNotes(e.target.value)}
                placeholder="e.g. October 2026 Monthly Cycle"
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <Button variant="secondary" onClick={() => setShowPeriodModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreatePeriod}
                disabled={!periodCode || actionLoading}
                className="bg-brand-500 hover:bg-brand-600 text-white"
              >
                {actionLoading ? 'Creating...' : 'Open Period'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
