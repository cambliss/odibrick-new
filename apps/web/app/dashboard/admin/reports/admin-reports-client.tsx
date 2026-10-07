'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface AdminReportsClientProps {
  initialReport: any;
}

const REPORT_CATALOG = [
  { id: 'properties', name: 'Property Performance', desc: 'Listings, demand metrics, views, and attributed revenue' },
  { id: 'leads', name: 'Lead Funnel & SLA', desc: 'Leads by source, conversion status, aging, and SLA tracking' },
  { id: 'finance', name: 'Financial Revenue Ledger', desc: 'Settled transactions, revenue classification, and P2P volumes' },
  { id: 'operations', name: 'Operations Work Queue', desc: 'Operational tasks, priorities, team workloads, and SLA status' },
  { id: 'maintenance', name: 'Maintenance Operations', desc: 'Tickets, cost liabilities, resolution times, and emergency issues' },
  { id: 'disputes', name: 'Disputes & Claims', desc: 'Open disputes, categories, disputed amounts, and resolution status' },
];

export function AdminReportsClient({ initialReport }: AdminReportsClientProps) {
  const [selectedType, setSelectedType] = useState<string>('properties');
  const [dateRange, setDateRange] = useState<string>('30D');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [report, setReport] = useState<any>(initialReport);
  const [loading, setLoading] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const fetchReport = async (type = selectedType, range = dateRange, from = customFrom, to = customTo) => {
    setLoading(true);
    setExportSuccess(null);
    try {
      let queryStr = `?range=${range}`;
      if (range === 'CUSTOM' && from && to) {
        queryStr += `&from=${from}&to=${to}`;
      }
      const data = await api<any>(`/admin/reports/${type}${queryStr}`);
      setReport(data);
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectReport = (type: string) => {
    setSelectedType(type);
    fetchReport(type, dateRange);
  };

  const handleExportCsv = async () => {
    setExporting(true);
    setExportSuccess(null);
    try {
      let queryStr = `?range=${dateRange}`;
      if (dateRange === 'CUSTOM' && customFrom && customTo) {
        queryStr += `&from=${customFrom}&to=${customTo}`;
      }
      const res = await api<{ filename: string; csv: string; totalRows: number }>(
        `/admin/reports/${selectedType}/export${queryStr}`,
        { method: 'POST' }
      );

      if (res?.csv) {
        // Trigger browser file download
        const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', res.filename || `odibrick_report.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setExportSuccess(`Exported ${res.totalRows} records as ${res.filename}`);
      }
    } catch (err) {
      console.error('Failed to export report CSV:', err);
    } finally {
      setExporting(false);
    }
  };

  const columns = report?.columns || [];
  const rows = report?.rows || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/admin/analytics"
              className="inline-flex items-center text-xs font-semibold text-gray-500 hover:text-gray-900"
            >
              ← Analytics Control Centre
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 mt-1">
            Management Reports & CSV Exports
          </h1>
          <p className="text-sm text-gray-500">
            Export structured business intelligence reports with governed audit logging.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={exporting || rows.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm disabled:opacity-50"
          >
            <svg className={`h-4 w-4 ${exporting ? 'animate-bounce' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting ? 'Exporting...' : 'Export as CSV'}
          </button>
        </div>
      </div>

      {exportSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs font-medium text-emerald-800">
          <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {exportSuccess}
        </div>
      )}

      {/* Catalog Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {REPORT_CATALOG.map((cat) => {
          const isSelected = selectedType === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => handleSelectReport(cat.id)}
              className={`text-left p-3 rounded-xl border transition-all ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-600'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <div className="font-semibold text-xs text-gray-900">{cat.name}</div>
              <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{cat.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Date Range:</span>
          <div className="flex items-center bg-gray-100 p-1 rounded-lg text-xs font-medium text-gray-700">
            {['TODAY', '7D', '30D', '90D', '6M', '1Y', 'CUSTOM'].map((r) => (
              <button
                key={r}
                onClick={() => {
                  setDateRange(r);
                  if (r !== 'CUSTOM') fetchReport(selectedType, r);
                }}
                className={`px-2.5 py-1 rounded-md transition-all ${
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
            <div className="flex items-center gap-1 bg-white border p-1 rounded-lg text-xs">
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
                onClick={() => fetchReport(selectedType, 'CUSTOM', customFrom, customTo)}
                className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            Showing <strong className="text-gray-900">{rows.length}</strong> records ({report?.dateRange || 'All'})
          </span>
          <button
            onClick={() => fetchReport()}
            disabled={loading}
            className="p-1.5 border rounded-lg hover:bg-gray-50 text-gray-600"
          >
            <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Report Data Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
              <tr>
                {columns.map((c: any) => (
                  <th key={c.key} className="py-3 px-4 whitespace-nowrap">
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y text-gray-700">
              {rows.map((row: any, idx: number) => (
                <tr key={idx} className="hover:bg-gray-50/80">
                  {columns.map((c: any) => (
                    <td key={c.key} className="py-3 px-4 whitespace-nowrap">
                      {row[c.key] !== undefined && row[c.key] !== null ? String(row[c.key]) : '-'}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length || 1} className="py-12 text-center text-gray-400">
                    No records found for the selected report filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
