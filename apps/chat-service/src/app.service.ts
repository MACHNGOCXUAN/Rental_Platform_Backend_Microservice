import { Injectable } from '@nestjs/common';
import { DatabaseService } from './common/services/database.service';

@Injectable()
export class AppService {
  constructor(
    private readonly databaseService: DatabaseService,
  ) {}
  getHello() {
    // return this.databaseService.user.findMany();
    return "Hello"
  }
}
