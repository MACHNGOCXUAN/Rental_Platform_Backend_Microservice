import { AuthService } from "./auth.service";
import { OtpService } from "./otp.service";
import { PropertyService } from "./property.service";
import { EsmsService } from "./esms.service";
import { UserService } from "./user.service";
import { CloudinaryService } from "./cloudinary.service";

const Service = [
    AuthService,
    OtpService,
    PropertyService,
    EsmsService,
    UserService,
    CloudinaryService,
]

export { CloudinaryService };
export default Service