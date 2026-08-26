import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ROLES_KEY } from './decorators';
import { AuthUser, RoleCode } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<RoleCode[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const permissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles?.length && !permissions?.length) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('This action needs a signed-in account.');
    if (user.roles.includes('SUPER_ADMIN')) return true;

    if (roles?.length && !roles.some((r) => user.roles.includes(r))) {
      throw new ForbiddenException('Your account does not have access to this area.');
    }
    if (permissions?.length && !permissions.every((p) => user.permissions.includes(p))) {
      throw new ForbiddenException('Your account does not have permission for this action.');
    }
    return true;
  }
}
