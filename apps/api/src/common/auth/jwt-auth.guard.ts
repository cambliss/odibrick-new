import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './decorators';
import { AccessTokenPayload, AuthUser } from './auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extract(req);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Sign in to continue.');
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('auth.accessSecret'),
      });
      const user: AuthUser = {
        id: payload.sub,
        publicId: payload.pid,
        email: payload.email,
        fullName: payload.name,
        roles: payload.roles ?? [],
        permissions: payload.perms ?? [],
      };
      (req as any).user = user;
      return true;
    } catch {
      if (isPublic) return true; // expired token on a public page is not an error
      throw new UnauthorizedException('Your session expired. Sign in again.');
    }
  }

  private extract(req: Request): string | null {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    const cookie = (req as any).cookies?.odb_at;
    return cookie ?? null;
  }
}
