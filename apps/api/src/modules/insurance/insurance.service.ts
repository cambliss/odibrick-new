import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { PaymentsService } from '../payments/payments.service';
import { AuthUser } from '../../common/auth/auth.types';
import { newPublicId } from '../../common/util/ids';
import { QuoteRequestDto } from './insurance.dto';

/**
 * Protection module.
 *
 * Two kinds of row live in insurance_products and the difference is load-bearing:
 *  - ODIBRICK_SERVICE  — something Odibrick itself does (records, dispute help).
 *  - INSURANCE_POLICY  — a contract issued by a licensed insurer. Odibrick only
 *    passes the request to the partner; it never issues cover, and a policy is
 *    only ACTIVE once the insurer returns a policy number.
 */
@Injectable()
export class InsuranceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  async catalogue(audience?: string) {
    const params: unknown[] = [];
    let clause = 'WHERE p.is_active = 1';
    if (audience) {
      clause += " AND p.audience IN (?, 'BOTH')";
      params.push(audience);
    }
    const rows = await this.db.query(
      `SELECT p.id, p.code, p.name, p.offering_type, p.category, p.audience, p.summary,
              p.coverage_json, p.exclusions_json, p.sum_insured_min, p.sum_insured_max,
              p.base_premium, p.term_months,
              ip.legal_name AS partner_name, ip.irdai_registration, ip.partner_type
         FROM insurance_products p
         LEFT JOIN insurance_partners ip ON ip.id = p.partner_id
         ${clause}
        ORDER BY p.offering_type, p.category`,
      params,
    );
    return rows.map((r: any) => ({
      ...r,
      // The UI must never blur these two.
      disclosure:
        r.offering_type === 'INSURANCE_POLICY'
          ? `Insurance underwritten by ${r.partner_name ?? 'the partner insurer'}. Odibrick distributes and coordinates only; cover starts when the insurer issues a policy.`
          : 'An Odibrick platform service. This is not insurance and does not pay claims.',
    }));
  }

  async quote(user: AuthUser, dto: QuoteRequestDto) {
    const product = await this.db.one<any>(
      'SELECT * FROM insurance_products WHERE id = ? AND is_active = 1', [dto.productId],
    );
    if (!product) throw new NotFoundException('That product is not available.');

    if (product.offering_type === 'ODIBRICK_SERVICE') {
      return {
        productId: product.id,
        offeringType: product.offering_type,
        premium: Number(product.base_premium ?? 0),
        message: 'This is an Odibrick service, included with your plan. No insurance quote is needed.',
      };
    }

    if (this.config.get('providers.insurance') === 'manual') {
      // No live rating engine: record the request and hand it to the partner desk.
      const id = await this.db.insert('insurance_quotes', {
        product_id: product.id,
        user_id: user.id,
        property_id: dto.propertyId ?? null,
        tenancy_id: dto.tenancyId ?? null,
        sum_insured: dto.sumInsured,
        premium: 0,
        status: 'DRAFT',
      });
      return {
        quoteId: id,
        status: 'DRAFT',
        premium: null,
        message:
          'Your request has gone to our insurance partner desk. A licensed representative will send an exact premium — nothing is bound until you accept it and the insurer issues the policy.',
      };
    }

    throw new ServiceUnavailableException('The insurance partner integration is not enabled on this environment.');
  }

  async requestPolicy(user: AuthUser, quoteId: number) {
    const quote = await this.db.one<any>(
      `SELECT q.*, p.offering_type, p.name FROM insurance_quotes q
         JOIN insurance_products p ON p.id = q.product_id
        WHERE q.id = ? AND q.user_id = ?`,
      [quoteId, user.id],
    );
    if (!quote) throw new NotFoundException('Quote not found.');
    if (quote.offering_type !== 'INSURANCE_POLICY') {
      throw new BadRequestException('This is a platform service, not an insurance product.');
    }
    if (!Number(quote.premium)) {
      throw new BadRequestException('This quote has no confirmed premium yet. Our partner desk will contact you.');
    }

    const id = await this.db.insert('insurance_policies', {
      public_id: newPublicId(),
      product_id: quote.product_id,
      quote_id: quote.id,
      holder_user_id: user.id,
      property_id: quote.property_id,
      tenancy_id: quote.tenancy_id,
      status: 'PAYMENT_PENDING',
      sum_insured: quote.sum_insured,
      premium: quote.premium,
    });

    const paymentId = await this.payments.createPayment({
      payerUserId: user.id,
      purpose: 'INSURANCE_PREMIUM',
      amount: Number(quote.premium),
      tenancyId: quote.tenancy_id,
      propertyId: quote.property_id,
      notes: `Premium for ${quote.name}`,
    });
    await this.db.update('insurance_policies', id, { payment_id: paymentId });
    await this.db.update('insurance_quotes', quoteId, { status: 'ACCEPTED' });
    await this.audit.record({ actor: user, action: 'insurance.policy_requested', objectType: 'policy', objectId: id });

    return {
      policyRequestId: id,
      paymentId,
      status: 'PAYMENT_PENDING',
      message: 'Cover is not in force yet. It starts only when the insurer confirms the policy after payment.',
    };
  }

  async myPolicies(user: AuthUser) {
    return this.db.query(
      `SELECT pol.id, pol.public_id, pol.policy_number, pol.status, pol.sum_insured, pol.premium,
              pol.starts_on, pol.expires_on, pol.claims_contact,
              pr.name AS product_name, pr.offering_type, pr.category,
              ip.legal_name AS insurer_name, ip.irdai_registration,
              p.title AS property_title
         FROM insurance_policies pol
         JOIN insurance_products pr ON pr.id = pol.product_id
         LEFT JOIN insurance_partners ip ON ip.id = pr.partner_id
         LEFT JOIN properties p ON p.id = pol.property_id
        WHERE pol.holder_user_id = ?
        ORDER BY pol.created_at DESC`,
      [user.id],
    );
  }

  /** Partner-side confirmation. Only an INSURANCE_PARTNER or admin can activate cover. */
  async confirmPolicy(user: AuthUser, id: number, policyNumber: string, startsOn: string, expiresOn: string) {
    const policy = await this.db.one<any>('SELECT * FROM insurance_policies WHERE id = ?', [id]);
    if (!policy) throw new NotFoundException('Policy not found.');
    if (!policyNumber) throw new BadRequestException('Enter the policy number issued by the insurer.');

    await this.db.update('insurance_policies', id, {
      policy_number: policyNumber,
      status: 'ACTIVE',
      starts_on: startsOn,
      expires_on: expiresOn,
    });
    await this.audit.record({
      actor: user, action: 'insurance.policy_activated', objectType: 'policy', objectId: id,
      metadata: { policyNumber },
    });
    return { id, status: 'ACTIVE', policyNumber };
  }
}
