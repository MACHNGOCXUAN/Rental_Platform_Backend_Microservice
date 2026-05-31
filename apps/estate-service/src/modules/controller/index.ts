import { AuthController } from "./auth.controller"
import { BookingController } from "./booking.controller"
import { PropertyController } from "./property.controller"
import { UserAdminController } from "./user.admin.controller"
import { UserController } from "./user.controller"
import { UploadController } from "./upload.controller"
import { KycController } from "./kyc.controller"
import { KycAdminController } from "./kyc.admin.controller"
import { DashboardAnalyticsController } from "./dashboard-analytics.controller"
import { ReviewController } from "./review.controller"
import { PriceAnalyticsController } from "./price-analytics.controller"
import { NewsController } from "./news.controller"
import { BulkImportController } from "./bulk-import.controller"
import { ListingFeeController } from "./listing-fee.controller"

const Controller = [
    AuthController,
    PropertyController,
    UserAdminController,
    UserController,
    BookingController,
    UploadController,
    KycController,
    KycAdminController,
    DashboardAnalyticsController,
    ReviewController,
    PriceAnalyticsController,
    NewsController,
    BulkImportController,
    ListingFeeController
]

export default Controller