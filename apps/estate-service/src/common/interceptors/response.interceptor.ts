import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { map, from, switchMap } from 'rxjs';
import { plainToInstance } from 'class-transformer';
import { MESSAGE_DTO_METADATA, MESSAGE_KEY_METADATA } from '../constants/response.constant';
import { IApiResponse } from '../interfaces/response.interface';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
    constructor(
        private readonly reflector: Reflector
    ) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<IApiResponse<unknown>> {
        const messageKey = this.reflector.get<string>(MESSAGE_KEY_METADATA, context.getHandler());

        const messageDto = this.reflector.get<new () => any>(
            MESSAGE_DTO_METADATA,
            context.getHandler(),
        );

        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode;

        return next.handle().pipe(
            switchMap(data =>
                of(this.getResponseMessage(messageKey, statusCode)).pipe(
                    map(message => {
                        let transformedData = data;

                        // transformedData = this.transformDecimals(transformedData); // Dùng để format tính toán Decimal

                        if (messageDto && data) {
                            transformedData = plainToInstance(messageDto, data, {
                                enableImplicitConversion: true
                            });
                        }

                        return {
                            statusCode,
                            timestamp: new Date().toISOString(),
                            message,
                            data: transformedData ?? null,
                        };
                    }),
                ),
            ),
        );
    }

    private getResponseMessage(
        messageKey: string | undefined,
        statusCode: number,
    ): string {
        if (messageKey) {
            return messageKey;
        }

        return this.getDefaultMessageKey(statusCode);
    }

    private getDefaultMessageKey(statusCode: number): string {
        return `http.success.${statusCode}`;
    }

    private transformDecimals(obj: any): any {
        if (obj === null || obj === undefined) return obj;

        // ✅ Kiểm tra cấu trúc Decimal
        if (this.isDecimalLike(obj)) {
            return this.decimalToNumber(obj);
        }

        // Handle arrays
        if (Array.isArray(obj)) {
            return obj.map(item => this.transformDecimals(item));
        }

        // Handle objects
        if (typeof obj === 'object' && obj.constructor === Object) {
            return Object.fromEntries(
                Object.entries(obj).map(([key, value]) => [
                    key,
                    this.transformDecimals(value),
                ]),
            );
        }

        return obj;
    }

    private isDecimalLike(obj: any): boolean {
        return (
            typeof obj === 'object' &&
            obj !== null &&
            's' in obj &&
            'e' in obj &&
            'd' in obj &&
            Array.isArray(obj.d) &&
            typeof obj.s === 'number' &&
            typeof obj.e === 'number'
        );
    }

    private decimalToNumber(decimal: any): number {
        // Nếu có method toNumber()
        if (typeof decimal.toNumber === 'function') {
            return decimal.toNumber();
        }

        // Tính toán thủ công
        const { s, e, d } = decimal;
        const digits = d.join('');
        const value = parseFloat(`${digits}e${e}`);
        
        return s === 1 ? value : -value;
    }
}