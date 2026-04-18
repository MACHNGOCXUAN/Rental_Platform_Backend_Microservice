import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AdminOnly } from 'src/common/decorators/auth-roles.decorator';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { PublicRoute } from 'src/common/decorators/public.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { AdminNewsListQueryDto, CreateNewsDto, NewsListQueryDto, UpdateNewsDto } from '../dtos/news.dto';
import { NewsService } from '../services/news.service';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  // ====================== Admin routes =======================

  @AdminOnly()
  @Get('/admin')
  getAdminNews(@Query() query: AdminNewsListQueryDto) {
    return this.newsService.getAdminList(query);
  }

  @AdminOnly()
  @Get('/admin/:id')
  getAdminNewsDetail(@Param('id') id: string) {
    return this.newsService.getAdminDetail(id);
  }

  @AdminOnly()
  @Post('/admin')
  createNews(@AuthUser() user: IAuthUserPayload, @Body() body: CreateNewsDto) {
    return this.newsService.createNews(body, user.id);
  }

  @AdminOnly()
  @Put('/admin/:id')
  updateNews(@Param('id') id: string, @Body() body: UpdateNewsDto) {
    return this.newsService.updateNews(id, body);
  }

  @AdminOnly()
  @Delete('/admin/:id')
  deleteNews(@Param('id') id: string) {
    return this.newsService.deleteNews(id);
  }

  @AdminOnly()
  @Put('/admin/:id/publish')
  publishNews(@Param('id') id: string) {
    return this.newsService.publishNews(id);
  }

  @AdminOnly()
  @Put('/admin/:id/unpublish')
  unpublishNews(@Param('id') id: string) {
    return this.newsService.unpublishNews(id);
  }

  @AdminOnly()
  @Put('/admin/:id/feature')
  setFeatured(@Param('id') id: string, @Body() body: { isFeatured: boolean }) {
    return this.newsService.toggleFeatured(id, body.isFeatured);
  }

  // ====================== Public routes =======================

  @PublicRoute('Danh sach tin tuc cong khai')
  @Get()
  getPublicNews(@Query() query: NewsListQueryDto) {
    return this.newsService.getPublicList(query);
  }

  @PublicRoute('Tin tuc noi bat')
  @Get('/featured')
  getFeatured(@Query('limit') limit?: string) {
    return this.newsService.getFeatured(limit ? parseInt(limit, 10) : 6);
  }

  @PublicRoute('Chi tiet tin tuc cong khai')
  @Get('/:slug')
  getPublicDetail(@Param('slug') slug: string) {
    return this.newsService.getPublicDetail(slug);
  }
}
