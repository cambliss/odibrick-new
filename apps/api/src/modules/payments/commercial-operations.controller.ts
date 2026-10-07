import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CommercialOperationsService } from './commercial-operations.service';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import {
  CreateCommercialRuleDto,
  UpdateCommercialRuleDto,
  PreviewCommercialCalculationDto,
  QueryCommercialObligationsDto,
  ApproveCommercialObligationDto,
  WaiveCommercialObligationDto,
  AdjustCommercialObligationDto,
  CancelCommercialObligationDto,
  QueryCommercialRevenueDto,
} from './commercial-operations.dto';

@Controller('admin/commercial')
export class CommercialOperationsController {
  constructor(private readonly commercialService: CommercialOperationsService) {}

  // 1. Overview & Metrics
  @Get('overview')
  @RequirePermissions('commercial.read')
  async getOverview(
    @CurrentUser() user: AuthUser,
    @Query('periodStart') periodStart?: string,
    @Query('periodEnd') periodEnd?: string,
  ) {
    return this.commercialService.getCommercialOverview(user, periodStart, periodEnd);
  }

  // 2. Commercial Rules
  @Get('rules')
  @RequirePermissions('commercial.read')
  async getRules(
    @CurrentUser() user: AuthUser,
    @Query('category') category?: string,
    @Query('isActive') isActive?: string,
  ) {
    const activeBool = isActive !== undefined ? isActive === 'true' || isActive === '1' : undefined;
    return this.commercialService.getRules(user, category, activeBool);
  }

  @Post('rules')
  @RequirePermissions('commercial.rules.manage')
  @HttpCode(HttpStatus.CREATED)
  async createRule(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCommercialRuleDto,
  ) {
    return this.commercialService.createRule(user, dto);
  }

  @Get('rules/:id')
  @RequirePermissions('commercial.read')
  async getRuleById(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.commercialService.getRuleById(user, id);
  }

  @Patch('rules/:id')
  @RequirePermissions('commercial.rules.manage')
  async updateRule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCommercialRuleDto,
  ) {
    return this.commercialService.updateRule(user, id, dto);
  }

  @Post('rules/:id/activate')
  @RequirePermissions('commercial.rules.manage')
  async activateRule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.commercialService.activateRule(user, id);
  }

  @Post('rules/:id/deactivate')
  @RequirePermissions('commercial.rules.manage')
  async deactivateRule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.commercialService.deactivateRule(user, id);
  }

  // 3. Calculation Preview (Read-Only Simulation)
  @Post('rules/preview')
  @RequirePermissions('commercial.read')
  @HttpCode(HttpStatus.OK)
  async previewCalculation(@Body() dto: PreviewCommercialCalculationDto) {
    return this.commercialService.previewCalculation(dto);
  }

  // 4. Commercial Obligations
  @Get('obligations')
  @RequirePermissions('commercial.read')
  async getObligations(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryCommercialObligationsDto,
  ) {
    return this.commercialService.getObligations(user, query);
  }

  @Post('obligations')
  @RequirePermissions('commercial.manage')
  @HttpCode(HttpStatus.CREATED)
  async createObligation(
    @CurrentUser() user: AuthUser,
    @Body() body: any,
  ) {
    return this.commercialService.createCommercialObligation(user, body);
  }

  @Get('obligations/:id')
  @RequirePermissions('commercial.read')
  async getObligationById(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.commercialService.getObligationById(user, id);
  }

  @Post('obligations/:id/approve')
  @RequirePermissions('commercial.manage')
  async approveObligation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveCommercialObligationDto,
  ) {
    return this.commercialService.approveObligation(user, id, dto);
  }

  @Post('obligations/:id/waive')
  @RequirePermissions('commercial.manage')
  async waiveObligation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WaiveCommercialObligationDto,
  ) {
    return this.commercialService.waiveObligation(user, id, dto);
  }

  @Post('obligations/:id/adjust')
  @RequirePermissions('commercial.manage')
  async adjustObligation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustCommercialObligationDto,
  ) {
    return this.commercialService.adjustObligation(user, id, dto);
  }

  @Post('obligations/:id/cancel')
  @RequirePermissions('commercial.manage')
  async cancelObligation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelCommercialObligationDto,
  ) {
    return this.commercialService.cancelObligation(user, id, dto);
  }

  // 5. Revenue Analytical Reporting
  @Get('revenue')
  @RequirePermissions('commercial.read')
  async getRevenueReporting(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryCommercialRevenueDto,
  ) {
    return this.commercialService.getRevenueReporting(user, query);
  }
}
