import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class DecimalTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => this.transformDecimals(data))
    );
  }

  private transformDecimals(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    
    if (this.isDecimalLike(obj)) {
      return this.decimalToNumber(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.transformDecimals(item));
    }
    
    if (typeof obj === 'object' && obj.constructor === Object) {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [
          key, 
          this.transformDecimals(value)
        ])
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
    if (typeof decimal.toNumber === 'function') {
      return decimal.toNumber();
    }
    const { s, e, d } = decimal;
    
    const digits = d.join('');

    const value = parseFloat(`${digits}e${e}`);
    
    return s === 1 ? value : -value;
  }
}