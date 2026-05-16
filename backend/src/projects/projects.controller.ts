import { Body, Controller, Delete, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('attachment', { limits: { fileSize: 25 * 1024 * 1024 } }))
  createProject(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateProjectDto,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    return this.projectsService.createProject(user, body, file, this.getPublicOrigin(req));
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('attachment', { limits: { fileSize: 25 * 1024 * 1024 } }))
  updateProject(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateProjectDto,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    return this.projectsService.updateProject(id, user, body, file, this.getPublicOrigin(req));
  }

  @Delete(':id')
  deleteProject(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.deleteProject(id, user);
  }

  private getPublicOrigin(req: any) {
    const host = req?.headers?.host ?? `localhost:${process.env.BACKEND_PORT ?? process.env.PORT ?? 4000}`;
    return `${req?.protocol ?? 'http'}://${host}`;
  }
}
