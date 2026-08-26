import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RentalService } from './rental.service';
import {
  ApplicationDecisionDto, CreateApplicationDto, CreateEnquiryDto, CreateViewingDto, ViewingResponseDto,
} from './rental.dto';
import { CurrentUser } from '../../common/auth/decorators';
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
}
