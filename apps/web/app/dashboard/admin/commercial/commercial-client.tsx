'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type Tab = 'overview' | 'obligations' | 'rules' | 'preview' | 'revenue';

export function CommercialClient() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [obligations, setObligations] = useState<any[]>([]);
  const [obligationsMeta, setObligationsMeta] = useState<any>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [revenueData, setRevenueData] = useState<any>(null);
  const [selectedObligation, setSelectedObligation] = useState<any>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupBy, setGroupBy] = useState<'category' | 'month' | 'property' | 'rule'>('category');

  // Preview form state
  const [previewForm, setPreviewForm] = useState({
    category: 'COMMISSION',
    basis: 'PERCENT_OF_MONTHLY_RENT',
    baseAmount: 50000,
    percentValue: 100,
    flatValue: 0,
    minAmount: 5000,
    maxAmount: 100000,
    taxRate: 18,
  });
  const [previewResult, setPreviewResult] = useState<any>(null);

  // Modals state
  const [actionModal, setActionModal] = useState<{
    type: 'approve' | 'waive' | 'adjust' | 'cancel' | 'createRule' | null;
    obligation?: any;
  }>({ type: null });

  const [modalReason, setModalReason] = useState('');
  const [modalAmount, setModalAmount] = useState<number>(0);
  const [modalNotes, setModalNotes] = useState('');

  // Create rule form state
  const [newRule, setNewRule] = useState({
    code: '',
    name: '',
    category: 'COMMISSION',
    appliesTo: 'STANDARD',
    basis: 'PERCENT_OF_MONTHLY_RENT',
    percentValue: 100,
    flatValue: 0,
    minAmount: 5000,
    maxAmount: 100000,
    payer: 'OWNER',
    taxRate: 18,
    priority: 10,
    city: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/admin/commercial/overview');
      if (res.ok) setOverview(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchObligations = async () => {
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);

      const res = await fetch(`/api/admin/commercial/obligations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setObligations(data.items || []);
        setObligationsMeta(data.meta || null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/admin/commercial/rules');
      if (res.ok) setRules(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRevenue = async () => {
    try {
      const res = await fetch(`/api/admin/commercial/revenue?groupBy=${groupBy}`);
      if (res.ok) setRevenueData(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([fetchOverview(), fetchObligations(), fetchRules(), fetchRevenue()]);
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (tab === 'obligations') fetchObligations();
    if (tab === 'rules') fetchRules();
    if (tab === 'revenue') fetchRevenue();
  }, [tab, categoryFilter, statusFilter, groupBy]);

  const handleRunPreview = async () => {
    try {
      const res = await fetch('/api/admin/commercial/rules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previewForm),
      });
      if (res.ok) {
        setPreviewResult(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/commercial/obligations/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: modalNotes }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Commercial obligation approved and payment created.' });
        setActionModal({ type: null });
        refreshAll();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.message || 'Approval failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Approval failed' });
    }
  };

  const handleWaive = async (id: number) => {
    if (!modalReason.trim()) {
      setMessage({ type: 'error', text: 'Waiver reason is required.' });
      return;
    }
    try {
      const res = await fetch(`/api/admin/commercial/obligations/${id}/waive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: modalReason, waiverAmount: modalAmount || undefined }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Commercial obligation successfully waived.' });
        setActionModal({ type: null });
        refreshAll();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.message || 'Waiver failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Waiver failed' });
    }
  };

  const handleAdjust = async (id: number) => {
    if (!modalReason.trim() || !modalAmount) {
      setMessage({ type: 'error', text: 'Adjustment amount and reason are required.' });
      return;
    }
    try {
      const res = await fetch(`/api/admin/commercial/obligations/${id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjustmentType: 'CORRECTION',
          amountAdjusted: Number(modalAmount),
          reason: modalReason,
          notes: modalNotes,
        }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Commercial obligation adjusted successfully.' });
        setActionModal({ type: null });
        refreshAll();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.message || 'Adjustment failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Adjustment failed' });
    }
  };

  const handleCancel = async (id: number) => {
    if (!modalReason.trim()) {
      setMessage({ type: 'error', text: 'Cancellation reason is required.' });
      return;
    }
    try {
      const res = await fetch(`/api/admin/commercial/obligations/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: modalReason }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Commercial obligation cancelled.' });
        setActionModal({ type: null });
        refreshAll();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.message || 'Cancellation failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Cancellation failed' });
    }
  };

  const handleCreateRule = async () => {
    if (!newRule.code || !newRule.name) {
      setMessage({ type: 'error', text: 'Rule code and name are required.' });
      return;
    }
    try {
      const res = await fetch('/api/admin/commercial/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Commercial pricing rule created successfully.' });
        setActionModal({ type: null });
        refreshAll();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.message || 'Failed to create rule' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to create rule' });
    }
  };

  const handleToggleRule = async (id: number, currentActive: boolean) => {
    try {
      const action = currentActive ? 'deactivate' : 'activate';
      const res = await fetch(`/api/admin/commercial/rules/${id}/${action}`, { method: 'POST' });
      if (res.ok) {
        setMessage({ type: 'success', text: `Rule ${action}d successfully.` });
        fetchRules();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatINR = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col justify-between gap-4 border-b border-sand pb-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-serif font-bold text-ink">Commercial & Revenue Operations</h1>
            <span className="rounded-full bg-seal-soft px-2.5 py-0.5 text-xs font-semibold text-seal-deep">
              Phase 8 Layer
            </span>
          </div>
          <p className="text-sm text-muted">
            Platform revenue attribution, commercial pricing rules, commission lifecycle, and analytical reporting.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin/finance"
            className="rounded-card border border-sand bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-sand/30"
          >
            ← Finance Control Centre
          </Link>
          <button
            onClick={() => setActionModal({ type: 'createRule' })}
            className="rounded-card bg-seal-deep px-4 py-2 text-sm font-medium text-white shadow hover:bg-seal-deep/90"
          >
            + Create Commercial Rule
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {message && (
        <div
          className={`flex items-center justify-between rounded-card p-3 text-sm ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="font-bold">
            ×
          </button>
        </div>
      )}

      {/* Overview KPI Cards */}
      {overview && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-card border border-sand bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-muted">Gross Volume</p>
            <p className="mt-1 text-xl font-bold text-ink">{formatINR(overview.volume.grossVolume)}</p>
            <p className="mt-1 text-xs text-muted">{overview.counts.total} obligations tracked</p>
          </div>

          <div className="rounded-card border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-emerald-700">Paid Platform Revenue</p>
            <p className="mt-1 text-xl font-bold text-emerald-900">{formatINR(overview.volume.paidRevenue)}</p>
            <p className="mt-1 text-xs text-emerald-700">{overview.counts.paid} settled obligations</p>
          </div>

          <div className="rounded-card border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-amber-700">Payment Due</p>
            <p className="mt-1 text-xl font-bold text-amber-900">{formatINR(overview.volume.paymentDue)}</p>
            <p className="mt-1 text-xs text-amber-700">{overview.counts.due} awaiting collection</p>
          </div>

          <div className="rounded-card border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-blue-700">Pending Review</p>
            <p className="mt-1 text-xl font-bold text-blue-900">{formatINR(overview.volume.pendingReview)}</p>
            <p className="mt-1 text-xs text-blue-700">{overview.counts.pending} awaiting approval</p>
          </div>

          <div className="rounded-card border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-purple-700">Active Rules</p>
            <p className="mt-1 text-xl font-bold text-purple-900">{overview.counts.activeRules}</p>
            <p className="mt-1 text-xs text-purple-700">Configured pricing rules</p>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-sand text-sm font-medium">
        <button
          onClick={() => setTab('overview')}
          className={`border-b-2 px-4 py-2.5 transition-colors ${
            tab === 'overview' ? 'border-seal-deep text-seal-deep' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Executive Overview
        </button>
        <button
          onClick={() => setTab('obligations')}
          className={`border-b-2 px-4 py-2.5 transition-colors ${
            tab === 'obligations' ? 'border-seal-deep text-seal-deep' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Obligations Console ({obligations.length})
        </button>
        <button
          onClick={() => setTab('rules')}
          className={`border-b-2 px-4 py-2.5 transition-colors ${
            tab === 'rules' ? 'border-seal-deep text-seal-deep' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Commercial Pricing Rules ({rules.length})
        </button>
        <button
          onClick={() => setTab('preview')}
          className={`border-b-2 px-4 py-2.5 transition-colors ${
            tab === 'preview' ? 'border-seal-deep text-seal-deep' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Calculation Simulator
        </button>
        <button
          onClick={() => setTab('revenue')}
          className={`border-b-2 px-4 py-2.5 transition-colors ${
            tab === 'revenue' ? 'border-seal-deep text-seal-deep' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Revenue Analytics & GST
        </button>
      </div>

      {/* Tab 1: Executive Overview */}
      {tab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="rounded-card border border-sand bg-white p-5 shadow-sm">
            <h2 className="text-lg font-serif font-semibold text-ink">Revenue by Commercial Category</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-sand text-xs font-semibold uppercase text-muted">
                    <th className="py-2.5">Category</th>
                    <th className="py-2.5">Obligations</th>
                    <th className="py-2.5">Taxable Base</th>
                    <th className="py-2.5">GST Total</th>
                    <th className="py-2.5">Total Billed</th>
                    <th className="py-2.5">Paid Revenue</th>
                    <th className="py-2.5">Payment Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand/50">
                  {overview.categories.map((cat: any) => (
                    <tr key={cat.category} className="hover:bg-sand/10">
                      <td className="py-3 font-semibold text-ink">
                        <span className="rounded bg-sand/30 px-2 py-1 text-xs">{cat.category}</span>
                      </td>
                      <td className="py-3 text-muted">{cat.count}</td>
                      <td className="py-3">{formatINR(cat.feeAmount)}</td>
                      <td className="py-3 text-muted">{formatINR(cat.taxAmount)}</td>
                      <td className="py-3 font-medium">{formatINR(cat.totalAmount)}</td>
                      <td className="py-3 font-semibold text-emerald-700">{formatINR(cat.paidAmount)}</td>
                      <td className="py-3 font-semibold text-amber-700">{formatINR(cat.dueAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Obligations Console */}
      {tab === 'obligations' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search by obligation #, property, payer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-card border border-sand bg-white px-3 py-1.5 text-sm outline-none focus:border-seal-deep"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-card border border-sand bg-white px-3 py-1.5 text-sm outline-none focus:border-seal-deep"
            >
              <option value="">All Categories</option>
              <option value="COMMISSION">COMMISSION</option>
              <option value="SERVICE_FEE">SERVICE_FEE</option>
              <option value="LEGAL_FEE">LEGAL_FEE</option>
              <option value="MARKETING_PACKAGE">MARKETING_PACKAGE</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-card border border-sand bg-white px-3 py-1.5 text-sm outline-none focus:border-seal-deep"
            >
              <option value="">All Statuses</option>
              <option value="PENDING_REVIEW">PENDING_REVIEW</option>
              <option value="PAYMENT_DUE">PAYMENT_DUE</option>
              <option value="PAID">PAID</option>
              <option value="WAIVED">WAIVED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="DISPUTED">DISPUTED</option>
            </select>
          </div>

          <div className="rounded-card border border-sand bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-sand bg-sand/20 text-xs font-semibold uppercase text-muted">
                  <th className="px-4 py-3">Obligation #</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Payer / Property</th>
                  <th className="px-4 py-3">Taxable Fee</th>
                  <th className="px-4 py-3">GST</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand/50">
                {obligations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted">
                      No commercial obligations found matching filters.
                    </td>
                  </tr>
                ) : (
                  obligations.map((ob) => (
                    <tr key={ob.id} className="hover:bg-sand/10">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-ink">{ob.obligationNumber}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-sand/40 px-2 py-0.5 text-xs font-medium">{ob.category}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{ob.payerName || `User #${ob.payerUserId}`}</p>
                        <p className="text-xs text-muted">{ob.propertyTitle || 'General Platform'}</p>
                      </td>
                      <td className="px-4 py-3">{formatINR(ob.feeAmount)}</td>
                      <td className="px-4 py-3 text-muted">{formatINR(ob.taxAmount)}</td>
                      <td className="px-4 py-3 font-bold text-ink">{formatINR(ob.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            ob.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ob.status === 'PAYMENT_DUE'
                              ? 'bg-amber-100 text-amber-800'
                              : ob.status === 'PENDING_REVIEW'
                              ? 'bg-blue-100 text-blue-800'
                              : ob.status === 'WAIVED'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-zinc-100 text-zinc-800'
                          }`}
                        >
                          {ob.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {ob.status === 'PENDING_REVIEW' && (
                            <button
                              onClick={() => {
                                setActionModal({ type: 'approve', obligation: ob });
                                setModalNotes('');
                              }}
                              className="rounded bg-seal-deep px-2 py-1 text-xs font-medium text-white hover:bg-seal-deep/90"
                            >
                              Approve
                            </button>
                          )}
                          {ob.status !== 'PAID' && ob.status !== 'WAIVED' && (
                            <button
                              onClick={() => {
                                setActionModal({ type: 'waive', obligation: ob });
                                setModalReason('');
                                setModalAmount(ob.totalAmount);
                              }}
                              className="rounded border border-sand bg-white px-2 py-1 text-xs text-muted hover:bg-sand/30 hover:text-ink"
                            >
                              Waive
                            </button>
                          )}
                          {ob.status !== 'PAID' && ob.status !== 'CANCELLED' && (
                            <button
                              onClick={() => {
                                setActionModal({ type: 'cancel', obligation: ob });
                                setModalReason('');
                              }}
                              className="rounded border border-sand bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            >
                              Cancel
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
        </div>
      )}

      {/* Tab 3: Commercial Rules Management */}
      {tab === 'rules' && (
        <div className="space-y-4">
          <div className="rounded-card border border-sand bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-sand bg-sand/20 text-xs font-semibold uppercase text-muted">
                  <th className="px-4 py-3">Rule Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Basis / Rate</th>
                  <th className="px-4 py-3">Payer</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Usage</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand/50">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-sand/10">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-ink">{r.code}</td>
                    <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-sand/40 px-2 py-0.5 text-xs">{r.category}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.basis === 'FLAT_FEE'
                        ? formatINR(r.flatValue)
                        : `${r.percentValue}% of ${r.basis.replace('PERCENT_OF_', '')}`}
                    </td>
                    <td className="px-4 py-3 text-xs">{r.payer}</td>
                    <td className="px-4 py-3 font-semibold text-xs">{r.priority}</td>
                    <td className="px-4 py-3 text-xs text-muted">{r.usageCount} times</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          r.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        {r.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleToggleRule(r.id, r.isActive)}
                        className="rounded border border-sand bg-white px-2 py-1 text-xs hover:bg-sand/20"
                      >
                        {r.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Calculation Simulator */}
      {tab === 'preview' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-card border border-sand bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-lg font-serif font-semibold text-ink">Commercial Calculation Simulator</h2>
            <p className="text-xs text-muted">
              Test commercial formula calculations without persisting financial obligations or creating payments.
            </p>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-muted">Category</label>
                <select
                  value={previewForm.category}
                  onChange={(e) => setPreviewForm({ ...previewForm, category: e.target.value })}
                  className="mt-1 w-full rounded-card border border-sand p-2"
                >
                  <option value="COMMISSION">COMMISSION</option>
                  <option value="SERVICE_FEE">SERVICE_FEE</option>
                  <option value="LEGAL_FEE">LEGAL_FEE</option>
                  <option value="MARKETING_PACKAGE">MARKETING_PACKAGE</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted">Calculation Basis</label>
                <select
                  value={previewForm.basis}
                  onChange={(e) => setPreviewForm({ ...previewForm, basis: e.target.value })}
                  className="mt-1 w-full rounded-card border border-sand p-2"
                >
                  <option value="PERCENT_OF_MONTHLY_RENT">PERCENT_OF_MONTHLY_RENT</option>
                  <option value="PERCENT_OF_ANNUAL_RENT">PERCENT_OF_ANNUAL_RENT</option>
                  <option value="FLAT_FEE">FLAT_FEE</option>
                  <option value="PERCENT_OF_TRANSACTION">PERCENT_OF_TRANSACTION</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted">Base Amount (₹)</label>
                <input
                  type="number"
                  value={previewForm.baseAmount}
                  onChange={(e) => setPreviewForm({ ...previewForm, baseAmount: Number(e.target.value) })}
                  className="mt-1 w-full rounded-card border border-sand p-2"
                />
              </div>

              {previewForm.basis !== 'FLAT_FEE' ? (
                <div>
                  <label className="block text-xs font-medium text-muted">Percentage Rate (%)</label>
                  <input
                    type="number"
                    value={previewForm.percentValue}
                    onChange={(e) => setPreviewForm({ ...previewForm, percentValue: Number(e.target.value) })}
                    className="mt-1 w-full rounded-card border border-sand p-2"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-muted">Flat Fee Amount (₹)</label>
                  <input
                    type="number"
                    value={previewForm.flatValue}
                    onChange={(e) => setPreviewForm({ ...previewForm, flatValue: Number(e.target.value) })}
                    className="mt-1 w-full rounded-card border border-sand p-2"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted">Min Amount (₹)</label>
                  <input
                    type="number"
                    value={previewForm.minAmount}
                    onChange={(e) => setPreviewForm({ ...previewForm, minAmount: Number(e.target.value) })}
                    className="mt-1 w-full rounded-card border border-sand p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted">Max Amount (₹)</label>
                  <input
                    type="number"
                    value={previewForm.maxAmount}
                    onChange={(e) => setPreviewForm({ ...previewForm, maxAmount: Number(e.target.value) })}
                    className="mt-1 w-full rounded-card border border-sand p-2"
                  />
                </div>
              </div>

              <button
                onClick={handleRunPreview}
                className="w-full rounded-card bg-seal-deep py-2.5 font-medium text-white shadow hover:bg-seal-deep/90"
              >
                Simulate Calculation
              </button>
            </div>
          </div>

          <div className="rounded-card border border-sand bg-white p-5 shadow-sm">
            <h2 className="text-lg font-serif font-semibold text-ink">Calculation Output</h2>
            {previewResult ? (
              <div className="mt-4 space-y-4 text-sm">
                <div className="rounded-card bg-sand/20 p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted">Base Amount:</span>
                    <span className="font-semibold">{formatINR(previewResult.baseAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Calculated Fee (Taxable Subtotal):</span>
                    <span className="font-bold text-ink">{formatINR(previewResult.calculatedFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">GST ({previewResult.taxRate}%):</span>
                    <span className="font-semibold text-muted">{formatINR(previewResult.calculatedTax)}</span>
                  </div>
                  <div className="border-t border-sand pt-2 flex justify-between text-base">
                    <span className="font-bold text-ink">Total Commercial Obligation:</span>
                    <span className="font-bold text-seal-deep">{formatINR(previewResult.totalAmount)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-8 text-center text-sm text-muted">
                Run a simulation to view itemized fee and GST breakdown.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Revenue Analytics */}
      {tab === 'revenue' && revenueData && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase text-muted">Group By:</span>
            {(['category', 'month', 'property', 'rule'] as const).map((dim) => (
              <button
                key={dim}
                onClick={() => setGroupBy(dim)}
                className={`rounded-card px-3 py-1 text-xs font-medium uppercase ${
                  groupBy === dim ? 'bg-seal-deep text-white' : 'bg-sand/30 text-ink hover:bg-sand/50'
                }`}
              >
                {dim}
              </button>
            ))}
          </div>

          <div className="rounded-card border border-sand bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-sand bg-sand/20 text-xs font-semibold uppercase text-muted">
                  <th className="px-4 py-3">{groupBy.toUpperCase()}</th>
                  <th className="px-4 py-3">Records</th>
                  <th className="px-4 py-3">Taxable Subtotal</th>
                  <th className="px-4 py-3">GST Total</th>
                  <th className="px-4 py-3">Total Billed</th>
                  <th className="px-4 py-3">Paid Revenue</th>
                  <th className="px-4 py-3">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand/50">
                {revenueData.breakdown.map((row: any) => (
                  <tr key={row.key} className="hover:bg-sand/10">
                    <td className="px-4 py-3 font-semibold text-ink">{row.label}</td>
                    <td className="px-4 py-3 text-muted">{row.count}</td>
                    <td className="px-4 py-3">{formatINR(row.taxableSubtotal)}</td>
                    <td className="px-4 py-3 text-muted">{formatINR(row.gstTotal)}</td>
                    <td className="px-4 py-3 font-bold">{formatINR(row.totalBilled)}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">{formatINR(row.totalPaid)}</td>
                    <td className="px-4 py-3 font-semibold text-amber-700">{formatINR(row.totalOutstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Modals */}
      {actionModal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-serif font-bold text-ink">
              {actionModal.type === 'approve' && 'Approve Commercial Obligation'}
              {actionModal.type === 'waive' && 'Waive Commercial Obligation'}
              {actionModal.type === 'cancel' && 'Cancel Commercial Obligation'}
              {actionModal.type === 'createRule' && 'Create Commercial Pricing Rule'}
            </h3>

            {actionModal.type === 'approve' && (
              <div className="space-y-3 text-sm">
                <p className="text-muted">
                  Approving will create a formal Payment Obligation in PaymentsService for{' '}
                  <span className="font-bold text-ink">{formatINR(actionModal.obligation?.totalAmount)}</span>.
                </p>
                <div>
                  <label className="block text-xs font-medium text-muted">Notes / Memo</label>
                  <input
                    type="text"
                    value={modalNotes}
                    onChange={(e) => setModalNotes(e.target.value)}
                    placeholder="Optional approval memo"
                    className="mt-1 w-full rounded-card border border-sand p-2"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setActionModal({ type: null })}
                    className="rounded-card border border-sand px-3 py-1.5 text-sm text-muted hover:bg-sand/20"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleApprove(actionModal.obligation.id)}
                    className="rounded-card bg-seal-deep px-4 py-1.5 text-sm font-medium text-white hover:bg-seal-deep/90"
                  >
                    Confirm Approval
                  </button>
                </div>
              </div>
            )}

            {actionModal.type === 'waive' && (
              <div className="space-y-3 text-sm">
                <p className="text-muted">
                  Waiving this obligation will record an official adjustment and cancel any pending DUE payment.
                </p>
                <div>
                  <label className="block text-xs font-medium text-muted">Waiver Reason *</label>
                  <input
                    type="text"
                    value={modalReason}
                    onChange={(e) => setModalReason(e.target.value)}
                    placeholder="e.g. Promotional launch incentive"
                    className="mt-1 w-full rounded-card border border-sand p-2"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setActionModal({ type: null })}
                    className="rounded-card border border-sand px-3 py-1.5 text-sm text-muted hover:bg-sand/20"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleWaive(actionModal.obligation.id)}
                    className="rounded-card bg-purple-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-800"
                  >
                    Confirm Waiver
                  </button>
                </div>
              </div>
            )}

            {actionModal.type === 'cancel' && (
              <div className="space-y-3 text-sm">
                <p className="text-muted">Cancelling this obligation will void the commercial entitlement.</p>
                <div>
                  <label className="block text-xs font-medium text-muted">Cancellation Reason *</label>
                  <input
                    type="text"
                    value={modalReason}
                    onChange={(e) => setModalReason(e.target.value)}
                    placeholder="e.g. Agreement cancelled prior to move-in"
                    className="mt-1 w-full rounded-card border border-sand p-2"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setActionModal({ type: null })}
                    className="rounded-card border border-sand px-3 py-1.5 text-sm text-muted hover:bg-sand/20"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => handleCancel(actionModal.obligation.id)}
                    className="rounded-card bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Confirm Cancellation
                  </button>
                </div>
              </div>
            )}

            {actionModal.type === 'createRule' && (
              <div className="space-y-3 text-sm max-h-[70vh] overflow-y-auto pr-1">
                <div>
                  <label className="block text-xs font-medium text-muted">Rule Code *</label>
                  <input
                    type="text"
                    value={newRule.code}
                    onChange={(e) => setNewRule({ ...newRule, code: e.target.value })}
                    placeholder="e.g. RULE-COMM-SPECIAL-2026"
                    className="mt-1 w-full rounded-card border border-sand p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted">Rule Name *</label>
                  <input
                    type="text"
                    value={newRule.name}
                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                    placeholder="e.g. Special Festival Commission"
                    className="mt-1 w-full rounded-card border border-sand p-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-muted">Category</label>
                    <select
                      value={newRule.category}
                      onChange={(e) => setNewRule({ ...newRule, category: e.target.value })}
                      className="mt-1 w-full rounded-card border border-sand p-2"
                    >
                      <option value="COMMISSION">COMMISSION</option>
                      <option value="SERVICE_FEE">SERVICE_FEE</option>
                      <option value="LEGAL_FEE">LEGAL_FEE</option>
                      <option value="MARKETING_PACKAGE">MARKETING_PACKAGE</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted">Basis</label>
                    <select
                      value={newRule.basis}
                      onChange={(e) => setNewRule({ ...newRule, basis: e.target.value })}
                      className="mt-1 w-full rounded-card border border-sand p-2"
                    >
                      <option value="PERCENT_OF_MONTHLY_RENT">PERCENT_OF_MONTHLY_RENT</option>
                      <option value="PERCENT_OF_ANNUAL_RENT">PERCENT_OF_ANNUAL_RENT</option>
                      <option value="FLAT_FEE">FLAT_FEE</option>
                      <option value="PERCENT_OF_TRANSACTION">PERCENT_OF_TRANSACTION</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-muted">Percent (%) / Flat (₹)</label>
                    <input
                      type="number"
                      value={newRule.basis === 'FLAT_FEE' ? newRule.flatValue : newRule.percentValue}
                      onChange={(e) =>
                        newRule.basis === 'FLAT_FEE'
                          ? setNewRule({ ...newRule, flatValue: Number(e.target.value) })
                          : setNewRule({ ...newRule, percentValue: Number(e.target.value) })
                      }
                      className="mt-1 w-full rounded-card border border-sand p-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted">Priority</label>
                    <input
                      type="number"
                      value={newRule.priority}
                      onChange={(e) => setNewRule({ ...newRule, priority: Number(e.target.value) })}
                      className="mt-1 w-full rounded-card border border-sand p-2"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-3">
                  <button
                    onClick={() => setActionModal({ type: null })}
                    className="rounded-card border border-sand px-3 py-1.5 text-sm text-muted hover:bg-sand/20"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateRule}
                    className="rounded-card bg-seal-deep px-4 py-1.5 text-sm font-medium text-white hover:bg-seal-deep/90"
                  >
                    Create Rule
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
