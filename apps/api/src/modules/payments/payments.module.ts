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
import { RazorpayPaymentProvider } from './providers/razorpay.provider';

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
    RazorpayPaymentProvider,
    {
      // Swapping providers is a config change, not a code change.
      // Default to RazorpayPaymentProvider unless explicitly set to manual or gateway
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, ManualPaymentProvider, RazorpayPaymentProvider, GatewayPaymentProvider],
      useFactory: (
        config: ConfigService,
        manual: ManualPaymentProvider,
        razorpay: RazorpayPaymentProvider,
        gateway: GatewayPaymentProvider,
      ) => {
        const providerName = config.get('providers.payment');
        if (providerName === 'manual') return manual;
        if (providerName === 'gateway') return gateway;
        return razorpay;
      },
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
