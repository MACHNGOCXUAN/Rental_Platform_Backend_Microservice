import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';

@Injectable()
export class PropertyService {

    constructor(private readonly databaseService: DatabaseService) { }

    async getAllProperty(){
        return this.databaseService.property.findMany()
    }

    async createProperty(data) {
        return this.databaseService.property.create({
            data: {
                name: data.name,
                address: data.address,
                ownerId: data.ownerId,
                createdAt: new Date()
            },
        });
    }
}
