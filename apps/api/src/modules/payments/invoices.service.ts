import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { createHash } from 'crypto';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth.types';
import {
  CancelInvoiceDto,
  GenerateInvoiceDto,
  InvoiceLineItemDto,
  InvoiceQueryDto,
  UpdateIssuerConfigDto,
} from './invoices.dto';
import { generateInvoicePdfBuffer } from './pdf-generator.util';

export interface IssuerProfile {
  legalName: string;
  tradeName?: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  country?: string;
  pincode?: string;
  gstin?: string;
  pan?: string;
  email?: string;
  phone?: string;
  invoicePrefix?: string;
  terms?: string;
}

const DEFAULT_ISSUER: IssuerProfile = {
  legalName: 'Odibrick Real Estate Technologies Pvt Ltd',
  tradeName: 'Odibrick Platform',
  address: 'Level 4, Embassy Tech Village, Outer Ring Road, Devarabisanahalli',
  city: 'Bengaluru',
  state: 'Karnataka',
  stateCode: '29',
  country: 'India',
  pincode: '560103',
  gstin: '29AAAAO1234A1Z5',
  pan: 'AAAAO1234A',
  email: 'finance@odibrick.com',
  phone: '+91 80 4000 1234',
  invoicePrefix: 'ODB',
  terms:
    '1. This tax invoice is issued in accordance with the provisions of the Goods and Services Tax Act.\n2. All payments are subject to the Odibrick Platform Terms of Service.\n3. This is a computer-generated document and does not require a physical signature.',
};

// Platform revenue purposes eligible for GST tax invoice generation
const ELIGIBLE_PURPOSES = new Set([
  'COMMISSION',
  'SERVICE_FEE',
  'LEGAL_FEE',
  'MARKETING_PACKAGE',
]);

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Determine if an actor is platform management.
   */
  private isManagement(user: AuthUser): boolean {
    const roles = user.roles || [];
    return (
      roles.includes('SUPER_ADMIN') ||
      roles.includes('ADMIN') ||
      roles.includes('LEGAL_TEAM') ||
      roles.includes('PROPERTY_MANAGER') ||
      roles.includes('SUPPORT_TEAM')
    );
  }

  /**
   * Retrieve issuer configuration from platform_settings or fallback.
   */
  async getIssuerProfile(): Promise<IssuerProfile> {
    try {
      const row = await this.db.one<any>(
        "SELECT value_json FROM platform_settings WHERE setting_key = 'invoice.issuer_profile'",
      );
      if (row && row.value_json) {
        const parsed =
          typeof row.value_json === 'string'
            ? JSON.parse(row.value_json)
            : row.value_json;
        return { ...DEFAULT_ISSUER, ...parsed };
      }
    } catch {
      // fallback
    }
    return DEFAULT_ISSUER;
  }

  /**
   * Update issuer profile (Management only).
   */
  async updateIssuerProfile(
    user: AuthUser,
    dto: UpdateIssuerConfigDto,
    req?: Request,
  ): Promise<IssuerProfile> {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can update invoice configuration.');
    }

    const merged = { ...DEFAULT_ISSUER, ...dto };
    const jsonStr = JSON.stringify(merged);

    const existing = await this.db.one<any>(
      "SELECT setting_key FROM platform_settings WHERE setting_key = 'invoice.issuer_profile'",
    );

    if (existing) {
      await this.db.execute(
        "UPDATE platform_settings SET value_json = ?, updated_by = ? WHERE setting_key = 'invoice.issuer_profile'",
        [jsonStr, user.id],
      );
    } else {
      await this.db.insert('platform_settings', {
        setting_key: 'invoice.issuer_profile',
        value_json: jsonStr,
        group_name: 'finance',
        description: 'Odibrick legal entity & GST issuer configuration',
        updated_by: user.id,
      });
    }

    await this.audit.record({
      actor: user,
      action: 'invoice.configuration_updated',
      objectType: 'setting',
      metadata: { key: 'invoice.issuer_profile', issuer: merged },
      req,
    });

    return merged;
  }

  /**
   * Get tax rate configured in platform_settings (default 18%).
   */
  async getGstRate(): Promise<number> {
    try {
      const row = await this.db.one<any>(
        "SELECT value_json FROM platform_settings WHERE setting_key = 'tax.gst_rate'",
      );
      if (row && row.value_json) {
        const val = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
        const num = parseFloat(val);
        if (!isNaN(num) && num >= 0) return num;
      }
    } catch {
      // fallback
    }
    return 18.0;
  }

  /**
   * Centralized decimal-safe tax calculation engine.
   */
  calculateTaxBreakdown(
    totalAmount: number,
    taxAmount: number,
    gstRate: number,
    customerState?: string,
    issuerState?: string,
  ) {
    const total = Math.round(Number(totalAmount) * 100) / 100;
    let subtotal: number;
    let totalTax: number;

    if (taxAmount > 0 && taxAmount < total) {
      totalTax = Math.round(Number(taxAmount) * 100) / 100;
      subtotal = Math.round((total - totalTax) * 100) / 100;
    } else {
      // Reverse calculate taxable value from total and rate
      subtotal = Math.round((total / (1 + gstRate / 100)) * 100) / 100;
      totalTax = Math.round((total - subtotal) * 100) / 100;
    }

    const cState = (customerState || '').trim().toLowerCase();
    const iState = (issuerState || 'Karnataka').trim().toLowerCase();
    const isIntraState = !cState || cState === iState;

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (isIntraState) {
      cgst = Math.round((totalTax / 2) * 100) / 100;
      sgst = Math.round((totalTax - cgst) * 100) / 100; // prevent 1 paisa rounding skew
      igst = 0;
    } else {
      cgst = 0;
      sgst = 0;
      igst = totalTax;
    }

    return {
      subtotal,
      totalTax,
      total,
      gstRate,
      cgst,
      sgst,
      igst,
      isIntraState,
    };
  }

  /**
   * Generate sequential, deterministic invoice number (e.g. ODB-INV-2026-000001).
   */
  private async generateNextInvoiceNumber(prefix = 'ODB'): Promise<string> {
    const year = new Date().getFullYear();
    const maxRow = await this.db.one<any>(
      'SELECT COALESCE(MAX(id), 0) AS max_id FROM invoices',
    );
    const nextSeq = ((maxRow?.max_id || 0) + 1);
    const padded = String(nextSeq).padStart(6, '0');
    return `${prefix}-INV-${year}-${padded}`;
  }

  /**
   * Generate Invoice for an eligible settled payment.
   */
  async generateInvoiceForPayment(
    user: AuthUser,
    paymentId: number,
    dto?: GenerateInvoiceDto,
    req?: Request,
  ) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can generate financial invoices.');
    }

    // 1. Fetch Payment
    const payment = await this.db.one<any>(
      `SELECT p.*,
              u.full_name, u.email AS payer_email, u.phone AS payer_phone,
              prop.title AS property_title, prop.address_line1, prop.city, prop.state AS prop_state, prop.pincode
         FROM payments p
         JOIN users u ON u.id = p.payer_user_id
         LEFT JOIN properties prop ON prop.id = p.property_id
        WHERE p.id = ?`,
      [paymentId],
    );

    if (!payment) {
      throw new NotFoundException(`Payment #${paymentId} not found.`);
    }

    // 2. Check Idempotency - if an invoice already exists for this payment
    const existingInvoice = await this.db.one<any>(
      'SELECT * FROM invoices WHERE payment_id = ? OR id = ?',
      [payment.id, payment.invoice_id || 0],
    );

    if (existingInvoice) {
      // Return existing invoice with its line items
      return this.getInvoice(user, existingInvoice.id);
    }

    // 3. Eligibility Check: Status
    if (payment.status !== 'PAID') {
      throw new BadRequestException(
        `Invoices can only be issued for settled PAID payments. Current status: ${payment.status}.`,
      );
    }

    // 4. Eligibility Check: Platform Revenue Classification
    if (!ELIGIBLE_PURPOSES.has(payment.purpose)) {
      throw new BadRequestException(
        `Payment purpose "${payment.purpose}" is non-platform direct funds and not eligible for Odibrick GST invoice generation.`,
      );
    }

    // 5. Build Customer Snapshot
    const customerName = (payment.full_name || '').trim() || payment.payer_email;
    const customerAddress = payment.address_line1
      ? `${payment.address_line1}, ${payment.city || ''}, ${payment.prop_state || ''} ${payment.pincode || ''}`.trim()
      : undefined;
    const customerState = payment.prop_state || 'Karnataka';

    const customerSnapshot = {
      userId: payment.payer_user_id,
      name: customerName,
      email: payment.payer_email,
      phone: payment.payer_phone,
      address: customerAddress,
      state: customerState,
      placeOfSupply: dto?.placeOfSupply || customerState,
    };

    // 6. Build Issuer Snapshot & Tax breakdown
    const issuerProfile = await this.getIssuerProfile();
    const gstRate = await this.getGstRate();
    const taxCalc = this.calculateTaxBreakdown(
      payment.total_amount,
      payment.tax_amount,
      gstRate,
      customerSnapshot.placeOfSupply || customerSnapshot.state,
      issuerProfile.state,
    );

    // 7. Structured Line Items
    let lineItems: any[] = [];
    if (dto?.lineItems && dto.lineItems.length > 0) {
      lineItems = dto.lineItems.map((item, idx) => {
        const qty = item.quantity || 1;
        const uPrice = Number(item.unitPrice);
        const itemTaxRate = item.taxRate !== undefined ? Number(item.taxRate) : gstRate;
        const lineTax = Math.round(((qty * uPrice * itemTaxRate) / 100) * 100) / 100;
        const lineTot = Math.round((qty * uPrice + lineTax) * 100) / 100;
        return {
          description: item.description,
          hsnSac: item.hsnSac || '997212',
          quantity: qty,
          unitPrice: uPrice,
          taxRate: itemTaxRate,
          taxAmount: lineTax,
          lineTotal: lineTot,
        };
      });
    } else {
      // Default single line item based on purpose
      const purposeNames: Record<string, string> = {
        COMMISSION: 'Odibrick Brokerage & Platform Commission',
        SERVICE_FEE: 'Odibrick Property Management & Service Fee',
        LEGAL_FEE: 'Legal Documentation, Drafting & Verification Fee',
        MARKETING_PACKAGE: 'Property Listing & Premium Marketing Package',
      };
      const desc = `${purposeNames[payment.purpose] || 'Platform Service'} (Ref: ${payment.reference_code})`;
      lineItems = [
        {
          description: desc,
          hsnSac: '997212',
          quantity: 1,
          unitPrice: taxCalc.subtotal,
          taxRate: gstRate,
          taxAmount: taxCalc.totalTax,
          lineTotal: taxCalc.total,
        },
      ];
    }

    // 8. Generate Invoice Number & Complete Immutable Snapshot
    const invoiceNumber = await this.generateNextInvoiceNumber(issuerProfile.invoicePrefix || 'ODB');
    const issuedOn = new Date().toISOString().split('T')[0];

    const snapshotData = {
      invoiceNumber,
      issuedAt: new Date().toISOString(),
      issuedOn,
      issuer: issuerProfile,
      customer: customerSnapshot,
      payment: {
        id: payment.id,
        publicId: payment.public_id,
        referenceCode: payment.reference_code,
        purpose: payment.purpose,
        amount: Number(payment.amount),
        taxAmount: Number(payment.tax_amount),
        totalAmount: Number(payment.total_amount),
        currency: payment.currency,
        paidAt: payment.paid_at,
        settlementStatus: payment.settlement_status,
        tenancyId: payment.tenancy_id,
        propertyId: payment.property_id,
        propertyTitle: payment.property_title,
      },
      taxSummary: taxCalc,
      lineItems,
      notes: dto?.notes || '',
      templateVersion: 1,
    };

    // 9. Generate Deterministic PDF and Hash
    const pdfData = {
      invoiceNumber,
      issuedOn,
      status: 'PAID',
      placeOfSupply: customerSnapshot.placeOfSupply,
      issuer: issuerProfile,
      customer: customerSnapshot,
      payment: {
        referenceCode: payment.reference_code,
        purpose: payment.purpose,
        settlementMode: payment.settlement_mode,
        paidAt: payment.paid_at,
        propertyTitle: payment.property_title,
        tenancyId: payment.tenancy_id,
      },
      lineItems,
      subtotal: taxCalc.subtotal,
      cgst: taxCalc.cgst,
      sgst: taxCalc.sgst,
      igst: taxCalc.igst,
      totalTax: taxCalc.totalTax,
      total: taxCalc.total,
      notes: dto?.notes || '',
      terms: issuerProfile.terms,
    };
    const pdfBuffer = generateInvoicePdfBuffer(pdfData);
    const pdfHash = createHash('sha256').update(pdfBuffer).digest('hex');

    // 10. Persist in Database
    const invoiceId = await this.db.insert('invoices', {
      invoice_number: invoiceNumber,
      user_id: payment.payer_user_id,
      tenancy_id: payment.tenancy_id || null,
      payment_id: payment.id,
      billing_name: customerSnapshot.name,
      billing_address: customerSnapshot.address || null,
      gstin: customerSnapshot.placeOfSupply || null,
      place_of_supply: customerSnapshot.placeOfSupply || null,
      snapshot_data: JSON.stringify(snapshotData),
      notes: dto?.notes || null,
      subtotal: taxCalc.subtotal,
      cgst: taxCalc.cgst,
      sgst: taxCalc.sgst,
      igst: taxCalc.igst,
      total: taxCalc.total,
      status: 'PAID', // Payment is already settled
      issued_on: issuedOn,
      pdf_hash: pdfHash,
    });

    // 11. Insert structured line items in invoice_lines
    for (const line of lineItems) {
      await this.db.insert('invoice_lines', {
        invoice_id: invoiceId,
        description: line.description,
        hsn_sac: line.hsnSac,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        tax_rate: line.taxRate,
        line_total: line.lineTotal,
      });
    }

    // 12. Link Payment to Invoice
    await this.db.execute(
      'UPDATE payments SET invoice_id = ? WHERE id = ?',
      [invoiceId, payment.id],
    );

    // 13. Record Audit Event
    await this.audit.record({
      actor: user,
      action: 'invoice.generated',
      objectType: 'invoice',
      objectId: invoiceId,
      metadata: {
        invoiceNumber,
        paymentId: payment.id,
        paymentReference: payment.reference_code,
        total: taxCalc.total,
        pdfHash,
      },
      req,
    });

    // 14. Add to Property Timeline if property exists
    if (payment.property_id) {
      try {
        await this.db.insert('property_timeline', {
          property_id: payment.property_id,
          tenancy_id: payment.tenancy_id || null,
          event_code: 'PAYMENT_COMPLETED',
          title: `Tax Invoice Issued: ${invoiceNumber}`,
          detail: `Tax Invoice generated for ${payment.purpose} (Payment Ref: ${payment.reference_code}) in amount of ₹${taxCalc.total}.`,
          actor_id: user.id,
          reference_type: 'INVOICE',
          reference_id: invoiceId,
        });
      } catch (err) {
        this.logger.warn(`Timeline insertion skipped: ${(err as Error).message}`);
      }
    }

    return this.getInvoice(user, invoiceId);
  }

  /**
   * Get single invoice by ID with authorization check.
   */
  async getInvoice(user: AuthUser, id: number) {
    const invoice = await this.db.one<any>(
      `SELECT i.*,
              p.reference_code AS payment_reference, p.purpose AS payment_purpose, p.status AS payment_status,
              p.paid_at, p.tenancy_id AS payment_tenancy_id, p.property_id AS payment_property_id
         FROM invoices i
         LEFT JOIN payments p ON p.id = i.payment_id
        WHERE i.id = ?`,
      [id],
    );

    if (!invoice) {
      throw new NotFoundException(`Invoice #${id} not found.`);
    }

    // RBAC: Management or Customer User
    if (!this.isManagement(user) && invoice.user_id !== user.id) {
      throw new ForbiddenException('You do not have permission to view this invoice.');
    }

    const lines = await this.db.query(
      'SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id ASC',
      [id],
    );

    let parsedSnapshot = null;
    if (invoice.snapshot_data) {
      try {
        parsedSnapshot = typeof invoice.snapshot_data === 'string'
          ? JSON.parse(invoice.snapshot_data)
          : invoice.snapshot_data;
      } catch {
        parsedSnapshot = null;
      }
    }

    return {
      ...invoice,
      lines,
      snapshot: parsedSnapshot,
    };
  }

  /**
   * Get invoice by payment ID.
   */
  async getInvoiceByPaymentId(user: AuthUser, paymentId: number) {
    const invoice = await this.db.one<any>(
      'SELECT id FROM invoices WHERE payment_id = ?',
      [paymentId],
    );
    if (!invoice) {
      return null;
    }
    return this.getInvoice(user, invoice.id);
  }

  /**
   * Generate/Stream PDF for an invoice.
   */
  async getInvoicePdf(user: AuthUser, id: number, req?: Request): Promise<{ buffer: Buffer; filename: string }> {
    const inv = await this.getInvoice(user, id);
    const snapshot = inv.snapshot;
    const issuer = snapshot?.issuer || (await this.getIssuerProfile());
    const taxSummary = snapshot?.taxSummary || {
      subtotal: Number(inv.subtotal),
      cgst: Number(inv.cgst),
      sgst: Number(inv.sgst),
      igst: Number(inv.igst),
      totalTax: Number(inv.cgst) + Number(inv.sgst) + Number(inv.igst),
      total: Number(inv.total),
      gstRate: 18,
    };

    const pdfData = {
      invoiceNumber: inv.invoice_number,
      issuedOn: inv.issued_on || inv.created_at,
      status: inv.status,
      placeOfSupply: snapshot?.customer?.placeOfSupply || inv.place_of_supply,
      issuer,
      customer: snapshot?.customer || {
        name: inv.billing_name,
        address: inv.billing_address,
        gstin: inv.gstin,
        placeOfSupply: inv.place_of_supply,
      },
      payment: {
        referenceCode: snapshot?.payment?.referenceCode || inv.payment_reference,
        purpose: snapshot?.payment?.purpose || inv.payment_purpose,
        settlementMode: snapshot?.payment?.settlementMode || 'DIRECT_TO_PAYEE',
        paidAt: snapshot?.payment?.paidAt || inv.paid_at,
        propertyTitle: snapshot?.payment?.propertyTitle,
        tenancyId: snapshot?.payment?.tenancyId || inv.payment_tenancy_id,
      },
      lineItems: snapshot?.lineItems || inv.lines || [],
      subtotal: Number(taxSummary.subtotal || inv.subtotal),
      cgst: Number(taxSummary.cgst || inv.cgst),
      sgst: Number(taxSummary.sgst || inv.sgst),
      igst: Number(taxSummary.igst || inv.igst),
      totalTax: Number(taxSummary.totalTax || (Number(inv.cgst) + Number(inv.sgst) + Number(inv.igst))),
      total: Number(taxSummary.total || inv.total),
      notes: inv.notes || snapshot?.notes || '',
      terms: issuer.terms,
    };

    const pdfBuffer = generateInvoicePdfBuffer(pdfData);

    await this.audit.record({
      actor: user,
      action: 'invoice.pdf_downloaded',
      objectType: 'invoice',
      objectId: inv.id,
      metadata: { invoiceNumber: inv.invoice_number },
      req,
    });

    return {
      buffer: pdfBuffer,
      filename: `${inv.invoice_number}.pdf`,
    };
  }

  /**
   * List / Filter invoices for Finance Control Centre and user dashboard.
   */
  async listInvoices(user: AuthUser, query: InvoiceQueryDto) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const offset = (page - 1) * pageSize;

    const where: string[] = ['1=1'];
    const params: any[] = [];

    // RBAC: Non-management users can only view their own invoices
    if (!this.isManagement(user)) {
      where.push('i.user_id = ?');
      params.push(user.id);
    } else if (query.userId) {
      where.push('i.user_id = ?');
      params.push(query.userId);
    }

    if (query.status && query.status !== 'ALL') {
      where.push('i.status = ?');
      params.push(query.status);
    }

    if (query.purpose) {
      where.push('p.purpose = ?');
      params.push(query.purpose);
    }

    if (query.from) {
      where.push('i.created_at >= ?');
      params.push(`${query.from} 00:00:00`);
    }

    if (query.to) {
      where.push('i.created_at <= ?');
      params.push(`${query.to} 23:59:59`);
    }

    if (query.q) {
      where.push('(i.invoice_number LIKE ? OR i.billing_name LIKE ? OR p.reference_code LIKE ?)');
      const pattern = `%${query.q}%`;
      params.push(pattern, pattern, pattern);
    }

    const whereSql = where.join(' AND ');

    const countRow = await this.db.one<any>(
      `SELECT COUNT(*) AS total
         FROM invoices i
         LEFT JOIN payments p ON p.id = i.payment_id
        WHERE ${whereSql}`,
      params,
    );

    const items = await this.db.query<any>(
      `SELECT i.*,
              p.reference_code AS payment_reference, p.purpose AS payment_purpose, p.status AS payment_status,
              p.paid_at
         FROM invoices i
         LEFT JOIN payments p ON p.id = i.payment_id
        WHERE ${whereSql}
        ORDER BY i.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    const total = Number(countRow?.total || 0);

    return {
      items,
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  /**
   * Cancel / Void an issued invoice (Management only).
   */
  async cancelInvoice(
    user: AuthUser,
    id: number,
    dto: CancelInvoiceDto,
    req?: Request,
  ) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can cancel invoices.');
    }

    const invoice = await this.db.one<any>(
      'SELECT * FROM invoices WHERE id = ?',
      [id],
    );

    if (!invoice) {
      throw new NotFoundException(`Invoice #${id} not found.`);
    }

    if (invoice.status === 'VOID') {
      throw new BadRequestException('Invoice is already cancelled / void.');
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await this.db.execute(
      'UPDATE invoices SET status = ?, cancelled_at = ?, cancellation_reason = ? WHERE id = ?',
      ['VOID', now, dto.reason, id],
    );

    await this.audit.record({
      actor: user,
      action: 'invoice.cancelled',
      objectType: 'invoice',
      objectId: id,
      metadata: {
        invoiceNumber: invoice.invoice_number,
        reason: dto.reason,
        cancelledAt: now,
      },
      req,
    });

    return this.getInvoice(user, id);
  }
}
