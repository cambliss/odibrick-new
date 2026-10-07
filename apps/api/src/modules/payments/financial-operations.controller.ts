import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { FinancialOperationsService } from './financial-operations.service';
import {
  StartReconciliationRunDto,
  QueryReconciliationRunsDto,
  QueryExceptionsDto,
  AcknowledgeExceptionDto,
  AssignExceptionDto,
  ResolveExceptionDto,
  ReopenExceptionDto,
  CreatePeriodDto,
  ReviewPeriodDto,
  ClosePeriodDto,
  QueryPeriodsDto,
  QuerySourceCoverageDto,
} from './financial-operations.dto';

@Controller('admin/finance')
export class FinancialOperationsController {
  constructor(private readonly service: FinancialOperationsService) {}

  @Get('control-overview')
  getControlOverview(
    @CurrentUser() user: AuthUser,
    @Query('periodStart') periodStart?: string,
    @Query('periodEnd') periodEnd?: string,
  ) {
    return this.service.getControlOverview(user, periodStart, periodEnd);
  }

  @Post('reconciliation/run')
  runReconciliation(
    @CurrentUser() user: AuthUser,
    @Body() dto: StartReconciliationRunDto,
    @Req() req: Request,
  ) {
    return this.service.runReconciliation(user, dto, req);
  }

  @Get('reconciliation/runs')
  listReconciliationRuns(
    @CurrentUser() user: AuthUser,
    @Query() dto: QueryReconciliationRunsDto,
  ) {
    return this.service.listReconciliationRuns(user, dto);
  }

  @Get('reconciliation/runs/:id')
  getReconciliationRun(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getReconciliationRun(user, id);
  }

  @Get('exceptions')
  listExceptions(
    @CurrentUser() user: AuthUser,
    @Query() dto: QueryExceptionsDto,
  ) {
    return this.service.listExceptions(user, dto);
  }

  @Get('exceptions/:id')
  getException(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getException(user, id);
  }

  @Post('exceptions/:id/acknowledge')
  acknowledgeException(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcknowledgeExceptionDto,
    @Req() req: Request,
  ) {
    return this.service.acknowledgeException(user, id, dto, req);
  }

  @Post('exceptions/:id/assign')
  assignException(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignExceptionDto,
    @Req() req: Request,
  ) {
    return this.service.assignException(user, id, dto, req);
  }

  @Post('exceptions/:id/resolve')
  resolveException(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveExceptionDto,
    @Req() req: Request,
  ) {
    return this.service.resolveException(user, id, dto, req);
  }

  @Post('exceptions/:id/reopen')
  reopenException(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReopenExceptionDto,
    @Req() req: Request,
  ) {
    return this.service.reopenException(user, id, dto, req);
  }

  @Get('periods')
  listPeriods(
    @CurrentUser() user: AuthUser,
    @Query() dto: QueryPeriodsDto,
  ) {
    return this.service.listPeriods(user, dto);
  }

  @Get('periods/:id')
  getPeriod(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getPeriod(user, id);
  }

  @Post('periods')
  createPeriod(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePeriodDto,
    @Req() req: Request,
  ) {
    return this.service.createPeriod(user, dto, req);
  }

  @Post('periods/:id/review')
  reviewPeriod(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewPeriodDto,
    @Req() req: Request,
  ) {
    return this.service.reviewPeriod(user, id, dto, req);
  }

  @Post('periods/:id/close')
  closePeriod(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ClosePeriodDto,
    @Req() req: Request,
  ) {
    return this.service.closePeriod(user, id, dto, req);
  }

  @Get('revenue-breakdown')
  getPlatformRevenueBreakdown(
    @CurrentUser() user: AuthUser,
    @Query('periodStart') periodStart?: string,
    @Query('periodEnd') periodEnd?: string,
  ) {
    return this.service.getPlatformRevenueBreakdown(user, periodStart, periodEnd);
  }

  @Get('source-coverage')
  getSourceCoverage(
    @CurrentUser() user: AuthUser,
    @Query() dto: QuerySourceCoverageDto,
  ) {
    return this.service.getSourceCoverage(user, dto);
  }
}
