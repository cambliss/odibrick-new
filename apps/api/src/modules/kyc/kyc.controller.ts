import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { KycService } from './kyc.service';
import { KycDecisionDto, SubmitKycDto } from './kyc.dto';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get('me')
  status(@CurrentUser() user: AuthUser) {
    return this.kyc.status(user);
  }

  @Post()
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitKycDto, @Req() req: Request) {
    return this.kyc.submit(user, dto, req);
  }

  @Get('queue')
  @RequirePermissions('kyc.read')
  queue(@Query('status') status?: string, @Query('page') page?: number) {
    return this.kyc.queue(status ?? 'SUBMITTED', page);
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
