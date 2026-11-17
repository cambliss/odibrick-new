import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { KycCryptoService } from './kyc-crypto.service';
import { KycTransitionService } from './kyc-transition.service';
import { VerificationOrchestrator } from './verification/verification.orchestrator';
import { KYC_PROVIDER } from './verification/provider.interface';
import { ManualProvider } from './verification/providers/manual.provider';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [KycController],
  providers: [
    KycService,
    KycCryptoService,
    KycTransitionService,
    ManualProvider,
    { provide: KYC_PROVIDER, useExisting: ManualProvider },
    VerificationOrchestrator,
  ],
  exports: [KycService, KycCryptoService, KycTransitionService, VerificationOrchestrator],
})
export class KycModule {}
