import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async removeFailedStatus(taskId: string, actorId: string) {
    if (!actorId) {
      throw new BadRequestException('actorId is required.');
    }

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignedDeveloper: true,
      },
    });

    if (!task || task.deletedAt) {
      throw new NotFoundException('Task not found.');
    }

    if (task.status !== TaskStatus.FAILED) {
      throw new BadRequestException('Only failed tasks can remove failed status.');
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
    });

    if (!actor) {
      throw new NotFoundException('Actor not found.');
    }

    const isAllowed = actor.role === 'ADMIN' || actor.id === task.assignedDeveloperId;
    if (!isAllowed) {
      throw new ForbiddenException('You cannot update this task.');
    }

    const now = new Date();

    const updatedTask = await this.prisma.$transaction(async (tx) => {
      const nextTask = await tx.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.IN_PROGRESS,
          startedAt: task.startedAt ?? now,
        },
      });

      await tx.taskHistory.create({
        data: {
          taskId: task.id,
          actorId: actor.id,
          action: 'Failed status removed',
          oldValue: 'FAILED' as Prisma.InputJsonValue,
          newValue: 'IN_PROGRESS' as Prisma.InputJsonValue,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          action: 'Failed status removed',
          entityType: 'Task',
          entityId: task.id,
          entityName: task.title,
          oldValue: 'FAILED' as Prisma.InputJsonValue,
          newValue: 'IN_PROGRESS' as Prisma.InputJsonValue,
        },
      });

      return nextTask;
    });

    return {
      success: true,
      task: updatedTask,
    };
  }
}
