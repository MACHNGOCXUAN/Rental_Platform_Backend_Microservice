import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "src/common/services/database.service";
import { AddConversationToCategoryDto, CreateCustomerCategoryDto } from "../dtos/customer-category.dto";


@Injectable()
export class CustomerCategoryService {
    constructor(
        private readonly databaseService: DatabaseService,
    ) { }

    async createCustomerCategory(data: CreateCustomerCategoryDto, userId: string) {
        const existing = await this.databaseService.customerCategory.findFirst({
            where: {
                userId,
                name: data.name
            }
        })
        if (existing) {
            throw new BadRequestException("Tên nhóm khách hàng đã tồn tại!")
        }

        const category = await this.databaseService.customerCategory.create({
            data: {
                ...data,
                userId
            }
        })
        return category
    }

    async getAllCustomerCategories(userId: string) {
        const categories = await this.databaseService.customerCategory.findMany({
            where: {
                userId
            },
            orderBy: {
                createdAt: "desc"
            },
            include: {
                _count: {
                    select: {
                        conversationLinks: true
                    }
                }
            }
        })

        return categories.map(category => {
            const { _count, ...rest } = category

            return {
                ...rest,
                conversationCount: _count.conversationLinks
            }
        })
    }

    async getCustomerCategoryById(id: string, userId: string) {
        const category = await this.databaseService.customerCategory.findUnique({
            where: {
                id,
                userId
            }
        })

        if (!category) {
            throw new NotFoundException("Không tìm thấy nhóm khách hàng!")
        }

        return category
    }

    async addConversationToCategory(
        data: AddConversationToCategoryDto,
        userId: string
    ) {
        const { categoryIds = [], conversationId } = data;
        const conversation = await this.databaseService.conversation.findFirst({
            where: {
                id: conversationId,
                OR: [{ user1Id: userId }, { user2Id: userId }],
            },
            select: { id: true }
        });

        if (!conversation) {
            throw new Error("Conversation không tồn tại hoặc user không có quyền");
        }

        let categories: any[] = [];
        console.log("nkmn: ", categoryIds);
        

        if (categoryIds.length > 0) {
            categories = await this.databaseService.customerCategory.findMany({
                where: {
                    id: { in: categoryIds },
                    userId,
                },
                select: {
                    id: true,
                    name: true,
                    color: true,
                    description: true
                }
            });

            if (categories.length !== categoryIds.length) {
                throw new Error("Có category không tồn tại hoặc không thuộc user");
            }
        }

        await this.databaseService.conversationCategory.deleteMany({
            where: {
                conversationId,
                userId,
            },
        });

        if (categoryIds.length > 0) {
            await this.databaseService.conversationCategory.createMany({
                data: categoryIds.map((categoryId) => ({
                    conversationId,
                    categoryId,
                    userId,
                })),
            });
        }
        
        return {
            conversationId,
            categories
        };
    }
}