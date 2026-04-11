import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { ConfirmPaymentDto, PaymentQueryDto } from '../dtos/payment.dto';
import { ContractService } from './contract.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class EstateClientService {
    constructor(private readonly config: ConfigService) { }

    // Url để call api của estate service
    private get baseUrl() {
        return this.config.get<string>('USER_SERVICE_URL');
    }

    // Token để xác thực khi call api nội bộ của estate service
    private get internalToken() {
        return this.config.get<string>('ESTATE_INTERNAL_TOKEN');
    }

    // Lấy thông tin user từ estate service
    async getUsersById(id: string) {
        const response = await axios.get(
            `${this.baseUrl}/api/estate/user/${id}`,
            { timeout: 2000 }
        );

        return response.data.data;
    }

    // Lấy thông tin property từ estate service
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

    // Cập nhật trạng thái bất động sản khi hợp đồng được kích hoạt hoặc kết thúc
    async updatePropertyContractStatus(
        propertyId: string,
        action: 'contract_active' | 'contract_ended',
        contractId?: string,
    ) {
        try {
            const headers: Record<string, string> = {};
            if (this.internalToken) {
                headers['x-internal-token'] = this.internalToken;
            }

            const response = await axios.post(
                `${this.baseUrl}/api/estate/properties/${propertyId}/contract-status`,
                { action, contractId },
                {
                    timeout: 5000,
                    headers,
                },
            );

            return response.data.data;
        } catch (error: any) {
            console.error('Error calling update property status API:', error.message);
            throw new Error('Không thể cập nhật trạng thái bất động sản');
        }
    }
}