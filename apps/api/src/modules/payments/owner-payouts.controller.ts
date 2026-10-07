import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { OwnerPayoutsService } from './owner-payouts.service';
import {
  ApprovePayoutDto,
  CreatePayoutDto,
  HoldPayoutDto,
  PayoutQueryDto,
  PreviewPayoutDto,
  ProcessPayoutDto,
  ReconcilePayoutDto,
  RecordPayoutPaymentDto,
  RejectPayoutDto,
} from './owner-payouts.dto';

@Controller('admin/finance/payouts')
export class OwnerPayoutsController {
  constructor(private readonly payouts: OwnerPayoutsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PayoutQueryDto) {
    return this.payouts.listPayouts(user, query);
  }

  @Get('preview')
  @RequirePermissions('payment.manage')
  preview(@CurrentUser() user: AuthUser, @Query() query: PreviewPayoutDto) {
    return this.payouts.previewOwnerPayable(user, query);
  }

  @Post()
  @RequirePermissions('payment.manage')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePayoutDto,
    @Req() req: Request,
  ) {
    return this.payouts.createPayout(user, dto, req);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.payouts.getPayout(user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('payment.manage')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApprovePayoutDto,
    @Req() req: Request,
  ) {
    return this.payouts.approvePayout(user, id, dto, req);
  }

  @Post(':id/reject')
  @RequirePermissions('payment.manage')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectPayoutDto,
    @Req() req: Request,
  ) {
    return this.payouts.rejectPayout(user, id, dto, req);
  }

  @Post(':id/hold')
  @RequirePermissions('payment.manage')
  hold(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HoldPayoutDto,
    @Req() req: Request,
  ) {
    return this.payouts.holdPayout(user, id, dto, req);
  }

  @Post(':id/process')
  @RequirePermissions('payment.manage')
  process(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProcessPayoutDto,
    @Req() req: Request,
  ) {
    return this.payouts.processPayout(user, id, dto, req);
  }

  @Post(':id/record-payment')
  @RequirePermissions('payment.manage')
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPayoutPaymentDto,
    @Req() req: Request,
  ) {
    return this.payouts.recordPayoutPayment(user, id, dto, req);
  }

  @Post(':id/reconcile')
  @RequirePermissions('payment.manage')
  reconcile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReconcilePayoutDto,
    @Req() req: Request,
  ) {
    return this.payouts.reconcilePayout(user, id, dto, req);
  }
}
