import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

const envCandidates = ['.env.local', '.env'];
for (const candidate of envCandidates) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) {
    loadEnv({ path, override: false });
  }
}

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, '');
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const allowedOrigins = Array.from(
    new Set([
      normalizeOrigin('http://localhost:3000'),
      normalizeOrigin('http://127.0.0.1:3000'),
      ...(process.env.FRONTEND_ORIGIN
        ? process.env.FRONTEND_ORIGIN.split(',').map(normalizeOrigin).filter(Boolean)
        : []),
    ]),
  );
  app.enableCors({
    origin: allowedOrigins,
    credentials: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useStaticAssets(resolve(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });
  const port = Number(process.env.PORT ?? process.env.BACKEND_PORT ?? 4000);
  const host = process.env.BACKEND_HOST ?? '0.0.0.0';
  console.log(`[bootstrap] Allowed CORS origins: ${allowedOrigins.join(', ')}`);
  await app.listen(port, host);
}
bootstrap();
