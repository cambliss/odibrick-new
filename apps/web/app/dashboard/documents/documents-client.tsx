'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, Button, StatusChip, Badge, EmptyState, ErrorNote, StatTile } from '@/components/ui';
import { shortDate } from '@/lib/format';

interface DocumentItem {
  id: number;
  public_id: string;
  title: string;
  category: string;
  document_type: string;
  context_type?: string;
  context_id?: number;
  mime_type: string;
  size_bytes: number;
  version: number;
  verification_status: string;
  expiry_date?: string;
  rejection_reason?: string;
  created_at: string;
}

interface KycProfile {
  status: string;
  record?: {
    legal_name: string;
    id_type: string;
    id_last4?: string;
    rejection_reason?: string;
    reviewed_at?: string;
    expires_at?: string;
  };
  documents: any[];
}

interface RequirementItem {
  documentType: string;
  name: string;
  description: string;
  category?: string;
  isMandatory: boolean;
  submitted: boolean;
  status: string;
  verified: boolean;
  expired: boolean;
  rejectionReason?: string;
  actionRequired: string;
}

interface ComplianceRequirements {
  isCompliant: boolean;
  totalRequired: number;
  totalSubmitted: number;
  totalVerified: number;
  items: RequirementItem[];
}

export function DocumentsClient() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [kycProfile, setKycProfile] = useState<KycProfile | null>(null);
  const [requirements, setRequirements] = useState<ComplianceRequirements | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'KYC' | 'PROPERTY' | 'APPLICATION' | 'TENANCY' | 'EXPIRING'>('ALL');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [replaceDoc, setReplaceDoc] = useState<DocumentItem | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [uploadCategory, setUploadCategory] = useState<string>('KYC');
  const [uploadDocType, setUploadDocType] = useState<string>('IDENTITY_PROOF');
  const [uploadTitle, setUploadTitle] = useState<string>('');
  const [uploadContextType, setUploadContextType] = useState<string>('USER');
  const [uploadContextId, setUploadContextId] = useState<string>('');
  const [uploadExpiry, setUploadExpiry] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [docsRes, kycRes, reqRes] = await Promise.all([
        api<{ items: DocumentItem[] }>('documents'),
        api<KycProfile>('kyc/me').catch(() => null),
        api<ComplianceRequirements>('compliance/requirements/KYC/0').catch(() => null),
      ]);

      setDocuments(docsRes.items || []);
      if (kycRes) setKycProfile(kycRes);
      if (reqRes) setRequirements(reqRes);
    } catch (err: any) {
      setError(err?.message || 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const files = fileInputRef.current?.files;
    if (!files || !files[0]) {
      setError('Please select a file to upload.');
      return;
    }

    try {
      setUploadLoading(true);
      setError(null);
      const formData = new FormData();
      formData.append('file', files[0]);
      formData.append('category', uploadCategory);
      formData.append('documentType', uploadDocType);
      if (uploadTitle) formData.append('title', uploadTitle);
      if (uploadContextType) formData.append('contextType', uploadContextType);
      if (uploadContextId) formData.append('contextId', uploadContextId);
      if (uploadExpiry) formData.append('expiryDate', uploadExpiry);

      await api('documents', {
        method: 'POST',
        body: formData,
      });

      setSuccessMsg('Document uploaded successfully to your private vault.');
      setUploadModalOpen(false);
      setUploadTitle('');
      setUploadExpiry('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Upload failed.');
    } finally {
      setUploadLoading(false);
    }
  }

  async function handleReplace(e: React.FormEvent) {
    e.preventDefault();
    if (!replaceDoc) return;
    const files = replaceFileInputRef.current?.files;
    if (!files || !files[0]) {
      setError('Please select a replacement file.');
      return;
    }

    try {
      setUploadLoading(true);
      setError(null);
      const formData = new FormData();
      formData.append('file', files[0]);
      if (uploadExpiry) formData.append('expiryDate', uploadExpiry);

      await api(`documents/${replaceDoc.id}/replace`, {
        method: 'POST',
        body: formData,
      });

      setSuccessMsg(`Version ${replaceDoc.version + 1} of "${replaceDoc.title}" submitted for review.`);
      setReplaceDoc(null);
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = '';
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Replacement upload failed.');
    } finally {
      setUploadLoading(false);
    }
  }

  async function handleSubmitReview(docId: number) {
    try {
      setError(null);
      await api(`documents/${docId}/submit-review`, { method: 'POST' });
      setSuccessMsg('Document submitted for compliance review.');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit document for review.');
    }
  }

  async function handleView(docId: number) {
    try {
      const linkRes = await api<{ url: string }>(`documents/${docId}/link`);
      if (linkRes?.url) {
        window.open(linkRes.url, '_blank');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to generate secure viewing link.');
    }
  }

  const filteredDocs = documents.filter((d) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'KYC') return d.category === 'KYC' || d.context_type === 'USER' || d.context_type === 'KYC';
    if (activeTab === 'PROPERTY') return d.category === 'PROPERTY' || d.category === 'OWNERSHIP' || d.context_type === 'PROPERTY';
    if (activeTab === 'APPLICATION') return d.category === 'RECEIPT' || d.context_type === 'APPLICATION';
    if (activeTab === 'TENANCY') return d.category === 'AGREEMENT' || d.context_type === 'TENANCY' || d.context_type === 'AGREEMENT';
    if (activeTab === 'EXPIRING') {
      if (!d.expiry_date) return false;
      const exp = new Date(d.expiry_date);
      const now = new Date();
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      return exp <= in30Days;
    }
    return true;
  });

  const verifiedCount = documents.filter((d) => d.verification_status === 'VERIFIED').length;
  const pendingCount = documents.filter((d) => d.verification_status === 'UNDER_REVIEW' || d.verification_status === 'UPLOADED').length;
  const rejectedCount = documents.filter((d) => d.verification_status === 'REJECTED').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Documents & Vault</h1>
          <p className="mt-1 text-[15px] text-muted">
            Secure, governed document evidence vault for KYC, properties, agreements, and tenancy compliance.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => loadData()}>
            Refresh
          </Button>
          <Button variant="primary" onClick={() => { setError(null); setUploadModalOpen(true); }}>
            + Upload Document
          </Button>
        </div>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {successMsg ? (
        <div className="rounded-card border border-seal/30 bg-seal-soft px-4 py-3 text-[14px] text-seal-deep flex justify-between items-center">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="font-bold text-seal hover:underline">Dismiss</button>
        </div>
      ) : null}

      {/* KYC Status Banner */}
      {kycProfile ? (
        <Card className="p-5 border-l-4 border-l-seal">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-seal-soft text-xl font-bold text-seal-deep">
                ID
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-display text-lg font-semibold">{kycProfile.record?.legal_name || 'My Identity Profile'}</p>
                  <StatusChip status={kycProfile.status} />
                </div>
                <p className="text-[13px] text-muted">
                  {kycProfile.status === 'VERIFIED'
                    ? `Verified by Odibrick Compliance on ${shortDate(kycProfile.record?.reviewed_at)}${kycProfile.record?.expires_at ? ` · Valid until ${shortDate(kycProfile.record.expires_at)}` : ''}`
                    : kycProfile.status === 'UNDER_REVIEW'
                    ? 'Your identification documents are currently under review by our compliance officers.'
                    : kycProfile.status === 'REJECTED'
                    ? `Verification rejected: ${kycProfile.record?.rejection_reason || 'Please upload updated clear documentation.'}`
                    : 'Submit your government identity proof to unlock transactions and listing.'}
                </p>
              </div>
            </div>
            {kycProfile.status !== 'VERIFIED' && kycProfile.status !== 'UNDER_REVIEW' ? (
              <Button size="sm" href="/dashboard/kyc">
                Complete KYC
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* Summary Stat Tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Total Vault Documents" value={documents.length} />
        <StatTile label="Verified Documents" value={verifiedCount} note="Compliant & Active" />
        <StatTile label="Pending Verification" value={pendingCount} note="Under Review" />
        <StatTile label="Action Required" value={rejectedCount} note="Rejected / Expired" />
      </div>

      {/* Compliance Requirements Checklist */}
      {requirements && requirements.items.length > 0 ? (
        <Card>
          <CardHeader
            title="Compliance Checklist"
            note={`${requirements.totalVerified} of ${requirements.totalRequired} mandatory documents verified`}
            action={
              <Badge tone={requirements.isCompliant ? 'seal' : 'ochre'}>
                {requirements.isCompliant ? 'FULLY COMPLIANT' : 'DOCUMENTS PENDING'}
              </Badge>
            }
          />
          <div className="divide-y divide-line/70">
            {requirements.items.map((item, idx) => (
              <div key={idx} className="flex flex-wrap items-center justify-between gap-4 p-4 text-[14px]">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${
                    item.verified ? 'bg-seal-soft text-seal-deep' : item.status === 'REJECTED' ? 'bg-alert/10 text-alert' : 'bg-paper text-muted border border-line'
                  }`}>
                    {item.verified ? '✓' : item.status === 'REJECTED' ? '!' : '·'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{item.name}</span>
                      {item.isMandatory ? <Badge tone="ochre">MANDATORY</Badge> : <Badge tone="neutral">OPTIONAL</Badge>}
                      <StatusChip status={item.status} />
                    </div>
                    <p className="text-[13px] text-muted">{item.description}</p>
                    {item.rejectionReason ? (
                      <p className="mt-1 text-[12px] text-alert">Correction needed: {item.rejectionReason}</p>
                    ) : null}
                  </div>
                </div>
                <div>
                  {item.actionRequired === 'UPLOAD' ? (
                    <Button size="sm" variant="secondary" onClick={() => {
                      setUploadCategory(item.category as any);
                      setUploadDocType(item.documentType);
                      setUploadTitle(item.name);
                      setUploadModalOpen(true);
                    }}>
                      Upload Now
                    </Button>
                  ) : item.actionRequired === 'REPLACE' ? (
                    <Button size="sm" variant="danger" onClick={() => {
                      const matched = documents.find((d) => d.document_type === item.documentType);
                      if (matched) setReplaceDoc(matched);
                      else {
                        setUploadCategory(item.category as any);
                        setUploadDocType(item.documentType);
                        setUploadTitle(item.name);
                        setUploadModalOpen(true);
                      }
                    }}>
                      Replace Document
                    </Button>
                  ) : item.verified ? (
                    <span className="font-mono text-[12px] text-seal-deep font-semibold">Ready & Verified</span>
                  ) : (
                    <span className="font-mono text-[12px] text-muted">Awaiting Verification</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto border-b border-line pb-2">
        {(
          [
            { key: 'ALL', label: `All Documents (${documents.length})` },
            { key: 'KYC', label: 'Identity & KYC' },
            { key: 'PROPERTY', label: 'Property & Title' },
            { key: 'APPLICATION', label: 'Application & Income' },
            { key: 'TENANCY', label: 'Tenancy & Agreements' },
            { key: 'EXPIRING', label: 'Expiring Soon' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap rounded-card px-4 py-2 text-[14px] font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-seal text-white'
                : 'bg-white text-muted hover:bg-paper hover:text-ink border border-line'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Document List */}
      {loading ? (
        <Card className="p-8 text-center text-muted">Loading vault documents...</Card>
      ) : filteredDocs.length === 0 ? (
        <EmptyState
          title="No documents in this view"
          body="Upload documents into your private vault to establish compliance verification across tenancies and properties."
          action={
            <Button onClick={() => setUploadModalOpen(true)}>+ Upload First Document</Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDocs.map((doc) => (
            <Card key={doc.id} className="flex flex-col justify-between p-5">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <Badge tone={doc.category === 'KYC' ? 'seal' : doc.category === 'PROPERTY' || doc.category === 'OWNERSHIP' ? 'ochre' : 'info'}>
                    {doc.document_type || doc.category}
                  </Badge>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px] text-muted border border-line">
                      v{doc.version}
                    </span>
                    <StatusChip status={doc.verification_status} />
                  </div>
                </div>

                <p className="mt-3 font-display text-base font-semibold text-ink line-clamp-1">{doc.title}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted">{doc.public_id}</p>

                {doc.rejection_reason ? (
                  <div className="mt-3 rounded-card border border-alert/30 bg-alert/5 p-2.5 text-[12px] text-alert">
                    <p className="font-semibold">Rejection Note:</p>
                    <p className="mt-0.5">{doc.rejection_reason}</p>
                  </div>
                ) : null}

                <div className="mt-4 space-y-1 text-[12px] text-muted">
                  <div className="flex justify-between">
                    <span>Uploaded:</span>
                    <span>{shortDate(doc.created_at)}</span>
                  </div>
                  {doc.expiry_date ? (
                    <div className="flex justify-between">
                      <span>Expires:</span>
                      <span className={new Date(doc.expiry_date) < new Date() ? 'font-bold text-alert' : ''}>
                        {shortDate(doc.expiry_date)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <span>File size:</span>
                    <span>{(doc.size_bytes / 1024).toFixed(0)} KB</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-line/70 pt-3">
                <button
                  type="button"
                  onClick={() => handleView(doc.id)}
                  className="text-[13px] font-semibold text-seal hover:underline"
                >
                  View / Download
                </button>

                <div className="flex gap-2">
                  {doc.verification_status === 'UPLOADED' ? (
                    <Button size="sm" variant="secondary" onClick={() => handleSubmitReview(doc.id)}>
                      Submit Review
                    </Button>
                  ) : null}
                  {doc.verification_status === 'REJECTED' || doc.verification_status === 'EXPIRED' ? (
                    <Button size="sm" variant="danger" onClick={() => setReplaceDoc(doc)}>
                      Replace v{doc.version + 1}
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Document Modal */}
      {uploadModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-lg rounded-card border border-line bg-white p-6 shadow-card">
            <h2 className="font-display text-xl font-semibold">Upload Document to Vault</h2>
            <p className="mt-1 text-[13px] text-muted">
              Uploaded files are stored encrypted in Odibrick's private vault and never exposed publicly.
            </p>

            <form onSubmit={handleUpload} className="mt-5 space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-ink">Category</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="mt-1 w-full rounded-card border border-line bg-white px-3 py-2 text-[14px]"
                  required
                >
                  <option value="KYC">KYC & Identity</option>
                  <option value="PROPERTY">Property Document</option>
                  <option value="OWNERSHIP">Ownership / Title</option>
                  <option value="AGREEMENT">Agreement / Contract</option>
                  <option value="RECEIPT">Tax / Payment Receipt</option>
                  <option value="INSPECTION">Inspection Report</option>
                  <option value="LEGAL">Legal Document</option>
                  <option value="OTHER">Other Evidence</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-ink">Document Type</label>
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value)}
                  className="mt-1 w-full rounded-card border border-line bg-white px-3 py-2 text-[14px]"
                  required
                >
                  <option value="IDENTITY_PROOF">Identity Proof (Aadhaar / PAN / Passport)</option>
                  <option value="ADDRESS_PROOF">Address Proof (Utility Bill / Passport)</option>
                  <option value="INCOME_PROOF">Income Proof (Salary Slip / ITR)</option>
                  <option value="BANK_PROOF">Bank Proof (Statement / Cheque)</option>
                  <option value="OWNERSHIP_PROOF">Proof of Ownership / Sale Deed</option>
                  <option value="PROPERTY_TAX_RECEIPT">Property Tax Receipt</option>
                  <option value="ENCUMBRANCE_CERTIFICATE">Encumbrance Certificate</option>
                  <option value="DRAFT_AGREEMENT">Draft Agreement</option>
                  <option value="EXECUTED_AGREEMENT">Executed Agreement</option>
                  <option value="STAMPING_DOCUMENT">Stamping / E-Stamp Certificate</option>
                  <option value="PHOTO">Profile / Verification Photo</option>
                  <option value="OTHER">Other Document</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-ink">Title / Label</label>
                <input
                  type="text"
                  placeholder="e.g. Aadhaar Card Front & Back"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="mt-1 w-full rounded-card border border-line px-3 py-2 text-[14px]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-ink">Context (Optional)</label>
                  <select
                    value={uploadContextType}
                    onChange={(e) => setUploadContextType(e.target.value)}
                    className="mt-1 w-full rounded-card border border-line bg-white px-3 py-2 text-[13px]"
                  >
                    <option value="USER">User KYC</option>
                    <option value="PROPERTY">Property</option>
                    <option value="APPLICATION">Application</option>
                    <option value="TENANCY">Tenancy</option>
                    <option value="LEGAL_CASE">Legal Case</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-ink">Context ID (Optional)</label>
                  <input
                    type="number"
                    placeholder="e.g. Property ID"
                    value={uploadContextId}
                    onChange={(e) => setUploadContextId(e.target.value)}
                    className="mt-1 w-full rounded-card border border-line px-3 py-2 text-[13px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-ink">Expiry Date (If applicable)</label>
                <input
                  type="date"
                  value={uploadExpiry}
                  onChange={(e) => setUploadExpiry(e.target.value)}
                  className="mt-1 w-full rounded-card border border-line px-3 py-2 text-[14px]"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-ink">Select File (PDF, PNG, JPG)</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="mt-1 w-full text-[13px]"
                  required
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setUploadModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploadLoading}>
                  {uploadLoading ? 'Uploading...' : 'Upload & Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Replace Document Version Modal */}
      {replaceDoc ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-lg rounded-card border border-line bg-white p-6 shadow-card">
            <h2 className="font-display text-xl font-semibold">Upload Replacement (v{replaceDoc.version + 1})</h2>
            <p className="mt-1 text-[13px] text-muted">
              Uploading a replacement for <span className="font-semibold text-ink">{replaceDoc.title}</span>. The previous version will be preserved in audit history.
            </p>

            {replaceDoc.rejection_reason ? (
              <div className="mt-3 rounded-card border border-alert/30 bg-alert/5 p-3 text-[13px] text-alert">
                <p className="font-semibold">Reason replacement was requested:</p>
                <p className="mt-0.5">{replaceDoc.rejection_reason}</p>
              </div>
            ) : null}

            <form onSubmit={handleReplace} className="mt-5 space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-ink">Updated Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={uploadExpiry}
                  onChange={(e) => setUploadExpiry(e.target.value)}
                  className="mt-1 w-full rounded-card border border-line px-3 py-2 text-[14px]"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-ink">New File Version (PDF, PNG, JPG)</label>
                <input
                  type="file"
                  ref={replaceFileInputRef}
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="mt-1 w-full text-[13px]"
                  required
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setReplaceDoc(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploadLoading}>
                  {uploadLoading ? 'Submitting...' : `Submit Version ${replaceDoc.version + 1}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
