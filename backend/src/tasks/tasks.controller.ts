import { Body, Controller, Param, Post } from '@nestjs/common';
import { TasksService } from './tasks.service';

type RemoveFailedStatusBody = {
  actorId: string;
};

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post(':id/remove-failed-status')
  removeFailedStatus(@Param('id') id: string, @Body() body: RemoveFailedStatusBody) {
    return this.tasksService.removeFailedStatus(id, body.actorId);
  }
}
