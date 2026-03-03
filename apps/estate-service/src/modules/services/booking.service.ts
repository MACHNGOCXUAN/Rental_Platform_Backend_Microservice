import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { BookingStatus, UserRole } from 'generated/prisma/enums';
import { UserResponseDto } from '../dtos/user.response.dto';
import { CreateBookingDto, GetAvailableSlotsDto } from '../dtos/booking.dto';
import { TIME_SLOTS } from 'src/constants/time-slots';

@Injectable()
export class BookingService {

    constructor(private readonly databaseService: DatabaseService) { }

    async getPropertyDetails(propertyId: string): Promise<any> {
        const property = await this.databaseService.property.findUnique({
            where: { propertyId: propertyId },
        });
        return property ?? null;
    }

    async getAllProperty(userId: string) {
        const properties = await this.databaseService.property.findMany({
            where: {
                landlordId: {
                    not: userId,
                },
            },
            include: {
                images: true, // nếu có bảng ảnh
            },
            orderBy: {
                createdAt: "desc",
            }
        });

        return properties.map(p => ({
            id: p.propertyId,
            landlordId: p.landlordId,
            price: `${p.pricePerMonth} triệu/tháng`,
            area: `${p.areaSqm}m²`,
            bedrooms: p.bedrooms,
            bathrooms: p.bathrooms,
            type: p.propertyType,              // ví dụ: "Nhà nguyên căn"
            furniture: p.furnitureStatus,    // ví dụ: "Nội thất cơ bản"
            direction: p.description,    // ví dụ: "Tây Bắc"
            location: `${p.district}, ${p.city}`,
            postedTime: this.formatPostedTime(p.createdAt),
            image: p.images?.[0]?.uri || null,
        }));
    }


    async getAvailableSlotsTemp(data: GetAvailableSlotsDto) {
        const { propertyId, date } = data;

        const visitDate = new Date(date);
        const now = new Date();

        const visitDay = new Date(visitDate);
        visitDay.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const bookings = await this.databaseService.booking.findMany({
            where: {
                propertyId,
                visitDate,
                status: {
                    in: ['pending', 'confirmed'],
                },
            },
            select: {
                visitTimeStart: true,
            },
        });

        const bookedTimes = new Set(
            bookings.map(b =>
                b.visitTimeStart.toISOString().substring(11, 16)
            )
        );

        return TIME_SLOTS.map(slot => {
            let isPast = false;
            if (visitDay < today) {
                isPast = true;
            }

            if (visitDay.getTime() === today.getTime()) {
                const [hour, minute] = slot.start.split(':').map(Number);
                const slotDateTime = new Date(visitDate);
                slotDateTime.setHours(hour, minute, 0, 0);

                if (slotDateTime < now) {
                    isPast = true;
                }
            }

            return {
                id: slot.id,
                startTime: slot.start,
                endTime: slot.end,
                isPast,
                isBooked: bookedTimes.has(slot.start),
            };
        });
    }

    async getAvailableSlots(data: GetAvailableSlotsDto) {
        const { propertyId, date } = data;

        const visitDate = new Date(date);
        const now = new Date();

        const visitDay = new Date(visitDate);
        visitDay.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const bookings = await this.databaseService.booking.findMany({
            where: {
                propertyId,
                visitDate,
                status: {
                    in: ['pending', 'confirmed'],
                },
            },
            select: {
                visitTimeStart: true,
            },
        });

        const bookedTimes = new Set(
            bookings.map(b =>
                b.visitTimeStart.toISOString().substring(11, 16)
            )
        );

        return TIME_SLOTS.map(slot => {
            let isPast = false;

            // Nếu ngày đã qua
            if (visitDay < today) {
                isPast = true;
            }

            // Nếu là hôm nay → check giờ đã qua chưa
            if (visitDay.getTime() === today.getTime()) {
                const [hour, minute] = slot.start.split(':').map(Number);
                const slotDateTime = new Date(visitDate);
                slotDateTime.setHours(hour, minute, 0, 0);

                if (slotDateTime < now) {
                    isPast = true;
                }
            }

            const isBooked = bookedTimes.has(slot.start);

            return {
                id: slot.id,
                time: `${slot.start} - ${slot.end}`,
                available: !isBooked,
            };
        });
    }

    async createBooking(booking: CreateBookingDto, tenantId: string) {
        const {
            propertyId,
            visitDate,
            visitTimeStart,
            visitTimeEnd,
            tenantNote,
            tenantPhone,
            numberOfVisitors
        } = booking
        const property = await this.databaseService.property.findUnique({
            where: {
                propertyId
            }
        })
        if (!property) {
            throw new NotFoundException("Không tồn tại bất động sản")
        }
        if (property.landlordId === tenantId) {
            throw new BadRequestException("Bạn không thể đặt lịch hẹn cho bất động sản của mình")
        }

        const startDateTime = new Date(`${visitDate}T${visitTimeStart}`)
        const endDateTime = new Date(`${visitDate}T${visitTimeEnd}`)

        if (startDateTime >= endDateTime) {
            throw new BadRequestException('Lỗi thời gian')
        }
        if (startDateTime < new Date()) {
            throw new BadRequestException('Không thể đặt lịch trong thời gian trước này hiện tại')
        }

        const existingBooking = await this.databaseService.booking.findFirst({
            where: {
                tenantId,
                propertyId,
                status: {
                    in: [BookingStatus.pending, BookingStatus.confirmed]
                }
            }
        })

        if (existingBooking) {
            throw new Error("Đã đặt lịch xem nhà cho bất động sản này rồi!")
        }

        const overlapping = await this.databaseService.booking.findFirst({
            where: {
                landlordId: property.landlordId,
                visitDate: new Date(visitDate),
                status: {
                    in: ['pending', 'confirmed']
                },
                AND: [
                    {
                        visitTimeStart: { lt: endDateTime }
                    },
                    {
                        visitTimeEnd: { gt: startDateTime }
                    }
                ]
            }
        })

        if (overlapping) {
            throw new ConflictException('Thời gian đã được đặt trước!')
        }

        const bookingCode = `BK-${Date.now()}`

        const newBooking = await this.databaseService.booking.create({
            data: {
                propertyId,
                tenantId,
                landlordId: property.landlordId,
                bookingCode,
                visitDate: new Date(visitDate),
                visitTimeStart: startDateTime,
                visitTimeEnd: endDateTime,
                tenantNote,
                tenantPhone,
                numberOfVisitors: numberOfVisitors ?? 1,
                status: 'pending'
            }
        })

        return newBooking
    }

    async getMyBookings(tenantId: string) {
        return await this.databaseService.booking.findMany({
            where: {
                tenantId
            },
            include: {
                property: true,
                landlord: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        })
    }

    async getOwnerBookings(landlordId: string, propertyId: string) {
        return this.databaseService.booking.findMany({
            where: { landlordId },
            include: {
                tenant: true,
                property: true
            },
            orderBy: {
                createdAt: "desc"
            }
        })
    }

    async confirmBooking(bookingId: string, landlordId: string) {
        const booking = await this.databaseService.booking.findUnique({
            where: { bookingId }
        })

        if (!booking || booking.landlordId !== landlordId) {
            throw new Error("Booking not found")
        }

        if (booking.status !== BookingStatus.pending) {
            throw new Error("Booking cannot be confirmed")
        }

        return this.databaseService.booking.update({
            where: { bookingId },
            data: {
                status: BookingStatus.confirmed,
                confirmedBy: landlordId,
                confirmedAt: new Date()
            }
        })
    }

    async rejectBooking(
        bookingId: string,
        landlordId: string,
        reason?: string
    ) {
        return this.databaseService.booking.update({
            where: { bookingId },
            data: {
                status: BookingStatus.cancelled,
                cancelledBy: landlordId,
                cancelledAt: new Date(),
                cancellationReason: reason
            }
        })
    }

    async cancelBooking(
        bookingId: string,
        tenantId: string,
        reason?: string
    ) {
        const booking = await this.databaseService.booking.findUnique({
            where: { bookingId }
        })

        if (!booking || booking.tenantId !== tenantId) {
            throw new Error("Booking not found")
        }

        if (booking.status !== BookingStatus.pending) {
            throw new Error("Cannot cancel this booking")
        }

        return this.databaseService.booking.update({
            where: { bookingId },
            data: {
                status: BookingStatus.cancelled,
                cancelledBy: tenantId,
                cancelledAt: new Date(),
                cancellationReason: reason
            }
        })
    }

    async completeBookingService(
        bookingId: string,
        landlordId: string
    ) {

        return this.databaseService.booking.update({
            where: { bookingId, landlordId },
            data: {
                status: BookingStatus.completed,
                completedAt: new Date()
            }
        })
    }



    private formatPostedTime(createdAt: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - createdAt.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) return 'Hôm nay';
        if (diffDays === 1) return '1 ngày trước';
        return `${diffDays} ngày trước`;
    }
}
