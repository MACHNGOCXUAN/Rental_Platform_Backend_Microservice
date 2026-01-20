import { OnGatewayInit, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { NotificationService } from "./services/notification.service";
import { Server, Socket } from 'socket.io';
import { GrpcAuthService } from "src/services/grpc.auth.service";

@WebSocketGateway({ cors: { origin: '*', credentials: true } })
export class NotificationGateway implements OnGatewayInit {
    @WebSocketServer()
    server: Server;

    constructor(
        private readonly notificationService: NotificationService,
        private grpcAuthService: GrpcAuthService
    ) { }

    afterInit(server: Server) {
        console.log(`✅ WebSocket server đang chạy tại ws://localhost:8080`);
    }

    async handleConnection(client: Socket) {
        const token =
            client.handshake.auth?.token || client.handshake.headers?.token;
        console.log('Token từ client:', token);

        if (!token) {
            client.disconnect();
            return;
        }

        try {
            const payload = this.grpcAuthService.validateToken(token);
            client.data.user = payload; // Gán user từ token vào client.data
            // join room với userId
            client.join("1");
        } catch (err) {
            console.log('[Socket] Invalid token');
            client.disconnect();
        }
    }
}