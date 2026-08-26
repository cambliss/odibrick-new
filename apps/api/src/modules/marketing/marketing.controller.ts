import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { CampaignUpdateDto, CreateOrderDto, PackageDto } from './marketing.dto';
import { CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller('marketing')
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Public()
  @Get('packages')
  packages(@Query('audience') audience?: string) {
    return this.marketing.packages(audience);
  }

  @Post('packages')
  @RequirePermissions('marketing.package.manage')
  createPackage(@CurrentUser() user: AuthUser, @Body() dto: PackageDto) {
    return this.marketing.upsertPackage(user, dto);
  }

  @Patch('packages/:id')
  @RequirePermissions('marketing.package.manage')
  updatePackage(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: PackageDto) {
    return this.marketing.upsertPackage(user, dto, id);
  }

  @Post('orders')
  order(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.marketing.order(user, dto);
  }

  @Get('orders/mine')
  myOrders(@CurrentUser() user: AuthUser) {
    return this.marketing.myOrders(user);
  }

  @Get('campaigns')
  @RequirePermissions('campaign.manage')
  board(@Query('status') status?: string, @Query('page') page?: number) {
    return this.marketing.campaignBoard(status, page);
  }

  @Get('campaigns/:id')
  performance(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.marketing.campaignPerformance(user, id);
  }

  @Patch('campaigns/:id')
  @RequirePermissions('campaign.manage')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CampaignUpdateDto) {
    return this.marketing.updateCampaign(user, id, dto);
  }
}
