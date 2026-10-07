import { Module } from '@nestjs/common';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import {
  AdminLeadsController,
  AdminMarketplaceController,
  AdminVisitsController,
  CustomerMarketplaceController,
  MarketplaceController,
  ProviderLeadsController,
  ProviderVisitsController,
} from './marketplace-operations.controller';
import { MarketplaceOperationsService } from './marketplace-operations.service';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PaymentsModule, NotificationsModule],
  controllers: [
    PropertiesController,
    AdminMarketplaceController,
    AdminLeadsController,
    AdminVisitsController,
    ProviderLeadsController,
    ProviderVisitsController,
    CustomerMarketplaceController,
    MarketplaceController,
  ],
  providers: [PropertiesService, MarketplaceOperationsService],
  exports: [PropertiesService, MarketplaceOperationsService],
})
export class PropertiesModule {}
