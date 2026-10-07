import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentReminderService } from './payment-reminder.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { OwnerPayoutsController } from './owner-payouts.controller';
import { OwnerPayoutsService } from './owner-payouts.service';
import { FinancialOperationsController } from './financial-operations.controller';
import { FinancialOperationsService } from './financial-operations.service';
import { CommercialOperationsController } from './commercial-operations.controller';
import { CommercialOperationsService } from './commercial-operations.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PAYMENT_PROVIDER } from './payments.tokens';
import { ManualPaymentProvider } from './providers/manual.provider';
import { GatewayPaymentProvider } from './providers/gateway.provider';

@Module({
  imports: [NotificationsModule],
  controllers: [
    PaymentsController,
    InvoicesController,
    OwnerPayoutsController,
    FinancialOperationsController,
    CommercialOperationsController,
  ],
  providers: [
    PaymentsService,
    PaymentReminderService,
    InvoicesService,
    OwnerPayoutsService,
    FinancialOperationsService,
    CommercialOperationsService,
    ManualPaymentProvider,
    GatewayPaymentProvider,
    {
      // Swapping providers is a config change, not a code change.
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, ManualPaymentProvider, GatewayPaymentProvider],
      useFactory: (config: ConfigService, manual: ManualPaymentProvider, gateway: GatewayPaymentProvider) =>
        config.get('providers.payment') === 'manual' ? manual : gateway,
    },
  ],
  exports: [
    PaymentsService,
    PaymentReminderService,
    InvoicesService,
    OwnerPayoutsService,
    FinancialOperationsService,
    CommercialOperationsService,
  ],
})
export class PaymentsModule {}
