import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClockSessionsService } from './clock-sessions.service';

@UseGuards(JwtAuthGuard)
@Controller('clock-sessions')
export class ClockSessionsController {
  constructor(private readonly clockSessionsService: ClockSessionsService) {}

  @Post('clock-in')
  clockIn(@CurrentUser() user: AuthenticatedUser) {
    return this.clockSessionsService.clockIn(user);
  }

  @Post('clock-out')
  clockOut(@CurrentUser() user: AuthenticatedUser) {
    return this.clockSessionsService.clockOut(user);
  }

  @Get('current')
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.clockSessionsService.getCurrent(user);
  }

  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.clockSessionsService.getHistory(user);
  }

  @Get('user/:userId/history')
  historyForUser(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string) {
    return this.clockSessionsService.getHistoryForUser(user, userId);
  }
}
