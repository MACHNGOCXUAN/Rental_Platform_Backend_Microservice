import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DatabaseService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('MongoDB connection established');
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB', error.message);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
      this.logger.log('MongoDB connection closed');
    } catch (error) {
      this.logger.error('Error closing MongoDB connection', error);
    }
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      // MongoDB không hỗ trợ SELECT 1
      await this.$runCommandRaw({ ping: 1 });

      return {
        database: {
          status: 'up',
          connection: 'active',
          type: 'mongodb',
        },
      };
    } catch (error) {
      this.logger.error('MongoDB health check failed', error);
      return {
        database: {
          status: 'down',
          connection: 'failed',
          error: error.message,
        },
      };
    }
  }
}
