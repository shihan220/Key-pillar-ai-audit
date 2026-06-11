import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClockSessionsController } from './clock-sessions.controller';
import { ClockSessionsService } from './clock-sessions.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ClockSessionsController],
  providers: [ClockSessionsService],
})
export class ClockSessionsModule {}
