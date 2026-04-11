import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private transporter: nodemailer.Transporter;

    constructor(private readonly configService: ConfigService) {
        this.transporter = nodemailer.createTransport({
            host: this.configService.get<string>('SMTP_HOST', 'smtp.gmail.com'),
            port: this.configService.get<number>('SMTP_PORT', 587),
            secure: false,
            auth: {
                user: this.configService.get<string>('SMTP_USER', ''),
                pass: this.configService.get<string>('SMTP_PASS', ''),
            },
        });
    }

    async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
        const smtpUser = this.configService.get<string>('SMTP_USER', '');
        if (!smtpUser || !to) {
            this.logger.warn(`Bỏ qua gửi email: SMTP chưa cấu hình hoặc thiếu email người nhận`);
            return false;
        }

        try {
            await this.transporter.sendMail({
                from: `"Rental Platform" <${smtpUser}>`,
                to,
                subject,
                html,
            });
            this.logger.log(`Gửi email thành công tới ${to}`);
            return true;
        } catch (error) {
            this.logger.error(`Gửi email thất bại tới ${to}:`, error);
            return false;
        }
    }

    async sendPropertyApprovedEmail(to: string, landlordName: string, propertyId: string): Promise<boolean> {
    const subject = 'Tin đăng của bạn đã được phê duyệt — Rental Platform';
    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Tin đăng đã được duyệt</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f3;padding:40px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e8e6;">

      <!-- Header -->
      <tr><td style="background:#f6fff9;padding:36px 40px 28px;border-bottom:1px solid #eef0ee;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#e6f7ee;border-radius:8px;width:32px;height:32px;text-align:center;vertical-align:middle;padding:7px;">
                    <img src="https://img.icons8.com/ios-filled/24/00875a/home.png" width="18" height="18" alt="" style="display:block;">
                  </td>
                  <td style="padding-left:10px;font-size:14px;font-weight:600;color:#1a1a1a;letter-spacing:-0.2px;">Rental Platform</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="padding-top:24px;">
            <span style="display:inline-block;background:#e6f7ee;color:#00875a;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;padding:5px 12px;border-radius:20px;">&#x2022; Đã phê duyệt</span>
          </td></tr>
          <tr><td style="padding-top:12px;font-size:26px;font-weight:700;color:#0d0d0d;letter-spacing:-0.5px;line-height:1.25;">
            Tin đăng của bạn<br>đã được duyệt
          </td></tr>
          <tr><td style="padding-top:8px;font-size:14px;color:#888;">Bất động sản đang hiển thị trên hệ thống</td></tr>
        </table>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 12px;font-size:15px;color:#333;">Xin chào <strong>${landlordName || 'bạn'}</strong>,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.75;">
          Chúng tôi vui mừng thông báo tin đăng bất động sản của bạn đã được đội ngũ quản trị xem xét và phê duyệt thành công. Tin đăng hiện đang hiển thị công khai trên nền tảng và sẵn sàng tiếp cận khách hàng.
        </p>

        <!-- Property card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf6;border:1px solid #b7ebcf;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:18px 20px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#00875a;margin-bottom:6px;">Mã bất động sản</div>
            <div style="font-size:15px;font-weight:600;color:#004d30;font-family:'Courier New',monospace;letter-spacing:0.5px;">${propertyId}</div>
          </td></tr>
        </table>

        <a href="#" style="display:inline-block;background:#00875a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:8px;letter-spacing:-0.1px;">Xem tin đăng của tôi</a>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:0 40px 28px;border-top:1px solid #f0f0f0;">
        <hr style="border:none;border-top:1px solid #f0f0f0;margin:0 0 20px;">
        <p style="margin:0 0 20px;font-size:14px;color:#333;line-height:1.6;">Trân trọng,<br><strong>Đội ngũ Rental Platform</strong></p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:12px;color:#ccc;">© 2025 Rental Platform</td>
            <td align="right" style="font-size:11px;">
              <a href="#" style="color:#ccc;text-decoration:none;margin-left:12px;">Trợ giúp</a>
              <a href="#" style="color:#ccc;text-decoration:none;margin-left:12px;">Liên hệ</a>
              <a href="#" style="color:#ccc;text-decoration:none;margin-left:12px;">Huỷ đăng ký</a>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
    return this.sendEmail(to, subject, html);
}

async sendPropertyRejectedEmail(to: string, landlordName: string, propertyId: string, reason?: string): Promise<boolean> {
    const subject = 'Tin đăng chưa được phê duyệt — Rental Platform';
    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f3;padding:40px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e8e6;">

      <tr><td style="background:#fff8f7;padding:36px 40px 28px;border-bottom:1px solid #f0eeed;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td>
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background:#fff0ee;border-radius:8px;width:32px;height:32px;text-align:center;vertical-align:middle;padding:7px;">
                <img src="https://img.icons8.com/ios-filled/24/cf2a1e/home.png" width="18" height="18" alt="" style="display:block;">
              </td>
              <td style="padding-left:10px;font-size:14px;font-weight:600;color:#1a1a1a;">Rental Platform</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding-top:24px;">
            <span style="display:inline-block;background:#fff0ee;color:#cf2a1e;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;padding:5px 12px;border-radius:20px;">&#x2022; Bị từ chối</span>
          </td></tr>
          <tr><td style="padding-top:12px;font-size:26px;font-weight:700;color:#0d0d0d;letter-spacing:-0.5px;line-height:1.25;">
            Tin đăng chưa<br>được phê duyệt
          </td></tr>
          <tr><td style="padding-top:8px;font-size:14px;color:#888;">Vui lòng xem xét và chỉnh sửa nội dung</td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 12px;font-size:15px;color:#333;">Xin chào <strong>${landlordName || 'bạn'}</strong>,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.75;">
          Rất tiếc, sau khi xem xét, đội ngũ quản trị chưa thể phê duyệt tin đăng của bạn. Bạn có thể xem lý do bên dưới, chỉnh sửa nội dung và gửi lại để được xét duyệt lần tiếp theo.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff5f4;border:1px solid #fac5c0;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:18px 20px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#cf2a1e;margin-bottom:6px;">Mã bất động sản</div>
            <div style="font-size:15px;font-weight:600;color:#7a1810;font-family:'Courier New',monospace;letter-spacing:0.5px;margin-bottom:${reason ? '14px' : '0'};">${propertyId}</div>
            ${reason ? `
            <hr style="border:none;border-top:1px solid #fac5c0;margin:0 0 14px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#cf2a1e;margin-bottom:6px;">Lý do từ chối</div>
            <div style="font-size:13px;color:#7a1810;line-height:1.6;">${reason}</div>
            ` : ''}
          </td></tr>
        </table>

        <a href="#" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:8px;">Chỉnh sửa tin đăng</a>
      </td></tr>

      <tr><td style="padding:0 40px 28px;">
        <hr style="border:none;border-top:1px solid #f0f0f0;margin:0 0 20px;">
        <p style="margin:0 0 20px;font-size:14px;color:#333;line-height:1.6;">Trân trọng,<br><strong>Đội ngũ Rental Platform</strong></p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:12px;color:#ccc;">© 2025 Rental Platform</td>
            <td align="right">
              <a href="#" style="color:#ccc;text-decoration:none;margin-left:12px;font-size:11px;">Trợ giúp</a>
              <a href="#" style="color:#ccc;text-decoration:none;margin-left:12px;font-size:11px;">Liên hệ</a>
              <a href="#" style="color:#ccc;text-decoration:none;margin-left:12px;font-size:11px;">Huỷ đăng ký</a>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
    return this.sendEmail(to, subject, html);
}

async sendPropertyPendingEmail(to: string, landlordName: string, propertyId: string): Promise<boolean> {
    const subject = 'Tin đăng đang chờ xét duyệt — Rental Platform';
    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f3;padding:40px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e8e6;">

      <tr><td style="background:#f7f9ff;padding:36px 40px 28px;border-bottom:1px solid #edeef5;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td>
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background:#eef2ff;border-radius:8px;width:32px;height:32px;text-align:center;vertical-align:middle;padding:7px;">
                <img src="https://img.icons8.com/ios-filled/24/3451d1/home.png" width="18" height="18" alt="" style="display:block;">
              </td>
              <td style="padding-left:10px;font-size:14px;font-weight:600;color:#1a1a1a;">Rental Platform</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding-top:24px;">
            <span style="display:inline-block;background:#eef2ff;color:#3451d1;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;padding:5px 12px;border-radius:20px;">&#x2022; Đang chờ duyệt</span>
          </td></tr>
          <tr><td style="padding-top:12px;font-size:26px;font-weight:700;color:#0d0d0d;letter-spacing:-0.5px;line-height:1.25;">
            Tin đăng đã được<br>gửi thành công
          </td></tr>
          <tr><td style="padding-top:8px;font-size:14px;color:#888;">Đội ngũ đang xem xét tin đăng của bạn</td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 12px;font-size:15px;color:#333;">Xin chào <strong>${landlordName || 'bạn'}</strong>,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.75;">
          Tin đăng bất động sản của bạn đã được tiếp nhận và đang trong hàng chờ xét duyệt. Chúng tôi sẽ thông báo ngay khi có kết quả — thường trong vòng 24–48 giờ làm việc.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6ff;border:1px solid #c0cdf7;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:18px 20px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#3451d1;margin-bottom:6px;">Mã bất động sản</div>
            <div style="font-size:15px;font-weight:600;color:#1a2e99;font-family:'Courier New',monospace;letter-spacing:0.5px;">${propertyId}</div>
          </td></tr>
        </table>

        <a href="#" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:8px;">Quản lý tin đăng</a>
      </td></tr>

      <tr><td style="padding:0 40px 28px;">
        <hr style="border:none;border-top:1px solid #f0f0f0;margin:0 0 20px;">
        <p style="margin:0 0 20px;font-size:14px;color:#333;line-height:1.6;">Trân trọng,<br><strong>Đội ngũ Rental Platform</strong></p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:12px;color:#ccc;">© 2025 Rental Platform</td>
            <td align="right">
              <a href="#" style="color:#ccc;text-decoration:none;margin-left:12px;font-size:11px;">Trợ giúp</a>
              <a href="#" style="color:#ccc;text-decoration:none;margin-left:12px;font-size:11px;">Liên hệ</a>
              <a href="#" style="color:#ccc;text-decoration:none;margin-left:12px;font-size:11px;">Huỷ đăng ký</a>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
    return this.sendEmail(to, subject, html);
}

  async sendOtpEmail(to: string, userName: string, otp: string): Promise<boolean> {
    const subject = 'Mã xác thực OTP — Rental Platform';
    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f3;padding:40px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e8e6;">

      <tr><td style="background:#f0fdf4;padding:36px 40px 28px;border-bottom:1px solid #d1fae5;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td>
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background:#eef2ff;border-radius:8px;width:32px;height:32px;text-align:center;vertical-align:middle;padding:7px;">
                <img src="https://img.icons8.com/ios-filled/24/3451d1/home.png" width="18" height="18" alt="" style="display:block;">
              </td>
              <td style="padding-left:10px;font-size:14px;font-weight:600;color:#1a1a1a;">Rental Platform</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding-top:24px;">
            <span style="display:inline-block;background:#dcfce7;color:#166534;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;padding:5px 12px;border-radius:20px;">&#x1F512; Xác thực email</span>
          </td></tr>
          <tr><td style="padding-top:12px;font-size:26px;font-weight:700;color:#0d0d0d;letter-spacing:-0.5px;line-height:1.25;">
            Mã xác thực OTP
          </td></tr>
          <tr><td style="padding-top:8px;font-size:14px;color:#888;">Vui lòng sử dụng mã bên dưới để xác thực email</td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 12px;font-size:15px;color:#333;">Xin chào <strong>${userName || 'bạn'}</strong>,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.75;">
          Bạn vừa yêu cầu mã OTP để xác thực địa chỉ email. Vui lòng nhập mã bên dưới vào ứng dụng. Mã có hiệu lực trong <strong>5 phút</strong>.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:2px dashed #86efac;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:24px 20px;text-align:center;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#166534;margin-bottom:10px;">Mã OTP của bạn</div>
            <div style="font-size:36px;font-weight:800;color:#166534;font-family:'Courier New',monospace;letter-spacing:8px;">${otp}</div>
          </td></tr>
        </table>

        <p style="margin:0 0 12px;font-size:13px;color:#999;line-height:1.6;">
          Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này. Không chia sẻ mã OTP với bất kỳ ai.
        </p>
      </td></tr>

      <tr><td style="padding:0 40px 28px;">
        <hr style="border:none;border-top:1px solid #f0f0f0;margin:0 0 20px;">
        <p style="margin:0 0 20px;font-size:14px;color:#333;line-height:1.6;">Trân trọng,<br><strong>Đội ngũ Rental Platform</strong></p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:12px;color:#ccc;">© 2025 Rental Platform</td>
            <td align="right">
              <a href="#" style="color:#ccc;text-decoration:none;margin-left:12px;font-size:11px;">Trợ giúp</a>
              <a href="#" style="color:#ccc;text-decoration:none;margin-left:12px;font-size:11px;">Liên hệ</a>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
    return this.sendEmail(to, subject, html);
  }
}
