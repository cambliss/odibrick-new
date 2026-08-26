import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { OperationsService } from './operations.service';
import {
  CreateDisputeDto, CreateMaintenanceDto, CreateTicketDto, DisputeEvidenceDto, DisputeUpdateDto,
  MaintenanceUpdateDto, TicketMessageDto,
} from './operations.dto';
import { CurrentUser } from '../../common/auth/decorators';
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
  listDisputes(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.ops.listDisputes(user, status);
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
