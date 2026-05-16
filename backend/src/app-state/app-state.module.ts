import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppStateController } from './app-state.controller';
import { AppStateService } from './app-state.service';

@Module({
  imports: [AuthModule],
  controllers: [AppStateController],
  providers: [AppStateService],
  exports: [AppStateService],
})
export class AppStateModule {}
