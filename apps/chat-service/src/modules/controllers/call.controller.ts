import { Controller, Get, Param, Query } from "@nestjs/common";
import { AuthUser } from "src/common/decorators/auth-user.decorator";
import type { IAuthUserPayload } from "src/common/interfaces/request.interface";
import { GetCallHistoryQueryDto } from "../dtos/call.dto";
import { CallService } from "../services/call.service";

@Controller("/calls")
export class CallController {
  constructor(private readonly callService: CallService) {}

  // Lấy lịch sử cuộc gọi của người dùng, có thể lọc theo conversationId và phân trang
  @Get()
  getMyCalls(
    @AuthUser() user: IAuthUserPayload,
    @Query() query: GetCallHistoryQueryDto
  ) {
    return this.callService.getCallsForUser(user.id, query);
  }

  // Lấy chi tiết một cuộc gọi cụ thể, chỉ cho phép nếu người dùng là caller hoặc callee
  @Get(":id")
  getCallDetail(@AuthUser() user: IAuthUserPayload, @Param("id") id: string) {
    return this.callService.getCallDetail(user.id, id);
  }
}
