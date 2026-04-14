import {
    ConnectedSocket,
    MessageBody,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer
} from "@nestjs/websockets";
import { Server, Socket } from 'socket.io';
import { ConversationService } from "./services/conversation.service";
import { OnEvent } from "@nestjs/event-emitter";
import { CallService } from "./services/call.service";
import { CallType } from "@prisma/client";


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
    server!: Server;
    private onlineUsers = new Map<string, Set<string>>();

    constructor(
        private readonly conversationService: ConversationService,
        private readonly callService: CallService
    ) { }

    afterInit(server: Server) {
        console.log(`WebSocket server running on port 9003/chat`);
    }

    // Xử lý kết nối mới
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
            const payload = await this.conversationService.validateTokenViaHttp(token);
            if (!payload) {
                client.disconnect();
                return;
            }

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
        } catch (err: any) {
            console.log('Invalid token:', err.message);
            client.disconnect();
        }
    }

    // Xử lý ngắt kết nối
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

    // Xử lý sự kiện cuộc trò chuyện mới được tạo
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

    // Xử lý sự kiện tin nhắn mới được gửi
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

    // Xử lý sự kiện tin nhắn đã được đọc
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

        @OnEvent("message.reaction")
        handleMessageReaction(payload: {
                conversationId: string;
                messageId: string;
                reactions: any[];
        }) {
                const { conversationId, messageId, reactions } = payload;

                this.server.emit("message_reaction", {
                        conversationId,
                        messageId,
                        reactions
                });
        }

    // Xử lý cuộc gọi
    @SubscribeMessage("call:invite")
    async handleCallInvite(
        @ConnectedSocket() client: Socket,
        @MessageBody()
        payload: { conversationId: string; calleeId: string; callType: CallType }
    ) {
        const callerId = client.data.userId as string;
        const { conversationId, calleeId, callType } = payload || {};
        console.log("payload: ", payload);
        if (!callerId || !conversationId || !calleeId || !callType) {
            this.emitCallError(client, "INVALID_PAYLOAD", "Thiếu dữ liệu cuộc gọi");
            return { status: "error" };
        }

        let call: any;
        try {
            call = await this.callService.createCallSession(
                callerId,
                calleeId,
                conversationId,
                callType
            );
        } catch (err: any) {
            console.warn("call:invite failed", err?.message);
            this.emitCallError(client, "INVITE_FAILED", "Không thể tạo cuộc gọi");
            return { status: "error" };
        }

        if (!this.isUserOnline(calleeId)) {
            await this.callService.markMissed(call.id);

            this.server.to(callerId).emit("call:missed", {
                callId: call.id,
                calleeId
            });

            return { callId: call.id, status: "missed" };
        }

        this.server.to(calleeId).emit("call:incoming", {
            callId: call.id,
            fromUserId: callerId,
            conversationId,
            callType
        });

        this.server.to(callerId).emit("call:outgoing", {
            callId: call.id,
            toUserId: calleeId,
            conversationId,
            callType
        });

        return { callId: call.id, status: "ringing" };
    }

    // Xử lý chấp nhận cuộc gọi
    @SubscribeMessage("call:accept")
    async handleCallAccept(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { callId: string }
    ) {
        const userId = client.data.userId as string;
        if (!payload?.callId) {
            this.emitCallError(client, "INVALID_PAYLOAD", "Thiếu callId");
            return { status: "error" };
        }

        let call: any;
        try {
            call = await this.callService.acceptCall(payload.callId, userId);
        } catch (err: any) {
            console.warn("call:accept failed", err?.message);
            this.emitCallError(client, "ACCEPT_FAILED", "Không thể chấp nhận cuộc gọi");
            return { status: "error" };
        }
        const otherUserId = this.getOtherUserId(call, userId);

        this.server.to(otherUserId).emit("call:accepted", {
            callId: call.id
        });
        this.server.to(userId).emit("call:accepted", { callId: call.id });

        return { callId: call.id, status: "accepted" };
    }

    // Xử lý từ chối cuộc gọi
    @SubscribeMessage("call:reject")
    async handleCallReject(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { callId: string; reason?: string }
    ) {
        const userId = client.data.userId as string;
        if (!payload?.callId) {
            this.emitCallError(client, "INVALID_PAYLOAD", "Thiếu callId");
            return { status: "error" };
        }

        let call: any;
        try {
            call = await this.callService.rejectCall(payload.callId, userId, payload.reason);
        } catch (err: any) {
            console.warn("call:reject failed", err?.message);
            this.emitCallError(client, "REJECT_FAILED", "Không thể từ chối cuộc gọi");
            return { status: "error" };
        }
        const otherUserId = this.getOtherUserId(call, userId);

        this.server.to(otherUserId).emit("call:rejected", {
            callId: call.id
        });
        this.server.to(userId).emit("call:rejected", { callId: call.id });

        return { callId: call.id, status: "rejected" };
    }

    // Xử lý hủy cuộc gọi
    @SubscribeMessage("call:cancel")
    async handleCallCancel(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { callId: string }
    ) {
        const userId = client.data.userId as string;
        if (!payload?.callId) {
            this.emitCallError(client, "INVALID_PAYLOAD", "Thiếu callId");
            return { status: "error" };
        }

        let call: any;
        try {
            call = await this.callService.cancelCall(payload.callId, userId);
        } catch (err: any) {
            console.warn("call:cancel failed", err?.message);
            this.emitCallError(client, "CANCEL_FAILED", "Không thể hủy cuộc gọi");
            return { status: "error" };
        }
        const otherUserId = this.getOtherUserId(call, userId);

        this.server.to(otherUserId).emit("call:canceled", {
            callId: call.id
        });
        this.server.to(userId).emit("call:canceled", { callId: call.id });

        return { callId: call.id, status: "canceled" };
    }

    // Xử lý kết thúc cuộc gọi
    @SubscribeMessage("call:end")
    async handleCallEnd(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { callId: string; reason?: string }
    ) {
        const userId = client.data.userId as string;
        if (!payload?.callId) {
            this.emitCallError(client, "INVALID_PAYLOAD", "Thiếu callId");
            return { status: "error" };
        }

        let call: any;
        try {
            call = await this.callService.endCall(payload.callId, userId, payload.reason);
        } catch (err: any) {
            console.warn("call:end failed", err?.message);
            this.emitCallError(client, "END_FAILED", "Không thể kết thúc cuộc gọi");
            return { status: "error" };
        }
        const otherUserId = this.getOtherUserId(call, userId);

        this.server.to(otherUserId).emit("call:ended", {
            callId: call.id,
            duration: call.duration
        });
        this.server.to(userId).emit("call:ended", {
            callId: call.id,
            duration: call.duration
        });

        return { callId: call.id, status: "ended" };
    }

    // Xử lý nhãn cuộc gọi
    @SubscribeMessage("call:offer")
    async handleCallOffer(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { callId: string; sdp: unknown }
    ) {
        const userId = client.data.userId as string;
        if (!payload?.callId || !payload?.sdp) {
            this.emitCallError(client, "INVALID_PAYLOAD", "Thiếu dữ liệu offer");
            return;
        }

        let call: any;
        try {
            call = await this.callService.getCallSessionForUser(payload.callId, userId);
        } catch (err: any) {
            console.warn("call:offer failed", err?.message);
            this.emitCallError(client, "OFFER_FAILED", "Không thể gửi offer");
            return;
        }
        const otherUserId = this.getOtherUserId(call, userId);

        this.server.to(otherUserId).emit("call:offer", {
            callId: call.id,
            fromUserId: userId,
            sdp: payload.sdp
        });
    }

    // Xử lý câu trả lời cuộc gọi
    @SubscribeMessage("call:answer")
    async handleCallAnswer(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { callId: string; sdp: unknown }
    ) {
        const userId = client.data.userId as string;
        if (!payload?.callId || !payload?.sdp) {
            this.emitCallError(client, "INVALID_PAYLOAD", "Thiếu dữ liệu answer");
            return;
        }

        let call: any;
        try {
            call = await this.callService.getCallSessionForUser(payload.callId, userId);
        } catch (err: any) {
            console.warn("call:answer failed", err?.message);
            this.emitCallError(client, "ANSWER_FAILED", "Không thể gửi answer");
            return;
        }
        const otherUserId = this.getOtherUserId(call, userId);

        this.server.to(otherUserId).emit("call:answer", {
            callId: call.id,
            fromUserId: userId,
            sdp: payload.sdp
        });
    }

    // Xử lý ICE candidates
    @SubscribeMessage("call:ice")
    async handleCallIce(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { callId: string; candidate: unknown }
    ) {
        const userId = client.data.userId as string;
        if (!payload?.callId || !payload?.candidate) {
            return;
        }

        let call: any;
        try {
            call = await this.callService.getCallSessionForUser(payload.callId, userId);
        } catch (err: any) {
            console.warn("call:ice failed", err?.message);
            this.emitCallError(client, "ICE_FAILED", "Không thể gửi ICE");
            return;
        }
        const otherUserId = this.getOtherUserId(call, userId);

        this.server.to(otherUserId).emit("call:ice", {
            callId: call.id,
            fromUserId: userId,
            candidate: payload.candidate
        });
    }

    private isUserOnline(userId: string) {
        return this.onlineUsers.has(userId);
    }

    private getOtherUserId(call: { callerId: string; calleeId: string }, userId: string) {
        return call.callerId === userId ? call.calleeId : call.callerId;
    }

    private emitCallError(client: Socket, code: string, message: string) {
        client.emit("call:error", { code, message });
    }
}