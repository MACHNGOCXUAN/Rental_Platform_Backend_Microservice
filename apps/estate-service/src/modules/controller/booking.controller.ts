import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { BookingService } from '../services/booking.service';
import { CreateBookingDto, GetAvailableSlotsDto } from '../dtos/booking.dto';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { MessageKey } from 'src/common/decorators/message.decorator';

@Controller('booking')
export class BookingController {
    constructor(private readonly bookingService: BookingService) { }
    @Get('property-details/:propertyId')
    getPropertyDetails(@Param('propertyId') propertyId: string): Promise<any> {
        return this.bookingService.getPropertyDetails(propertyId);
    }

    @Get('available-slots')
    getAvailableSlots(@Query() query: GetAvailableSlotsDto) {
        return this.bookingService.getAvailableSlots(query);
    }

    @Get("properties")
    getAllProperty(@AuthUser() user: IAuthUserPayload) {
        return this.bookingService.getAllProperty(user.id)
    }

    @Post("create")
    @MessageKey("Đặt lịch xem nhà thành công")
    createBooking(@AuthUser() user: IAuthUserPayload, @Body() payload: CreateBookingDto) {
        return this.bookingService.createBooking(payload, user.id)
    }

    @Get("my")
    getMyBookings(@AuthUser() user: IAuthUserPayload) {
        return this.bookingService.getMyBookings(user.id)
    }

    @Get("owner")
    getOwnerBookings(
        @AuthUser() user: IAuthUserPayload,
        @Query("propertyId") propertyId: string,
    ) {
        return this.bookingService.getOwnerBookings(user.id, propertyId);
    }

    @Put(":id/confirm")
    confirmBooking(@AuthUser() user: IAuthUserPayload, @Param("id") id: string) {
        return this.bookingService.confirmBooking(id, user.id)
    }

    @Put(':id/reject')
    rejectBooking(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') id: string,
        @Body('reason') reason: string,
    ) {
        return this.bookingService.rejectBooking(id, user.id, reason);
    }

    @Put(':id/cancel')
    cancelBooking(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') bookingId: string,
        @Body("reason") reason: string,
    ) {
        return this.bookingService.cancelBooking(
            bookingId,
            user.id,
            reason,
        );
    }

    @Put(':id/complete')
    completeBooking(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') bookingId: string,
    ) {
        return this.bookingService.completeBookingService(
            bookingId,
            user.id,
        );
    }
}
