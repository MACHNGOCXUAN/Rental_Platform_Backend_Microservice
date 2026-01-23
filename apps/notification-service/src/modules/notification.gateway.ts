import { OnEvent } from "@nestjs/event-emitter";
import { OnGatewayInit, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server, Socket } from 'socket.io';


@WebSocketGateway({
    namespace: '/notification',
    cors: {
        origin: '*',
        credentials: true
    },
    transports: ['websocket', 'polling'],
})
export class NotificationGateway implements OnGatewayInit {
    @WebSocketServer()
    server: Server;

    constructor(
        // private grpcAuthService: GrpcAuthService
    ) { }

    afterInit(server: Server) {
        console.log(`WebSocket server running on port 9004/notification`);
    }

    async handleConnection(client: Socket) {
        const token = client.handshake.auth?.token ||
            client.handshake.headers?.token;

        console.log('📨 Connection attempt from:', client.id);
        console.log('🔑 Token:', token ? 'Present' : 'Missing');

        if (!token) {
            console.log('❌ No token, disconnecting');
            client.disconnect();
            return;
        }

        try {
            // const payload = await this.grpcAuthService.validateToken(token);
            // client.data.user = payload;

            // const roomId = payload.payload?.id?.toString();
            const roomId = "96e6ad94-83fe-48b2-b210-18ab41616561"
            if (roomId) {
                client.join(roomId);
                console.log(`✅ User ${roomId} joined room`);
            } else {
                console.log('❌ No valid room ID');
                client.disconnect();
            }
        } catch (err) {
            console.log('❌ Invalid token:', err.message);
            client.disconnect();
        }
    }


    sendNotification(userId: string, payload: any) {
        console.log(`📢 Emit notification to user ${userId}`);
        this.server.to(userId).emit('notification', payload);
    }

    @OnEvent('notification.created')
    handleNotificationCreated(payload: { userId: string; notification: any }) {
        console.log(`📢 Emit notification to user ${payload.userId}`);
        this.server.to(payload.userId).emit('notification', payload.notification);
    }
}