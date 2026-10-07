import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RentalService } from './rental.service';
import {
  AcceptSettlementDto, AdminApplicationDecideDto, AdminTenancyOverrideDto, ApplicationDecisionDto,
  ConfirmMoveOutDto, ConfirmRenewalDto, CreateApplicationDto, CreateEnquiryDto,
  CreateViewingDto, DisputeSettlementDto, ProposeRenewalDto, ProposeSettlementDto,
  RequestMoveOutDto, ViewingResponseDto,
} from './rental.dto';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller()
export class RentalController {
  constructor(private readonly rental: RentalService) {}

  @Post('enquiries')
  createEnquiry(@CurrentUser() user: AuthUser, @Body() dto: CreateEnquiryDto, @Req() req: Request) {
    return this.rental.createEnquiry(user, dto, req);
  }

  @Get('enquiries/received')
  leads(@CurrentUser() user: AuthUser, @Query('status') status?: string, @Query('page') page?: number) {
    return this.rental.listLeads(user, status, page);
  }

  @Patch('enquiries/:id')
  updateEnquiry(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body('status') status: string) {
    return this.rental.updateEnquiryStatus(user, id, status);
  }

  @Post('viewings')
  requestViewing(@CurrentUser() user: AuthUser, @Body() dto: CreateViewingDto) {
    return this.rental.requestViewing(user, dto);
  }

  @Patch('viewings/:id')
  respondViewing(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ViewingResponseDto,
  ) {
    return this.rental.respondToViewing(user, id, dto.status, dto.scheduledFor);
  }

  @Post('applications')
  apply(@CurrentUser() user: AuthUser, @Body() dto: CreateApplicationDto, @Req() req: Request) {
    return this.rental.apply(user, dto, req);
  }

  @Get('applications/mine')
  async mine(@CurrentUser() user: AuthUser) {
    const data = await this.rental.myApplications(user);
    return { data };
  }

  @Get('applications/received')
  async received(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    const data = await this.rental.receivedApplications(user, status);
    return { data };
  }

  @Post('applications/:id/decision')
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplicationDecisionDto,
    @Req() req: Request,
  ) {
    return this.rental.decide(user, id, dto, req);
  }

  @Get('tenancies')
  tenancies(@CurrentUser() user: AuthUser) {
    return this.rental.myTenancies(user);
  }

  @Get('tenancies/:id')
  tenancy(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.rental.tenancyDetail(user, id);
  }

  @Get('tenancies/:id/financial-summary')
  financialSummary(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.rental.tenancyFinancialSummary(user, id);
  }

  @Post('tenancies/:id/renew')
  proposeRenewal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProposeRenewalDto,
    @Req() req: Request,
  ) {
    return this.rental.proposeRenewal(user, id, dto, req);
  }

  @Post('tenancies/:id/renew/confirm')
  confirmRenewal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmRenewalDto,
    @Req() req: Request,
  ) {
    return this.rental.confirmRenewal(user, id, dto, req);
  }

  @Post('tenancies/:id/move-out')
  requestMoveOut(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestMoveOutDto,
    @Req() req: Request,
  ) {
    return this.rental.requestMoveOut(user, id, dto, req);
  }

  @Post('tenancies/:id/move-out/confirm')
  confirmMoveOut(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmMoveOutDto,
    @Req() req: Request,
  ) {
    return this.rental.confirmMoveOut(user, id, dto, req);
  }

  @Post('tenancies/:id/settlement')
  proposeSettlement(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProposeSettlementDto,
    @Req() req: Request,
  ) {
    return this.rental.proposeSettlement(user, id, dto, req);
  }

  @Post('tenancies/:id/settlement/accept')
  acceptSettlement(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcceptSettlementDto,
    @Req() req: Request,
  ) {
    return this.rental.acceptSettlement(user, id, dto, req);
  }

  @Post('tenancies/:id/settlement/dispute')
  disputeSettlement(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DisputeSettlementDto,
    @Req() req: Request,
  ) {
    return this.rental.disputeSettlement(user, id, dto, req);
  }

  @Post('applications/:id/admin-decide')
  @RequirePermissions('application.decide')
  adminDecideApplication(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminApplicationDecideDto,
    @Req() req: Request,
  ) {
    return this.rental.adminDecideApplication(user, id, dto, req);
  }

  @Post('tenancies/:id/admin-override')
  @RequirePermissions('tenancy.manage')
  adminOverrideTenancy(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminTenancyOverrideDto,
    @Req() req: Request,
  ) {
    return this.rental.adminOverrideTenancy(user, id, dto, req);
  }
}
