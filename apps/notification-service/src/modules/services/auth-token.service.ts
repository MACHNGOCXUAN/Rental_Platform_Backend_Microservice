import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class AuthTokenService {
  async validateTokenViaHttp(token: string) {
    try {
      const res = await axios.post(
        `${process.env.ESTATE_SERVICE_URL}/api/estate/auth/validate-token`,
        { token },
        { timeout: 3000 },
      );

      const data = res.data?.data;

      if (!data || data.success !== true) {
        return null;
      }

      return data;
    } catch (err: any) {
      console.error(
        'Auth API error:',
        err.response?.data || err.message,
      );
      return null;
    }
  }
}
