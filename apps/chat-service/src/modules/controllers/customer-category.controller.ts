import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CustomerCategoryService } from "../services/customer-category.service";
import { AddConversationToCategoryDto, CreateCustomerCategoryDto } from "../dtos/customer-category.dto";
import type { IAuthUserPayload } from "src/common/interfaces/request.interface";
import { AuthUser } from "src/common/decorators/auth-user.decorator";

@Controller("/customer-categories")
export class CustomerCategoryController {
  constructor(
    private readonly customerCategoryService: CustomerCategoryService
  ) { }

  @Post()
  createCustomerCategory(@Body() data: CreateCustomerCategoryDto, @AuthUser() user: IAuthUserPayload) {
    return this.customerCategoryService.createCustomerCategory(data, user.id)
  }

  @Get()
  getAllCustomerCategories(@AuthUser() user: IAuthUserPayload) {
    return this.customerCategoryService.getAllCustomerCategories(user.id)
  }

  @Get("detail/:id")
  getCustomerCategoryById(@Param("id") id: string, @AuthUser() user: IAuthUserPayload) {
    return this.customerCategoryService.getCustomerCategoryById(id, user.id)
  }

  @Post("add-conversation")
  addConversationToCategory(@AuthUser() user: IAuthUserPayload, @Body() data: AddConversationToCategoryDto) {
    return this.customerCategoryService.addConversationToCategory(data, user.id)
  }
}