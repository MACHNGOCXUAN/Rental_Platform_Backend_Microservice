import { AuthService } from "./auth.service";
import { OtpService } from "./otp.service";
import { PropertyService } from "./property.service";
import { EsmsService } from "./esms.service";
import { UserService } from "./user.service";
import { BookingService } from "./booking.service";
import { CloudinaryService } from "./cloudinary.service";
import { KycService } from "./kyc.service";
import { DashboardAnalyticsService } from "./dashboard-analytics.service";

const Service = [
    AuthService,
    OtpService,
    PropertyService,
    EsmsService,
    UserService,
    BookingService,
    CloudinaryService,
    KycService,
    DashboardAnalyticsService
]

export { CloudinaryService };
export default Service