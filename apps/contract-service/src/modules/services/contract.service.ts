import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';

@Injectable()
export class ContractService {

    constructor(private readonly databaseService: DatabaseService) { }

    async getAllContract() {
        return this.databaseService.rentalContract.findMany();
    }

    async createRentalContract(data: {
        propertyId: string;
        ownerId: string;
        tenantId: string;
        contractCode: string;
        startDate: Date;
        endDate: Date;
        monthlyRent: number;
        depositAmount: number;
    }) {
        return this.databaseService.rentalContract.create({
            data: {
                propertyId: data.propertyId,
                ownerId: data.ownerId,
                tenantId: data.tenantId,
                contractCode: data.contractCode,

                startDate: data.startDate,
                endDate: data.endDate,

                monthlyRent: data.monthlyRent,
                depositAmount: data.depositAmount,
            },
        });
    }
}
