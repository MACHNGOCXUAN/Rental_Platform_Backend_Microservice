import { AuthController } from "./auth.controller"
import { BookingController } from "./booking.controller"
import { PropertyController } from "./property.controller"
import { UserAdminController } from "./user.admin.controller"
import { UserController } from "./user.controller"
import { UploadController } from "./upload.controller"
import { KycController } from "./kyc.controller"

const Controller = [
    AuthController,
    PropertyController,
    UserAdminController,
    UserController,
    BookingController,
    UploadController,
    KycController
]

export default Controller