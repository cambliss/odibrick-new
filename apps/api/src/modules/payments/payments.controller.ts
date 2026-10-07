import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { PaymentReminderService } from './payment-reminder.service';
import { RecordPaymentDto, RefundDto } from './payments.dto';
import { CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

import { InvoicesService } from './invoices.service';

@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly reminderService: PaymentReminderService,
    private readonly invoices: InvoicesService,
  ) {}

  @Get('payments')
  list(
    @CurrentUser() user: AuthUser,
    @Query('role') role?: 'PAYER' | 'PAYEE' | 'ALL',
    @Query('status') status?: string,
    @Query('page') page?: number,
  ) {
    return this.payments.myPayments(user, role ?? 'ALL', status, page);
  }

  @Get('payments/:id')
  ledger(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.payments.ledger(id, user);
  }

  @Get('payments/:id/invoice')
  async paymentInvoice(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.payments.ledger(id, user);
    return this.invoices.getInvoiceByPaymentId(user, id);
  }

  @Get('payments/:id/reminders')
  async reminders(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.payments.ledger(id, user);
    return this.reminderService.getPaymentReminders(id);
  }

  @Post('payments/:id/checkout')
  checkout(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.payments.startCheckout(user, id);
  }

  @Post('payments/:id/pay')
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { method?: string; reference?: string },
    @Req() req: Request,
  ) {
    return this.payments.settleByPayer(user, id, dto, req);
  }

  @Post('payments/generate-rent')
  generateRent(
    @CurrentUser() user: AuthUser,
    @Body() dto: { tenancyId?: number; year?: number; month?: number },
    @Req() req: Request,
  ) {
    return this.payments.generateMonthlyRent({
      tenancyId: dto.tenancyId ? Number(dto.tenancyId) : undefined,
      year: dto.year ? Number(dto.year) : undefined,
      month: dto.month ? Number(dto.month) : undefined,
      req,
    });
  }

  /** Provider webhook. Public route: authenticity comes from the signature. */
  @Public()
  @Post('payments/callback')
  callback(@Body() payload: Record<string, unknown>, @Headers('x-provider-signature') signature?: string) {
    return this.payments.handleCallback(payload, signature);
  }

  @Post('payments/:id/record')
  @RequirePermissions('payment.manage')
  record(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
    @Req() req: Request,
  ) {
    return this.payments.recordOfflinePayment(user, id, dto, req);
  }

  @Post('payments/:id/refund')
  @RequirePermissions('payment.manage')
  refund(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RefundDto,
    @Req() req: Request,
  ) {
    return this.payments.refund(user, id, dto, req);
  }

  @Get('commissions')
  @RequirePermissions('commission.manage')
  commissions(@Query('status') status?: string, @Query('page') page?: number) {
    return this.payments.commissionList(status, page);
  }

  @Post('commissions/:id/invoice')
  @RequirePermissions('commission.manage')
  invoice(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.payments.invoiceCommission(user, id);
  }
}
