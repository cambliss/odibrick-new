import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { RiskService } from './risk.service';
import {
  AssignRiskCaseDto,
  CreateRiskCaseDto,
  CreateRiskSignalDto,
  EscalateRiskCaseDto,
  FalsePositiveRiskCaseDto,
  LogSecurityEventDto,
  QueryRiskCasesDto,
  QueryRiskSignalsDto,
  QuerySecurityEventsDto,
  ReopenRiskCaseDto,
  RequestEvidenceRiskCaseDto,
  ResolveRiskCaseDto,
} from './risk.dto';

@Controller('admin/risk')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get('overview')
  @RequirePermissions('risk.read')
  async getOverview() {
    return this.riskService.getOverview();
  }

  @Get('cases')
  @RequirePermissions('risk.read')
  async getCases(@Query() query: QueryRiskCasesDto) {
    return this.riskService.getCases(query);
  }

  @Get('cases/:id')
  @RequirePermissions('risk.read')
  async getCaseById(@Param('id') id: string) {
    return this.riskService.getCaseById(id);
  }

  @Post('cases')
  @RequirePermissions('risk.manage')
  async createRiskCase(@Body() dto: CreateRiskCaseDto, @CurrentUser() actor: AuthUser) {
    return this.riskService.createRiskCase(dto, actor);
  }

  @Post('cases/:id/assign')
  @RequirePermissions('risk.manage')
  async assignCase(
    @Param('id') id: string,
    @Body() dto: AssignRiskCaseDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.riskService.assignCase(id, dto, actor);
  }

  @Post('cases/:id/escalate')
  @RequirePermissions('risk.manage')
  async escalateCase(
    @Param('id') id: string,
    @Body() dto: EscalateRiskCaseDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.riskService.escalateCase(id, dto, actor);
  }

  @Post('cases/:id/evidence')
  @RequirePermissions('risk.investigate')
  async requestEvidence(
    @Param('id') id: string,
    @Body() dto: RequestEvidenceRiskCaseDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.riskService.requestEvidence(id, dto, actor);
  }

  @Post('cases/:id/resolve')
  @RequirePermissions('risk.resolve')
  async resolveCase(
    @Param('id') id: string,
    @Body() dto: ResolveRiskCaseDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.riskService.resolveCase(id, dto, actor);
  }

  @Post('cases/:id/false-positive')
  @RequirePermissions('risk.resolve')
  async markFalsePositive(
    @Param('id') id: string,
    @Body() dto: FalsePositiveRiskCaseDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.riskService.markFalsePositive(id, dto, actor);
  }

  @Post('cases/:id/reopen')
  @RequirePermissions('risk.manage')
  async reopenCase(
    @Param('id') id: string,
    @Body() dto: ReopenRiskCaseDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.riskService.reopenCase(id, dto, actor);
  }

  @Get('signals')
  @RequirePermissions('risk.read')
  async getSignals(@Query() query: QueryRiskSignalsDto) {
    return this.riskService.getRiskSignals(query);
  }

  @Post('signals')
  @RequirePermissions('risk.manage')
  async detectRiskSignal(@Body() dto: CreateRiskSignalDto) {
    return this.riskService.detectRiskSignal(dto);
  }

  @Get('security-events')
  @RequirePermissions('security.read')
  async getSecurityEvents(@Query() query: QuerySecurityEventsDto) {
    return this.riskService.getSecurityEvents(query);
  }

  @Post('security-events')
  @RequirePermissions('security.manage')
  async logSecurityEvent(@Body() dto: LogSecurityEventDto, @Req() req: any) {
    return this.riskService.logSecurityEvent(dto, req);
  }

  @Get('suspicious/payments')
  @RequirePermissions('risk.read')
  async getSuspiciousPayments() {
    return this.riskService.getSuspiciousPayments();
  }

  @Get('suspicious/accounts')
  @RequirePermissions('risk.read')
  async getSuspiciousAccounts() {
    return this.riskService.getSuspiciousAccounts();
  }

  @Get('suspicious/listings')
  @RequirePermissions('risk.read')
  async getSuspiciousListings() {
    return this.riskService.getSuspiciousListings();
  }
}
