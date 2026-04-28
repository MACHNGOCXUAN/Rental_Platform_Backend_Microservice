import { AuthTokenService } from "./auth-token.service";
import { EmailService } from "./email.service";
import { FirebaseService } from "./firebase.service";
import { NotificationService } from "./notification.service";
import { SmsService } from "./sms.service";

const Service = [
  NotificationService,
  FirebaseService,
  AuthTokenService,
  EmailService,
  SmsService
]

export default Service;