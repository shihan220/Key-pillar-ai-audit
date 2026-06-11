import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GitHubWorkspaceController } from './github-workspace.controller';
import { GitHubWorkspaceService } from './github-workspace.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [GitHubWorkspaceController],
  providers: [GitHubWorkspaceService],
  exports: [GitHubWorkspaceService],
})
export class GitHubWorkspaceModule {}
