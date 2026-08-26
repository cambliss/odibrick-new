import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser, RoleCode } from './auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

/** Route is reachable without a session (search, property pages, auth endpoints). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
