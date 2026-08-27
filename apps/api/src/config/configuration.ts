export interface AppConfig {
  env: string;
  port: number;
  prefix: string;
  webUrl: string;
  corsOrigins: string[];
}

export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? process.env.API_PORT ?? '4000', 10),
    prefix: process.env.API_PREFIX ?? 'api',
    webUrl: process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: parseInt(process.env.DB_PORT ?? '3306', 10),
    user: process.env.DB_USER ?? 'odibrick',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'odibrick',
    ssl: process.env.DB_SSL === 'true' || process.env.DB_SSL === '1',
    sslCa: process.env.DB_SSL_CA ?? '',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT ?? '15', 10),
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    refreshTtlDays: parseInt(process.env.JWT_REFRESH_TTL_DAYS ?? '30', 10),
    pepper: process.env.PASSWORD_PEPPER ?? '',
    fieldKey: process.env.FIELD_ENCRYPTION_KEY ?? '',
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? 'LOCAL') as 'LOCAL' | 'S3',
    localRoot: process.env.STORAGE_LOCAL_ROOT ?? '/var/lib/odibrick/storage',
    signedUrlTtl: parseInt(process.env.SIGNED_URL_TTL ?? '300', 10),
  },
  providers: {
    payment: process.env.PAYMENT_PROVIDER ?? 'manual',
    paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? '',
    video: process.env.VIDEO_PROVIDER ?? 'pending',
    kyc: process.env.KYC_PROVIDER ?? 'manual',
    insurance: process.env.INSURANCE_PROVIDER ?? 'manual',
    email: process.env.NOTIFICATION_EMAIL_PROVIDER ?? 'log',
    sms: process.env.NOTIFICATION_SMS_PROVIDER ?? 'log',
  },
});
