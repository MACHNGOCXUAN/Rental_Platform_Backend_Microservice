import { AuthTokenService } from "./auth-token.service";
import { EmailService } from "./email.service";
import { NotificationService } from "./notification.service";

const Service = [
  NotificationService,
  AuthTokenService,
  EmailService,
]

export default Service;