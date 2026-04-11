import { OnEvent } from "@nestjs/event-emitter";
import { OnGatewayInit, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server, Socket } from 'socket.io';
import { AuthTokenService } from "./services/auth-token.service";


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
    server!: Server;

    constructor(
        private readonly authTokenService: AuthTokenService
    ) { }

    afterInit(server: Server) {
        console.log(`WebSocket server running on port 9004/notification`);
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
            const payload = await this.authTokenService.validateTokenViaHttp(token)
            console.log("jnjknkjnj: ", payload);

            const roomId = payload.payload?.id?.toString();
            if (roomId) {
                client.join(roomId);
                console.log(`User ${roomId} joined room`);
            } else {
                console.log('No valid room ID');
                client.disconnect();
            }
        } catch (err) {
            console.log('Invalid token:', (err as Error).message);
            client.disconnect();
        }
    }


    sendNotification(userId: string, payload: any) {
        this.server.to(userId).emit('notification', payload);
    }

    @OnEvent('notification.created')
    handleNotificationCreated(payload: { userId: string; notification: any }) {
        console.log("heloo nha: ", payload.userId);
        
        this.server.to(payload.userId).emit('notification', payload.notification);
    }

    @OnEvent('notification.read')
    handleNotificationRead(payload: any) {
        console.log('====================================');
        console.log("kojmkm: ", payload);
        console.log('====================================');
        this.server
            .to(payload.userId)
            .emit('notification:read', payload);
    }
}