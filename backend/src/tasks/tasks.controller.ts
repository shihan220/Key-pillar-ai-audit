import { Body, Controller, Delete, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddCommentDto, ChangeTaskStatusDto, CreateTaskDto, ReassignTaskDto, UpdateTaskDto } from './dto/task.dto';
import { TasksService } from './tasks.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  createTask(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateTaskDto) {
    return this.tasksService.createTask(user, body);
  }

  @Patch(':id')
  updateTask(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: UpdateTaskDto) {
    return this.tasksService.updateTask(id, user, body);
  }

  @Delete(':id')
  deleteTask(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.deleteTask(id, user);
  }

  @Post(':id/reassign')
  reassignTask(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: ReassignTaskDto) {
    return this.tasksService.reassignTask(id, user, body);
  }

  @Post(':id/approve')
  approveTask(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.approveTask(id, user);
  }

  @Post(':id/status')
  changeStatus(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: ChangeTaskStatusDto) {
    return this.tasksService.changeTaskStatus(id, user, body);
  }

  @Post(':id/remove-failed-status')
  removeFailedStatus(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.removeFailedStatus(id, user);
  }

  @Post(':id/comments')
  addComment(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: AddCommentDto) {
    return this.tasksService.addComment(id, user, body);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('attachment', { limits: { fileSize: 25 * 1024 * 1024 } }))
  uploadAttachment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    return this.tasksService.uploadAttachment(id, user, file, this.getPublicOrigin(req));
  }

  private getPublicOrigin(req: any) {
    const host = req?.headers?.host ?? `localhost:${process.env.BACKEND_PORT ?? process.env.PORT ?? 4000}`;
    return `${req?.protocol ?? 'http'}://${host}`;
  }
}
