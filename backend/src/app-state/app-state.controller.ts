import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppStateService } from './app-state.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-user';

@Controller('app-state')
export class AppStateController {
  constructor(private readonly appStateService: AppStateService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getState(@CurrentUser() user: AuthenticatedUser) {
    return this.appStateService.getState(user);
  }
}
