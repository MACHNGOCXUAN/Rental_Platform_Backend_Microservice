import { AuthController } from "./auth.controller"
import { BookingController } from "./booking.controller"
import { PropertyController } from "./property.controller"
import { UserAdminController } from "./user.admin.controller"
import { UserController } from "./user.controller"

const Controller = [
    AuthController,
    PropertyController,
    UserAdminController,
    UserController,
    BookingController
]

export default Controller