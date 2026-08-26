import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';

import { DatabaseModule } from './common/database/database.module';
import { AuditModule } from './common/audit/audit.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { AllExceptionsFilter } from './common/http/http-exception.filter';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { KycModule } from './modules/kyc/kyc.module';
import { StorageModule } from './modules/storage/storage.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { RentalModule } from './modules/rental/rental.module';
import { LegalModule } from './modules/legal/legal.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { InspectionsModule } from './modules/inspections/inspections.module';
import { OperationsModule } from './modules/operations/operations.module';
import { InsuranceModule } from './modules/insurance/insurance.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], cache: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    AuditModule,
    StorageModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    KycModule,
    PropertiesModule,
    RentalModule,
    PaymentsModule,
    LegalModule,
    InspectionsModule,
    OperationsModule,
    InsuranceModule,
    MarketingModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    // Auth first, then role/permission checks, then rate limiting.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
