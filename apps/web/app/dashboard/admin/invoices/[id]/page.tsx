'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Card, CardHeader, StatusChip, Button, Badge } from '@/components/ui';
import { inr, shortDate, titleCase } from '@/lib/format';

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cancellation modal state
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInvoice() {
      setLoading(true);
      try {
        const data = await api<any>(`/invoices/${id}`);
        setInvoice(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load invoice.');
      } finally {
        setLoading(false);
      }
    }
    loadInvoice();
  }, [id]);

  const handleDownloadPdf = () => {
    // Direct link to the API PDF download endpoint
    const url = `/api/invoices/${id}/pdf`;
    window.open(url, '_blank');
  };

  const handleCancelInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim() || cancelReason.trim().length < 5) {
      setCancelError('Cancellation reason must be at least 5 characters.');
      return;
    }

    setCancelLoading(true);
    setCancelError(null);
    try {
      const updated = await api<any>(`/invoices/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      setInvoice(updated);
      setCancelling(false);
    } catch (err: any) {
      setCancelError(err.message || 'Failed to cancel invoice.');
    } finally {
      setCancelLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-seal border-t-transparent"></div>
          <p className="mt-2 text-sm text-muted">Loading financial invoice document...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/admin/finance"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-seal-deep hover:underline"
        >
          ← Back to Finance Control Centre
        </Link>
        <Card className="p-8 text-center">
          <p className="text-rose-600 font-semibold">{error || 'Invoice not found.'}</p>
        </Card>
      </div>
    );
  }

  const snapshot = invoice.snapshot || {};
  const issuer = snapshot.issuer || {
    legalName: 'Odibrick Real Estate Technologies Pvt Ltd',
    tradeName: 'Odibrick Platform',
    address: 'Level 4, Embassy Tech Village, Outer Ring Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    stateCode: '29',
    gstin: '29AAAAO1234A1Z5',
    pan: 'AAAAO1234A',
    email: 'finance@odibrick.com',
    phone: '+91 80 4000 1234',
  };

  const customer = snapshot.customer || {
    name: invoice.billing_name,
    address: invoice.billing_address,
    state: invoice.place_of_supply || 'Karnataka',
    placeOfSupply: invoice.place_of_supply || 'Karnataka',
  };

  const payment = snapshot.payment || {
    referenceCode: invoice.payment_reference || 'N/A',
    purpose: invoice.payment_purpose || 'SERVICE_FEE',
    totalAmount: invoice.total,
    paidAt: invoice.paid_at,
  };

  const lines = snapshot.lineItems || invoice.lines || [];
  const taxSummary = snapshot.taxSummary || {
    subtotal: Number(invoice.subtotal),
    cgst: Number(invoice.cgst),
    sgst: Number(invoice.sgst),
    igst: Number(invoice.igst),
    totalTax: Number(invoice.cgst) + Number(invoice.sgst) + Number(invoice.igst),
    total: Number(invoice.total),
    gstRate: 18,
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/dashboard/admin/finance"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-seal-deep hover:underline"
        >
          ← Back to Finance Control Centre
        </Link>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 rounded-button bg-seal px-4 py-2 text-xs font-medium text-white shadow-subtle hover:bg-seal-deep transition-colors"
          >
            <span>↓</span> Download Official PDF
          </button>

          {invoice.status !== 'VOID' && (
            <button
              type="button"
              onClick={() => setCancelling(true)}
              className="rounded-button border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 transition-colors"
            >
              Void / Cancel Invoice
            </button>
          )}
        </div>
      </div>

      {/* Cancellation Notice if VOID */}
      {invoice.status === 'VOID' && (
        <div className="rounded-card border border-rose-300 bg-rose-50/80 p-4 text-xs text-rose-900 shadow-subtle">
          <div className="flex items-center gap-2 font-semibold">
            <span className="text-base">⚠</span> INVOICE CANCELLED / VOIDED
          </div>
          <p className="mt-1">
            <strong>Cancelled on:</strong> {shortDate(invoice.cancelled_at)}
          </p>
          <p className="mt-0.5">
            <strong>Reason:</strong> {invoice.cancellation_reason || 'No reason provided.'}
          </p>
          <p className="mt-1 text-[11px] text-rose-700">
            This document is preserved for financial audit and compliance history.
          </p>
        </div>
      )}

      {/* Invoice Document Paper Container */}
      <div className="rounded-card border border-line bg-paper p-6 sm:p-10 shadow-card">
        {/* Document Header */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between border-b border-line pb-8">
          <div>
            <span className="rounded bg-seal-soft px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-seal-deep">
              TAX / GST INVOICE
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink mt-2">
              {invoice.invoice_number}
            </h1>
            <p className="font-mono text-xs text-muted mt-1">
              Issued On: {shortDate(invoice.issued_on || invoice.created_at)}
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-1.5">
            <div className="flex items-center gap-2">
              <StatusChip status={invoice.status} />
              <span className="rounded bg-surface px-2 py-0.5 font-mono text-[10px] text-muted border border-line">
                Template v{snapshot.templateVersion || 1}
              </span>
            </div>
            {invoice.pdf_hash && (
              <p className="font-mono text-[10px] text-muted max-w-[220px] truncate" title={invoice.pdf_hash}>
                Doc Hash: {invoice.pdf_hash.slice(0, 16)}...
              </p>
            )}
          </div>
        </div>

        {/* Issuer & Recipient Snapshot Grid */}
        <div className="grid gap-6 sm:grid-cols-2 py-6 border-b border-line text-xs">
          {/* Issuer Details */}
          <div className="space-y-1.5 bg-surface/50 p-4 rounded-input border border-line/60">
            <p className="eyebrow text-seal-deep font-semibold">Service Provider (Issuer)</p>
            <p className="font-semibold text-ink text-sm">{issuer.legalName}</p>
            {issuer.tradeName && <p className="text-muted">{issuer.tradeName}</p>}
            <p className="text-muted leading-relaxed">{issuer.address}, {issuer.city}, {issuer.state} - {issuer.pincode}</p>
            <div className="pt-2 border-t border-line/40 space-y-0.5 font-mono text-[11px]">
              <p><strong>GSTIN:</strong> {issuer.gstin || '—'}</p>
              <p><strong>PAN:</strong> {issuer.pan || '—'}</p>
              <p><strong>Email:</strong> {issuer.email || '—'}</p>
            </div>
          </div>

          {/* Customer / Billed To Details */}
          <div className="space-y-1.5 bg-surface/50 p-4 rounded-input border border-line/60">
            <p className="eyebrow text-seal-deep font-semibold">Billed To (Customer)</p>
            <p className="font-semibold text-ink text-sm">{customer.name}</p>
            {customer.address ? (
              <p className="text-muted leading-relaxed">{customer.address}</p>
            ) : (
              <p className="text-muted italic">No physical address on file</p>
            )}
            <div className="pt-2 border-t border-line/40 space-y-0.5 font-mono text-[11px]">
              <p><strong>Place of Supply:</strong> {customer.placeOfSupply || customer.state || 'Karnataka'}</p>
              {customer.gstin && <p><strong>GSTIN:</strong> {customer.gstin}</p>}
              {customer.email && <p><strong>Email:</strong> {customer.email}</p>}
              {customer.phone && <p><strong>Phone:</strong> {customer.phone}</p>}
            </div>
          </div>
        </div>

        {/* Associated Financial Payment Context */}
        <div className="py-4 border-b border-line text-xs flex flex-wrap items-center justify-between gap-4 bg-paper">
          <div>
            <span className="text-muted font-mono uppercase tracking-wider text-[10px]">Underlying Payment Ref:</span>
            <p className="font-mono font-bold text-ink text-sm">{payment.referenceCode}</p>
          </div>
          <div>
            <span className="text-muted font-mono uppercase tracking-wider text-[10px]">Financial Classification:</span>
            <p className="font-medium text-ink">{titleCase(payment.purpose)}</p>
          </div>
          <div>
            <span className="text-muted font-mono uppercase tracking-wider text-[10px]">Settled Amount:</span>
            <p className="font-semibold text-ink">{inr(payment.totalAmount)}</p>
          </div>
          {invoice.payment_id && (
            <div>
              <Link
                href={`/dashboard/payments/${invoice.payment_id}`}
                className="rounded border border-line bg-surface px-2.5 py-1 text-xs font-medium hover:border-seal text-seal-deep shadow-subtle inline-block"
              >
                Inspect Source Payment →
              </Link>
            </div>
          )}
        </div>

        {/* Structured Line Items Table */}
        <div className="py-6 border-b border-line overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                <th className="pb-3 w-8">#</th>
                <th className="pb-3">Item Description</th>
                <th className="pb-3">HSN/SAC</th>
                <th className="pb-3 text-right">Qty</th>
                <th className="pb-3 text-right">Unit Price</th>
                <th className="pb-3 text-right">GST Rate</th>
                <th className="pb-3 text-right">Tax Amount</th>
                <th className="pb-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-surface/30">
                  <td className="py-3 font-mono text-muted">{idx + 1}</td>
                  <td className="py-3 font-medium text-ink max-w-sm">{item.description}</td>
                  <td className="py-3 font-mono text-muted">{item.hsn_sac || item.hsnSac || '997212'}</td>
                  <td className="py-3 text-right font-mono">{item.quantity || 1}</td>
                  <td className="py-3 text-right tabular">{inr(item.unit_price || item.unitPrice)}</td>
                  <td className="py-3 text-right font-mono">{item.tax_rate || item.taxRate || 18}%</td>
                  <td className="py-3 text-right tabular">{inr(item.tax_amount || item.taxAmount || 0)}</td>
                  <td className="py-3 text-right font-semibold tabular text-ink">{inr(item.line_total || item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Calculation Breakdown */}
        <div className="py-6 flex flex-col sm:flex-row justify-between gap-6 text-xs">
          <div className="max-w-md space-y-2 text-muted">
            <p className="font-semibold text-ink">Document & Tax Notes:</p>
            <p className="leading-relaxed">
              {invoice.notes || snapshot.notes || 'Tax invoice generated automatically from underlying settled platform revenue payment.'}
            </p>
            <div className="pt-2 text-[11px] text-muted border-t border-line/40">
              <p className="font-semibold text-ink">Terms of Issuance:</p>
              <p className="whitespace-pre-line mt-0.5">{issuer.terms || 'Subject to Odibrick Platform Terms.'}</p>
            </div>
          </div>

          <div className="w-full sm:w-72 space-y-2 bg-surface/40 p-4 rounded-card border border-line">
            <div className="flex justify-between">
              <span className="text-muted">Taxable Subtotal:</span>
              <span className="font-medium tabular text-ink">{inr(taxSummary.subtotal)}</span>
            </div>

            {Number(taxSummary.cgst) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">CGST ({(taxSummary.gstRate || 18) / 2}%):</span>
                <span className="tabular text-ink">{inr(taxSummary.cgst)}</span>
              </div>
            )}

            {Number(taxSummary.sgst) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">SGST ({(taxSummary.gstRate || 18) / 2}%):</span>
                <span className="tabular text-ink">{inr(taxSummary.sgst)}</span>
              </div>
            )}

            {Number(taxSummary.igst) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">IGST ({taxSummary.gstRate || 18}%):</span>
                <span className="tabular text-ink">{inr(taxSummary.igst)}</span>
              </div>
            )}

            <div className="flex justify-between border-t border-line/60 pt-1.5">
              <span className="text-muted font-medium">Total Tax:</span>
              <span className="font-medium tabular text-ink">{inr(taxSummary.totalTax)}</span>
            </div>

            <div className="flex justify-between border-t-2 border-ink pt-2 font-display text-base font-bold text-ink">
              <span>Grand Total:</span>
              <span className="tabular text-seal-deep">{inr(taxSummary.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cancellation Modal Dialog */}
      {cancelling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-card bg-paper p-6 shadow-card border border-line">
            <h3 className="font-display text-lg font-bold text-ink">Void / Cancel Tax Invoice</h3>
            <p className="mt-1 text-xs text-muted">
              Cancelling an invoice marks it as VOID. The historical document and audit trail remain permanently preserved for regulatory audit.
            </p>

            <form onSubmit={handleCancelInvoice} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink">
                  Reason for Cancellation <span className="text-rose-600">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Duplicate test issuance, billing correction requested by finance team..."
                  rows={3}
                  className="mt-1 w-full rounded-input border border-line bg-surface p-2.5 text-xs text-ink focus:border-rose-500 focus:outline-none"
                  required
                />
              </div>

              {cancelError && (
                <p className="text-xs font-semibold text-rose-600">{cancelError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelling(false)}
                  disabled={cancelLoading}
                  className="rounded-button border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cancelLoading}
                  className="rounded-button bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {cancelLoading ? 'Cancelling...' : 'Confirm Void Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
