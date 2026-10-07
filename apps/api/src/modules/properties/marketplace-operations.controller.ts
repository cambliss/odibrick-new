import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { MarketplaceOperationsService } from './marketplace-operations.service';
import {
  AdminLeadsQueryDto,
  AdminVisitsQueryDto,
  AssignLeadDto,
  AssignVisitDto,
  CancelVisitDto,
  CompleteVisitDto,
  ConfirmVisitDto,
  ContactLeadDto,
  ConvertLeadDto,
  CustomerVisitsQueryDto,
  FollowUpLeadDto,
  ManagementPromotionOverrideDto,
  MarketplaceLeadsQueryDto,
  MarketplaceListingsQueryDto,
  MarkLeadDuplicateDto,
  MarkLeadLostDto,
  MarkLeadSpamDto,
  ModerateListingDto,
  NoShowVisitDto,
  OverrideVisitDto,
  PreviewPackagePurchaseDto,
  ProposeVisitDto,
  ProviderLeadsQueryDto,
  ProviderVisitsQueryDto,
  PurchasePackageDto,
  QualifyLeadDto,
  RecordLeadDto,
  RequestVisitDto,
  RescheduleVisitDto,
  SavePropertyDto,
} from './marketplace-operations.dto';
import { CurrentUser, Public, RequirePermissions, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

// =============================================================================
// ADMIN MARKETPLACE & LISTINGS GOVERNANCE
// =============================================================================
@Controller('admin/marketplace')
export class AdminMarketplaceController {
  constructor(private readonly marketplace: MarketplaceOperationsService) {}

  @Get('overview')
  @Roles('SUPER_ADMIN', 'ADMIN')
  overview(@CurrentUser() user: AuthUser) {
    return this.marketplace.getMarketplaceOverview(user);
  }

  @Get('listings')
  @Roles('SUPER_ADMIN', 'ADMIN')
  listListings(
    @CurrentUser() user: AuthUser,
    @Query() query: MarketplaceListingsQueryDto,
  ) {
    return this.marketplace.listMarketplaceListings(user, query);
  }

  @Get('listings/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  getListing(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.marketplace.getListingDetail(user, id);
  }

  @Post('listings/:id/moderate')
  @Roles('SUPER_ADMIN', 'ADMIN')
  moderate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModerateListingDto,
    @Req() req: Request,
  ) {
    return this.marketplace.moderateListing(user, id, dto, req);
  }

  @Post('listings/:id/override')
  @Roles('SUPER_ADMIN', 'ADMIN')
  override(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManagementPromotionOverrideDto,
    @Req() req: Request,
  ) {
    return this.marketplace.managementOverridePromotion(user, id, dto, req);
  }

  @Post('listings/:id/check-duplicate')
  @Roles('SUPER_ADMIN', 'ADMIN')
  checkDuplicate(@Param('id', ParseIntPipe) id: number) {
    return this.marketplace.checkDuplicate(id);
  }

  @Get('promotions')
  @Roles('SUPER_ADMIN', 'ADMIN')
  listPromotions(
    @CurrentUser() user: AuthUser,
    @Query('listingId') listingId?: number,
    @Query('status') status?: string,
  ) {
    return this.marketplace.listPromotions(user, listingId ? Number(listingId) : undefined, status);
  }

  @Post('promotions/process-expiries')
  @Roles('SUPER_ADMIN', 'ADMIN')
  processExpiries() {
    return this.marketplace.processExpiredPromotions();
  }

  @Get('leads')
  @Roles('SUPER_ADMIN', 'ADMIN')
  listLeads(
    @CurrentUser() user: AuthUser,
    @Query() query: MarketplaceLeadsQueryDto,
  ) {
    return this.marketplace.listMarketplaceLeads(user, query);
  }

  @Get('attribution')
  @Roles('SUPER_ADMIN', 'ADMIN')
  getAttribution(
    @CurrentUser() user: AuthUser,
    @Query('listingId') listingId?: number,
  ) {
    return this.marketplace.getAttributionFunnel(user, listingId ? Number(listingId) : undefined);
  }
}

// =============================================================================
// ADMIN LEAD CONTROL CENTRE (PHASE 10)
// =============================================================================
@Controller('admin/leads')
export class AdminLeadsController {
  constructor(private readonly marketplace: MarketplaceOperationsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  listAllLeads(
    @CurrentUser() user: AuthUser,
    @Query() query: AdminLeadsQueryDto,
  ) {
    return this.marketplace.listAdminLeads(user, query);
  }

  @Get('analytics')
  @Roles('SUPER_ADMIN', 'ADMIN')
  analytics(@CurrentUser() user: AuthUser) {
    return this.marketplace.getAdminLeadsAnalytics(user);
  }

  @Get('stale')
  @Roles('SUPER_ADMIN', 'ADMIN')
  listStaleLeads(
    @CurrentUser() user: AuthUser,
    @Query() query: AdminLeadsQueryDto,
  ) {
    return this.marketplace.listAdminLeads(user, { ...query, staleOnly: true });
  }

  @Post('process-sla-escalations')
  @Roles('SUPER_ADMIN', 'ADMIN')
  processSlaEscalations(@CurrentUser() user: AuthUser) {
    return this.marketplace.processSlaEscalations(user);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  getLead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.marketplace.getProviderLeadDetail(user, id);
  }

  @Post(':id/assign')
  @Roles('SUPER_ADMIN', 'ADMIN')
  assignLead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignLeadDto,
    @Req() req: Request,
  ) {
    return this.marketplace.assignLead(user, id, dto, req);
  }

  @Post(':id/reassign')
  @Roles('SUPER_ADMIN', 'ADMIN')
  reassignLead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignLeadDto,
    @Req() req: Request,
  ) {
    return this.marketplace.reassignLead(user, id, dto, req);
  }

  @Post(':id/mark-spam')
  @Roles('SUPER_ADMIN', 'ADMIN')
  markSpam(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkLeadSpamDto,
    @Req() req: Request,
  ) {
    return this.marketplace.markLeadSpam(user, id, dto, req);
  }

  @Post(':id/mark-duplicate')
  @Roles('SUPER_ADMIN', 'ADMIN')
  markDuplicate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkLeadDuplicateDto,
    @Req() req: Request,
  ) {
    return this.marketplace.markLeadDuplicate(user, id, dto, req);
  }

  @Post(':id/reopen')
  @Roles('SUPER_ADMIN', 'ADMIN')
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.marketplace.reopenLead(user, id, req);
  }
}

// =============================================================================
// PROVIDER / OWNER / AGENT LEAD MANAGEMENT INBOX (PHASE 10)
// =============================================================================
@Controller('provider/leads')
export class ProviderLeadsController {
  constructor(private readonly marketplace: MarketplaceOperationsService) {}

  @Get()
  listLeads(
    @CurrentUser() user: AuthUser,
    @Query() query: ProviderLeadsQueryDto,
  ) {
    return this.marketplace.listProviderLeads(user, query);
  }

  @Get('analytics')
  analytics(@CurrentUser() user: AuthUser) {
    return this.marketplace.getProviderLeadsAnalytics(user);
  }

  @Get(':id')
  getLead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.marketplace.getProviderLeadDetail(user, id);
  }

  @Post(':id/acknowledge')
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.marketplace.acknowledgeLead(user, id, req);
  }

  @Post(':id/contact')
  contact(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ContactLeadDto,
    @Req() req: Request,
  ) {
    return this.marketplace.contactLead(user, id, dto, req);
  }

  @Post(':id/qualify')
  qualify(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: QualifyLeadDto,
    @Req() req: Request,
  ) {
    return this.marketplace.qualifyLead(user, id, dto, req);
  }

  @Post(':id/follow-up')
  addFollowUp(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FollowUpLeadDto,
    @Req() req: Request,
  ) {
    return this.marketplace.addLeadFollowUp(user, id, dto, req);
  }

  @Post(':id/lost')
  markLost(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkLeadLostDto,
    @Req() req: Request,
  ) {
    return this.marketplace.markLeadLost(user, id, dto, req);
  }

  @Post(':id/convert')
  convert(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConvertLeadDto,
    @Req() req: Request,
  ) {
    return this.marketplace.convertLead(user, id, dto, req);
  }

  @Post(':id/close')
  close(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.marketplace.closeLead(user, id, req);
  }
}

// =============================================================================
// CUSTOMER MARKETPLACE EXPERIENCE (PHASE 10)
// =============================================================================
@Controller('customer')
export class CustomerMarketplaceController {
  constructor(private readonly marketplace: MarketplaceOperationsService) {}

  @Get('saved-properties')
  savedProperties(@CurrentUser() user: AuthUser) {
    return this.marketplace.listCustomerSavedProperties(user);
  }

  @Post('saved-properties/:id')
  toggleSaved(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body('note') note?: string,
  ) {
    return this.marketplace.toggleCustomerSavedProperty(user, id, note);
  }

  @Delete('saved-properties/:id')
  unsaved(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.marketplace.toggleCustomerSavedProperty(user, id);
  }

  @Get('enquiries')
  myEnquiries(@CurrentUser() user: AuthUser) {
    return this.marketplace.listCustomerEnquiries(user);
  }

  @Get('enquiries/:id')
  getEnquiry(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.marketplace.getCustomerEnquiryDetail(user, id);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.marketplace.getCustomerDashboard(user);
  }

  @Get('visits')
  myVisits(
    @CurrentUser() user: AuthUser,
    @Query() query: CustomerVisitsQueryDto,
  ) {
    return this.marketplace.listCustomerVisits(user, query);
  }

  @Get('visits/:id')
  getVisit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.marketplace.getCustomerVisitDetail(user, id);
  }

  @Post('visits')
  requestVisit(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.requestVisit(user, dto, req);
  }

  @Post('visits/:id/confirm')
  confirmVisit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.confirmCustomerVisit(user, id, dto, req);
  }

  @Post('visits/:id/cancel')
  cancelVisit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.cancelCustomerVisit(user, id, dto, req);
  }

  @Post('visits/:id/reschedule')
  rescheduleVisit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RescheduleVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.rescheduleCustomerVisit(user, id, dto, req);
  }
}

// =============================================================================
// PROVIDER VISITS CONTROLLER (PHASE 11)
// =============================================================================
@Controller('provider/visits')
export class ProviderVisitsController {
  constructor(private readonly marketplace: MarketplaceOperationsService) {}

  @Get()
  listVisits(
    @CurrentUser() user: AuthUser,
    @Query() query: ProviderVisitsQueryDto,
  ) {
    return this.marketplace.listProviderVisits(user, query);
  }

  @Get(':id')
  getVisit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.marketplace.getProviderVisitDetail(user, id);
  }

  @Post('propose/:enquiryId')
  propose(
    @CurrentUser() user: AuthUser,
    @Param('enquiryId', ParseIntPipe) enquiryId: number,
    @Body() dto: ProposeVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.proposeProviderVisit(user, enquiryId, dto, req);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.confirmProviderVisit(user, id, dto, req);
  }

  @Post(':id/reschedule')
  reschedule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RescheduleVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.rescheduleProviderVisit(user, id, dto, req);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.cancelProviderVisit(user, id, dto, req);
  }

  @Post(':id/complete')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.completeProviderVisit(user, id, dto, req);
  }

  @Post(':id/no-show')
  noShow(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoShowVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.recordVisitNoShow(user, id, dto, req);
  }

  @Post(':id/convert')
  convert(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConvertLeadDto,
    @Req() req: Request,
  ) {
    return this.marketplace.convertVisitToApplication(user, id, dto, req);
  }
}

// =============================================================================
// ADMIN VISITS CONTROL CENTRE (PHASE 11)
// =============================================================================
@Controller('admin/visits')
export class AdminVisitsController {
  constructor(private readonly marketplace: MarketplaceOperationsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  listVisits(
    @CurrentUser() user: AuthUser,
    @Query() query: AdminVisitsQueryDto,
  ) {
    return this.marketplace.listAdminVisits(user, query);
  }

  @Get('analytics')
  @Roles('SUPER_ADMIN', 'ADMIN')
  analytics(@CurrentUser() user: AuthUser) {
    return this.marketplace.getAdminVisitsAnalytics(user);
  }

  @Post('process-reminders')
  @Roles('SUPER_ADMIN', 'ADMIN')
  reminders(@CurrentUser() user: AuthUser) {
    return this.marketplace.processVisitReminders(user);
  }

  @Post('sla-escalate')
  @Roles('SUPER_ADMIN', 'ADMIN')
  slaEscalate(@CurrentUser() user: AuthUser) {
    return this.marketplace.processVisitSlaEscalations(user);
  }

  @Post(':id/assign')
  @Roles('SUPER_ADMIN', 'ADMIN')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.assignVisitHost(user, id, dto, req);
  }

  @Post(':id/override')
  @Roles('SUPER_ADMIN', 'ADMIN')
  override(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OverrideVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.overrideVisit(user, id, dto, req);
  }

  @Post(':id/cancel')
  @Roles('SUPER_ADMIN', 'ADMIN')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.cancelAdminVisit(user, id, dto, req);
  }
}

// =============================================================================
// PUBLIC & LISTER MARKETPLACE CONTROLLER
// =============================================================================
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceOperationsService) {}

  @Public()
  @Get('packages')
  packages(@Query('audience') audience?: string) {
    return this.marketplace.listPackages(audience);
  }

  @Post('listings/:id/packages/preview')
  previewPackage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body('packageId', ParseIntPipe) packageId: number,
  ) {
    return this.marketplace.previewPackagePurchase(user, id, packageId);
  }

  @Post('listings/:id/packages/purchase')
  purchasePackage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body('packageId', ParseIntPipe) packageId: number,
    @Req() req: Request,
  ) {
    return this.marketplace.purchasePackage(user, id, packageId, req);
  }

  @Get('listings/:id/promotions')
  promotions(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.marketplace.listPromotions(user, id);
  }

  @Get('my-listings')
  myListings(
    @CurrentUser() user: AuthUser,
    @Query() query: MarketplaceListingsQueryDto,
  ) {
    return this.marketplace.listMarketplaceListings(user, query);
  }

  @Get('leads/mine')
  myLeads(
    @CurrentUser() user: AuthUser,
    @Query() query: MarketplaceLeadsQueryDto,
  ) {
    return this.marketplace.listMarketplaceLeads(user, query);
  }

  @Post('listings/:id/enquiries')
  submitEnquiry(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordLeadDto,
    @Req() req: Request,
  ) {
    return this.marketplace.recordLead(user, { ...dto, propertyId: id }, req);
  }

  @Post('leads')
  recordLead(
    @CurrentUser() user: AuthUser,
    @Body() dto: RecordLeadDto,
    @Req() req: Request,
  ) {
    return this.marketplace.recordLead(user, dto, req);
  }

  @Get('my-visits')
  myVisits(
    @CurrentUser() user: AuthUser,
    @Query() query: CustomerVisitsQueryDto,
  ) {
    return this.marketplace.listCustomerVisits(user, query);
  }

  @Get('visits/:id')
  getVisit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.marketplace.getCustomerVisitDetail(user, id);
  }

  @Post('visits')
  requestVisit(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.requestVisit(user, dto, req);
  }

  @Post('visits/:id/confirm')
  confirmVisit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.confirmCustomerVisit(user, id, dto, req);
  }

  @Post('visits/:id/cancel')
  cancelVisit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.cancelCustomerVisit(user, id, dto, req);
  }

  @Post('visits/:id/reschedule')
  rescheduleVisit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RescheduleVisitDto,
    @Req() req: Request,
  ) {
    return this.marketplace.rescheduleCustomerVisit(user, id, dto, req);
  }
}

