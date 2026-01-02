import { join } from 'path';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';

import configs from './config'
import Joi from 'joi';
import { DatabaseService } from './services/database.service';
import { HashService } from './services/hash.service';
import { RequestMiddleware } from './middlewares/request.middleware';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { AuthJwtAccessGuard } from './guards/jwt.access.guard';
import { RolesGuard } from './guards/roles.guard';
import { GrpcAuthModule } from 'src/services/grpc.auth.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            load: configs,
            isGlobal: true,
            cache: true,
            envFilePath: ['.env.docker', '.env'],
            expandVariables: true,
            validationSchema: Joi.object({
                // App Configuration
                NODE_ENV: Joi.string()
                    .valid('development', 'staging', 'production', 'local')
                    .default('development'),
                APP_NAME: Joi.string().default('NestJS Auth Service'),
                APP_DEBUG: Joi.boolean().truthy('true').falsy('false').default(false),

                // CORS Configuration
                APP_CORS_ORIGINS: Joi.string().default('http://localhost:3000'),

                // HTTP Configuration
                HTTP_ENABLE: Joi.boolean().truthy('true').falsy('false').default(true),
                HTTP_HOST: Joi.string().default('0.0.0.0'),
                HTTP_PORT: Joi.number().port().default(9001),
                HTTP_VERSIONING_ENABLE: Joi.boolean().truthy('true').falsy('false').default(false),
                HTTP_VERSION: Joi.number().valid(1, 2).default(1),

                // Monitoring
                SENTRY_DSN: Joi.string().allow('').optional(),

                // Database Configuration
                DATABASE_URL: Joi.string().uri().required(),

                // JWT Configuration
                ACCESS_TOKEN_SECRET_KEY: Joi.string().min(32).required(),
                ACCESS_TOKEN_EXPIRED: Joi.string().default('15m'),
                REFRESH_TOKEN_SECRET_KEY: Joi.string().min(32).required(),
                REFRESH_TOKEN_EXPIRED: Joi.string().default('7d'),

                // Redis Configuration
                REDIS_URL: Joi.string().uri().default('redis://localhost:6379'),
                REDIS_KEY_PREFIX: Joi.string().default('auth:'),
                REDIS_TTL: Joi.number().default(3600),

                // GRPC Configuration
                GRPC_URL: Joi.string().required(),
                GRPC_PACKAGE: Joi.string().default('auth'),
            }),
        }),
        PassportModule.register({
            defaultStrategy: 'jwt',
            session: false,
        }),
        GrpcAuthModule
    ],
    providers: [
        // Core Services
        DatabaseService,
        HashService,

        // Global Interceptors
        {
            provide: APP_INTERCEPTOR,
            useClass: ResponseInterceptor,
        },

        {
            provide: APP_GUARD,
            useClass: AuthJwtAccessGuard,
        },
        {
            provide: APP_GUARD,
            useClass: RolesGuard
        },
    ],
    exports: [
        DatabaseService,
        HashService,
        // AuthJwtAccessStrategy,
        // AuthJwtRefreshStrategy
    ],
})
export class CommonModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestMiddleware).forRoutes('*');
    }
}