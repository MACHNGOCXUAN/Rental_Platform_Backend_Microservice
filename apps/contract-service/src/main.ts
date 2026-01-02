import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { ConfigService } from '@nestjs/config';
import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common';
import { Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const expressApp = app.getHttpAdapter().getInstance();

  const appName = configService.getOrThrow<string>('app.name');
  const env = configService.getOrThrow<string>('app.env');
  const port = configService.getOrThrow<number>('app.http.port');
  const host = configService.getOrThrow<string>('app.http.host');

  // Validation (REQUEST)
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Serializer (RESPONSE)
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  expressApp.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  await app.listen(port, host);

  logger.log(`🚀 ${appName} started at http://${host}:${port}`);
  logger.log(`🔌 gRPC server started at ${configService.get<string>('grpc.url')}`);
}
bootstrap();
