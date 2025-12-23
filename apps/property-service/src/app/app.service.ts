import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';

@Injectable()
export class AppService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getHello() {
    return "Mach Ngoc Xuan"
  }
}
