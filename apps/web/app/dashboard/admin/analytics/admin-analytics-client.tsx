'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface AdminAnalyticsClientProps {
  initialOverview: any;
  initialProperties: any;
  initialFinance: any;
  initialOperations: any;
  initialCompliance: any;
}

export function AdminAnalyticsClient({
  initialOverview,
  initialProperties,
  initialFinance,
  initialOperations,
  initialCompliance,
}: AdminAnalyticsClientProps) {
  const [overview, setOverview] = useState<any>(initialOverview);
  const [properties, setProperties] = useState<any>(initialProperties);
  const [finance, setFinance] = useState<any>(initialFinance);
  const [operations, setOperations] = useState<any>(initialOperations);
  const [compliance, setCompliance] = useState<any>(initialCompliance);

  const [dateRange, setDateRange] = useState<string>('30D');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'funnel' | 'finance' | 'operations' | 'compliance'>('funnel');
  const [loading, setLoading] = useState<boolean>(false);

  const fetchAnalytics = async (range = dateRange, from = customFrom, to = customTo) => {
    setLoading(true);
    try {
      let queryStr = `?range=${range}`;
      if (range === 'CUSTOM' && from && to) {
        queryStr += `&from=${from}&to=${to}`;
      }

      const [ov, pr, fn, op, cp] = await Promise.all([
        api<any>(`/admin/analytics/overview${queryStr}`),
        api<any>(`/admin/analytics/properties${queryStr}`),
        api<any>(`/admin/analytics/finance${queryStr}`),
        api<any>(`/admin/analytics/operations${queryStr}`),
        api<any>(`/admin/analytics/compliance${queryStr}`),
      ]);

      setOverview(ov);
      setProperties(pr);
      setFinance(fn);
      setOperations(op);
      setCompliance(cp);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRangeChange = (range: string) => {
    setDateRange(range);
    if (range !== 'CUSTOM') {
      fetchAnalytics(range);
    }
  };

  const formatInr = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const funnel = properties?.funnel;
  const listings = properties?.listings || [];

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Analytics & Business Intelligence
            </h1>
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200">
              Control Tower BI
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Real-time multi-domain aggregations, demand funnel, financial classification, and operational bottlenecks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date range presets */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg text-xs font-medium text-gray-700">
            {['TODAY', '7D', '30D', '90D', '6M', '1Y', 'CUSTOM'].map((r) => (
              <button
                key={r}
                onClick={() => handleRangeChange(r)}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  dateRange === r
                    ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {dateRange === 'CUSTOM' && (
            <div className="flex items-center gap-1.5 bg-white border p-1 rounded-lg text-xs">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="border-0 p-1 text-xs focus:ring-0"
              />
              <span className="text-gray-400">-</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="border-0 p-1 text-xs focus:ring-0"
              />
              <button
                onClick={() => fetchAnalytics('CUSTOM', customFrom, customTo)}
                className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700"
              >
                Apply
              </button>
            </div>
          )}

          <button
            onClick={() => fetchAnalytics()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
          >
            <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>

          <Link
            href="/dashboard/admin/reports"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-700 shadow-sm"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Reports & CSV Export
          </Link>
        </div>
      </div>

      {/* Top Executive KPI Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-gray-500">Gross Vol (GTV)</span>
          <p className="text-lg font-bold text-gray-900 mt-1 truncate">
            {formatInr(overview?.grossTransactionVolume || 0)}
          </p>
          <span className="text-[11px] text-emerald-600 font-medium">All Settled P2P & Fees</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/20 shadow-sm">
          <span className="text-xs font-medium text-indigo-700">Platform Revenue</span>
          <p className="text-lg font-bold text-indigo-900 mt-1 truncate">
            {formatInr(overview?.platformRevenue || 0)}
          </p>
          <span className="text-[11px] text-indigo-600 font-medium">Commissions & Fees</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-gray-500">Total Users</span>
          <p className="text-lg font-bold text-gray-900 mt-1">{overview?.totalUsers || 0}</p>
          <span className="text-[11px] text-gray-500 font-medium">
            +{overview?.newUsers || 0} in period
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-gray-500">Active Listings</span>
          <p className="text-lg font-bold text-gray-900 mt-1">{overview?.activeListings || 0}</p>
          <span className="text-[11px] text-gray-500 font-medium">
            Avg {formatInr(overview?.averageMonthlyRent || 0)}/mo
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-gray-500">Demand Enquiries</span>
          <p className="text-lg font-bold text-gray-900 mt-1">{overview?.enquiriesCount || 0}</p>
          <span className="text-[11px] text-indigo-600 font-medium">
            {overview?.leadsCount || 0} Qualified Leads
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-gray-500">Active Tenancies</span>
          <p className="text-lg font-bold text-gray-900 mt-1">{overview?.activeTenancies || 0}</p>
          <span className="text-[11px] text-emerald-600 font-medium">
            {overview?.upcomingMoveIns || 0} Move-ins
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/20 shadow-sm">
          <span className="text-xs font-medium text-amber-700">Open Ops Tasks</span>
          <p className="text-lg font-bold text-amber-900 mt-1">{overview?.openTasks || 0}</p>
          <span className="text-[11px] text-red-600 font-medium">
            {overview?.criticalTasks || 0} Critical
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-gray-500">KYC Verified</span>
          <p className="text-lg font-bold text-gray-900 mt-1">{overview?.kycVerified || 0}</p>
          <span className="text-[11px] text-amber-600 font-medium">
            {overview?.kycPending || 0} Pending
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 text-sm font-medium text-gray-500">
        <button
          onClick={() => setActiveTab('funnel')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-semibold transition-all ${
            activeTab === 'funnel'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Property Demand Funnel & Listings
        </button>

        <button
          onClick={() => setActiveTab('finance')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-semibold transition-all ${
            activeTab === 'finance'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Financial Intelligence & Revenue
        </button>

        <button
          onClick={() => setActiveTab('operations')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-semibold transition-all ${
            activeTab === 'operations'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Tenancy & Operations Control Tower
        </button>

        <button
          onClick={() => setActiveTab('compliance')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-semibold transition-all ${
            activeTab === 'compliance'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Compliance, Disputes & Automation
        </button>
      </div>

      {/* TAB 1: DEMAND FUNNEL & LISTINGS */}
      {activeTab === 'funnel' && (
        <div className="space-y-6">
          {/* Funnel Pipeline Visualizer */}
          <div className="bg-white p-6 rounded-xl border shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center justify-between">
              <span>Property Demand Conversion Funnel</span>
              <span className="text-xs font-normal text-gray-500">
                Overall Funnel Conversion: <strong className="text-indigo-600">{funnel?.conversionRates?.overallFunnel || 0}%</strong>
              </span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 relative">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-xs font-medium text-slate-500">1. Views</span>
                <p className="text-2xl font-bold text-slate-900 mt-1">{funnel?.views || 0}</p>
                <div className="mt-3 text-[11px] text-slate-600">Organic Discovery</div>
              </div>

              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200">
                <span className="text-xs font-medium text-indigo-600">2. Enquiries</span>
                <p className="text-2xl font-bold text-indigo-950 mt-1">{funnel?.enquiries || 0}</p>
                <div className="mt-3 text-[11px] text-indigo-700 font-medium">
                  {funnel?.conversionRates?.enquiryToLead || 0}% → Leads
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                <span className="text-xs font-medium text-blue-600">3. Qualified Leads</span>
                <p className="text-2xl font-bold text-blue-950 mt-1">{funnel?.leads || 0}</p>
                <div className="mt-3 text-[11px] text-blue-700 font-medium">
                  {funnel?.conversionRates?.leadToVisit || 0}% → Visits
                </div>
              </div>

              <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                <span className="text-xs font-medium text-amber-700">4. Visits</span>
                <p className="text-2xl font-bold text-amber-950 mt-1">{funnel?.visits || 0}</p>
                <div className="mt-3 text-[11px] text-amber-800 font-medium">
                  {funnel?.conversionRates?.visitToApplication || 0}% → Apps
                </div>
              </div>

              <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
                <span className="text-xs font-medium text-purple-700">5. Applications</span>
                <p className="text-2xl font-bold text-purple-950 mt-1">{funnel?.applications || 0}</p>
                <div className="mt-3 text-[11px] text-purple-800 font-medium">
                  {funnel?.conversionRates?.applicationToAgreement || 0}% → Agreements
                </div>
              </div>

              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                <span className="text-xs font-medium text-emerald-700">6. Active Tenancies</span>
                <p className="text-2xl font-bold text-emerald-950 mt-1">{funnel?.activeTenancies || 0}</p>
                <div className="mt-3 text-[11px] text-emerald-800 font-medium">
                  {funnel?.conversionRates?.agreementToTenancy || 0}% Finalized
                </div>
              </div>
            </div>
          </div>

          {/* Listing Performance Table */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Listing Demand & Revenue Attribution</h3>
                <p className="text-xs text-gray-500">Measurable performance metrics per property</p>
              </div>
              <Link
                href="/dashboard/admin/marketplace"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                Marketplace Management →
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
                  <tr>
                    <th className="py-3 px-4">Property</th>
                    <th className="py-3 px-4">City</th>
                    <th className="py-3 px-4">Monthly Rent</th>
                    <th className="py-3 px-4 text-center">Enquiries</th>
                    <th className="py-3 px-4 text-center">Leads</th>
                    <th className="py-3 px-4 text-center">Visits</th>
                    <th className="py-3 px-4 text-center">Apps</th>
                    <th className="py-3 px-4 text-center">Tenancies</th>
                    <th className="py-3 px-4 text-center">Conversion</th>
                    <th className="py-3 px-4">Promotion</th>
                    <th className="py-3 px-4 text-right">Attributed Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-gray-700">
                  {listings.map((l: any) => (
                    <tr key={l.propertyId} className="hover:bg-gray-50/80">
                      <td className="py-3 px-4 font-medium text-gray-900">
                        <Link href={`/properties/${l.propertyId}`} className="hover:text-indigo-600">
                          {l.title}
                        </Link>
                      </td>
                      <td className="py-3 px-4">{l.city}</td>
                      <td className="py-3 px-4 font-semibold">{formatInr(l.monthlyRent)}</td>
                      <td className="py-3 px-4 text-center">{l.enquiries}</td>
                      <td className="py-3 px-4 text-center">{l.leads}</td>
                      <td className="py-3 px-4 text-center">{l.visits}</td>
                      <td className="py-3 px-4 text-center">{l.applications}</td>
                      <td className="py-3 px-4 text-center font-semibold text-emerald-700">{l.tenancies}</td>
                      <td className="py-3 px-4 text-center font-medium">
                        {l.conversionRate}%
                      </td>
                      <td className="py-3 px-4">
                        {l.promotionPackage ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800">
                            {l.promotionPackage}
                          </span>
                        ) : (
                          <span className="text-gray-400">Organic</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-gray-900">
                        {formatInr(l.attributedRevenue)}
                      </td>
                    </tr>
                  ))}
                  {listings.length === 0 && (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-gray-400">
                        No listing data found for selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FINANCIAL INTELLIGENCE */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Revenue Classification Card */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-semibold text-gray-900">Platform Revenue Breakdown</h3>
                <span className="text-xs text-indigo-600 font-bold">
                  {formatInr(finance?.platformRevenue || 0)}
                </span>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">Commission Revenue</span>
                  <span className="font-semibold text-gray-900">{formatInr(finance?.revenueByCategory?.commission || 0)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">Marketing Packages</span>
                  <span className="font-semibold text-gray-900">{formatInr(finance?.revenueByCategory?.marketingPackages || 0)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">Service Fees</span>
                  <span className="font-semibold text-gray-900">{formatInr(finance?.revenueByCategory?.serviceFees || 0)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Legal Fees</span>
                  <span className="font-semibold text-gray-900">{formatInr(finance?.revenueByCategory?.legalFees || 0)}</span>
                </div>
              </div>
              <div className="pt-2">
                <Link
                  href="/dashboard/admin/finance"
                  className="w-full inline-flex justify-center items-center gap-1.5 py-2 px-3 border border-indigo-200 text-xs font-semibold rounded-lg text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50"
                >
                  Finance Control Centre →
                </Link>
              </div>
            </div>

            {/* Direct P2P Transaction Volume */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-semibold text-gray-900">Direct P2P Flow (Non-Revenue)</h3>
                <span className="text-xs text-emerald-700 font-bold">
                  {formatInr((finance?.directP2PVolume?.monthlyRent || 0) + (finance?.directP2PVolume?.securityDeposit || 0))}
                </span>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">Direct Monthly Rent</span>
                  <span className="font-semibold text-gray-900">{formatInr(finance?.directP2PVolume?.monthlyRent || 0)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">Security Deposits Held</span>
                  <span className="font-semibold text-gray-900">{formatInr(finance?.directP2PVolume?.securityDeposit || 0)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">Advance Rent</span>
                  <span className="font-semibold text-gray-900">{formatInr(finance?.directP2PVolume?.advanceRent || 0)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Processed Owner Payouts</span>
                  <span className="font-semibold text-gray-900">{formatInr(finance?.ownerPayoutsTotal || 0)}</span>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 italic">
                Direct tenant-to-owner funds are segregated and not recognized as Odibrick revenue.
              </p>
            </div>

            {/* Receivables & Exceptions */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-semibold text-gray-900">Receivables & Exceptions</h3>
                <span className="text-xs text-amber-700 font-bold">
                  {formatInr(finance?.pendingReceivables || 0)}
                </span>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">Pending Invoices</span>
                  <span className="font-semibold text-amber-700">{formatInr(finance?.pendingReceivables || 0)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">Overdue Payments</span>
                  <span className="font-semibold text-red-600">{formatInr(finance?.overdueReceivables || 0)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Disbursed Refunds</span>
                  <span className="font-semibold text-gray-900">{formatInr(finance?.refundsTotal || 0)}</span>
                </div>
              </div>
              <div className="pt-2">
                <Link
                  href="/dashboard/admin/finance/reconciliation"
                  className="w-full inline-flex justify-center items-center gap-1.5 py-2 px-3 border border-amber-200 text-xs font-semibold rounded-lg text-amber-800 bg-amber-50/50 hover:bg-amber-50"
                >
                  Reconciliation Centre →
                </Link>
              </div>
            </div>
          </div>

          {/* 12-Month Trend Series */}
          <div className="bg-white p-5 rounded-xl border shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">12-Month Revenue & Volume Trend</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
                  <tr>
                    <th className="py-2.5 px-4">Month</th>
                    <th className="py-2.5 px-4 text-right">Commission</th>
                    <th className="py-2.5 px-4 text-right">Marketing</th>
                    <th className="py-2.5 px-4 text-right">Services & Legal</th>
                    <th className="py-2.5 px-4 text-right">Total Revenue</th>
                    <th className="py-2.5 px-4 text-right font-bold">Gross Volume (GTV)</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-gray-700">
                  {(finance?.monthlyRevenueSeries || []).map((m: any) => (
                    <tr key={m.month} className="hover:bg-gray-50">
                      <td className="py-2.5 px-4 font-medium text-gray-900">{m.month}</td>
                      <td className="py-2.5 px-4 text-right">{formatInr(m.commission)}</td>
                      <td className="py-2.5 px-4 text-right">{formatInr(m.marketing)}</td>
                      <td className="py-2.5 px-4 text-right">{formatInr((m.services || 0) + (m.legal || 0))}</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-indigo-700">{formatInr(m.totalRevenue)}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-gray-900">{formatInr(m.grossVolume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TENANCY & OPERATIONS */}
      {activeTab === 'operations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Team Workload Breakdown */}
            <div className="bg-white p-5 rounded-xl border shadow-sm">
              <div className="flex items-center justify-between border-b pb-3 mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Operations Team Workload</h3>
                  <p className="text-xs text-gray-500">Live operational task distribution across teams</p>
                </div>
                <Link
                  href="/dashboard/admin/operations"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  Control Tower →
                </Link>
              </div>

              <div className="space-y-3">
                {(operations?.teamWorkload || []).map((t: any) => (
                  <div key={t.team} className="flex items-center justify-between text-xs p-2.5 bg-gray-50 rounded-lg">
                    <div>
                      <span className="font-semibold text-gray-900">{t.team}</span>
                      <p className="text-[11px] text-gray-500">{t.total} total assigned</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold text-[11px]">
                        {t.open} Open
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[11px]">
                        {t.resolved} Resolved
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Domain Distribution */}
            <div className="bg-white p-5 rounded-xl border shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-1">Tasks by Domain</h3>
              <p className="text-xs text-gray-500 mb-3">Originating business source breakdown</p>

              <div className="grid grid-cols-2 gap-2">
                {(operations?.domainDistribution || []).map((d: any) => (
                  <div key={d.domain} className="p-3 bg-slate-50 border rounded-lg flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{d.domain}</span>
                    <span className="font-bold text-slate-900">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: COMPLIANCE, DISPUTES & AUTOMATION */}
      {activeTab === 'compliance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* KYC & Identity Status */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-3">
              <h3 className="font-semibold text-gray-900 border-b pb-2">KYC Verification Pipeline</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Records</span>
                  <span className="font-semibold text-gray-900">{compliance?.totalKycRecords || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Verified</span>
                  <span className="font-semibold text-emerald-700">{compliance?.kycVerified || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Pending Review</span>
                  <span className="font-semibold text-amber-700">{compliance?.kycPending || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Rejected</span>
                  <span className="font-semibold text-red-700">{compliance?.kycRejected || 0}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-700 font-medium">Verification Rate</span>
                  <span className="font-bold text-indigo-700">{compliance?.verificationRate || 0}%</span>
                </div>
              </div>
              <Link
                href="/dashboard/admin/compliance"
                className="w-full inline-flex justify-center items-center gap-1 py-1.5 px-3 border border-gray-200 text-xs font-semibold rounded text-gray-700 hover:bg-gray-50"
              >
                Compliance Centre →
              </Link>
            </div>

            {/* Document Expiry Risk */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-3">
              <h3 className="font-semibold text-gray-900 border-b pb-2">Document Expiry Risk</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Verified Documents</span>
                  <span className="font-semibold text-emerald-700">{compliance?.documentsVerified || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Expiring in 30 Days</span>
                  <span className="font-semibold text-amber-700">{compliance?.documentsExpiringSoon || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Expired Documents</span>
                  <span className="font-semibold text-red-700">{compliance?.documentsExpired || 0}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-700 font-medium">Open Compliance Exceptions</span>
                  <span className="font-bold text-red-700">{compliance?.complianceExceptionsOpen || 0}</span>
                </div>
              </div>
            </div>

            {/* Automation Health */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-3">
              <h3 className="font-semibold text-gray-900 border-b pb-2">Workflow Automation Health</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Events Dispatched</span>
                  <span className="font-semibold text-gray-900">{overview?.automationExecutions || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Failed Executions</span>
                  <span className="font-semibold text-red-700">{overview?.automationFailures || 0}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-700 font-medium">Execution Success Rate</span>
                  <span className="font-bold text-emerald-700">
                    {100 - (overview?.automationFailures ? Math.round((overview.automationFailures / (overview.automationExecutions || 1)) * 100) : 0)}%
                  </span>
                </div>
              </div>
              <Link
                href="/dashboard/admin/automation"
                className="w-full inline-flex justify-center items-center gap-1 py-1.5 px-3 border border-gray-200 text-xs font-semibold rounded text-gray-700 hover:bg-gray-50"
              >
                Automation Engine →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
