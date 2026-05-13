import { AuthService } from "./auth.service";
import { OtpService } from "./otp.service";
import { PropertyService } from "./property.service";
import { EsmsService } from "./esms.service";
import { UserService } from "./user.service";
import { BookingService } from "./booking.service";
import { CloudinaryService } from "./cloudinary.service";
import { KycService } from "./kyc.service";
import { DashboardAnalyticsService } from "./dashboard-analytics.service";
import { ReviewService } from "./review.service";
import { PriceAnalyticsService } from "./price-analytics.service";
import { NewsService } from "./news.service";
import { BulkImportService } from "./bulk-import.service";

const Service = [
    AuthService,
    OtpService,
    PropertyService,
    EsmsService,
    UserService,
    BookingService,
    CloudinaryService,
    KycService,
    DashboardAnalyticsService,
    ReviewService,
    PriceAnalyticsService,
    NewsService,
    BulkImportService
]

export { CloudinaryService };
export default Service