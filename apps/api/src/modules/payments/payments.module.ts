import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PAYMENT_PROVIDER } from './payments.tokens';
import { ManualPaymentProvider } from './providers/manual.provider';
import { GatewayPaymentProvider } from './providers/gateway.provider';

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
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
  exports: [PaymentsService],
})
export class PaymentsModule {}
