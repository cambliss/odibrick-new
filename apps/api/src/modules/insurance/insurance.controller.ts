import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { InsuranceService } from './insurance.service';
import { ConfirmPolicyDto, QuoteRequestDto } from './insurance.dto';
import { CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller('insurance')
export class InsuranceController {
  constructor(private readonly insurance: InsuranceService) {}

  @Public()
  @Get('products')
  catalogue(@Query('audience') audience?: string) {
    return this.insurance.catalogue(audience);
  }

  @Post('quotes')
  quote(@CurrentUser() user: AuthUser, @Body() dto: QuoteRequestDto) {
    return this.insurance.quote(user, dto);
  }

  @Post('quotes/:id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.insurance.requestPolicy(user, id);
  }

  @Get('policies')
  policies(@CurrentUser() user: AuthUser) {
    return this.insurance.myPolicies(user);
  }

  @Post('policies/:id/confirm')
  @RequirePermissions('insurance.manage')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmPolicyDto,
  ) {
    return this.insurance.confirmPolicy(user, id, dto.policyNumber, dto.startsOn, dto.expiresOn);
  }
}
