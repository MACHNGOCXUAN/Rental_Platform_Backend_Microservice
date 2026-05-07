import { Body, Controller, Delete, Get, Headers, Param, Post } from "@nestjs/common";
import { ConversationService } from "../services/conversation.service";
import { AuthUser } from "src/common/decorators/auth-user.decorator";
import type { IAuthUserPayload } from "src/common/interfaces/request.interface";

@Controller("/conversations")
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService
  ) {}

  @Post()
  createConversation(@AuthUser() user: IAuthUserPayload, @Body("userId") userId: string) {
    const data = {
      user1Id: user.id,
      user2Id: userId
    }
    return this.conversationService.createConversation(data)
  }

  @Get("/my")
  getConversationByUserId(@AuthUser() user: IAuthUserPayload, @Headers('authorization') authHeader: string) {

    const token = authHeader?.split(' ')[1];
    console.log('====================================');
    console.log("xuan nha: ", token);
    console.log('====================================');
    return this.conversationService.getConversationByUserId(user.id)
  }

  @Post("/:id/archive")
  toggleArchive(@AuthUser() user: IAuthUserPayload, @Param("id") id: string) {
    return this.conversationService.toggleArchive(user.id, id)
  }

  @Delete("/:id")
  toggleDelete(@AuthUser() user: IAuthUserPayload, @Param("id") id: string) {
    return this.conversationService.toggleDelete(user.id, id)
  }

  @Get("/archived")
  getArchived(@AuthUser() user: IAuthUserPayload) {
    return this.conversationService.getArchivedConversations(user.id)
  }
}