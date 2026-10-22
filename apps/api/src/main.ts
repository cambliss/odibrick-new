import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // D-15: Enforce strict secret validation in production
  const nodeEnv = config.get<string>('app.env') || 'development';
  const accessSecret = config.get<string>('auth.accessSecret');
  const refreshSecret = config.get<string>('auth.refreshSecret');
  if (nodeEnv === 'production') {
    if (!accessSecret || accessSecret === 'dev-access-secret' || accessSecret.length < 32) {
      throw new Error('FATAL: JWT_ACCESS_SECRET is missing or weak in production environment.');
    }
    if (!refreshSecret || refreshSecret === 'dev-refresh-secret' || refreshSecret.length < 32) {
      throw new Error('FATAL: JWT_REFRESH_SECRET is missing or weak in production environment.');
    }
    if (!config.get<string>('auth.pepper')) {
      throw new Error('FATAL: PASSWORD_PEPPER must be configured in production environment.');
    }
    if (!config.get<string>('auth.fieldKey') || config.get<string>('auth.fieldKey')!.length < 32) {
      throw new Error('FATAL: FIELD_ENCRYPTION_KEY must be configured in production environment.');
    }
  }

  // D-13: Configure Express trust proxy for correct client IP resolution behind reverse proxy
  const expressApp = app.getHttpAdapter().getInstance();
  const trustProxy = config.get<string>('app.trustProxy') ?? '1';
  if (trustProxy === 'true' || trustProxy === '1') {
    expressApp.set('trust proxy', 1);
  } else if (!isNaN(Number(trustProxy))) {
    expressApp.set('trust proxy', Number(trustProxy));
  } else if (trustProxy) {
    expressApp.set('trust proxy', trustProxy);
  }

  app.setGlobalPrefix(config.get('app.prefix')!);
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: false, // the web app sets its own CSP
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.enableCors({
    origin: config.get<string[]>('app.corsOrigins'),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  app.enableShutdownHooks();

  const port = config.get<number>('app.port')!;
  await app.listen(port, '0.0.0.0');
  logger.log(`Odibrick API listening on 0.0.0.0:${port}/${config.get('app.prefix')}`);
}

bootstrap();
