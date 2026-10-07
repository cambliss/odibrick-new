import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PaymentReminderService } from '../payments/payment-reminder.service';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly reminderService: PaymentReminderService,
  ) {}

  @Get('kpis')
  @RequirePermissions('analytics.read')
  kpis() {
    return this.admin.kpis();
  }

  @Get('finance/overview')
  @RequirePermissions('payment.manage')
  financeOverview(
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.admin.financeOverview({ period, from, to });
  }

  @Get('finance/ledger')
  @RequirePermissions('payment.manage')
  financeLedger(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('purpose') purpose?: string,
    @Query('status') status?: string,
    @Query('settlementStatus') settlementStatus?: string,
    @Query('tenancyId') tenancyId?: number,
    @Query('payerUserId') payerUserId?: number,
    @Query('payeeUserId') payeeUserId?: number,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('q') q?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.admin.financeLedger(
      {
        from,
        to,
        purpose,
        status,
        settlementStatus,
        tenancyId: tenancyId ? Number(tenancyId) : undefined,
        payerUserId: payerUserId ? Number(payerUserId) : undefined,
        payeeUserId: payeeUserId ? Number(payeeUserId) : undefined,
        paymentMethod,
        q,
      },
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  @Post('finance/reminders/run')
  @RequirePermissions('payment.manage')
  runReminders(@CurrentUser() user: AuthUser, @Body() body?: { targetDate?: string }) {
    return this.reminderService.processDueReminders(body?.targetDate, user);
  }

  @Get('finance/payment-escalations')
  @RequirePermissions('payment.manage')
  paymentEscalations(
    @Query('minDaysOverdue') minDays?: number,
    @Query('stage') stage?: string,
    @Query('limit') limit?: number,
    @Query('asOfDate') asOfDate?: string,
  ) {
    return this.reminderService.getPaymentEscalations({
      minDaysOverdue: minDays !== undefined && minDays !== null ? Number(minDays) : undefined,
      stage,
      limit: limit ? Number(limit) : undefined,
      asOfDate,
    });
  }

  @Get('governance-overview')
  @RequirePermissions('user.read')
  governanceOverview() {
    return this.admin.operationalOverview();
  }

  @Get('users')
  @RequirePermissions('user.read')
  users(
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: number,
  ) {
    return this.admin.users({ role, status, q }, page);
  }

  @Patch('users/:id/status')
  @RequirePermissions('user.manage')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string; reason?: string },
  ) {
    return this.admin.setUserStatus(user, id, body.status, body.reason);
  }

  @Post('users/:id/roles')
  @RequirePermissions('user.manage')
  assignRole(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { roleCode: string; grant: boolean },
  ) {
    return this.admin.assignRole(user, id, body.roleCode, body.grant !== false);
  }

  @Get('settings')
  @RequirePermissions('settings.manage')
  settings(@Query('group') group?: string) {
    return this.admin.settings(group);
  }

  @Patch('settings/:key')
  @RequirePermissions('settings.manage')
  updateSetting(@CurrentUser() user: AuthUser, @Param('key') key: string, @Body('value') value: unknown) {
    return this.admin.updateSetting(user, key, value);
  }

  @Get('commission-rules')
  @RequirePermissions('commission.manage')
  rules() {
    return this.admin.commissionRules();
  }

  @Post('commission-rules')
  @RequirePermissions('commission.manage')
  saveRule(@CurrentUser() user: AuthUser, @Body() body: any) {
    return this.admin.saveCommissionRule(user, body, body.id);
  }

  @Get('audit')
  @RequirePermissions('audit.read')
  audit(
    @Query('actorId') actorId?: number,
    @Query('action') action?: string,
    @Query('objectType') objectType?: string,
    @Query('page') page?: number,
  ) {
    return this.admin.auditLog({ actorId, action, objectType }, page);
  }

  @Get('fraud-signals')
  @RequirePermissions('audit.read')
  fraud() {
    return this.admin.fraudSignals();
  }
}
