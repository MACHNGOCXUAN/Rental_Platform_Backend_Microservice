import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { AdminNewsListQueryDto, CreateNewsDto, NewsListQueryDto, UpdateNewsDto, NEWS_STATUSES, NewsStatus } from '../dtos/news.dto';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

@Injectable()
export class NewsService {
  constructor(private readonly db: DatabaseService) {}

  private async ensureUniqueSlug(base: string) {
    const normalized = base || 'tin-tuc';
    let slug = normalized;
    let suffix = 1;

    while (await this.db.newsArticle.findUnique({ where: { slug } })) {
      slug = `${normalized}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }

  private buildPublicWhere(query: NewsListQueryDto) {
    const where: any = {
      deletedAt: null,
      isActive: true,
      status: 'published',
    };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { summary: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.category) {
      where.category = { equals: query.category, mode: 'insensitive' };
    }

    if (query.tag) {
      where.tags = { has: query.tag };
    }

    return where;
  }

  private buildAdminWhere(query: AdminNewsListQueryDto) {
    const where: any = { deletedAt: null };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { summary: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.category) {
      where.category = { equals: query.category, mode: 'insensitive' };
    }

    if (query.tag) {
      where.tags = { has: query.tag };
    }

    if (query.status) {
      where.status = query.status;
    }

    return where;
  }

  async createNews(dto: CreateNewsDto, authorId: string) {
    const status: NewsStatus = dto.status ?? 'draft';
    if (!NEWS_STATUSES.includes(status)) {
      throw new BadRequestException('Invalid news status');
    }

    const baseSlug = dto.title ? slugify(dto.title) : 'tin-tuc';
    const slug = await this.ensureUniqueSlug(baseSlug);

    const data = await this.db.newsArticle.create({
      data: {
        title: dto.title,
        slug,
        summary: dto.summary ?? null,
        content: dto.content,
        coverImageUrl: dto.coverImageUrl ?? null,
        category: dto.category ?? null,
        tags: dto.tags ?? [],
        status,
        isFeatured: dto.isFeatured ?? false,
        publishedAt: status === 'published' ? new Date() : null,
        authorId,
      },
      select: {
        newsId: true,
        slug: true,
      },
    });

    return {
      message: 'News created successfully',
      ...data,
    };
  }

  async updateNews(newsId: string, dto: UpdateNewsDto) {
    const existing = await this.db.newsArticle.findFirst({
      where: { newsId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('News not found');
    }

    let slug = existing.slug;
    if (dto.slug && dto.slug.trim()) {
      slug = await this.ensureUniqueSlug(slugify(dto.slug.trim()));
    }

    const status = dto.status ?? existing.status;
    const publishedAt =
      status === 'published'
        ? existing.publishedAt ?? new Date()
        : status === 'draft'
        ? null
        : existing.publishedAt;

    await this.db.newsArticle.update({
      where: { newsId },
      data: {
        title: dto.title ?? undefined,
        slug,
        summary: dto.summary ?? undefined,
        content: dto.content ?? undefined,
        coverImageUrl: dto.coverImageUrl ?? undefined,
        category: dto.category ?? undefined,
        tags: dto.tags ?? undefined,
        status,
        isFeatured: dto.isFeatured ?? undefined,
        publishedAt,
      },
    });

    return { message: 'News updated successfully' };
  }

  async deleteNews(newsId: string) {
    const existing = await this.db.newsArticle.findFirst({
      where: { newsId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('News not found');
    }

    await this.db.newsArticle.update({
      where: { newsId },
      data: { deletedAt: new Date(), isActive: false },
    });

    return { message: 'News removed successfully' };
  }

  async publishNews(newsId: string) {
    const existing = await this.db.newsArticle.findFirst({
      where: { newsId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('News not found');
    }

    await this.db.newsArticle.update({
      where: { newsId },
      data: {
        status: 'published',
        isActive: true,
        publishedAt: existing.publishedAt ?? new Date(),
      },
    });

    return { message: 'News published successfully' };
  }

  async unpublishNews(newsId: string) {
    const existing = await this.db.newsArticle.findFirst({
      where: { newsId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('News not found');
    }

    await this.db.newsArticle.update({
      where: { newsId },
      data: {
        status: 'draft',
        publishedAt: null,
      },
    });

    return { message: 'News moved to draft' };
  }

  async toggleFeatured(newsId: string, isFeatured: boolean) {
    const existing = await this.db.newsArticle.findFirst({
      where: { newsId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('News not found');
    }

    await this.db.newsArticle.update({
      where: { newsId },
      data: { isFeatured },
    });

    return { message: 'News updated successfully' };
  }

  async getPublicList(query: NewsListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(30, Math.max(6, query.limit ?? 9));
    const where = this.buildPublicWhere(query);

    const [items, total] = await Promise.all([
      this.db.newsArticle.findMany({
        where,
        orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          newsId: true,
          title: true,
          slug: true,
          summary: true,
          coverImageUrl: true,
          category: true,
          tags: true,
          publishedAt: true,
          viewCount: true,
          author: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.db.newsArticle.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminList(query: AdminNewsListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(10, query.limit ?? 10));
    const where = this.buildAdminWhere(query);

    const [items, total] = await Promise.all([
      this.db.newsArticle.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          newsId: true,
          title: true,
          slug: true,
          status: true,
          isFeatured: true,
          category: true,
          publishedAt: true,
          createdAt: true,
          viewCount: true,
          author: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      }),
      this.db.newsArticle.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminDetail(newsId: string) {
    const news = await this.db.newsArticle.findFirst({
      where: { newsId, deletedAt: null },
      select: {
        newsId: true,
        title: true,
        slug: true,
        summary: true,
        content: true,
        coverImageUrl: true,
        category: true,
        tags: true,
        status: true,
        isFeatured: true,
        publishedAt: true,
        createdAt: true,
        viewCount: true,
        author: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    if (!news) {
      throw new NotFoundException('News not found');
    }

    return news;
  }

  async getPublicDetail(slug: string) {
    const news = await this.db.newsArticle.findFirst({
      where: {
        slug,
        deletedAt: null,
        status: 'published',
        isActive: true,
      },
      select: {
        newsId: true,
        title: true,
        slug: true,
        summary: true,
        content: true,
        coverImageUrl: true,
        category: true,
        tags: true,
        publishedAt: true,
        viewCount: true,
        author: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!news) {
      throw new NotFoundException('News not found');
    }

    await this.db.newsArticle.update({
      where: { newsId: news.newsId },
      data: { viewCount: { increment: 1 } },
    });

    return news;
  }

  async getFeatured(limit = 6) {
    const items = await this.db.newsArticle.findMany({
      where: {
        deletedAt: null,
        status: 'published',
        isActive: true,
        isFeatured: true,
      },
      orderBy: [{ publishedAt: 'desc' }],
      take: Math.min(12, Math.max(3, limit)),
      select: {
        newsId: true,
        title: true,
        slug: true,
        summary: true,
        coverImageUrl: true,
        category: true,
        tags: true,
        publishedAt: true,
        viewCount: true,
      },
    });

    return items;
  }
}
