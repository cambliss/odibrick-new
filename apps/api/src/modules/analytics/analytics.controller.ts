import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, ExportReportDto } from './analytics.dto';

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @RequirePermissions('analytics.read')
  async getOverview(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getOverview(query);
  }

  @Get('properties')
  @RequirePermissions('analytics.read')
  async getProperties(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getPropertyAnalytics(query);
  }

  @Get('leads')
  @RequirePermissions('analytics.read')
  async getLeads(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getLeadAnalytics(query);
  }

  @Get('visits')
  @RequirePermissions('analytics.read')
  async getVisits(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getVisitAnalytics(query);
  }

  @Get('applications')
  @RequirePermissions('analytics.read')
  async getApplications(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getApplicationAnalytics(query);
  }

  @Get('tenancies')
  @RequirePermissions('analytics.read')
  async getTenancies(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getTenancyAnalytics(query);
  }

  @Get('legal')
  @RequirePermissions('analytics.read')
  async getLegal(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getLegalAnalytics(query);
  }

  @Get('finance')
  @RequirePermissions('analytics.read')
  async getFinance(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getFinanceAnalytics(query);
  }

  @Get('payments')
  @RequirePermissions('analytics.read')
  async getPayments(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getPaymentAnalytics(query);
  }

  @Get('maintenance')
  @RequirePermissions('analytics.read')
  async getMaintenance(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getMaintenanceAnalytics(query);
  }

  @Get('disputes')
  @RequirePermissions('analytics.read')
  async getDisputes(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getDisputeAnalytics(query);
  }

  @Get('compliance')
  @RequirePermissions('analytics.read')
  async getCompliance(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getComplianceAnalytics(query);
  }

  @Get('operations')
  @RequirePermissions('analytics.read')
  async getOperations(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getOperationsAnalytics(query);
  }

  @Get('automation')
  @RequirePermissions('analytics.read')
  async getAutomation(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getAutomationAnalytics(query);
  }
}

@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get(':reportType')
  @RequirePermissions('reports.read')
  async getReport(
    @Param('reportType') reportType: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analytics.getReport(reportType, query);
  }

  @Post(':reportType/export')
  @RequirePermissions('reports.export')
  async exportReport(
    @CurrentUser() user: AuthUser,
    @Param('reportType') reportType: string,
    @Query() query: ExportReportDto,
    @Req() req?: Request,
  ) {
    return this.analytics.exportReportCsv(user, reportType, query, req);
  }
}
