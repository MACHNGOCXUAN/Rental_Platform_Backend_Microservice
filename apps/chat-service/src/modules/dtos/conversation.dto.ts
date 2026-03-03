export interface CreateConversationDto {
  user1Id: string
  user2Id: string
}

export interface ConversationResponseDto {
  id: string;
  status: string;
  participant: any;
  lastMessage: {
    content: string | null;
    type: string | null;
    senderId: string | null;
    createdAt: string | null;
  };
  unreadCount: number;
  isPinned: boolean;
  isArchived: boolean;
  categories: {
    id: string;
    name: string;
    color: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}