import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "src/common/services/database.service";
import { GetMessagesQueryDto, SendMessageDto } from "../dtos/message.dto";
import { EventEmitter2 } from "@nestjs/event-emitter";


@Injectable()
export class MessageService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly eventEmitter: EventEmitter2
    ) { }

    async getMessageByConversationId(conversationId: string, userId: string, query: GetMessagesQueryDto) {
        const limit = Number(query.limit) || 20

        const messages = await this.databaseService.message.findMany({
            where: {
                conversationId,
                isDeleted: false
            },
            include: {
                replyTo: {
                    select: {
                        id: true,
                        content: true,
                        senderId: true,
                        messageType: true,
                        isDeleted: true
                    }
                }
            },
            orderBy: {
                createdAt: "desc"
            },
            take: limit + 1,
            ...(query.cursor && {
                cursor: { id: query.cursor },
                skip: 1
            })
        })

        const hasNextPage = messages.length > limit;
        if (hasNextPage) messages.pop();

        return {
            messages,
            nextCursor: hasNextPage ? messages[messages.length - 1].id : null,
            hasNextPage
        }
    }

    async sendMessage(senderId: string, dto: SendMessageDto) {
        const conversation = await this.databaseService.conversation.findUnique({
            where: {
                id: dto.conversationId
            }
        })
        if (!conversation) {
            throw new NotFoundException("Không tồn tại cuộc trò chuyện")
        }

        const isUser1 = conversation.user1Id === senderId;
        const isUser2 = conversation.user2Id === senderId;
        if (!isUser1 && !isUser2) {
            throw new ForbiddenException("Bạn không có quyền");
        }

        if (dto.replyToId) {
            const repliedMessage = await this.databaseService.message.findUnique({
                where: { id: dto.replyToId }
            })

            if (!repliedMessage) {
                throw new NotFoundException("Tin nhắn được reply không tồn tại");
            }

            if (repliedMessage.conversationId !== dto.conversationId) {
                throw new ForbiddenException("Không thể reply tin nhắn ở cuộc trò chuyện khác");
            }
        }

        const [message] = await this.databaseService.$transaction([
            this.databaseService.message.create({
                data: {
                    conversationId: dto.conversationId,
                    senderId,
                    content: dto.content,
                    messageType: dto.messageType,
                    fileUrl: dto.fileUrl,
                    fileName: dto.fileName,
                    fileSize: dto.fileSize,
                    mimeType: dto.mimeType,
                    width: dto.width,
                    height: dto.height,
                    duration: dto.duration,
                    thumbnailUrl: dto.thumbnailUrl,
                    replyToId: dto.replyToId,
                },
                include: {
                    replyTo: {
                        select: {
                            id: true,
                            content: true,
                            senderId: true, 
                            messageType: true
                        }
                    }
                }
            }),

            this.databaseService.conversation.update({
                where: {
                    id: dto.conversationId
                },
                data: {
                    lastMessage: dto.content ?? dto.fileName ?? dto.messageType,
                    lastMessageAt: new Date(),
                    lastMessageType: dto.messageType,
                    lastMessageSender: senderId,
                    ...(isUser1
                        ? { unreadCountUser2: { increment: 1 } }
                        : { unreadCountUser1: { increment: 1 } }),
                }
            })
        ])

        this.eventEmitter.emit("message.sent", {
            user1Id: conversation.user1Id,
            user2Id: conversation.user2Id,
            message
        });
        return message
    }

    async deleteMessage() {

    }

    async reactMessage() {

    }

    async markAsRead(conversationId: string, userId: string) {
        const conversation = await this.databaseService.conversation.findUnique({
            where: {
                id: conversationId
            }
        })

        if (!conversation) {
            throw new NotFoundException("Không tồn tại cuộc trò chuyện");
        }

        const isUser1 = conversation.user1Id === userId;
        const isUser2 = conversation.user2Id === userId;

        if (!isUser1 && !isUser2) {
            throw new ForbiddenException("Bạn không có quyền");
        }

        await this.databaseService.conversation.update({
            where: { id: conversationId },
            data: isUser1
                ? { unreadCountUser1: 0 }
                : { unreadCountUser2: 0 }
        })

        this.eventEmitter.emit("message.read", {
            conversationId,
            readerId: userId,
            otherUserId: isUser1
                ? conversation.user2Id
                : conversation.user1Id
        });

        return { success: true };
    }

    async getMessageById() {

    }
}