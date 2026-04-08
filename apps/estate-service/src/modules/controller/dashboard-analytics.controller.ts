import { Controller, Get } from '@nestjs/common';
import { AdminOnly } from 'src/common/decorators/auth-roles.decorator';
import { DashboardAnalyticsService } from '../services/dashboard-analytics.service';

@Controller('/admin/analytics')
export class DashboardAnalyticsController {
  constructor(private readonly dashboardAnalyticsService: DashboardAnalyticsService) {}

  @AdminOnly()
  @Get('/dashboard')
  getDashboardAnalytics() {
    return this.dashboardAnalyticsService.getDashboardAnalytics();
  }
}