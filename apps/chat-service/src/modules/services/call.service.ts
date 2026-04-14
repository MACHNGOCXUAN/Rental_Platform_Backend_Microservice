import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { CallStatus, CallType, MessageType } from "@prisma/client";
import { DatabaseService } from "src/common/services/database.service";
import { GetCallHistoryQueryDto } from "../dtos/call.dto";
import { MessageService } from "./message.service";

const ACTIVE_CALL_STATUSES: CallStatus[] = [
  CallStatus.RINGING,
  CallStatus.ACCEPTED
];

@Injectable()
export class CallService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly messageService: MessageService
  ) {}

  // Tạo cuộc gọi mới
  async createCallSession(
    callerId: string,
    calleeId: string,
    conversationId: string,
    callType: CallType
  ) {
    // Kiểm tra không được gọi chính mình
    if (callerId === calleeId) {
      throw new BadRequestException("Cannot call yourself");
    }

    // Kiểm tra cuộc trò chuyện tồn tại và người dùng tham gia
    const conversation = await this.databaseService.conversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation) {
      throw new NotFoundException("Cuộc trò chuyện không tồn tại");
    }

    // Kiểm tra cả caller và callee đều phải là thành viên của cuộc trò chuyện
    const isCallerInConversation =
      conversation.user1Id === callerId || conversation.user2Id === callerId;
    const isCalleeInConversation =
      conversation.user1Id === calleeId || conversation.user2Id === calleeId;

    // Nếu một trong hai người dùng không thuộc cuộc trò chuyện, trả về lỗi
    if (!isCallerInConversation || !isCalleeInConversation) {
      throw new ForbiddenException("Người dùng không thuộc cuộc trò chuyện này");
    }

    // Kiểm tra xem cả caller và callee có cuộc gọi nào đang hoạt động không
    const activeCall = await this.databaseService.callSession.findFirst({
      where: {
        status: { in: ACTIVE_CALL_STATUSES },
        OR: [
          { callerId },
          { calleeId: callerId },
          { callerId: calleeId },
          { calleeId }
        ]
      }
    });

    // Nếu có cuộc gọi nào đang hoạt động, trả về lỗi
    if (activeCall) {
      throw new BadRequestException("User already in active call");
    }

    return this.databaseService.callSession.create({
      data: {
        conversationId,
        callerId,
        calleeId,
        callType,
        status: CallStatus.RINGING,
        startedAt: new Date()
      }
    });
  }

  // Người nhận cuộc gọi chấp nhận
  async acceptCall(callId: string, userId: string) {
    // Lấy thông tin cuộc gọi và kiểm tra quyền truy cập
    const call = await this.getCallSessionForUser(callId, userId);

    if (call.calleeId !== userId) {
      throw new ForbiddenException("Only callee can accept call");
    }

    if (call.status !== CallStatus.RINGING) {
      throw new BadRequestException("Call is not ringing");
    }

    return this.databaseService.callSession.update({
      where: { id: callId },
      data: {
        status: CallStatus.ACCEPTED,
        answeredAt: new Date()
      }
    });
  }

  // Người nhận cuộc gọi từ chối
  async rejectCall(callId: string, userId: string, reason?: string) {
    const call = await this.getCallSessionForUser(callId, userId);

    if (call.calleeId !== userId) {
      throw new ForbiddenException("Only callee can reject call");
    }

    if (call.status !== CallStatus.RINGING) {
      throw new BadRequestException("Call is not ringing");
    }

    const updated = await this.databaseService.callSession.update({
      where: { id: callId },
      data: {
        status: CallStatus.REJECTED,
        endedAt: new Date(),
        endReason: reason || "rejected"
      }
    });

    await this.createCallLog(updated, CallStatus.REJECTED);

    return updated;
  }

  // Người gọi hủy cuộc gọi trước khi người nhận chấp nhận
  async cancelCall(callId: string, userId: string) {
    const call = await this.getCallSessionForUser(callId, userId);

    if (call.callerId !== userId) {
      throw new ForbiddenException("Only caller can cancel call");
    }

    if (call.status !== CallStatus.RINGING) {
      throw new BadRequestException("Call is not ringing");
    }

    const updated = await this.databaseService.callSession.update({
      where: { id: callId },
      data: {
        status: CallStatus.CANCELED,
        endedAt: new Date(),
        endReason: "canceled"
      }
    });

    await this.createCallLog(updated, CallStatus.CANCELED);

    return updated;
  }

  // Kết thúc cuộc gọi
  async endCall(callId: string, userId: string, reason?: string) {
    const call = await this.getCallSessionForUser(callId, userId);

    if (call.status !== CallStatus.ACCEPTED) {
      throw new BadRequestException("Call is not active");
    }

    const endedAt = new Date();
    const durationSeconds = this.calculateDurationSeconds(call.answeredAt, endedAt);

    const updated = await this.databaseService.callSession.update({
      where: { id: callId },
      data: {
        status: CallStatus.ENDED,
        endedAt,
        duration: durationSeconds,
        endReason: reason || "ended"
      }
    });

    await this.createCallLog(updated, CallStatus.ENDED);

    return updated;
  }

  // Đánh dấu cuộc gọi nhỡ
  async markMissed(callId: string) {
    const call = await this.databaseService.callSession.findUnique({
      where: { id: callId }
    });

    if (!call || call.status !== CallStatus.RINGING) {
      return null;
    }

    const updated = await this.databaseService.callSession.update({
      where: { id: callId },
      data: {
        status: CallStatus.MISSED,
        endedAt: new Date(),
        endReason: "missed"
      }
    });

    await this.createCallLog(updated, CallStatus.MISSED);

    return updated;
  }

  async getCallDetail(userId: string, callId: string) {
    return this.getCallSessionForUser(callId, userId);
  }

  // Lấy lịch sử cuộc gọi của người dùng
  async getCallsForUser(userId: string, query: GetCallHistoryQueryDto) {
    const limit = Number(query.limit) || 20;

    const calls = await this.databaseService.callSession.findMany({
      where: {
        OR: [{ callerId: userId }, { calleeId: userId }],
        ...(query.conversationId && {
          conversationId: query.conversationId
        })
      },
      orderBy: {
        startedAt: "desc"
      },
      take: limit + 1,
      ...(query.cursor && {
        cursor: { id: query.cursor },
        skip: 1
      })
    });

    const hasNextPage = calls.length > limit;
    if (hasNextPage) calls.pop();

    return {
      calls,
      nextCursor: hasNextPage ? calls[calls.length - 1].id : null,
      hasNextPage
    };
  }

  // Lấy thông tin cuộc gọi và kiểm tra quyền truy cập
  async getCallSessionForUser(callId: string, userId: string) {
    const call = await this.databaseService.callSession.findUnique({
      where: { id: callId }
    });

    if (!call) {
      throw new NotFoundException("Call not found");
    }

    const isParticipant = call.callerId === userId || call.calleeId === userId;

    if (!isParticipant) {
      throw new ForbiddenException("You are not a participant of this call");
    }

    return call;
  }

  // Tạo log cuộc gọi dưới dạng tin nhắn trong cuộc trò chuyện
  private async createCallLog(call: any, status: CallStatus) {
    if (!call?.conversationId) return;

    if (status === CallStatus.ENDED) {
      const label = this.getCallLabel(call.callType as CallType);
      const durationLabel = call.duration ? ` (${this.formatDuration(call.duration)})` : "";

      await this.messageService.sendMessage(call.callerId, {
        conversationId: call.conversationId,
        messageType: call.callType === CallType.VIDEO ? MessageType.CALL_VIDEO : MessageType.CALL_VOICE,
        content: `${label}${durationLabel}`
      });

      return;
    }

    if (
      status === CallStatus.MISSED ||
      status === CallStatus.REJECTED ||
      status === CallStatus.CANCELED
    ) {
      await this.messageService.sendMessage(call.callerId, {
        conversationId: call.conversationId,
        messageType: MessageType.CALL_MISSED,
        content: "Missed call"
      });
    }
  }

  // Lấy nhãn cuộc gọi dựa trên loại cuộc gọi
  private getCallLabel(callType: CallType) {
    return callType === CallType.VIDEO ? "Video call" : "Voice call";
  }

  // Tính toán thời lượng cuộc gọi tính bằng giây
  private calculateDurationSeconds(answeredAt: Date | null, endedAt: Date) {
    if (!answeredAt) return 0;
    const seconds = Math.floor((endedAt.getTime() - answeredAt.getTime()) / 1000);
    return Math.max(0, seconds);
  }

  // Định dạng thời lượng từ giây sang MM:SS
  private formatDuration(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainder
      .toString()
      .padStart(2, "0")}`;
  }
}
