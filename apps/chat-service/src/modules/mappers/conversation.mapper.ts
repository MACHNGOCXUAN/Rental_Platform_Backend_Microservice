import { Conversation, Prisma } from '@prisma/client';
import { ConversationResponseDto } from '../dtos/conversation.dto';

type ConversationWithCategories =
  Prisma.ConversationGetPayload<{
    include: {
      categories: {
        include: {
          category: true;
        };
      };
    };
  }>;

export class ConversationMapper {
  static toResponse(
    conversation: ConversationWithCategories,
    currentUserId: string,
    participant?: {
      id: string;
      fullName: string;
      avatarUrl: string | null;
    } | null
  ): ConversationResponseDto {

    const isUser1 = conversation.user1Id === currentUserId;

    return {
      id: conversation.id,
      status: conversation.status,

      participant: participant
      ? {
          id: participant.id,
          fullName: participant.fullName,
          avatarUrl: participant.avatarUrl
        }
      : null,

      lastMessage: {
        content: conversation.lastMessage,
        type: conversation.lastMessageType,
        senderId: conversation.lastMessageSender,
        createdAt: conversation.lastMessageAt?.toISOString()
      },

      unreadCount: isUser1
        ? conversation.unreadCountUser1
        : conversation.unreadCountUser2,

      isPinned: isUser1
        ? conversation.isPinnedByUser1
        : conversation.isPinnedByUser2,

      isArchived: isUser1
        ? conversation.isArchivedByUser1
        : conversation.isArchivedByUser2,

      categories: conversation.categories.map(link => ({
        id: link.category.id,
        name: link.category.name,
        color: link.category.color ?? '#000000',
        description: link.category.description
      })),

      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    };
  }
}