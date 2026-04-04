import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class DecimalTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => this.transform(data)),
    );
  }

  private transform(obj: any): any {
    // 1. Nếu là null hoặc không phải object thì trả về luôn
    if (obj === null || obj === undefined) {
      return obj;
    }

    // 2. Kiểm tra nếu là đối tượng Decimal (có cấu trúc s, e, d)
    if (this.isDecimal(obj)) {
      return this.decimalToNumber(obj);
    }

    // 3. Nếu là Mảng (ví dụ danh sách sản phẩm)
    if (Array.isArray(obj)) {
      return obj.map((item) => this.transform(item));
    }

    // 4. Nếu là Object (bao gồm cả Class Instance từ DB trả về)
    if (typeof obj === 'object' && !(obj instanceof Date)) {
      const clonedObj = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          clonedObj[key] = this.transform(obj[key]);
        }
      }
      return clonedObj;
    }

    return obj;
  }

  private isDecimal(obj: any): boolean {
    return (
      obj !== null &&
      typeof obj === 'object' &&
      's' in obj &&
      'e' in obj &&
      'd' in obj &&
      Array.isArray(obj.d)
    );
  }

  private decimalToNumber(decimal: any): number {
    // Nếu đối tượng có sẵn hàm toNumber() thì dùng (nhanh và chính xác nhất)
    if (typeof decimal.toNumber === 'function') {
      return decimal.toNumber();
    }

    // Nếu không (trường hợp object bị mất prototype), ta tính toán thủ công dựa trên cấu trúc s, e, d
    // Công thức: s * d_joined * 10^(e - d.length + 1)
    const { s, e, d } = decimal;
    const digits = d.join('');
    
    // Sử dụng Number và toFixed để tránh sai số dấu phẩy động
    const multiplier = Math.pow(10, e - digits.length + 1);
    const result = s * Number(digits) * multiplier;
    
    return result;
  }
}