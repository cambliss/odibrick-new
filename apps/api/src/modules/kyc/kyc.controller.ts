import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { KycService } from './kyc.service';
import {
  AssignKycVerifierDto,
  KycDecisionDto,
  RejectKycDto,
  ReopenKycDto,
  RequestAdditionalDocsDto,
  SubmitKycDto,
  SuspendKycDto,
  VerifyKycDto,
} from './kyc.dto';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get('me')
  status(@CurrentUser() user: AuthUser) {
    return this.kyc.status(user);
  }

  @Get('user/:userId')
  @RequirePermissions('kyc.read')
  getUserKyc(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.kyc.getUserKyc(user, userId);
  }

  @Post()
  submitLegacy(@CurrentUser() user: AuthUser, @Body() dto: SubmitKycDto, @Req() req: Request) {
    return this.kyc.submit(user, dto, req);
  }

  @Post('submit')
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitKycDto, @Req() req: Request) {
    return this.kyc.submit(user, dto, req);
  }

  @Get('queue')
  @RequirePermissions('kyc.read')
  queue(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('verifierId') verifierId?: string,
    @Query('role') role?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.kyc.queue(
      status ?? 'UNDER_REVIEW',
      { search, verifierId: verifierId ? Number(verifierId) : undefined, role },
      page ? Number(page) : undefined,
      perPage ? Number(perPage) : undefined,
    );
  }

  @Post(':id/verify')
  @RequirePermissions('kyc.verify')
  verify(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyKycDto,
    @Req() req: Request,
  ) {
    return this.kyc.verify(user, id, dto, req);
  }

  @Post(':id/reject')
  @RequirePermissions('kyc.verify')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectKycDto,
    @Req() req: Request,
  ) {
    return this.kyc.reject(user, id, dto, req);
  }

  @Post(':id/request-documents')
  @RequirePermissions('kyc.manage')
  requestAdditionalDocuments(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestAdditionalDocsDto,
    @Req() req: Request,
  ) {
    return this.kyc.requestAdditionalDocuments(user, id, dto, req);
  }

  @Post(':id/suspend')
  @RequirePermissions('kyc.manage')
  suspend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SuspendKycDto,
    @Req() req: Request,
  ) {
    return this.kyc.suspend(user, id, dto, req);
  }

  @Post(':id/reopen')
  @RequirePermissions('kyc.manage')
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReopenKycDto,
    @Req() req: Request,
  ) {
    return this.kyc.reopen(user, id, dto, req);
  }

  @Post(':id/assign')
  @RequirePermissions('kyc.manage')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignKycVerifierDto,
    @Req() req: Request,
  ) {
    return this.kyc.assignVerifier(user, id, dto, req);
  }

  @Post(':id/decision')
  @RequirePermissions('kyc.review')
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: KycDecisionDto,
    @Req() req: Request,
  ) {
    return this.kyc.decide(user, id, dto, req);
  }
}
