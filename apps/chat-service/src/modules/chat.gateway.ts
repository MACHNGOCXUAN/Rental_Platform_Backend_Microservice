import { OnGatewayInit, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server, Socket } from 'socket.io';
import { ConversationService } from "./services/conversation.service";
import { OnEvent } from "@nestjs/event-emitter";


@WebSocketGateway({
    namespace: '/chat',
    cors: {
        origin: '*',
        credentials: true
    },
    transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayInit {
    @WebSocketServer()
    server: Server;
    private onlineUsers = new Map<string, Set<string>>();

    constructor(
        private readonly conversationService: ConversationService
    ) { }

    afterInit(server: Server) {
        console.log(`WebSocket server running on port 9003/chat`);
    }

    async handleConnection(client: Socket) {
        const token = client.handshake.auth?.token ||
            client.handshake.headers?.token;

        console.log("Token: ", token);

        if (!token) {
            console.log('Không có token, đang disconnecting');
            client.disconnect();
            return;
        }

        try {
            const payload = await this.conversationService.validateTokenViaHttp(token)
            const userId = payload.payload?.id?.toString();
            if (!userId) {
                client.disconnect();
                return;
            }
            client.data.userId = userId;
            client.join(userId);

            if (!this.onlineUsers.has(userId)) {
                this.onlineUsers.set(userId, new Set())
                this.server.emit("user_online", userId)
            }

            this.onlineUsers.get(userId)!.add(client.id);
            console.log("Online users:", this.onlineUsers);
        } catch (err) {
            console.log('Invalid token:', err.message);
            client.disconnect();
        }
    }

    async handleDisconnect(client: Socket) {
        const userId = client.data.userId;
        if (!userId) return;

        const userSockets = this.onlineUsers.get(userId);
        if (!userSockets) return;
        userSockets.delete(client.id);

        if (userSockets.size === 0) {
            this.onlineUsers.delete(userId);
            this.server.emit("user_offline", userId);
        }
        console.log("Online users:", this.onlineUsers);
    }

    @OnEvent("conversation.created")
    handleConversationCreated(payload: {
        user1Id: string;
        user2Id: string;
        conversation: any;
    }) {
        const { user1Id, user2Id, conversation } = payload;

        this.server.to(user1Id).emit("new_conversation", conversation);
        this.server.to(user2Id).emit("new_conversation", conversation);

        console.log("Emitted new_conversation to:", user1Id, user2Id);
    }

    @OnEvent("message.sent")
    handleMessageSent(payload: {
        user1Id: string;
        user2Id: string;
        message: any;
    }) {
        const { user1Id, user2Id, message } = payload;

        this.server.to(user1Id).emit("new_message", message);
        this.server.to(user2Id).emit("new_message", message);

        console.log("Emitted new_message to:", user1Id, user2Id);
    }

    @OnEvent("message.read")
    handleMessageRead(payload: {
        conversationId: string;
        readerId: string;
        otherUserId: string;
    }) {
        const { conversationId, readerId, otherUserId } = payload;

        this.server.to(otherUserId).emit("message_read", {
            conversationId,
            readerId
        });

        console.log("Emitted message_read to:", otherUserId);
    }
}