'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Badge, Button, Card, CardHeader, ErrorNote, StatusChip } from '@/components/ui';
import { Seal } from '@/components/verification-seal';
import { inr, shortDate, titleCase } from '@/lib/format';

export type MasterClause = {
  id: number;
  code: string;
  title: string;
  category: string;
  body_template: string;
  is_mandatory: number;
  jurisdiction?: string;
  version: number;
};

export type AgreementData = {
  agreement?: {
    id: number;
    public_id: string;
    agreement_number: string;
    agreement_type: string;
    status: string;
    current_version: number;
    effective_from?: string;
    effective_to?: string;
    stamp_duty_status: string;
    approved_by?: number;
    approved_at?: string;
    executed_at?: string;
    approved_by_name?: string;
  } | null;
  version?: {
    version: number;
    body_html: string;
    variables?: Record<string, unknown>;
    change_summary?: string;
    drafted_with_ai?: number;
    reviewed_at?: string;
  } | null;
  clauses?: Array<{
    title: string;
    body: string;
    sort_order: number;
  }>;
  signatories?: Array<{
    id: number;
    party_role: string;
    status: string;
    signed_at?: string;
    full_name: string;
  }>;
  versions?: Array<{
    version: number;
    change_summary?: string;
    drafted_with_ai: number;
    created_at: string;
    drafter_name: string;
  }>;
};

export type LegalCaseContext = {
  id: number;
  case_number: string;
  case_type: string;
  status: string;
  priority: string;
  jurisdiction?: string;
  tenancy_id: number;
  rent_amount: number;
  deposit_amount: number;
  maintenance_amount?: number;
  start_date?: string;
  end_date?: string;
  lock_in_months?: number;
  notice_period_days?: number;
  service_plan: string;
  property_title: string;
  address_line1?: string;
  locality: string;
  city: string;
  state?: string;
  pincode?: string;
  owner_name: string;
  owner_email: string;
  tenant_name: string;
  tenant_email: string;
  assignee_name?: string;
};

export function AgreementDrafter({
  legalCase,
  initialAgreement,
  masterClauses,
  userPermissions,
}: {
  legalCase: LegalCaseContext;
  initialAgreement: AgreementData | null;
  masterClauses: MasterClause[];
  userPermissions: string[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'TERMS' | 'CLAUSES' | 'HISTORY'>('TERMS');

  // Commercial & Legal Form Variables
  const [agreementType, setAgreementType] = useState<string>(
    initialAgreement?.agreement?.agreement_type ?? 'LEAVE_AND_LICENSE',
  );
  const [effectiveFrom, setEffectiveFrom] = useState<string>(
    initialAgreement?.agreement?.effective_from
      ? initialAgreement.agreement.effective_from.slice(0, 10)
      : legalCase.start_date
      ? legalCase.start_date.slice(0, 10)
      : '',
  );
  const [effectiveTo, setEffectiveTo] = useState<string>(
    initialAgreement?.agreement?.effective_to
      ? initialAgreement.agreement.effective_to.slice(0, 10)
      : legalCase.end_date
      ? legalCase.end_date.slice(0, 10)
      : '',
  );
  const [rentAmount, setRentAmount] = useState<number>(
    Number(initialAgreement?.version?.variables?.rent_amount ?? legalCase.rent_amount),
  );
  const [depositAmount, setDepositAmount] = useState<number>(
    Number(initialAgreement?.version?.variables?.deposit_amount ?? legalCase.deposit_amount),
  );
  const [maintenanceAmount, setMaintenanceAmount] = useState<number>(
    Number(initialAgreement?.version?.variables?.maintenance_amount ?? legalCase.maintenance_amount ?? 0),
  );
  const [maintenanceBearer, setMaintenanceBearer] = useState<string>(
    String(initialAgreement?.version?.variables?.maintenance_bearer ?? 'Licensee'),
  );
  const [lockInMonths, setLockInMonths] = useState<number>(
    Number(initialAgreement?.version?.variables?.lock_in_months ?? legalCase.lock_in_months ?? 0),
  );
  const [noticePeriodDays, setNoticePeriodDays] = useState<number>(
    Number(initialAgreement?.version?.variables?.notice_period_days ?? legalCase.notice_period_days ?? 30),
  );
  const [rentDueDay, setRentDueDay] = useState<number>(
    Number(initialAgreement?.version?.variables?.rent_due_day ?? 5),
  );
  const [refundDays, setRefundDays] = useState<number>(
    Number(initialAgreement?.version?.variables?.refund_days ?? 30),
  );
  const [minorRepairCap, setMinorRepairCap] = useState<number>(
    Number(initialAgreement?.version?.variables?.minor_repair_cap ?? 2500),
  );
  const [changeSummary, setChangeSummary] = useState<string>('');
  const [draftedWithAi, setDraftedWithAi] = useState<boolean>(false);

  // Selected Clauses state (clause codes)
  const [selectedClauseCodes, setSelectedClauseCodes] = useState<Set<string>>(() => {
    if (initialAgreement?.clauses?.length) {
      // If clauses exist on agreement, map them
      const codes = new Set<string>();
      masterClauses.forEach((mc) => {
        if (initialAgreement.clauses?.some((c) => c.title === mc.title)) {
          codes.add(mc.code);
        }
      });
      if (codes.size > 0) return codes;
    }
    // Default: select mandatory clauses + standard clauses
    const defaults = new Set<string>();
    masterClauses.forEach((mc) => {
      if (mc.is_mandatory || ['LOCK_IN', 'MAINTENANCE', 'UTILITIES', 'REPAIRS', 'CONDITION_RECORD'].includes(mc.code)) {
        defaults.add(mc.code);
      }
    });
    return defaults;
  });

  const [customClauseTitle, setCustomClauseTitle] = useState('');
  const [customClauseBody, setCustomClauseBody] = useState('');
  const [customClauses, setCustomClauses] = useState<Array<{ title: string; body: string }>>([]);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Computed variable dictionary for template replacements
  const variablesMap = useMemo(() => {
    return {
      rent_amount: inr(rentAmount),
      deposit_amount: inr(depositAmount),
      maintenance_amount: inr(maintenanceAmount),
      maintenance_bearer: maintenanceBearer,
      lock_in_months: lockInMonths,
      notice_period_days: noticePeriodDays,
      rent_due_day: rentDueDay,
      refund_days: refundDays,
      minor_repair_cap: inr(minorRepairCap),
      checkin_date: effectiveFrom ? shortDate(effectiveFrom) : 'the check-in date',
      property_title: legalCase.property_title,
      owner_name: legalCase.owner_name,
      tenant_name: legalCase.tenant_name,
    };
  }, [
    rentAmount,
    depositAmount,
    maintenanceAmount,
    maintenanceBearer,
    lockInMonths,
    noticePeriodDays,
    rentDueDay,
    refundDays,
    minorRepairCap,
    effectiveFrom,
    legalCase,
  ]);

  function interpolate(template: string) {
    return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => String((variablesMap as Record<string, unknown>)[key] ?? `{{${key}}}`));
  }

  // Active compiled clauses list
  const activeClauses = useMemo(() => {
    const list = masterClauses
      .filter((mc) => selectedClauseCodes.has(mc.code))
      .map((mc) => ({
        clauseId: mc.id,
        code: mc.code,
        title: mc.title,
        body: interpolate(mc.body_template),
      }));

    const customs = customClauses.map((cc) => ({
      clauseId: undefined,
      code: 'CUSTOM',
      title: cc.title,
      body: interpolate(cc.body),
    }));

    return [...list, ...customs];
  }, [masterClauses, selectedClauseCodes, customClauses, variablesMap]);

  function toggleClause(code: string, isMandatory: boolean) {
    if (isMandatory) return; // Cannot unselect mandatory clauses
    setSelectedClauseCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function handleAddCustomClause(e: React.FormEvent) {
    e.preventDefault();
    if (!customClauseTitle.trim() || !customClauseBody.trim()) return;
    setCustomClauses((prev) => [
      ...prev,
      { title: customClauseTitle.trim(), body: customClauseBody.trim() },
    ]);
    setCustomClauseTitle('');
    setCustomClauseBody('');
  }

  // Generate HTML for the complete agreement preview
  const generatedHtml = useMemo(() => {
    const clausesHtml = activeClauses
      .map(
        (c, idx) =>
          `<div class="clause-block" style="margin-bottom: 1.25rem;">
            <p style="font-weight: 600; margin-bottom: 0.25rem;">Clause ${idx + 1}. ${c.title}</p>
            <p style="line-height: 1.6; color: #1e293b;">${c.body}</p>
          </div>`,
      )
      .join('\n');

    return `
      <div class="agreement-document">
        <h2 style="text-align: center; font-size: 1.25rem; font-weight: bold; margin-bottom: 1rem;">
          ${agreementType.replace(/_/g, ' ')} AGREEMENT
        </h2>
        <p style="text-align: center; font-size: 0.875rem; color: #64748b; margin-bottom: 1.5rem;">
          Jurisdiction: ${legalCase.jurisdiction ?? (legalCase.state ? `${legalCase.state} Tenancy Law` : 'State Tenancy Act')}
        </p>

        <p style="line-height: 1.6; margin-bottom: 1rem;">
          This <strong>${titleCase(agreementType)} Agreement</strong> is made and entered into on this 
          <strong>${effectiveFrom ? shortDate(effectiveFrom) : '____'}</strong>, by and between:
        </p>

        <div style="margin-bottom: 1rem; padding: 0.75rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;">
          <p><strong>1. LICENSOR (OWNER):</strong> ${legalCase.owner_name} (${legalCase.owner_email})</p>
          <p style="margin-top: 0.25rem;"><strong>2. LICENSEE (TENANT):</strong> ${legalCase.tenant_name} (${legalCase.tenant_email})</p>
        </div>

        <p style="line-height: 1.6; margin-bottom: 1.5rem;">
          WHEREAS the Licensor is the lawful owner of the residential property situated at:
          <br/>
          <strong>${legalCase.property_title}, ${legalCase.address_line1 ? `${legalCase.address_line1}, ` : ''}${legalCase.locality}, ${legalCase.city}${legalCase.state ? `, ${legalCase.state}` : ''}${legalCase.pincode ? ` - ${legalCase.pincode}` : ''}</strong>
          <br/>
          and has agreed to grant license to the Licensee on the following agreed terms and covenants:
        </p>

        <div class="clauses-container">
          ${clausesHtml}
        </div>

        <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 2px solid #e2e8f0;">
          <p style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; text-align: center;">
            Document Generated via Odibrick Legal Verification & Workspace
          </p>
        </div>
      </div>
    `;
  }, [activeClauses, agreementType, effectiveFrom, legalCase]);

  // Handle Save Draft API
  async function handleSaveDraft() {
    setError(null);
    setSuccessMessage(null);

    const payload = {
      agreementType,
      bodyHtml: generatedHtml,
      changeSummary: changeSummary.trim() || undefined,
      variables: {
        rent_amount: rentAmount,
        deposit_amount: depositAmount,
        maintenance_amount: maintenanceAmount,
        maintenance_bearer: maintenanceBearer,
        lock_in_months: lockInMonths,
        notice_period_days: noticePeriodDays,
        rent_due_day: rentDueDay,
        refund_days: refundDays,
        minor_repair_cap: minorRepairCap,
      },
      clauses: activeClauses.map((c) => ({
        clauseId: c.clauseId,
        title: c.title,
        body: c.body,
      })),
      effectiveFrom: effectiveFrom || undefined,
      effectiveTo: effectiveTo || undefined,
      draftedWithAi,
    };

    try {
      const res = await api<{ agreementId: number; version: number; status: string }>(
        `/legal/cases/${legalCase.id}/draft`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );

      setSuccessMessage(`Agreement draft v${res.version} saved successfully in LEGAL_REVIEW status.`);
      setChangeSummary('');
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save agreement draft.');
    }
  }

  // Handle Legal Approval API
  async function handleApprove() {
    if (!initialAgreement?.agreement?.id || !initialAgreement.version?.version) {
      setError('Please save a draft first before approving.');
      return;
    }

    if (
      !confirm(
        `Approve Agreement version ${initialAgreement.version.version} and send it to ${legalCase.owner_name} & ${legalCase.tenant_name} for signatures?`,
      )
    ) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await api(`/agreements/${initialAgreement.agreement.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ version: initialAgreement.version.version }),
      });

      setSuccessMessage('Agreement approved! Moved to AWAITING_SIGNATURES.');
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to approve agreement.');
    }
  }

  const isExecuted = initialAgreement?.agreement?.status === 'EXECUTED';
  const isAwaitingSignatures = initialAgreement?.agreement?.status === 'AWAITING_SIGNATURES';
  const canApprove =
    userPermissions.includes('agreement.approve') &&
    initialAgreement?.agreement?.status === 'LEGAL_REVIEW' &&
    !!initialAgreement.version?.version;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ BREADCRUMBS */}
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted">
        <Link href="/dashboard/legal" className="hover:text-seal">
          Legal queue
        </Link>
        <span>/</span>
        <Link href={`/dashboard/legal/${legalCase.id}`} className="hover:text-seal">
          {legalCase.case_number}
        </Link>
        <span>/</span>
        <span className="text-ink">Agreement Drafting</span>
      </div>

      {/* ----------------------------------------------- A. AGREEMENT HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">
              {initialAgreement?.agreement?.agreement_number ?? 'Drafting New Agreement'}
            </span>
            {initialAgreement?.agreement?.status ? (
              <StatusChip status={initialAgreement.agreement.status} />
            ) : (
              <Badge tone="ochre">DRAFT PENDING</Badge>
            )}
            {initialAgreement?.version?.version ? (
              <Badge>v{initialAgreement.version.version}</Badge>
            ) : null}
            <Badge tone="seal">{titleCase(agreementType)}</Badge>
          </div>

          <h1 className="mt-3 font-display text-2xl sm:text-3xl font-semibold text-ink">
            {legalCase.property_title}
          </h1>

          <p className="mt-1 text-[15px] text-muted">
            {legalCase.locality}, {legalCase.city} · {legalCase.owner_name} ⟷ {legalCase.tenant_name} · Assigned: {legalCase.assignee_name ?? 'Adv. Shalini Menon'}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {canApprove ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleApprove}
              disabled={isPending}
            >
              Approve draft (v{initialAgreement.version?.version})
            </Button>
          ) : null}

          <Button
            variant={canApprove ? 'secondary' : 'primary'}
            size="sm"
            onClick={handleSaveDraft}
            disabled={isPending || isExecuted || isAwaitingSignatures}
          >
            {isPending ? 'Saving...' : initialAgreement?.agreement?.id ? 'Save new version' : 'Save draft'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            href={`/dashboard/legal/${legalCase.id}`}
          >
            Back to case
          </Button>
        </div>
      </div>

      {/* Status alerts */}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {successMessage ? (
        <div className="rounded-card border border-seal/30 bg-seal-soft p-3 text-sm text-seal-deep font-medium">
          ✓ {successMessage}
        </div>
      ) : null}

      {isExecuted ? (
        <div className="rounded-card border border-seal/30 bg-seal-soft/40 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-display text-base font-semibold text-seal-deep">This agreement is fully executed.</p>
            <p className="text-sm text-muted">Signed by both parties on {shortDate(initialAgreement?.agreement?.executed_at)}.</p>
          </div>
          <Seal label="Executed" sub={initialAgreement?.agreement?.executed_at ? shortDate(initialAgreement.agreement.executed_at) : undefined} />
        </div>
      ) : isAwaitingSignatures ? (
        <div className="rounded-card border border-ochre/40 bg-ochre-soft p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-display text-base font-semibold text-ochre">Awaiting Party Signatures</p>
            <p className="text-sm text-muted">
              Approved by {initialAgreement?.agreement?.approved_by_name ?? 'Legal Counsel'} on {shortDate(initialAgreement?.agreement?.approved_at)}. Sent to owner and tenant.
            </p>
          </div>
          <Badge tone="ochre">Out for signature</Badge>
        </div>
      ) : null}

      {/* ------------------------------------------- WORKBENCH 2-COL GRID */}
      <div className="grid gap-6 lg:grid-cols-[480px_1fr] lg:items-start">
        {/* LEFT COLUMN: DRAFTING CONTROLS */}
        <div className="space-y-6">
          <Card>
            {/* Tabs */}
            <div className="flex border-b border-line">
              <button
                type="button"
                onClick={() => setActiveTab('TERMS')}
                className={`flex-1 py-3 text-center font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  activeTab === 'TERMS'
                    ? 'border-b-2 border-seal font-semibold text-seal-deep bg-seal-soft/20'
                    : 'text-muted hover:text-ink'
                }`}
              >
                1. Rental Terms
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('CLAUSES')}
                className={`flex-1 py-3 text-center font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  activeTab === 'CLAUSES'
                    ? 'border-b-2 border-seal font-semibold text-seal-deep bg-seal-soft/20'
                    : 'text-muted hover:text-ink'
                }`}
              >
                2. Clauses ({selectedClauseCodes.size + customClauses.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('HISTORY')}
                className={`flex-1 py-3 text-center font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  activeTab === 'HISTORY'
                    ? 'border-b-2 border-seal font-semibold text-seal-deep bg-seal-soft/20'
                    : 'text-muted hover:text-ink'
                }`}
              >
                3. History ({initialAgreement?.versions?.length ?? 0})
              </button>
            </div>

            {/* TAB 1: COMMERCIAL & LEGAL TERMS */}
            {activeTab === 'TERMS' ? (
              <div className="p-5 space-y-4">
                <div className="border-b border-line pb-3">
                  <p className="font-display text-sm font-semibold">Contract Structure</p>
                  <p className="text-[12px] text-muted">Select agreement instrument and tenure.</p>
                </div>

                <div>
                  <label htmlFor="agreement-type-select" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                    Agreement Instrument
                  </label>
                  <select
                    id="agreement-type-select"
                    value={agreementType}
                    onChange={(e) => setAgreementType(e.target.value)}
                    disabled={isExecuted || isAwaitingSignatures}
                    className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:bg-white focus:outline-none"
                  >
                    <option value="LEAVE_AND_LICENSE">Leave and License Agreement</option>
                    <option value="RENTAL">Residential Rental Agreement</option>
                    <option value="LEASE">Long-term Lease Deed</option>
                    <option value="RENEWAL">Tenancy Renewal Agreement</option>
                    <option value="ADDENDUM">Addendum to Tenancy</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="effective-from-input" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                      Effective From (Start)
                    </label>
                    <input
                      id="effective-from-input"
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                      disabled={isExecuted || isAwaitingSignatures}
                      className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="effective-to-input" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                      Effective To (End)
                    </label>
                    <input
                      id="effective-to-input"
                      type="date"
                      value={effectiveTo}
                      onChange={(e) => setEffectiveTo(e.target.value)}
                      disabled={isExecuted || isAwaitingSignatures}
                      className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="border-b border-line pt-2 pb-3">
                  <p className="font-display text-sm font-semibold">Commercial Variables</p>
                  <p className="text-[12px] text-muted">Values automatically injected into template placeholders.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="monthly-rent-input" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                      Monthly Rent (₹)
                    </label>
                    <input
                      id="monthly-rent-input"
                      type="number"
                      value={rentAmount}
                      onChange={(e) => setRentAmount(Number(e.target.value))}
                      disabled={isExecuted || isAwaitingSignatures}
                      className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="security-deposit-input" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                      Security Deposit (₹)
                    </label>
                    <input
                      id="security-deposit-input"
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(Number(e.target.value))}
                      disabled={isExecuted || isAwaitingSignatures}
                      className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="maintenance-amount-input" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                      Maintenance (₹/mo)
                    </label>
                    <input
                      id="maintenance-amount-input"
                      type="number"
                      value={maintenanceAmount}
                      onChange={(e) => setMaintenanceAmount(Number(e.target.value))}
                      disabled={isExecuted || isAwaitingSignatures}
                      className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="maintenance-bearer-select" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                      Maintenance Bearer
                    </label>
                    <select
                      id="maintenance-bearer-select"
                      value={maintenanceBearer}
                      onChange={(e) => setMaintenanceBearer(e.target.value)}
                      disabled={isExecuted || isAwaitingSignatures}
                      className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:bg-white focus:outline-none"
                    >
                      <option value="Licensee">Licensee (Tenant)</option>
                      <option value="Licensor">Licensor (Owner)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="lock-in-input" className="font-mono text-[10px] uppercase tracking-wider text-muted block mb-1">
                      Lock-in (Mo)
                    </label>
                    <input
                      id="lock-in-input"
                      type="number"
                      value={lockInMonths}
                      onChange={(e) => setLockInMonths(Number(e.target.value))}
                      disabled={isExecuted || isAwaitingSignatures}
                      className="w-full rounded-card border border-line bg-paper px-2 py-1.5 text-sm focus:border-seal focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="notice-period-input" className="font-mono text-[10px] uppercase tracking-wider text-muted block mb-1">
                      Notice (Days)
                    </label>
                    <input
                      id="notice-period-input"
                      type="number"
                      value={noticePeriodDays}
                      onChange={(e) => setNoticePeriodDays(Number(e.target.value))}
                      disabled={isExecuted || isAwaitingSignatures}
                      className="w-full rounded-card border border-line bg-paper px-2 py-1.5 text-sm focus:border-seal focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="rent-due-day-input" className="font-mono text-[10px] uppercase tracking-wider text-muted block mb-1">
                      Rent Due Day
                    </label>
                    <input
                      id="rent-due-day-input"
                      type="number"
                      min={1}
                      max={28}
                      value={rentDueDay}
                      onChange={(e) => setRentDueDay(Number(e.target.value))}
                      disabled={isExecuted || isAwaitingSignatures}
                      className="w-full rounded-card border border-line bg-paper px-2 py-1.5 text-sm focus:border-seal focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label htmlFor="refund-days-input" className="font-mono text-[10px] uppercase tracking-wider text-muted block mb-1">
                      Deposit Refund (Days)
                    </label>
                    <input
                      id="refund-days-input"
                      type="number"
                      value={refundDays}
                      onChange={(e) => setRefundDays(Number(e.target.value))}
                      disabled={isExecuted || isAwaitingSignatures}
                      className="w-full rounded-card border border-line bg-paper px-2 py-1.5 text-sm focus:border-seal focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="minor-repair-cap-input" className="font-mono text-[10px] uppercase tracking-wider text-muted block mb-1">
                      Minor Repair Cap (₹)
                    </label>
                    <input
                      id="minor-repair-cap-input"
                      type="number"
                      value={minorRepairCap}
                      onChange={(e) => setMinorRepairCap(Number(e.target.value))}
                      disabled={isExecuted || isAwaitingSignatures}
                      className="w-full rounded-card border border-line bg-paper px-2 py-1.5 text-sm focus:border-seal focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-line">
                  <label htmlFor="change-summary-input" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                    Version Revision Note / Summary
                  </label>
                  <input
                    id="change-summary-input"
                    type="text"
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    placeholder="e.g., Initial draft for owner-tenant review"
                    disabled={isExecuted || isAwaitingSignatures}
                    className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="ai-assist"
                    type="checkbox"
                    checked={draftedWithAi}
                    onChange={(e) => setDraftedWithAi(e.target.checked)}
                    disabled={isExecuted || isAwaitingSignatures}
                    className="rounded border-line text-seal focus:ring-seal"
                  />
                  <label htmlFor="ai-assist" className="text-[12px] text-muted cursor-pointer">
                    Assisted with AI clause generator (recorded for compliance)
                  </label>
                </div>
              </div>
            ) : null}

            {/* TAB 2: CLAUSE LIBRARY SELECTION */}
            {activeTab === 'CLAUSES' ? (
              <div className="p-5 space-y-4">
                <div className="border-b border-line pb-3">
                  <p className="font-display text-sm font-semibold">Master Clause Library</p>
                  <p className="text-[12px] text-muted">
                    Toggle clauses to include. Mandatory statutory clauses cannot be removed.
                  </p>
                </div>

                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {masterClauses.map((clause) => {
                    const isSelected = selectedClauseCodes.has(clause.code);
                    const isMandatory = Boolean(clause.is_mandatory);

                    return (
                      <div
                        key={clause.code}
                        className={`rounded-card border p-3 transition-colors ${
                          isSelected ? 'border-seal/40 bg-seal-soft/20' : 'border-line/60 bg-paper/30 opacity-75'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isMandatory || isExecuted || isAwaitingSignatures}
                              onChange={() => toggleClause(clause.code, isMandatory)}
                              className="rounded border-line text-seal focus:ring-seal"
                            />
                            <span className="font-display text-[13px] font-semibold text-ink">
                              {clause.title}
                            </span>
                          </label>

                          <div className="flex items-center gap-1">
                            {isMandatory ? (
                              <Badge tone="seal">Mandatory</Badge>
                            ) : (
                              <Badge tone="neutral">{clause.category}</Badge>
                            )}
                          </div>
                        </div>

                        <p className="mt-2 text-[12px] text-muted leading-relaxed font-mono">
                          {interpolate(clause.body_template)}
                        </p>
                      </div>
                    );
                  })}

                  {customClauses.map((cc, idx) => (
                    <div key={`custom-${idx}`} className="rounded-card border border-ochre/40 bg-ochre-soft/30 p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-display text-[13px] font-semibold text-ink">{cc.title}</span>
                        <Badge tone="ochre">Custom</Badge>
                      </div>
                      <p className="mt-1 text-[12px] text-muted">{interpolate(cc.body)}</p>
                    </div>
                  ))}
                </div>

                {/* Add custom clause */}
                {!isExecuted && !isAwaitingSignatures ? (
                  <form onSubmit={handleAddCustomClause} className="pt-3 border-t border-line space-y-2">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-muted">Add Custom Clause</p>
                    <input
                      type="text"
                      placeholder="Clause Title (e.g. Pet Policy)"
                      value={customClauseTitle}
                      onChange={(e) => setCustomClauseTitle(e.target.value)}
                      className="w-full rounded-card border border-line bg-paper px-3 py-1.5 text-xs focus:border-seal focus:outline-none"
                    />
                    <textarea
                      placeholder="Clause body template (supports {{rent_amount}}, {{notice_period_days}}, etc.)"
                      value={customClauseBody}
                      onChange={(e) => setCustomClauseBody(e.target.value)}
                      rows={2}
                      className="w-full rounded-card border border-line bg-paper px-3 py-1.5 text-xs focus:border-seal focus:outline-none"
                    />
                    <Button variant="secondary" size="sm" type="submit" disabled={!customClauseTitle || !customClauseBody}>
                      + Add clause
                    </Button>
                  </form>
                ) : null}
              </div>
            ) : null}

            {/* TAB 3: VERSION HISTORY */}
            {activeTab === 'HISTORY' ? (
              <div className="p-5 space-y-4">
                <div className="border-b border-line pb-3">
                  <p className="font-display text-sm font-semibold">Agreement Version History</p>
                  <p className="text-[12px] text-muted">Audit trail of all previous revisions and sign-offs.</p>
                </div>

                {initialAgreement?.versions?.length ? (
                  <div className="space-y-3">
                    {initialAgreement.versions.map((ver) => (
                      <div
                        key={ver.version}
                        className={`rounded-card border p-3.5 ${
                          ver.version === initialAgreement.agreement?.current_version
                            ? 'border-seal bg-seal-soft/30'
                            : 'border-line bg-paper/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold">Version {ver.version}</span>
                            {ver.version === initialAgreement.agreement?.current_version ? (
                              <Badge tone="seal">Current</Badge>
                            ) : null}
                            {ver.drafted_with_ai ? <Badge tone="ochre">AI assisted</Badge> : null}
                          </div>
                          <span className="font-mono text-[11px] text-muted">
                            {shortDate(ver.created_at)}
                          </span>
                        </div>

                        <p className="mt-1.5 text-[13px] text-ink">
                          {ver.change_summary ?? 'Standard agreement draft.'}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">
                          Drafted by {ver.drafter_name ?? 'Legal Team'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted text-center py-6">
                    No version history recorded yet. Saving this form will create Version 1.
                  </p>
                )}
              </div>
            ) : null}
          </Card>

          {/* SIGNATORIES STATUS CARD */}
          {initialAgreement?.signatories?.length ? (
            <Card className="p-5">
              <p className="eyebrow">Signatories & Consent</p>
              <div className="mt-3 divide-y divide-line">
                {initialAgreement.signatories.map((sig) => (
                  <div key={sig.id} className="flex items-center justify-between py-2 first:pt-0">
                    <div>
                      <p className="text-[13px] font-medium text-ink">{sig.full_name}</p>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                        Role: {sig.party_role} {sig.signed_at ? `· Signed ${shortDate(sig.signed_at)}` : ''}
                      </p>
                    </div>
                    <StatusChip status={sig.status} />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        {/* RIGHT COLUMN: LIVE AGREEMENT DOCUMENT PREVIEW */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <Card className="p-8 shadow-card border-line bg-white font-serif">
            {/* Watermark/Notice Header */}
            <div className="border-b-2 border-line/80 pb-4 mb-6 text-center font-sans">
              <div className="inline-flex items-center gap-2 rounded-pill bg-paper px-3 py-1 text-xs font-mono uppercase tracking-wider text-muted border border-line">
                <span>Odibrick Legal Workspace</span>
                <span>·</span>
                <span>{initialAgreement?.agreement?.agreement_number ?? 'DRAFT'}</span>
              </div>
              {!isExecuted ? (
                <p className="mt-2 text-xs font-mono text-ochre uppercase tracking-wider font-semibold">
                  ⚠️ DRAFT DOCUMENT — NOT IN FORCE UNTIL APPROVED AND SIGNED
                </p>
              ) : null}
            </div>

            {/* Document Content */}
            <div
              className="prose prose-slate max-w-none text-[14px] leading-relaxed text-slate-800"
              dangerouslySetInnerHTML={{ __html: generatedHtml }}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
