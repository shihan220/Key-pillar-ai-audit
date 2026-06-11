import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateGitWorkspaceRepositoryDto } from './dto/github-workspace.dto';
import { GitHubWorkspaceService } from './github-workspace.service';

@UseGuards(JwtAuthGuard)
@Controller('github-workspace')
export class GitHubWorkspaceController {
  constructor(private readonly gitHubWorkspaceService: GitHubWorkspaceService) {}

  @Get()
  getWorkspace() {
    return this.gitHubWorkspaceService.getWorkspace();
  }

  @Post()
  addRepository(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateGitWorkspaceRepositoryDto) {
    return this.gitHubWorkspaceService.addRepository(user, body.url, body.accessToken);
  }

  @Delete(':id')
  deleteRepository(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.gitHubWorkspaceService.deleteRepository(user, id);
  }
}
