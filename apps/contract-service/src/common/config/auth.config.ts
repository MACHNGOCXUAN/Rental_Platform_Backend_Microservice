import { registerAs } from '@nestjs/config';
import ms from 'ms';
import { IAuthConfig } from 'src/interfaces/config.interface';

// chuyển đổi thời gian: vd 15m = 900000
function parseTimeToSeconds(timeString: string, defaultValue: string): number {
    try {
        return ms((timeString || defaultValue) as ms.StringValue) / 1000;
    } catch (error) {
        console.warn(
            `Định dạng thời gian không hợp lệ: ${timeString}, dùng giá trị mặc định: ${defaultValue}`,
        );
        return ms(defaultValue as ms.StringValue) / 1000;
    }
}

export default registerAs('auth', (): IAuthConfig => {
    // Lấy từ .env
    const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET_KEY;
    const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET_KEY;

    if (!accessTokenSecret || !refreshTokenSecret) {
        throw new Error(
            'Thiếu cấu hình JWT. Vui lòng kiểm tra ACCESS_TOKEN_SECRET_KEY và REFRESH_TOKEN_SECRET_KEY trong file .env',
        );
    }

    if (accessTokenSecret.length < 32 || refreshTokenSecret.length < 32) {
        console.warn('Cảnh báo bảo mật: Khóa bí mật JWT nên có độ dài tối thiểu 32 ký tự để đảm bảo an toàn.');
    }

    return {
        accessToken: {
            secret: accessTokenSecret,
            expirationTime: parseTimeToSeconds(
                process.env.ACCESS_TOKEN_EXPIRED ?? '15m',
                '15m',
            ),
        },
        refreshToken: {
            secret: refreshTokenSecret,
            expirationTime: parseTimeToSeconds(
                process.env.REFRESH_TOKEN_EXPIRED ?? '7d',
                '7d',
            ),
        },
    };
});