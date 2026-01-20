import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common';
import { Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const expressApp = app.getHttpAdapter().getInstance();

  const appName = configService.getOrThrow<string>('app.name');
  const env = configService.getOrThrow<string>('app.env');
  const port = configService.getOrThrow<number>('app.http.port');
  const host = configService.getOrThrow<string>('app.http.host');


  app.connectMicroservice({
    transport: Transport.RMQ,
    options: {
      urls: [configService.get<string>('rabbitmq.url', 'amqp://localhost:5672')],
      queue: "notification_queue",
      prefetchCount: configService.get<number>('rabbitmq.prefetch', 1),
      queueOptions: {
        durable: true,
      },
    },
  });

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

  // expressApp.get('/health', (_req: Request, res: Response) => {
  //   res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  // });

  await app.startAllMicroservices();
  await app.listen(port, host);

  logger.log(`🚀 ${appName} started at http://${host}:${port}`);
  logger.log(`🔌 gRPC server started at ${configService.get<string>('grpc.url')}`);
}
bootstrap();
