import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { newPublicId } from '../../common/util/ids';
import { pageParams, paginate } from '../../common/util/pagination';
import {
  AssignExceptionDto,
  CreateExceptionDto,
  OverrideComplianceDto,
  ResolveExceptionDto,
} from './compliance.dto';

export interface RequiredDocRule {
  documentType: string;
  name: string;
  description: string;
  isMandatory: boolean;
  category: string;
}

const REQUIREMENT_RULES: Record<string, RequiredDocRule[]> = {
  APPLICATION: [
    {
      documentType: 'IDENTITY_PROOF',
      name: 'Identity Proof',
      description: 'Government-issued photo identification (Aadhaar, Passport, PAN or DL)',
      isMandatory: true,
      category: 'KYC',
    },
    {
      documentType: 'ADDRESS_PROOF',
      name: 'Address Proof',
      description: 'Proof of current residence (Aadhaar, Utility Bill, or Rental Agreement)',
      isMandatory: true,
      category: 'KYC',
    },
    {
      documentType: 'INCOME_PROOF',
      name: 'Income Proof',
      description: 'Recent salary slips (last 3 months) or Income Tax Return',
      isMandatory: true,
      category: 'OTHER',
    },
    {
      documentType: 'BANK_PROOF',
      name: 'Bank Statement',
      description: 'Bank statement of the last 6 months or cancelled cheque',
      isMandatory: true,
      category: 'OTHER',
    },
    {
      documentType: 'REFERENCE_DOCUMENT',
      name: 'Reference Letter',
      description: 'Letter of reference from employer or previous landlord',
      isMandatory: false,
      category: 'OTHER',
    },
  ],
  PROPERTY: [
    {
      documentType: 'OWNERSHIP_PROOF',
      name: 'Proof of Ownership / Sale Deed',
      description: 'Registered sale deed or title transfer deed establishing property ownership',
      isMandatory: true,
      category: 'OWNERSHIP',
    },
    {
      documentType: 'PROPERTY_TAX_RECEIPT',
      name: 'Property Tax Receipt',
      description: 'Latest municipal property tax paid challan / receipt',
      isMandatory: true,
      category: 'RECEIPT',
    },
    {
      documentType: 'ENCUMBRANCE_CERTIFICATE',
      name: 'Encumbrance Certificate (EC)',
      description: 'Nil-encumbrance certificate issued by the sub-registrar office',
      isMandatory: true,
      category: 'PROPERTY',
    },
    {
      documentType: 'RERA_DOCUMENT',
      name: 'RERA Certificate',
      description: 'RERA project registration or compliance certificate if applicable',
      isMandatory: false,
      category: 'PROPERTY',
    },
    {
      documentType: 'PROPERTY_PHOTO',
      name: 'Verification Photos',
      description: 'High quality interior, exterior and entrance verification photographs',
      isMandatory: false,
      category: 'PROPERTY',
    },
  ],
  USER: [
    {
      documentType: 'IDENTITY_PROOF',
      name: 'Identity Proof',
      description: 'Aadhaar Card, Passport, PAN Card, or Voter ID',
      isMandatory: true,
      category: 'KYC',
    },
    {
      documentType: 'ADDRESS_PROOF',
      name: 'Address Proof',
      description: 'Valid address proof document with current residential address',
      isMandatory: true,
      category: 'KYC',
    },
    {
      documentType: 'PHOTO',
      name: 'Profile Photograph',
      description: 'Recent clear passport-size facial photograph',
      isMandatory: false,
      category: 'KYC',
    },
    {
      documentType: 'BUSINESS_REGISTRATION',
      name: 'Business Registration / GST',
      description: 'GST certificate or Certificate of Incorporation for commercial entities',
      isMandatory: false,
      category: 'KYC',
    },
  ],
  KYC: [
    {
      documentType: 'IDENTITY_PROOF',
      name: 'Identity Proof',
      description: 'Aadhaar Card, Passport, PAN Card, or Voter ID',
      isMandatory: true,
      category: 'KYC',
    },
    {
      documentType: 'ADDRESS_PROOF',
      name: 'Address Proof',
      description: 'Valid address proof document with current residential address',
      isMandatory: true,
      category: 'KYC',
    },
    {
      documentType: 'PHOTO',
      name: 'Profile Photograph',
      description: 'Recent clear passport-size facial photograph',
      isMandatory: false,
      category: 'KYC',
    },
  ],
  LEGAL_CASE: [
    {
      documentType: 'IDENTITY_PROOF',
      name: 'Litigant Identification',
      description: 'Government photo identification of client / applicant',
      isMandatory: true,
      category: 'LEGAL',
    },
    {
      documentType: 'PROPERTY_DOCUMENT',
      name: 'Disputed Property Title / Record',
      description: 'Relevant property title deed or municipal assessment record',
      isMandatory: true,
      category: 'LEGAL',
    },
    {
      documentType: 'LEGAL_NOTICE',
      name: 'Legal Notice / Petition Copy',
      description: 'Copy of issued legal notice or court pleadings',
      isMandatory: true,
      category: 'LEGAL',
    },
  ],
  AGREEMENT: [
    {
      documentType: 'DRAFT_AGREEMENT',
      name: 'Draft Agreement',
      description: 'Unsigned approved draft agreement terms',
      isMandatory: true,
      category: 'AGREEMENT',
    },
    {
      documentType: 'EXECUTED_AGREEMENT',
      name: 'Executed Agreement',
      description: 'Fully executed and signed copy of the tenancy agreement',
      isMandatory: true,
      category: 'AGREEMENT',
    },
    {
      documentType: 'STAMPING_DOCUMENT',
      name: 'E-Stamp Certificate',
      description: 'E-stamping receipt / stamp duty certificate',
      isMandatory: true,
      category: 'AGREEMENT',
    },
    {
      documentType: 'REGISTRATION_DOCUMENT',
      name: 'Sub-Registrar Registration Copy',
      description: 'Registered copy from the sub-registrar office',
      isMandatory: false,
      category: 'AGREEMENT',
    },
  ],
  TENANCY: [
    {
      documentType: 'EXECUTED_AGREEMENT',
      name: 'Executed Tenancy Agreement',
      description: 'Signed rental contract binding owner and tenant',
      isMandatory: true,
      category: 'AGREEMENT',
    },
    {
      documentType: 'TENANT_KYC',
      name: 'Tenant Verified KYC',
      description: 'Approved government KYC verification for the tenant',
      isMandatory: true,
      category: 'KYC',
    },
    {
      documentType: 'OWNER_KYC',
      name: 'Owner Verified KYC',
      description: 'Approved government KYC verification for the property owner',
      isMandatory: true,
      category: 'KYC',
    },
    {
      documentType: 'PROPERTY_DOCUMENT',
      name: 'Property Document',
      description: 'Proof of title or authorized management agreement',
      isMandatory: true,
      category: 'PROPERTY',
    },
    {
      documentType: 'INSPECTION_REPORT',
      name: 'Move-in Inspection Report',
      description: 'Signed check-in inventory and inspection condition report',
      isMandatory: false,
      category: 'INSPECTION',
    },
  ],
  DISPUTE: [
    {
      documentType: 'EVIDENCE_DOCUMENT',
      name: 'Dispute Evidence Document',
      description: 'Photographic, financial, or communication evidence of the dispute',
      isMandatory: true,
      category: 'DISPUTE',
    },
  ],
  MAINTENANCE: [
    {
      documentType: 'EVIDENCE_DOCUMENT',
      name: 'Maintenance Request Photo / Invoice',
      description: 'Issue photo or vendor estimate/invoice',
      isMandatory: true,
      category: 'MAINTENANCE',
    },
  ],
  SUPPORT: [
    {
      documentType: 'EVIDENCE_DOCUMENT',
      name: 'Supporting Document',
      description: 'Support case attachment',
      isMandatory: false,
      category: 'OTHER',
    },
  ],
};

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  /** Deterministic requirement resolver for any context */
  async resolveRequiredDocuments(contextType: string, contextId: number | string) {
    const normContext = (contextType || 'OTHER').toUpperCase();
    const rules = REQUIREMENT_RULES[normContext] || [
      {
        documentType: 'EVIDENCE_DOCUMENT',
        name: 'Supporting Document',
        description: 'General supporting compliance document',
        isMandatory: true,
        category: 'OTHER',
      },
    ];

    const numericContextId = Number(contextId) || 0;

    // Fetch existing documents for this context
    const attachedDocs = await this.db.query<any>(
      `SELECT d.id, d.public_id, d.title, d.category, d.document_type, d.verification_status,
              d.version, d.parent_id, d.is_active, d.expiry_date, d.rejection_reason,
              d.created_at, d.updated_at
         FROM documents d
        WHERE d.deleted_at IS NULL
          AND d.is_active = 1
          AND (
            (d.context_type = ? AND d.context_id = ?)
            OR (d.entity_type = ? AND d.entity_id = ?)
            ${normContext === 'USER' || normContext === 'KYC' ? 'OR (d.owner_user_id = ? AND d.category = "KYC")' : ''}
          )
        ORDER BY d.created_at DESC`,
      normContext === 'USER' || normContext === 'KYC'
        ? [normContext, numericContextId, normContext.toLowerCase(), numericContextId, numericContextId]
        : [normContext, numericContextId, normContext.toLowerCase(), numericContextId],
    );

    // If Tenancy context, also check Tenant & Owner KYC records
    let tenantKycRecord: any = null;
    let ownerKycRecord: any = null;
    if (normContext === 'TENANCY' && numericContextId > 0) {
      const tenancy = await this.db.one<any>(
        'SELECT owner_user_id, tenant_user_id FROM tenancies WHERE id = ?',
        [numericContextId],
      );
      if (tenancy) {
        if (tenancy.tenant_user_id) {
          tenantKycRecord = await this.db.one<any>(
            'SELECT status FROM kyc_records WHERE user_id = ? ORDER BY id DESC LIMIT 1',
            [tenancy.tenant_user_id],
          );
        }
        if (tenancy.owner_user_id) {
          ownerKycRecord = await this.db.one<any>(
            'SELECT status FROM kyc_records WHERE user_id = ? ORDER BY id DESC LIMIT 1',
            [tenancy.owner_user_id],
          );
        }
      }
    }

    const items = rules.map((rule) => {
      // Check for tenancy-specific KYC rules
      if (normContext === 'TENANCY' && rule.documentType === 'TENANT_KYC') {
        const isVerified = tenantKycRecord?.status === 'VERIFIED';
        const isUnderReview = ['UNDER_REVIEW', 'SUBMITTED', 'IN_REVIEW'].includes(tenantKycRecord?.status);
        const isRejected = tenantKycRecord?.status === 'REJECTED';
        const isExpired = tenantKycRecord?.status === 'EXPIRED';

        const status = isVerified
          ? 'VERIFIED'
          : isUnderReview
            ? 'UNDER_REVIEW'
            : isRejected
              ? 'REJECTED'
              : isExpired
                ? 'EXPIRED'
                : 'MISSING';

        return {
          documentType: rule.documentType,
          name: rule.name,
          description: rule.description,
          isMandatory: rule.isMandatory,
          category: rule.category,
          submitted: !!tenantKycRecord && tenantKycRecord.status !== 'NOT_STARTED',
          documentId: null,
          publicId: null,
          version: 1,
          status,
          verified: isVerified,
          expired: isExpired,
          rejectionReason: null,
          expiryDate: null,
          actionRequired: isVerified ? 'NONE' : status === 'MISSING' ? 'UPLOAD' : status === 'REJECTED' ? 'REPLACE' : 'AWAIT_REVIEW',
        };
      }

      if (normContext === 'TENANCY' && rule.documentType === 'OWNER_KYC') {
        const isVerified = ownerKycRecord?.status === 'VERIFIED';
        const isUnderReview = ['UNDER_REVIEW', 'SUBMITTED', 'IN_REVIEW'].includes(ownerKycRecord?.status);
        const isRejected = ownerKycRecord?.status === 'REJECTED';
        const isExpired = ownerKycRecord?.status === 'EXPIRED';

        const status = isVerified
          ? 'VERIFIED'
          : isUnderReview
            ? 'UNDER_REVIEW'
            : isRejected
              ? 'REJECTED'
              : isExpired
                ? 'EXPIRED'
                : 'MISSING';

        return {
          documentType: rule.documentType,
          name: rule.name,
          description: rule.description,
          isMandatory: rule.isMandatory,
          category: rule.category,
          submitted: !!ownerKycRecord && ownerKycRecord.status !== 'NOT_STARTED',
          documentId: null,
          publicId: null,
          version: 1,
          status,
          verified: isVerified,
          expired: isExpired,
          rejectionReason: null,
          expiryDate: null,
          actionRequired: isVerified ? 'NONE' : status === 'MISSING' ? 'UPLOAD' : status === 'REJECTED' ? 'REPLACE' : 'AWAIT_REVIEW',
        };
      }

      // Match document by documentType OR category if generic
      const matched = attachedDocs.find(
        (d: any) =>
          d.document_type === rule.documentType ||
          (d.document_type === 'OTHER' && d.category === rule.category),
      );

      if (!matched) {
        return {
          documentType: rule.documentType,
          name: rule.name,
          description: rule.description,
          isMandatory: rule.isMandatory,
          category: rule.category,
          submitted: false,
          documentId: null,
          publicId: null,
          version: null,
          status: 'MISSING',
          verified: false,
          expired: false,
          rejectionReason: null,
          expiryDate: null,
          actionRequired: rule.isMandatory ? 'UPLOAD' : 'NONE',
        };
      }

      const isExpired =
        matched.verification_status === 'EXPIRED' ||
        (matched.expiry_date && new Date(matched.expiry_date) < new Date());

      const status = isExpired
        ? 'EXPIRED'
        : (matched.verification_status as 'VERIFIED' | 'UNDER_REVIEW' | 'REJECTED' | 'UPLOADED');

      const isVerified = status === 'VERIFIED';

      let actionRequired: 'UPLOAD' | 'REPLACE' | 'AWAIT_REVIEW' | 'NONE' = 'NONE';
      if (status === 'REJECTED' || status === 'EXPIRED') {
        actionRequired = 'REPLACE';
      } else if (status === 'UNDER_REVIEW' || status === 'UPLOADED') {
        actionRequired = 'AWAIT_REVIEW';
      }

      return {
        documentType: rule.documentType,
        name: rule.name,
        description: rule.description,
        isMandatory: rule.isMandatory,
        category: rule.category,
        submitted: true,
        documentId: matched.id,
        publicId: matched.public_id,
        title: matched.title,
        version: matched.version,
        status,
        verified: isVerified,
        expired: isExpired,
        rejectionReason: matched.rejection_reason || null,
        expiryDate: matched.expiry_date || null,
        actionRequired,
      };
    });

    const totalRequired = items.filter((i) => i.isMandatory).length;
    const totalSubmitted = items.filter((i) => i.submitted).length;
    const totalVerified = items.filter((i) => i.verified).length;
    const missingCount = items.filter((i) => i.isMandatory && !i.submitted).length;
    const pendingCount = items.filter((i) => i.status === 'UNDER_REVIEW' || i.status === 'UPLOADED').length;
    const rejectedCount = items.filter((i) => i.status === 'REJECTED').length;
    const expiredCount = items.filter((i) => i.expired).length;

    // Compliant iff every mandatory document is submitted, verified, and not expired
    const isCompliant = items
      .filter((i) => i.isMandatory)
      .every((i) => i.submitted && i.verified && !i.expired);

    return {
      contextType: normContext,
      contextId: numericContextId,
      isCompliant,
      totalRequired,
      totalSubmitted,
      totalVerified,
      missingCount,
      pendingCount,
      rejectedCount,
      expiredCount,
      items,
    };
  }

  /** Admin Compliance Analytics & KPIs */
  async getAdminComplianceAnalytics() {
    const [
      pendingKyc,
      pendingDocs,
      rejectedDocs,
      expiringSoonDocs,
      expiredDocs,
      openExceptions,
      verifiedTodayDocs,
      verifiedTodayKyc,
    ] = await Promise.all([
      this.db.one<{ count: number }>(
        "SELECT COUNT(*) AS count FROM kyc_records WHERE status IN ('UNDER_REVIEW', 'SUBMITTED', 'IN_REVIEW')",
      ),
      this.db.one<{ count: number }>(
        "SELECT COUNT(*) AS count FROM documents WHERE verification_status = 'UNDER_REVIEW' AND is_active = 1 AND deleted_at IS NULL",
      ),
      this.db.one<{ count: number }>(
        "SELECT COUNT(*) AS count FROM documents WHERE verification_status = 'REJECTED' AND is_active = 1 AND deleted_at IS NULL",
      ),
      this.db.one<{ count: number }>(
        `SELECT COUNT(*) AS count FROM documents
          WHERE expiry_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY)
            AND is_active = 1 AND deleted_at IS NULL`,
      ),
      this.db.one<{ count: number }>(
        `SELECT COUNT(*) AS count FROM documents
          WHERE (verification_status = 'EXPIRED' OR (expiry_date < CURRENT_DATE AND expiry_date IS NOT NULL))
            AND is_active = 1 AND deleted_at IS NULL`,
      ),
      this.db.one<{ count: number }>(
        "SELECT COUNT(*) AS count FROM compliance_exceptions WHERE status IN ('OPEN', 'IN_REVIEW')",
      ),
      this.db.one<{ count: number }>(
        "SELECT COUNT(*) AS count FROM documents WHERE verification_status = 'VERIFIED' AND DATE(verified_at) = CURRENT_DATE",
      ),
      this.db.one<{ count: number }>(
        "SELECT COUNT(*) AS count FROM kyc_records WHERE status = 'VERIFIED' AND DATE(reviewed_at) = CURRENT_DATE",
      ),
    ]);

    return {
      pendingKyc: Number(pendingKyc?.count || 0),
      pendingDocuments: Number(pendingDocs?.count || 0),
      rejectedDocuments: Number(rejectedDocs?.count || 0),
      expiringSoon: Number(expiringSoonDocs?.count || 0),
      expiredDocuments: Number(expiredDocs?.count || 0),
      complianceExceptions: Number(openExceptions?.count || 0),
      verifiedToday: Number(verifiedTodayDocs?.count || 0) + Number(verifiedTodayKyc?.count || 0),
    };
  }

  /** Compliance Exceptions Management */
  async listExceptions(
    filters: {
      status?: string;
      category?: string;
      contextType?: string;
      severity?: string;
      search?: string;
      page?: number;
      perPage?: number;
    },
  ) {
    const { page: p, perPage: pp, offset } = pageParams(filters.page, filters.perPage);
    const where: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filters.status) {
      where.push('ce.status = ?');
      params.push(filters.status.toUpperCase());
    }
    if (filters.category) {
      where.push('ce.category = ?');
      params.push(filters.category.toUpperCase());
    }
    if (filters.contextType) {
      where.push('ce.context_type = ?');
      params.push(filters.contextType.toUpperCase());
    }
    if (filters.severity) {
      where.push('ce.severity = ?');
      params.push(filters.severity.toUpperCase());
    }
    if (filters.search) {
      where.push('(ce.title LIKE ? OR ce.public_id LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    const totalRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM compliance_exceptions ce
         LEFT JOIN users u ON u.id = ce.user_id
        WHERE ${where.join(' AND ')}`,
      params,
    );

    const rows = await this.db.query(
      `SELECT ce.*, u.full_name AS user_name, u.email AS user_email,
              a.full_name AS assignee_name, r.full_name AS resolver_name
         FROM compliance_exceptions ce
         LEFT JOIN users u ON u.id = ce.user_id
         LEFT JOIN users a ON a.id = ce.assigned_to
         LEFT JOIN users r ON r.id = ce.resolved_by
        WHERE ${where.join(' AND ')}
        ORDER BY FIELD(ce.severity, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'), ce.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );

    return paginate(rows, totalRow?.total ?? 0, p, pp);
  }

  async createException(dto: CreateExceptionDto, req?: Request) {
    const publicId = `ODB-EXC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    const id = await this.db.insert('compliance_exceptions', {
      public_id: publicId,
      category: dto.category,
      context_type: dto.contextType.toUpperCase(),
      context_id: dto.contextId,
      user_id: dto.userId ?? null,
      document_id: dto.documentId ?? null,
      title: dto.title,
      description: dto.description ?? null,
      severity: dto.severity ?? 'MEDIUM',
      status: 'OPEN',
    });

    return { id, publicId, status: 'OPEN' };
  }

  async resolveException(user: AuthUser, id: number, dto: ResolveExceptionDto, req?: Request) {
    const exc = await this.db.one<any>('SELECT * FROM compliance_exceptions WHERE id = ?', [id]);
    if (!exc) throw new NotFoundException('Compliance exception not found.');

    await this.db.update('compliance_exceptions', id, {
      status: 'RESOLVED',
      resolution_notes: dto.resolutionNotes,
      resolved_by: user.id,
      resolved_at: new Date(),
    });

    await this.audit.record({
      actor: user,
      action: 'compliance.exception_resolved',
      objectType: 'compliance_exception',
      objectId: id,
      metadata: { resolutionNotes: dto.resolutionNotes },
      req,
    });

    return { id, status: 'RESOLVED', resolvedAt: new Date() };
  }

  async overrideCompliance(user: AuthUser, id: number, dto: OverrideComplianceDto, req?: Request) {
    const exc = await this.db.one<any>('SELECT * FROM compliance_exceptions WHERE id = ?', [id]);
    if (!exc) throw new NotFoundException('Compliance exception not found.');
    if (!dto.overrideReason || dto.overrideReason.trim().length < 5) {
      throw new BadRequestException('A mandatory override reason is required.');
    }

    await this.db.update('compliance_exceptions', id, {
      status: 'OVERRIDDEN',
      override_reason: dto.overrideReason.trim(),
      resolution_notes: dto.resolutionNotes ?? null,
      resolved_by: user.id,
      resolved_at: new Date(),
    });

    await this.audit.record({
      actor: user,
      action: 'compliance.override',
      objectType: 'compliance_exception',
      objectId: id,
      metadata: {
        category: exc.category,
        contextType: exc.context_type,
        contextId: exc.context_id,
        overrideReason: dto.overrideReason.trim(),
      },
      req,
    });

    return { id, status: 'OVERRIDDEN', overrideReason: dto.overrideReason.trim() };
  }

  async assignException(user: AuthUser, id: number, dto: AssignExceptionDto, req?: Request) {
    const exc = await this.db.one<any>('SELECT * FROM compliance_exceptions WHERE id = ?', [id]);
    if (!exc) throw new NotFoundException('Compliance exception not found.');

    await this.db.update('compliance_exceptions', id, {
      assigned_to: dto.assignedTo,
      status: exc.status === 'OPEN' ? 'IN_REVIEW' : exc.status,
    });

    return { id, assignedTo: dto.assignedTo };
  }

  /** Idempotent Batch Expiry Processor */
  async processExpiry(actor?: AuthUser) {
    const now = new Date();

    // 1. Documents expiring within 30 days
    const docs30d = await this.db.query<any>(
      `SELECT d.id, d.title, d.owner_user_id, d.expiry_date
         FROM documents d
        WHERE d.expiry_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY)
          AND d.expiry_notified_30d = 0
          AND d.is_active = 1
          AND d.deleted_at IS NULL`,
    );

    for (const doc of docs30d) {
      await this.notify.send(doc.owner_user_id, 'DOCUMENT_EXPIRING_SOON', {
        title: 'Document expiring soon (30 days)',
        body: `Your document "${doc.title}" expires on ${doc.expiry_date}. Please prepare a renewed version.`,
        severity: 'WARNING',
        actionUrl: '/dashboard/documents',
      });
      await this.db.execute('UPDATE documents SET expiry_notified_30d = 1 WHERE id = ?', [doc.id]);
    }

    // 2. Documents expiring within 7 days
    const docs7d = await this.db.query<any>(
      `SELECT d.id, d.title, d.owner_user_id, d.expiry_date
         FROM documents d
        WHERE d.expiry_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)
          AND d.expiry_notified_7d = 0
          AND d.is_active = 1
          AND d.deleted_at IS NULL`,
    );

    for (const doc of docs7d) {
      await this.notify.send(doc.owner_user_id, 'DOCUMENT_EXPIRING_SOON', {
        title: 'Document expiring in 7 days',
        body: `Your document "${doc.title}" expires soon (${doc.expiry_date}). Please upload a valid replacement immediately.`,
        severity: 'ACTION',
        actionUrl: '/dashboard/documents',
      });
      await this.db.execute('UPDATE documents SET expiry_notified_7d = 1 WHERE id = ?', [doc.id]);
    }

    // 3. Documents that have expired
    const docsExpired = await this.db.query<any>(
      `SELECT d.id, d.title, d.owner_user_id, d.expiry_date, d.context_type, d.context_id
         FROM documents d
        WHERE d.expiry_date < CURRENT_DATE
          AND d.is_active = 1
          AND d.deleted_at IS NULL
          AND (d.verification_status != 'EXPIRED' OR d.expiry_notified_expired = 0)`,
    );

    for (const doc of docsExpired) {
      await this.db.execute(
        "UPDATE documents SET verification_status = 'EXPIRED', expiry_notified_expired = 1 WHERE id = ?",
        [doc.id],
      );

      await this.notify.send(doc.owner_user_id, 'DOCUMENT_EXPIRED', {
        title: 'Document expired',
        body: `Your document "${doc.title}" has expired. Please upload an updated valid document.`,
        severity: 'CRITICAL',
        actionUrl: '/dashboard/documents',
      });

      await this.audit.record({
        actor,
        action: 'document.expired',
        objectType: 'document',
        objectId: doc.id,
        metadata: { title: doc.title, expiryDate: doc.expiry_date },
      });
    }

    // 4. KYC records that have expired
    const kycExpired = await this.db.query<any>(
      `SELECT k.id, k.user_id, k.expires_at
         FROM kyc_records k
        WHERE k.expires_at < CURRENT_DATE
          AND k.status = 'VERIFIED'`,
    );

    for (const kyc of kycExpired) {
      await this.db.execute("UPDATE kyc_records SET status = 'EXPIRED' WHERE id = ?", [kyc.id]);
      await this.notify.send(kyc.user_id, 'KYC_EXPIRED', {
        title: 'KYC verification expired',
        body: 'Your identity verification record has expired. Please update and re-submit your KYC documents.',
        severity: 'CRITICAL',
        actionUrl: '/dashboard/documents',
      });
      await this.audit.record({
        actor,
        action: 'kyc.expired',
        objectType: 'kyc',
        objectId: kyc.id,
      });
    }

    return {
      processedAt: now,
      documentsNotified30d: docs30d.length,
      documentsNotified7d: docs7d.length,
      documentsExpired: docsExpired.length,
      kycExpired: kycExpired.length,
    };
  }
}
