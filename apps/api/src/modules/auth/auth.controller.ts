import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshDto, RegisterDto } from './auth.dto';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

const REFRESH_COOKIE = 'odb_rt';
const ACCESS_COOKIE = 'odb_at';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto, req);
    this.setCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, req);
    this.setCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = dto.refreshToken ?? (req as any).cookies?.[REFRESH_COOKIE];
    const result = await this.auth.refresh(token, req);
    this.setCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentUser() user?: AuthUser) {
    await this.auth.logout((req as any).cookies?.[REFRESH_COOKIE], user, req);
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.loadAuthUser(user.id);
  }

  @HttpCode(204)
  @Post('password')
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    await this.auth.changePassword(user, dto.currentPassword, dto.newPassword, req);
  }

  private setCookies(res: Response, accessToken: string, refreshToken: string) {
    const secure = this.config.get('app.env') === 'production';
    const base = { httpOnly: true as const, secure, sameSite: 'lax' as const, path: '/' };
    res.cookie(ACCESS_COOKIE, accessToken, { ...base, maxAge: this.config.get<number>('auth.accessTtl')! * 1000 });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...base,
      maxAge: this.config.get<number>('auth.refreshTtlDays')! * 86_400_000,
    });
  }
}
