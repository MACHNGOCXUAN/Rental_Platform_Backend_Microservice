import { Injectable } from '@nestjs/common';
import { ApprovalStatus, PropertyStatus } from 'generated/prisma/enums';
import { DatabaseService } from 'src/common/services/database.service';
import { PriceAnalyticsQueryDto } from '../dtos/price-analytics.dto';

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
};

const monthKey = (date: Date) => `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const percentile = (sorted: number[], percent: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((percent / 100) * (sorted.length - 1))));
  return sorted[index];
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

@Injectable()
export class PriceAnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  private createMonthBuckets(length = 6) {
    const now = new Date();
    const months: string[] = [];
    for (let i = length - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(monthKey(d));
    }
    return months;
  }

  private buildWhere(query: PriceAnalyticsQueryDto) {
    const where: any = {
      deletedAt: null,
      status: PropertyStatus.active,
      approvalStatus: ApprovalStatus.approved,
      isActive: true,
    };

    if (query.propertyType) where.propertyType = query.propertyType;
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
    if (query.district) where.district = { contains: query.district, mode: 'insensitive' };
    if (query.ward) where.ward = { contains: query.ward, mode: 'insensitive' };

    return where;
  }

  async getPriceAnalytics(query: PriceAnalyticsQueryDto) {
    const months = clamp(query.months ?? 6, 3, 24);
    const top = clamp(query.top ?? 8, 3, 20);
    const where = this.buildWhere(query);

    const [items, groupedCity] = await Promise.all([
      this.db.property.findMany({
        where,
        select: {
          pricePerMonth: true,
          areaSqm: true,
          createdAt: true,
          city: true,
        },
      }),
      this.db.property.groupBy({
        by: ['city'],
        where,
        _avg: { pricePerMonth: true, areaSqm: true },
        _count: { city: true },
      }),
    ]);

    const prices = items
      .map((item) => toNumber(item.pricePerMonth))
      .filter((value) => value > 0)
      .sort((a, b) => a - b);

    const sampleCount = prices.length;
    const minPrice = prices[0] ?? 0;
    const maxPrice = prices[prices.length - 1] ?? 0;
    const avgPrice = sampleCount > 0 ? prices.reduce((acc, v) => acc + v, 0) / sampleCount : 0;
    const medianPrice = sampleCount > 0 ? prices[Math.floor(sampleCount / 2)] : 0;

    const areas = items
      .map((item) => toNumber(item.areaSqm))
      .filter((value) => value > 0);
    const avgArea = areas.length > 0 ? areas.reduce((acc, v) => acc + v, 0) / areas.length : 0;

    const pricePerSqmList = items
      .map((item) => {
        const price = toNumber(item.pricePerMonth);
        const area = toNumber(item.areaSqm);
        return area > 0 ? price / area : 0;
      })
      .filter((value) => value > 0);

    const avgPricePerSqm = pricePerSqmList.length > 0
      ? pricePerSqmList.reduce((acc, v) => acc + v, 0) / pricePerSqmList.length
      : 0;

    const popularMin = percentile(prices, 25);
    const popularMax = percentile(prices, 75);

    const bucketCount = 5;
    const distribution = prices.length === 0
      ? []
      : (() => {
          const step = Math.max(1, (maxPrice - minPrice) / bucketCount);
          const buckets = Array.from({ length: bucketCount }, (_, index) => ({
            min: minPrice + step * index,
            max: index === bucketCount - 1 ? maxPrice : minPrice + step * (index + 1),
            count: 0,
          }));

          prices.forEach((price) => {
            const idx = Math.min(bucketCount - 1, Math.floor((price - minPrice) / step));
            buckets[idx].count += 1;
          });

          return buckets.map((bucket) => ({
            label: `${Math.round(bucket.min / 1_000_000)}-${Math.round(bucket.max / 1_000_000)}tr`,
            min: bucket.min,
            max: bucket.max,
            count: bucket.count,
          }));
        })();

    const monthLabels = this.createMonthBuckets(months);
    const monthSet = new Set(monthLabels);
    const monthMap = new Map<string, number[]>();

    items.forEach((item) => {
      const label = monthKey(item.createdAt);
      if (!monthSet.has(label)) return;
      const price = toNumber(item.pricePerMonth);
      if (price <= 0) return;
      if (!monthMap.has(label)) monthMap.set(label, []);
      monthMap.get(label)!.push(price);
    });

    const trend = monthLabels.map((label) => {
      const values = (monthMap.get(label) ?? []).sort((a, b) => a - b);
      const count = values.length;
      const min = values[0] ?? 0;
      const max = values[values.length - 1] ?? 0;
      const avg = count > 0 ? values.reduce((acc, v) => acc + v, 0) / count : 0;
      const median = count > 0 ? values[Math.floor(count / 2)] : 0;
      return {
        month: label,
        avgPrice: avg,
        medianPrice: median,
        minPrice: min,
        maxPrice: max,
        count,
      };
    });

    const latestAvg = trend[trend.length - 1]?.avgPrice ?? 0;
    const prevAvg = trend[trend.length - 2]?.avgPrice ?? 0;
    const changePercent = prevAvg > 0 ? Math.round(((latestAvg - prevAvg) / prevAvg) * 100) : 0;

    const topCities = groupedCity
      .filter((row) => row.city && row.city.trim().length > 0)
      .map((row) => {
        const avg = toNumber(row._avg.pricePerMonth);
        const avgAreaGroup = toNumber(row._avg.areaSqm);
        const avgSqm = avgAreaGroup > 0 ? avg / avgAreaGroup : 0;
        return {
          key: slugify(row.city || 'khac'),
          label: row.city || 'Khác',
          avgPrice: avg,
          count: row._count.city ?? 0,
          avgPricePerSqm: avgSqm,
        };
      })
      .sort((a, b) => b.avgPrice - a.avgPrice)
      .slice(0, top);

    return {
      filters: {
        propertyType: query.propertyType ?? null,
        city: query.city ?? null,
        district: query.district ?? null,
        ward: query.ward ?? null,
        months,
      },
      summary: {
        sampleCount,
        avgPrice,
        medianPrice,
        minPrice,
        maxPrice,
        avgArea,
        avgPricePerSqm,
        popularRange: {
          min: popularMin,
          max: popularMax,
        },
        latestMonthLabel: trend[trend.length - 1]?.month ?? null,
        changePercent,
      },
      distribution,
      trend,
      topCities,
    };
  }
}
