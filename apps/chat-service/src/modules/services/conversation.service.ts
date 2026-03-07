import { BadRequestException, Injectable } from "@nestjs/common";
import { DatabaseService } from "src/common/services/database.service";
import { CreateConversationDto } from "../dtos/conversation.dto";
import { ConversationStatus } from "@prisma/client";
import axios from "axios";
import { ConversationMapper } from "../mappers/conversation.mapper";
import { ChatGateway } from "../chat.gateway";
import { EventEmitter2 } from "@nestjs/event-emitter";


@Injectable()
export class ConversationService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly eventEmitter: EventEmitter2
    ) { }

    async createConversation(data: CreateConversationDto) {
        const { user1Id, user2Id } = data

        if (user1Id === user2Id) {
            throw new BadRequestException("Không thể tạo cuộc trò chuyện cho chính bạn.")
        }

        const [firstUser, secondUser] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id]

        const existingConversation = await this.databaseService.conversation.findUnique({
            where: {
                user1Id_user2Id: {
                    user1Id: firstUser,
                    user2Id: secondUser
                }
            },
            include: {
                categories: {
                    include: {
                        category: true
                    }
                }
            },
        })

        if (existingConversation) {

            const participantId =
                existingConversation.user1Id === user1Id
                    ? existingConversation.user2Id
                    : existingConversation.user1Id;

            let user = null;

            try {
                const response = await axios.get(
                    `http://kong:8000/api/estate/user/${participantId}`,
                    { timeout: 3000 }
                );

                user = response.data.data;

            } catch (error: any) {
                console.error("User service error:", error.response?.data || error.message);
            }

            return ConversationMapper.toResponse(existingConversation, user1Id, user);
        }

        const newConversation = await this.databaseService.conversation.create({
            data: {
                user1Id: firstUser,
                user2Id: secondUser,
                status: ConversationStatus.ACTIVE,
                lastMessageAt: new Date()
            },
            include: {
                categories: {
                    include: {
                        category: true
                    }
                }
            },
        })

        const participantId =
                newConversation.user1Id === user1Id
                    ? newConversation.user2Id
                    : newConversation.user1Id;

            let user = null;

            try {
                const response = await axios.get(
                    `http://kong:8000/api/estate/user/${participantId}`,
                    { timeout: 3000 }
                );

                user = response.data.data;

            } catch (error: any) {
                console.error("User service error:", error.response?.data || error.message);
            }

        const response =
            ConversationMapper.toResponse(newConversation, user1Id, user);

        this.eventEmitter.emit("conversation.created", {
            user1Id: firstUser,
            user2Id: secondUser,
            conversation: response,
        });

        return response;
    }

    async getConversationByUserId(userId: string) {
        const conversations = await this.databaseService.conversation.findMany({
            where: {
                OR: [
                    { user1Id: userId },
                    { user2Id: userId }
                ]
            },
            include: {
                categories: {
                    include: {
                        category: true
                    }
                }
            },
            orderBy: {
                lastMessageAt: "desc"
            }
        });

        const results = await Promise.all(
            conversations.map(async conversation => {

                const participantId =
                    conversation.user1Id === userId
                        ? conversation.user2Id
                        : conversation.user1Id;

                let user = null;

                try {
                    const response = await axios.get(
                        `http://kong:8000/api/estate/user/${participantId}`,
                        { timeout: 3000 }
                    );

                    user = response.data.data;

                } catch (error: any) {
                    console.error("User service error:", error.response?.data || error.message);
                }

                return ConversationMapper.toResponse(
                    conversation,
                    userId,
                    user
                );
            })
        );

        return results
    }

    async getConversationByUserId1(userId: string) {

        const conversations = await this.databaseService.conversation.findMany({
            where: {
                OR: [
                    { user1Id: userId },
                    { user2Id: userId }
                ]
            },
            include: {
                categories: {
                    include: { category: true }
                }
            },
            orderBy: {
                lastMessageAt: "desc"
            }
        });

        const results = await Promise.all(
            conversations.map(async conversation => {

                const participantId =
                    conversation.user1Id === userId
                        ? conversation.user2Id
                        : conversation.user1Id;

                let user = null;

                try {
                    const response = await axios.get(
                        `http://kong:8000/api/estate/user/${participantId}`,
                        { timeout: 3000 }
                    );

                    user = response.data.data;

                } catch (error: any) {
                    console.error("User service error:", error.response?.data || error.message);
                }

                return ConversationMapper.toResponse(
                    conversation,
                    userId,
                    user
                );
            })
        );

        return results;
    }

    async validateTokenViaHttp(token: string) {
        try {
            const res = await axios.post(
                'http://kong:8000/api/estate/auth/validate-token',
                { token },
                { timeout: 3000 },
            );

            const data = res.data?.data;

            if (!data || data.success !== true) {
                return null;
            }

            return data;
        } catch (err: any) {
            console.error(
                'Auth API error:',
                err.response?.data || err.message,
            );
            return null;
        }
    }
}