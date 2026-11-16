export type RoleCode =
  | 'SUPER_ADMIN' | 'ADMIN' | 'LEGAL_TEAM' | 'KYC_TEAM' | 'MARKETING_TEAM'
  | 'PROPERTY_MANAGER' | 'SUPPORT_TEAM' | 'INSURANCE_PARTNER'
  | 'OWNER' | 'TENANT' | 'AGENT' | 'BUILDER';

export type OtpChannel = 'EMAIL' | 'SMS';

export interface AuthUser {
  id: number;
  publicId: string;
  email: string;
  phone?: string | null;
  fullName: string;
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  emailVerified?: boolean;
  phoneVerified?: boolean;
  contactVerified?: boolean;
  termsAccepted?: boolean;
  roles: RoleCode[];
  permissions: string[];
}

export interface AccessTokenPayload {
  sub: number;
  pid: string;
  email: string;
  name: string;
  roles: RoleCode[];
  perms: string[];
  ev?: boolean;
  pv?: boolean;
}

export const STAFF_ROLES: RoleCode[] = [
  'SUPER_ADMIN', 'ADMIN', 'LEGAL_TEAM', 'KYC_TEAM',
  'MARKETING_TEAM', 'PROPERTY_MANAGER', 'SUPPORT_TEAM', 'INSURANCE_PARTNER',
];
