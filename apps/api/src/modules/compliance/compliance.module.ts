import { Global, Module } from '@nestjs/common';
import { ComplianceController, AdminComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

@Global()
@Module({
  controllers: [ComplianceController, AdminComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
