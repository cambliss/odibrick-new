import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { OperationsService } from './operations.service';
import {
  AssignDisputeDto, CloseDisputeDto, CreateDisputeDto, CreateMaintenanceDto, CreateTicketDto,
  DisputeEvidenceDto, DisputeMessageDto, DisputeUpdateDto, EscalateDisputeDto,
  MaintenanceFinancialApprovalDto, MaintenanceFinancialRejectDto, MaintenanceUpdateDto,
  ReopenDisputeDto, ResolveDisputeDto, TicketMessageDto,
} from './operations.dto';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller()
export class OperationsController {
  constructor(private readonly ops: OperationsService) {}

  // maintenance
  @Post('maintenance')
  createMaintenance(@CurrentUser() user: AuthUser, @Body() dto: CreateMaintenanceDto) {
    return this.ops.createMaintenance(user, dto);
  }

  @Get('maintenance')
  listMaintenance(@CurrentUser() user: AuthUser, @Query('status') status?: string, @Query('page') page?: number) {
    return this.ops.listMaintenance(user, status, page);
  }

  @Get('maintenance/:id')
  maintenanceDetail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.ops.maintenanceDetail(user, id);
  }

  @Get('maintenance/:id/financial')
  getMaintenanceFinancial(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.ops.getMaintenanceFinancial(user, id);
  }

  @Post('maintenance/:id/financial-approve')
  @RequirePermissions('maintenance.manage')
  approveMaintenanceFinancial(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MaintenanceFinancialApprovalDto,
  ) {
    return this.ops.approveMaintenanceFinancial(user, id, dto);
  }

  @Post('maintenance/:id/financial-reject')
  @RequirePermissions('maintenance.manage')
  rejectMaintenanceFinancial(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MaintenanceFinancialRejectDto,
  ) {
    return this.ops.rejectMaintenanceFinancial(user, id, dto);
  }

  @Get('admin/finance/maintenance')
  @RequirePermissions('payment.manage')
  listMaintenanceFinancials(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('costBearer') costBearer?: string,
    @Query('page') page?: number,
  ) {
    return this.ops.listMaintenanceFinancials(user, { status, costBearer, page });
  }

  @Patch('maintenance/:id')
  updateMaintenance(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MaintenanceUpdateDto,
  ) {
    return this.ops.updateMaintenance(user, id, dto);
  }

  // disputes
  @Post('disputes')
  createDispute(@CurrentUser() user: AuthUser, @Body() dto: CreateDisputeDto) {
    return this.ops.createDispute(user, dto);
  }

  @Get('disputes')
  listDisputes(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('assignedTo') assignedTo?: number,
    @Query('onlyResolved') onlyResolved?: boolean | string,
    @Query('financialOnly') financialOnly?: boolean | string,
    @Query('mineOnly') mineOnly?: boolean | string,
  ) {
    return this.ops.listDisputes(user, { status, category, assignedTo, onlyResolved, financialOnly, mineOnly });
  }

  @Get('disputes/:id')
  disputeDetail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.ops.disputeDetail(user, id);
  }

  @Post('disputes/:id/evidence')
  addEvidence(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DisputeEvidenceDto,
  ) {
    return this.ops.addEvidence(user, id, dto);
  }

  @Post('disputes/:id/assign')
  assignDispute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignDisputeDto,
  ) {
    return this.ops.assignDispute(user, id, dto);
  }

  @Post('disputes/:id/escalate-legal')
  escalateToLegal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EscalateDisputeDto,
  ) {
    return this.ops.escalateToLegal(user, id, dto);
  }

  @Post('disputes/:id/resolve')
  resolveDispute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.ops.resolveDispute(user, id, dto);
  }

  @Post('disputes/:id/reopen')
  reopenDispute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReopenDisputeDto,
  ) {
    return this.ops.reopenDispute(user, id, dto);
  }

  @Post('disputes/:id/close')
  closeDispute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto?: CloseDisputeDto,
  ) {
    return this.ops.closeDispute(user, id, dto);
  }

  @Get('disputes/:id/messages')
  getDisputeMessages(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.ops.getDisputeMessages(user, id);
  }

  @Post('disputes/:id/messages')
  sendDisputeMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DisputeMessageDto,
  ) {
    return this.ops.sendDisputeMessage(user, id, dto);
  }

  @Patch('disputes/:id')
  updateDispute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DisputeUpdateDto,
  ) {
    return this.ops.updateDispute(user, id, dto.status, dto.resolution);
  }

  // support
  @Post('support/tickets')
  createTicket(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.ops.createTicket(user, dto);
  }

  @Get('support/tickets')
  listTickets(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.ops.listTickets(user, status);
  }

  @Get('support/tickets/:id')
  ticketDetail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.ops.ticketDetail(user, id);
  }

  @Post('support/tickets/:id/messages')
  reply(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: TicketMessageDto) {
    return this.ops.replyTicket(user, id, dto);
  }
}
