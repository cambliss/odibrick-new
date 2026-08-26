export type RoleCode =
  | 'SUPER_ADMIN' | 'ADMIN' | 'LEGAL_TEAM' | 'KYC_TEAM' | 'MARKETING_TEAM'
  | 'PROPERTY_MANAGER' | 'SUPPORT_TEAM' | 'INSURANCE_PARTNER'
  | 'OWNER' | 'TENANT' | 'AGENT' | 'BUILDER';

export interface AuthUser {
  id: number;
  publicId: string;
  email: string;
  fullName: string;
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
}

export const STAFF_ROLES: RoleCode[] = [
  'SUPER_ADMIN', 'ADMIN', 'LEGAL_TEAM', 'KYC_TEAM',
  'MARKETING_TEAM', 'PROPERTY_MANAGER', 'SUPPORT_TEAM', 'INSURANCE_PARTNER',
];
