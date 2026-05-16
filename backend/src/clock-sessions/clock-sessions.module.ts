import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClockSessionsController } from './clock-sessions.controller';
import { ClockSessionsService } from './clock-sessions.service';

@Module({
  imports: [AuthModule],
  controllers: [ClockSessionsController],
  providers: [ClockSessionsService],
})
export class ClockSessionsModule {}
