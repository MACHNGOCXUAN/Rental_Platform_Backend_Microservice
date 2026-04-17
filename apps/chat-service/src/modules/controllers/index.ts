import { ConversationController } from "./conversation.controller";
import { CustomerCategoryController } from "./customer-category.controller";
import { MessageController } from "./message.controller";
import { CallController } from "./call.controller";
import { UploadFileController } from "./uploadfile.controller";

export const CONTROLLERS = [
  ConversationController,
  CustomerCategoryController,
  MessageController,
  CallController,
  UploadFileController
];
