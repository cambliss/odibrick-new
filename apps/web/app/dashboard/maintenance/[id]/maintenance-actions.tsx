'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

type MaintenanceRequest = {
  id: number;
  ticket_number: string;
  status: string;
  category: string;
  priority: string;
  title: string;
  description?: string;
  owner_user_id: number;
  tenant_user_id: number;
  raised_by: number;
  cost_bearer?: string;
  estimated_cost?: number;
  final_cost?: number;
  vendor_name?: string;
  vendor_phone?: string;
  scheduled_for?: string;
  owner_decision_note?: string;
};

export function MaintenanceActions({
  request,
  currentUserId,
  isStaff,
}: {
  request: MaintenanceRequest;
  currentUserId: number;
  isStaff?: boolean;
}) {
  const router = useRouter();

  const isOwner = currentUserId === request.owner_user_id;
  const isTenant = currentUserId === request.tenant_user_id || currentUserId === request.raised_by;

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [note, setNote] = useState<string>('');
  const [vendorName, setVendorName] = useState<string>(request.vendor_name || '');
  const [vendorPhone, setVendorPhone] = useState<string>(request.vendor_phone || '');
  const [scheduledFor, setScheduledFor] = useState<string>(request.scheduled_for ? request.scheduled_for.slice(0, 16) : '');
  const [finalCost, setFinalCost] = useState<string>(request.final_cost ? String(request.final_cost) : '');
  const [costBearer, setCostBearer] = useState<string>(request.cost_bearer || 'OWNER');

  // Financial Approval States
  const [finFinalCost, setFinFinalCost] = useState<string>(request.final_cost ? String(request.final_cost) : '');
  const [finCostBearer, setFinCostBearer] = useState<'OWNER' | 'TENANT' | 'SHARED' | 'ODIBRICK'>(
    (request.cost_bearer as any) || 'OWNER',
  );
  const [finOwnerAmount, setFinOwnerAmount] = useState<string>('');
  const [finTenantAmount, setFinTenantAmount] = useState<string>('');
  const [finDueDate, setFinDueDate] = useState<string>(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [finDecisionNote, setFinDecisionNote] = useState<string>('');
  const [finRejectReason, setFinRejectReason] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinancialApproval() {
    setIsSubmitting(true);
    setError(null);
    try {
      const parsedCost = Number(finFinalCost);
      if (isNaN(parsedCost) || parsedCost < 0) {
        throw new Error('Please enter a valid non-negative final cost.');
      }

      const payload: Record<string, any> = {
        costBearer: finCostBearer,
        finalCost: parsedCost,
        dueDate: finDueDate || undefined,
        decisionNote: finDecisionNote.trim() || undefined,
      };

      if (finCostBearer === 'SHARED') {
        const oAmt = Number(finOwnerAmount);
        const tAmt = Number(finTenantAmount);
        if (isNaN(oAmt) || isNaN(tAmt) || oAmt < 0 || tAmt < 0) {
          throw new Error('Please enter valid non-negative amounts for both owner and tenant.');
        }
        if (Math.abs(oAmt + tAmt - parsedCost) > 0.01) {
          throw new Error(`Owner (INR ${oAmt}) + Tenant (INR ${tAmt}) must exactly equal final cost (INR ${parsedCost}).`);
        }
        payload.ownerAmount = oAmt;
        payload.tenantAmount = tAmt;
      }

      const res = await fetch(`/api/maintenance/${request.id}/financial-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Financial approval failed.');
      }
      setActiveModal(null);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'An error occurred during financial approval.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFinancialReject() {
    setIsSubmitting(true);
    setError(null);
    try {
      if (!finRejectReason.trim()) {
        throw new Error('Please provide a reason for rejecting the financial obligation.');
      }
      const res = await fetch(`/api/maintenance/${request.id}/financial-reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: finRejectReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Financial rejection failed.');
      }
      setActiveModal(null);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'An error occurred during financial rejection.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAction(payload: Record<string, any>) {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/maintenance/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Action failed.');
      }
      setActiveModal(null);
      setNote('');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-card border border-crimson/30 bg-crimson-soft/40 p-3 text-[13px] text-crimson-deep">
          {error}
        </div>
      )}

      {/* -------------------- OWNER WORKFLOW CONTROLS -------------------- */}
      {isOwner && (
        <div className="rounded-card border border-line bg-sand-light/40 p-4 space-y-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted font-semibold">
            Owner Action Controls
          </p>

          {/* If request is OPEN or OWNER_REVIEW */}
          {['OPEN', 'OWNER_REVIEW'].includes(request.status) && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => handleAction({ status: 'APPROVED', note: 'Owner accepted the maintenance request.' })}
                disabled={isSubmitting}
              >
                Accept Request
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setActiveModal('REQUEST_INFO')}
                disabled={isSubmitting}
              >
                Request More Information
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-crimson-deep hover:bg-crimson-soft"
                onClick={() => setActiveModal('REJECT')}
                disabled={isSubmitting}
              >
                Reject Request
              </Button>
            </div>
          )}

          {/* If request is APPROVED */}
          {request.status === 'APPROVED' && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[14px] text-ink">Request is approved. Ready to schedule repair work.</p>
              <Button
                size="sm"
                onClick={() => setActiveModal('START_WORK')}
                disabled={isSubmitting}
              >
                Start Repair / Assign Vendor
              </Button>
            </div>
          )}

          {/* If request is IN_PROGRESS */}
          {['IN_PROGRESS', 'SCHEDULED'].includes(request.status) && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                onClick={() => setActiveModal('COMPLETE_WORK')}
                disabled={isSubmitting}
              >
                Mark Repair Complete
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setActiveModal('POST_NOTE')}
                disabled={isSubmitting}
              >
                Add Status Update
              </Button>
            </div>
          )}

          {/* If request is COMPLETED */}
          {request.status === 'COMPLETED' && (
            <p className="text-[13px] text-muted">
              Repair marked complete. Awaiting tenant verification and final sign-off.
            </p>
          )}

          {/* If request is CLOSED */}
          {request.status === 'CLOSED' && (
            <p className="text-[13px] text-muted">
              This request is confirmed resolved and closed.
            </p>
          )}
        </div>
      )}

      {/* -------------------- TENANT WORKFLOW CONTROLS -------------------- */}
      {isTenant && (
        <div className="rounded-card border border-line bg-sand-light/40 p-4 space-y-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted font-semibold">
            Tenant Verification & Actions
          </p>

          {/* When repair is COMPLETED by owner */}
          {request.status === 'COMPLETED' && (
            <div className="space-y-3">
              <div className="rounded-card bg-seal-soft/40 border border-seal/30 p-3 text-[14px] text-seal-deep">
                The landlord has marked this repair completed. Please check the property and confirm resolution.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => handleAction({ status: 'CLOSED', note: 'Tenant verified and confirmed repair resolution.' })}
                  disabled={isSubmitting}
                >
                  Confirm Resolved
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-crimson-deep"
                  onClick={() => setActiveModal('NOT_RESOLVED')}
                  disabled={isSubmitting}
                >
                  Issue Not Resolved
                </Button>
              </div>
            </div>
          )}

          {/* When request is OPEN or OWNER_REVIEW */}
          {['OPEN', 'OWNER_REVIEW'].includes(request.status) && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-muted">
                Your request is under review with the property owner.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="text-crimson-deep"
                onClick={() => handleAction({ status: 'CANCELLED', note: 'Tenant cancelled the maintenance request.' })}
                disabled={isSubmitting}
              >
                Cancel Request
              </Button>
            </div>
          )}

          {/* When work is IN_PROGRESS */}
          {['APPROVED', 'IN_PROGRESS', 'SCHEDULED'].includes(request.status) && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-muted">
                Repair work is currently underway.
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setActiveModal('POST_NOTE')}
                disabled={isSubmitting}
              >
                Post a message
              </Button>
            </div>
          )}

          {/* When CLOSED */}
          {request.status === 'CLOSED' && (
            <p className="text-[13px] text-muted">
              You confirmed this repair resolved. Request is closed.
            </p>
          )}
        </div>
      )}

      {/* -------------------- MANAGEMENT FINANCIAL GOVERNANCE -------------------- */}
      {isStaff && ['COMPLETED', 'VERIFIED', 'CLOSED'].includes(request.status) && (
        <div className="rounded-card border border-seal-deep/30 bg-seal-soft/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-seal-deep font-bold">
              Platform Governance · Financial Review
            </span>
            <span className="rounded bg-seal px-2 py-0.5 text-[10px] font-semibold text-white font-mono uppercase">
              Management Authority
            </span>
          </div>
          <p className="text-[13px] text-ink">
            Review confirmed maintenance expense, assign cost allocation (Owner / Tenant / Split / Platform), and generate payment obligations.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="primary"
              onClick={() => setActiveModal('FINANCIAL_APPROVE')}
              disabled={isSubmitting}
            >
              ⚡ Review & Approve Financial Obligations
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setActiveModal('FINANCIAL_REJECT')}
              disabled={isSubmitting}
            >
              Reject Financial Obligation
            </Button>
          </div>
        </div>
      )}

      {/* -------------------- MODALS / DIALOG PANELS -------------------- */}

      {/* Request Info Modal */}
      {activeModal === 'REQUEST_INFO' && (
        <div className="rounded-card border border-seal/30 bg-white p-4 space-y-3 shadow-card">
          <p className="font-medium text-[15px]">Request More Information from Tenant</p>
          <textarea
            rows={3}
            placeholder="Specify what additional details, availability, or photos you require..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-card border border-line p-2.5 text-[14px] focus:border-seal focus:outline-none"
            required
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setActiveModal(null)} type="button">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSubmitting || !note.trim()}
              onClick={() => handleAction({ status: 'OWNER_REVIEW', note: `Owner requested more information: ${note.trim()}` })}
            >
              Send Request
            </Button>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {activeModal === 'REJECT' && (
        <div className="rounded-card border border-crimson/30 bg-white p-4 space-y-3 shadow-card">
          <p className="font-medium text-[15px] text-crimson-deep">Reject Maintenance Request</p>
          <p className="text-[13px] text-muted">Please provide a clear explanation for declining this repair request.</p>
          <textarea
            rows={3}
            placeholder="Reason for rejection (mandatory)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-card border border-line p-2.5 text-[14px] focus:border-seal focus:outline-none"
            required
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setActiveModal(null)} type="button">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="bg-crimson text-white hover:bg-crimson-deep"
              disabled={isSubmitting || !note.trim()}
              onClick={() => handleAction({ status: 'REJECTED', note: `Request rejected: ${note.trim()}` })}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      )}

      {/* Start Work Modal */}
      {activeModal === 'START_WORK' && (
        <div className="rounded-card border border-seal/30 bg-white p-4 space-y-3 shadow-card">
          <p className="font-medium text-[15px]">Start Repair Work & Schedule</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                Technician / Vendor Name
              </label>
              <input
                type="text"
                placeholder="e.g. Ramesh Plumbing Services"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                className="w-full rounded-card border border-line p-2 text-[14px] focus:border-seal focus:outline-none"
              />
            </div>
            <div>
              <label className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                Contact Phone
              </label>
              <input
                type="text"
                placeholder="e.g. +91 98765 43210"
                value={vendorPhone}
                onChange={(e) => setVendorPhone(e.target.value)}
                className="w-full rounded-card border border-line p-2 text-[14px] focus:border-seal focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
              Scheduled Date / Time
            </label>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full rounded-card border border-line p-2 text-[14px] focus:border-seal focus:outline-none"
            />
          </div>
          <div>
            <label className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
              Work Notes / Instructions
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Plumber scheduled for visit to replace washers and pipe joints."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-card border border-line p-2 text-[14px] focus:border-seal focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setActiveModal(null)} type="button">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSubmitting}
              onClick={() =>
                handleAction({
                  status: 'IN_PROGRESS',
                  vendorName: vendorName.trim() || undefined,
                  vendorPhone: vendorPhone.trim() || undefined,
                  scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
                  note: note.trim() || 'Work scheduled and marked in progress.',
                })
              }
            >
              Start Work
            </Button>
          </div>
        </div>
      )}

      {/* Complete Work Modal */}
      {activeModal === 'COMPLETE_WORK' && (
        <div className="rounded-card border border-seal/30 bg-white p-4 space-y-3 shadow-card">
          <p className="font-medium text-[15px]">Mark Repair Complete / Resolved</p>
          <div>
            <label className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
              Resolution Summary <span className="text-crimson">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Describe how the repair was completed (e.g. replaced pipe fitting, tested drainage and water flow)..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-card border border-line p-2.5 text-[14px] focus:border-seal focus:outline-none"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                Final Repair Cost (₹)
              </label>
              <input
                type="number"
                placeholder="e.g. 1500"
                value={finalCost}
                onChange={(e) => setFinalCost(e.target.value)}
                className="w-full rounded-card border border-line p-2 text-[14px] focus:border-seal focus:outline-none"
              />
            </div>
            <div>
              <label className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                Cost Borne By
              </label>
              <select
                value={costBearer}
                onChange={(e) => setCostBearer(e.target.value)}
                className="w-full rounded-card border border-line p-2 text-[14px] focus:border-seal focus:outline-none"
              >
                <option value="OWNER">Owner</option>
                <option value="TENANT">Tenant</option>
                <option value="SHARED">Shared</option>
                <option value="UNDECIDED">Undecided</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setActiveModal(null)} type="button">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSubmitting || !note.trim()}
              onClick={() =>
                handleAction({
                  status: 'COMPLETED',
                  finalCost: finalCost ? Number(finalCost) : undefined,
                  costBearer,
                  note: `Repair completed: ${note.trim()}`,
                })
              }
            >
              Mark Resolved
            </Button>
          </div>
        </div>
      )}

      {/* Tenant Issue Not Resolved Modal */}
      {activeModal === 'NOT_RESOLVED' && (
        <div className="rounded-card border border-ochre/30 bg-white p-4 space-y-3 shadow-card">
          <p className="font-medium text-[15px] text-ochre-deep">Issue Remains Unresolved</p>
          <p className="text-[13px] text-muted">
            Describe why the repair was insufficient so the owner can coordinate follow-up work.
          </p>
          <textarea
            rows={3}
            placeholder="Explain what is still not working..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-card border border-line p-2.5 text-[14px] focus:border-seal focus:outline-none"
            required
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setActiveModal(null)} type="button">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSubmitting || !note.trim()}
              onClick={() =>
                handleAction({
                  status: 'IN_PROGRESS',
                  note: `Tenant reported issue not resolved: ${note.trim()}`,
                })
              }
            >
              Reopen / Return to In Progress
            </Button>
          </div>
        </div>
      )}

      {/* Generic Post Note Modal */}
      {activeModal === 'POST_NOTE' && (
        <div className="rounded-card border border-line bg-white p-4 space-y-3 shadow-card">
          <p className="font-medium text-[15px]">Add Activity Message</p>
          <textarea
            rows={3}
            placeholder="Type your message or update note here..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-card border border-line p-2.5 text-[14px] focus:border-seal focus:outline-none"
            required
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setActiveModal(null)} type="button">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSubmitting || !note.trim()}
              onClick={() => handleAction({ note: note.trim() })}
            >
              Post Note
            </Button>
          </div>
        </div>
      )}

      {/* Financial Approval Modal */}
      {activeModal === 'FINANCIAL_APPROVE' && (
        <div className="rounded-card border border-seal-deep bg-white p-5 space-y-4 shadow-card">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <p className="font-medium text-[16px] text-ink font-display">Approve Maintenance Financial Obligation</p>
            <span className="rounded bg-seal-soft px-2 py-0.5 text-seal-deep font-mono text-[11px] font-bold">
              {request.ticket_number}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-muted mb-1">
                Final Confirmed Cost (INR) *
              </label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 5000"
                value={finFinalCost}
                onChange={(e) => setFinFinalCost(e.target.value)}
                className="w-full rounded border border-line p-2 text-[14px] text-ink focus:border-seal focus:outline-none font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-muted mb-1">
                Cost Bearer *
              </label>
              <select
                value={finCostBearer}
                onChange={(e) => setFinCostBearer(e.target.value as any)}
                className="w-full rounded border border-line p-2 text-[14px] text-ink focus:border-seal focus:outline-none"
              >
                <option value="OWNER">Property Owner</option>
                <option value="TENANT">Tenant</option>
                <option value="SHARED">Split / Shared Cost</option>
                <option value="ODIBRICK">Platform Borne / Waived</option>
              </select>
            </div>
          </div>

          {/* Split Cost Breakdown Inputs */}
          {finCostBearer === 'SHARED' && (
            <div className="grid gap-3 sm:grid-cols-2 bg-paper/60 p-3 rounded-card border border-line">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-muted mb-1">
                  Owner Share (INR) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 3000"
                  value={finOwnerAmount}
                  onChange={(e) => setFinOwnerAmount(e.target.value)}
                  className="w-full rounded border border-line p-2 text-[13px] text-ink focus:border-seal focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-muted mb-1">
                  Tenant Share (INR) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 2000"
                  value={finTenantAmount}
                  onChange={(e) => setFinTenantAmount(e.target.value)}
                  className="w-full rounded border border-line p-2 text-[13px] text-ink focus:border-seal focus:outline-none"
                />
              </div>
              {finFinalCost && (
                <p className="sm:col-span-2 text-[11px] font-mono text-muted">
                  Total Allocation: INR {(Number(finOwnerAmount || 0) + Number(finTenantAmount || 0)).toFixed(2)} / Required: INR {Number(finFinalCost || 0).toFixed(2)}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-muted mb-1">
              Payment Due Date
            </label>
            <input
              type="date"
              value={finDueDate}
              onChange={(e) => setFinDueDate(e.target.value)}
              className="w-full rounded border border-line p-2 text-[13px] text-ink focus:border-seal focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-muted mb-1">
              Management Decision Note
            </label>
            <textarea
              rows={2}
              placeholder="Internal notes, invoice references, or decision justification..."
              value={finDecisionNote}
              onChange={(e) => setFinDecisionNote(e.target.value)}
              className="w-full rounded border border-line p-2 text-[13px] text-ink focus:border-seal focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button size="sm" variant="ghost" onClick={() => setActiveModal(null)} type="button">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={isSubmitting || !finFinalCost}
              onClick={handleFinancialApproval}
            >
              Approve & Generate Payment(s)
            </Button>
          </div>
        </div>
      )}

      {/* Financial Reject Modal */}
      {activeModal === 'FINANCIAL_REJECT' && (
        <div className="rounded-card border border-crimson/30 bg-white p-5 space-y-4 shadow-card">
          <p className="font-medium text-[16px] text-crimson-deep font-display">Reject Maintenance Financial Obligation</p>
          <p className="text-[13px] text-muted">
            Provide the reason why this maintenance expense is rejected for financial obligation creation.
          </p>
          <textarea
            rows={3}
            placeholder="Reason for financial rejection (required)..."
            value={finRejectReason}
            onChange={(e) => setFinRejectReason(e.target.value)}
            className="w-full rounded border border-line p-2.5 text-[14px] focus:border-crimson focus:outline-none"
            required
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button size="sm" variant="ghost" onClick={() => setActiveModal(null)} type="button">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="bg-crimson text-white hover:bg-crimson-deep"
              disabled={isSubmitting || !finRejectReason.trim()}
              onClick={handleFinancialReject}
            >
              Confirm Financial Rejection
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
