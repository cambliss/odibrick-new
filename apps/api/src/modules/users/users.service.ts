import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AuthUser } from '../../common/auth/auth.types';
import { UpdateProfileDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async profile(user: AuthUser) {
    const [account, profile, owner, tenant, agent, builder, kyc] = await Promise.all([
      this.db.one('SELECT id, public_id, full_name, email, phone, status, mfa_enabled, created_at FROM users WHERE id = ?', [user.id]),
      this.db.one('SELECT * FROM user_profiles WHERE user_id = ?', [user.id]),
      this.db.one('SELECT * FROM owners WHERE user_id = ?', [user.id]),
      this.db.one('SELECT * FROM tenants WHERE user_id = ?', [user.id]),
      this.db.one('SELECT * FROM agents WHERE user_id = ?', [user.id]),
      this.db.one('SELECT * FROM builders WHERE user_id = ?', [user.id]),
      this.db.one('SELECT status, reviewed_at, expires_at FROM kyc_records WHERE user_id = ? ORDER BY id DESC LIMIT 1', [user.id]),
    ]);
    return { account, profile, roles: user.roles, owner, tenant, agent, builder, kyc };
  }

  async updateProfile(user: AuthUser, dto: UpdateProfileDto) {
    if (dto.fullName) await this.db.update('users', user.id, { full_name: dto.fullName });

    await this.db.execute(
      `INSERT INTO user_profiles (user_id, date_of_birth, gender, occupation, employer, address_line1,
         address_line2, locality, city, state, pincode, about)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         date_of_birth = COALESCE(VALUES(date_of_birth), date_of_birth),
         gender = COALESCE(VALUES(gender), gender),
         occupation = COALESCE(VALUES(occupation), occupation),
         employer = COALESCE(VALUES(employer), employer),
         address_line1 = COALESCE(VALUES(address_line1), address_line1),
         address_line2 = COALESCE(VALUES(address_line2), address_line2),
         locality = COALESCE(VALUES(locality), locality),
         city = COALESCE(VALUES(city), city),
         state = COALESCE(VALUES(state), state),
         pincode = COALESCE(VALUES(pincode), pincode),
         about = COALESCE(VALUES(about), about)`,
      [
        user.id, dto.dateOfBirth ?? null, dto.gender ?? null, dto.occupation ?? null, dto.employer ?? null,
        dto.addressLine1 ?? null, dto.addressLine2 ?? null, dto.locality ?? null, dto.city ?? null,
        dto.state ?? null, dto.pincode ?? null, dto.about ?? null,
      ],
    );

    if (dto.tenant && user.roles.includes('TENANT')) {
      await this.db.execute(
        `UPDATE tenants SET household_type = COALESCE(?, household_type), occupants = COALESCE(?, occupants),
           has_pets = COALESCE(?, has_pets), monthly_income = COALESCE(?, monthly_income),
           preferred_move_in = COALESCE(?, preferred_move_in), budget_min = COALESCE(?, budget_min),
           budget_max = COALESCE(?, budget_max)
         WHERE user_id = ?`,
        [
          dto.tenant.householdType ?? null, dto.tenant.occupants ?? null,
          dto.tenant.hasPets === undefined ? null : dto.tenant.hasPets ? 1 : 0,
          dto.tenant.monthlyIncome ?? null, dto.tenant.preferredMoveIn ?? null,
          dto.tenant.budgetMin ?? null, dto.tenant.budgetMax ?? null, user.id,
        ],
      );
    }

    if (dto.agency && (user.roles.includes('AGENT') || user.roles.includes('BUILDER'))) {
      if (user.roles.includes('AGENT')) {
        await this.db.execute(
          `UPDATE agents SET agency_name = COALESCE(?, agency_name), rera_number = COALESCE(?, rera_number),
             gstin = COALESCE(?, gstin), team_size = COALESCE(?, team_size) WHERE user_id = ?`,
          [dto.agency.name ?? null, dto.agency.reraNumber ?? null, dto.agency.gstin ?? null,
           dto.agency.teamSize ?? null, user.id],
        );
      } else {
        await this.db.execute(
          `UPDATE builders SET company_name = COALESCE(?, company_name), rera_number = COALESCE(?, rera_number),
             gstin = COALESCE(?, gstin), cin = COALESCE(?, cin), website = COALESCE(?, website)
           WHERE user_id = ?`,
          [dto.agency.name ?? null, dto.agency.reraNumber ?? null, dto.agency.gstin ?? null,
           dto.agency.cin ?? null, dto.agency.website ?? null, user.id],
        );
      }
    }

    return this.profile(user);
  }

  async publicProfile(publicId: string) {
    const user = await this.db.one<any>(
      `SELECT u.public_id, u.full_name, u.created_at,
              a.agency_name, a.rera_number, a.verification_status AS agent_status, a.rating,
              b.company_name, b.rera_number AS builder_rera, b.verification_status AS builder_status,
              (SELECT COUNT(*) FROM properties p WHERE p.listed_by_user_id = u.id AND p.status = 'ACTIVE') AS active_listings,
              (SELECT k.status FROM kyc_records k WHERE k.user_id = u.id ORDER BY k.id DESC LIMIT 1) AS kyc_status
         FROM users u
         LEFT JOIN agents a ON a.user_id = u.id
         LEFT JOIN builders b ON b.user_id = u.id
        WHERE u.public_id = ? AND u.deleted_at IS NULL`,
      [publicId],
    );
    if (!user) throw new NotFoundException('Profile not found.');
    // Contact details are never in a public profile — enquiries route through the platform.
    return {
      publicId: user.public_id,
      name: user.agency_name ?? user.company_name ?? user.full_name,
      memberSince: user.created_at,
      activeListings: user.active_listings,
      identityVerified: user.kyc_status === 'VERIFIED',
      reraNumber: user.rera_number ?? user.builder_rera ?? null,
      rating: user.rating,
    };
  }

  async savedProperties(user: AuthUser) {
    return this.db.query(
      `SELECT p.id, p.public_id, p.slug, p.title, p.locality, p.city, p.rent_amount, p.sale_price,
              p.bedrooms, p.property_type, p.status, sp.note, sp.created_at AS saved_at,
              (SELECT pi.storage_key FROM property_images pi WHERE pi.property_id = p.id
                ORDER BY pi.is_cover DESC LIMIT 1) AS cover_key
         FROM saved_properties sp JOIN properties p ON p.id = sp.property_id
        WHERE sp.user_id = ? ORDER BY sp.created_at DESC`,
      [user.id],
    );
  }

  async toggleSaved(user: AuthUser, propertyId: number) {
    const existing = await this.db.one<any>(
      'SELECT property_id FROM saved_properties WHERE user_id = ? AND property_id = ?', [user.id, propertyId],
    );
    if (existing) {
      await this.db.execute('DELETE FROM saved_properties WHERE user_id = ? AND property_id = ?', [user.id, propertyId]);
      return { saved: false };
    }
    await this.db.execute('INSERT INTO saved_properties (user_id, property_id) VALUES (?, ?)', [user.id, propertyId]);
    return { saved: true };
  }

  /** Everything the signed-in user needs for the "what do I do next" panel. */
  async dashboardSummary(user: AuthUser) {
    const [kyc, notifications] = await Promise.all([
      this.db.one<any>('SELECT status FROM kyc_records WHERE user_id = ? ORDER BY id DESC LIMIT 1', [user.id]),
      this.db.one<any>("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL AND channel = 'IN_APP'", [user.id]),
    ]);

    const tasks: Array<{ label: string; href: string; severity: string }> = [];
    if (!kyc || kyc.status !== 'VERIFIED') {
      tasks.push({
        label: kyc?.status === 'SUBMITTED' ? 'Identity verification in progress' : 'Verify your identity to list or apply',
        href: '/dashboard/kyc',
        severity: kyc?.status === 'SUBMITTED' ? 'INFO' : 'ACTION',
      });
    }

    const duePayments = await this.db.query<any>(
      "SELECT id, reference_code, purpose, total_amount, due_date FROM payments WHERE payer_user_id = ? AND status = 'DUE' ORDER BY due_date LIMIT 5",
      [user.id],
    );
    duePayments.forEach((p) =>
      tasks.push({ label: `Pay ${p.purpose.toLowerCase().replace('_', ' ')} — INR ${p.total_amount}`, href: '/dashboard/payments', severity: 'ACTION' }),
    );

    const signatures = await this.db.query<any>(
      `SELECT a.id, a.agreement_number FROM agreement_signatories s JOIN agreements a ON a.id = s.agreement_id
        WHERE s.user_id = ? AND s.status = 'PENDING' AND a.status IN ('AWAITING_SIGNATURES','PARTIALLY_SIGNED')`,
      [user.id],
    );
    signatures.forEach((a) =>
      tasks.push({ label: `Sign agreement ${a.agreement_number}`, href: `/dashboard/agreements/${a.id}`, severity: 'ACTION' }),
    );

    const checkIn = await this.db.query<any>(
      "SELECT id FROM tenancies WHERE tenant_user_id = ? AND stage = 'CHECK_IN_PENDING'", [user.id],
    );
    checkIn.forEach((t) =>
      tasks.push({ label: 'Record your Day 1 condition report', href: `/dashboard/tenancy/${t.id}`, severity: 'ACTION' }),
    );

    const stats = await this.db.one<any>(
      `SELECT (SELECT COUNT(*) FROM properties WHERE listed_by_user_id = ? AND status = 'ACTIVE') AS active_listings,
              (SELECT COUNT(*) FROM properties WHERE listed_by_user_id = ? AND status = 'DRAFT') AS draft_listings,
              (SELECT COUNT(*) FROM enquiries e JOIN properties p ON p.id = e.property_id
                WHERE p.listed_by_user_id = ? AND e.status = 'NEW') AS new_leads,
              (SELECT COUNT(*) FROM applications a JOIN properties p ON p.id = a.property_id
                WHERE p.listed_by_user_id = ? AND a.status = 'SUBMITTED') AS new_applications,
              (SELECT COUNT(*) FROM applications WHERE tenant_user_id = ?) AS my_applications,
              (SELECT COUNT(*) FROM saved_properties WHERE user_id = ?) AS saved,
              (SELECT COUNT(*) FROM tenancies WHERE (owner_user_id = ? OR tenant_user_id = ?) AND stage NOT IN ('CLOSED','CANCELLED')) AS active_tenancies`,
      [user.id, user.id, user.id, user.id, user.id, user.id, user.id, user.id],
    );

    return { kycStatus: kyc?.status ?? 'NOT_STARTED', unreadNotifications: notifications?.c ?? 0, tasks, stats };
  }
}
