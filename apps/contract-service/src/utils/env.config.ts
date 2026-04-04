import { BadRequestException } from '@nestjs/common';

export function getRequiredEnv(key: string): string {
    const value = process.env[key];

    if (!value) {
        throw new BadRequestException(`Thiếu cấu hình thanh toán: ${key}`);
    }

    return value;
}