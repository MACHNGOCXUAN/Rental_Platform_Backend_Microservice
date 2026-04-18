import { Controller, Get, Query } from '@nestjs/common';
import { PublicRoute } from 'src/common/decorators/public.decorator';
import { PriceAnalyticsQueryDto } from '../dtos/price-analytics.dto';
import { PriceAnalyticsService } from '../services/price-analytics.service';

@Controller('analytics')
export class PriceAnalyticsController {
  constructor(private readonly priceAnalyticsService: PriceAnalyticsService) {}

  @PublicRoute('Phân tích giá bất động sản')
  @Get('/price')
  getPriceAnalytics(@Query() query: PriceAnalyticsQueryDto) {
    return this.priceAnalyticsService.getPriceAnalytics(query);
  }
}
