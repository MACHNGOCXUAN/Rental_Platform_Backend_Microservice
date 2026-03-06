import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { MessageService } from "../services/message.service";
import type { IAuthUserPayload } from "src/common/interfaces/request.interface";
import { AuthUser } from "src/common/decorators/auth-user.decorator";
import { GetMessagesQueryDto, SendMessageDto } from "../dtos/message.dto";

@Controller("/messages")
export class MessageController {
  constructor(
    private readonly messageService: MessageService
  ) { }

  @Get("conversation/:conversationId")
  async getMessageByConversationId(
    @AuthUser() user: IAuthUserPayload,
    @Param("conversationId") conversationId: string,
    @Query() query: GetMessagesQueryDto
  ) {
    return this.messageService.getMessageByConversationId(conversationId, user.id, query)
  }

  @Post()
  sendMessage(
    @AuthUser() user: IAuthUserPayload,
    @Body() dto: SendMessageDto
  ) {
    return this.messageService.sendMessage(user.id, dto);
  }

  deleteMessage() {

  }

  @Post(":id/react")
  reactMessage(
    @AuthUser() user: IAuthUserPayload,
    @Param("id") id: string,
    @Body("emoji") emoji: string
  ) {
    return this.messageService.reactMessage(id, user.id, emoji);
  }

  @Put("conversation/:conversationId/message/read")
  markAsRead(@Param("conversationId") conversationId: string, @AuthUser() user: IAuthUserPayload) {
    return this.messageService.markAsRead(conversationId, user.id)
  }

  getMessageById() {

  }
}