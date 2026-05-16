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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const allowedOrigins = (
    process.env.FRONTEND_ORIGIN
      ? process.env.FRONTEND_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
      : ['http://localhost:3000', 'http://127.0.0.1:3000']
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
  const port = process.env.BACKEND_PORT ?? process.env.PORT ?? 4000;
  const host = process.env.BACKEND_HOST ?? 'localhost';
  const listenHost = host === 'localhost' ? '0.0.0.0' : host;
  await app.listen(port, listenHost);
}
bootstrap();
