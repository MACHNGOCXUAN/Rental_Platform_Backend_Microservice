import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { ConfirmPaymentDto, PaymentQueryDto } from '../dtos/payment.dto';
import { ContractService } from './contract.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class EstateClientService {
    constructor(private readonly config: ConfigService) { }

    private get baseUrl() {
        return this.config.get<string>('USER_SERVICE_URL');
    }

    async getUsersById(id: string) {
        const response = await axios.get(
            `${this.baseUrl}/api/estate/user/${id}`,
            { timeout: 2000 }
        );

        return response.data.data;
    }

    async getPropertyDetail(id: string) {
        try {
            const response = await axios.get(`${this.baseUrl}/api/estate/properties/public/${id}`, {
                timeout: 5000,
            });
            return response.data.data;
        } catch (error: any) {
            console.error('Error calling property API:', error.message);
            throw new Error('Không thể lấy thông tin property');
        }
    }
}