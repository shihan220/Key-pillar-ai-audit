import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommentType, Prisma, Task, TaskStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-user';
import { commentTypeFromFrontend, parseDateInput, taskStatusFromFrontend } from '../common/frontend-mappers';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddCommentDto, ChangeTaskStatusDto, CreateTaskDto, ReassignTaskDto, UpdateTaskDto } from './dto/task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createTask(user: AuthenticatedUser, body: CreateTaskDto) {
    this.requireAdmin(user);

    const task = await this.prisma.task.create({
      data: {
        title: body.title,
        description: body.description,
        projectId: body.projectId,
        assignedDeveloperId: body.developerId,
        dueAt: parseDateInput(body.dueDate),
        status: TaskStatus.PENDING,
        createdById: user.id,
      },
    });

    await this.prisma.$transaction([
      this.prisma.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          action: 'Task created',
          entityType: 'Task',
          entityId: task.id,
          entityName: task.title,
          newValue: 'Pending' as Prisma.InputJsonValue,
        },
      }),
      this.prisma.taskHistory.create({
        data: {
          taskId: task.id,
          actorId: user.id,
          action: 'Task created',
          newValue: task.title as Prisma.InputJsonValue,
        },
      }),
      this.prisma.taskHistory.create({
        data: {
          taskId: task.id,
          actorId: user.id,
          action: 'Task assigned',
          newValue: body.developerId as Prisma.InputJsonValue,
        },
      }),
    ]);

    await this.notificationsService.notifyAdmins(
      'Task created',
      'Task',
      task.id,
      'Task created',
      `New task created: ${task.title}.`,
    );
    await this.notificationsService.notifyUsers({
      userIds: [body.developerId],
      action: 'Task created',
      entityType: 'Task',
      entityId: task.id,
      title: 'New task assigned',
      message: `You have been assigned a new task: ${task.title}.`,
    });

    return { success: true, id: task.id };
  }

  async updateTask(taskId: string, user: AuthenticatedUser, body: UpdateTaskDto) {
    const task = await this.requireTask(taskId);

    if (user.role === 'ADMIN') {
      const patch: Prisma.TaskUpdateInput = {
        title: body.title ?? task.title,
        description: body.description ?? task.description,
        dueAt: body.dueDate ? parseDateInput(body.dueDate) : task.dueAt,
        project: body.projectId ? { connect: { id: body.projectId } } : undefined,
        assignedDeveloper: body.developerId ? { connect: { id: body.developerId } } : undefined,
      };

      if (body.status) {
        Object.assign(patch, this.statusPatch(task, taskStatusFromFrontend(body.status), user));
      }

      await this.prisma.task.update({
        where: { id: taskId },
        data: patch,
      });
    } else {
      this.requireAssignedDeveloper(task, user);

      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          title: body.title ?? task.title,
          description: body.description ?? task.description,
          dueAt: body.dueDate ? parseDateInput(body.dueDate) : task.dueAt,
        },
      });
    }

    await this.recordTaskEvent(task, user, 'Task edited', task.title, body.title ?? task.title);
    const nextTitle = body.title ?? task.title;
    await this.notificationsService.notifyAdmins(
      'Task updated',
      'Task',
      task.id,
      'Task updated',
      user.role === 'ADMIN' ? `Task updated: ${nextTitle}.` : `${user.name} updated a task: ${nextTitle}.`,
    );
    if (user.role === 'ADMIN') {
      await this.notificationsService.notifyUsers({
        userIds: [body.developerId ?? task.assignedDeveloperId],
        action: 'Task updated',
        entityType: 'Task',
        entityId: task.id,
        title: 'Task updated',
        message: `Your task details have been updated: ${nextTitle}.`,
      });
    }
    return { success: true };
  }

  async reassignTask(taskId: string, user: AuthenticatedUser, body: ReassignTaskDto) {
    this.requireAdmin(user);
    const task = await this.requireTask(taskId);

    await this.prisma.task.update({
      where: { id: taskId },
      data: { assignedDeveloperId: body.developerId },
    });

    await this.recordTaskEvent(task, user, 'Task reassigned', task.assignedDeveloperId, body.developerId);
    await this.notificationsService.notifyAdmins(
      'Task reassigned',
      'Task',
      task.id,
      'Task reassigned',
      `Task reassigned successfully: ${task.title}.`,
    );
    await this.notificationsService.notifyUsers({
      userIds: [body.developerId],
      action: 'Task reassigned',
      entityType: 'Task',
      entityId: task.id,
      title: 'Task reassigned',
      message: `A task has been reassigned to you: ${task.title}.`,
    });
    return { success: true };
  }

  async approveTask(taskId: string, user: AuthenticatedUser) {
    this.requireAdmin(user);
    const task = await this.requireTask(taskId);
    if (task.status !== TaskStatus.WAITING_FOR_APPROVAL) {
      throw new BadRequestException('Only tasks waiting for approval can be approved.');
    }

    const now = new Date();
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.COMPLETE,
        approvedById: user.id,
        approvedAt: now,
        completedAt: now,
      },
    });

    await this.recordTaskEvent(task, user, 'Task approved', 'Waiting for Approval', 'Complete');
    await this.notificationsService.notifyAdmins(
      'Admin approval action',
      'Task',
      task.id,
      'Task approved',
      `Task approved: ${task.title}.`,
    );
    await this.notificationsService.notifyUsers({
      userIds: [task.assignedDeveloperId],
      action: 'Task approved',
      entityType: 'Task',
      entityId: task.id,
      title: 'Task approved',
      message: `Admin has approved your task: ${task.title}.`,
    });
    return { success: true };
  }

  async deleteTask(taskId: string, user: AuthenticatedUser) {
    this.requireAdmin(user);
    const task = await this.requireTask(taskId);
    await this.prisma.task.update({
      where: { id: taskId },
      data: { deletedAt: new Date() },
    });
    await this.recordTaskEvent(task, user, 'Task deleted', task.status, 'Deleted');
    await this.notificationsService.notifyAdmins(
      'Task deleted',
      'Task',
      task.id,
      'Task deleted',
      `Task deleted: ${task.title}.`,
    );
    await this.notificationsService.notifyUsers({
      userIds: [task.assignedDeveloperId],
      action: 'Task deleted',
      entityType: 'Task',
      entityId: task.id,
      title: 'Task deleted',
      message: `A task assigned to you was deleted: ${task.title}.`,
    });
    return { success: true };
  }

  async changeTaskStatus(taskId: string, user: AuthenticatedUser, body: ChangeTaskStatusDto) {
    const task = await this.requireTask(taskId);
    this.requireAssignedDeveloper(task, user);

    const nextStatus = taskStatusFromFrontend(body.status);
    const current = task.status;

    if (current === TaskStatus.PENDING && nextStatus !== TaskStatus.IN_PROGRESS) {
      throw new BadRequestException('Pending tasks can only be started.');
    }
    if (
      current === TaskStatus.IN_PROGRESS &&
      nextStatus !== TaskStatus.FAILED &&
      nextStatus !== TaskStatus.WAITING_FOR_APPROVAL
    ) {
      throw new BadRequestException('In progress tasks can only be marked failed or sent for approval.');
    }
    if (current === TaskStatus.FAILED && nextStatus !== TaskStatus.WAITING_FOR_APPROVAL) {
      throw new BadRequestException('Failed tasks can only be sent for approval from this action.');
    }
    if (current === TaskStatus.WAITING_FOR_APPROVAL || current === TaskStatus.COMPLETE) {
      throw new BadRequestException('This task status cannot be changed here.');
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: this.statusPatch(task, nextStatus, user),
    });

    await this.recordTaskEvent(task, user, 'Task status changed', this.frontStatus(task.status), this.frontStatus(nextStatus));
    if (nextStatus === TaskStatus.WAITING_FOR_APPROVAL) {
      await this.notificationsService.notifyAdmins(
        'Task waiting for approval',
        'Task',
        task.id,
        'Task sent for approval',
        `${user.name} has submitted a task for approval: ${task.title}.`,
      );
      await this.notificationsService.notifyUsers({
        userIds: [task.assignedDeveloperId],
        action: 'Task waiting for approval',
        entityType: 'Task',
        entityId: task.id,
        title: 'Task sent for approval',
        message: `Your task has been sent for approval: ${task.title}.`,
      });
    } else if (nextStatus === TaskStatus.FAILED) {
      await this.notificationsService.notifyAdmins(
        'Failed task update',
        'Task',
        task.id,
        'Task failed',
        `Task marked as failed: ${task.title}.`,
      );
      await this.notificationsService.notifyUsers({
        userIds: [task.assignedDeveloperId],
        action: 'Failed task update',
        entityType: 'Task',
        entityId: task.id,
        title: 'Task failed',
        message: `Your task has been marked as failed: ${task.title}.`,
      });
    } else {
      await this.notificationsService.notifyAdmins(
        'Task status changed',
        'Task',
        task.id,
        'Task status updated',
        `${user.name} updated the task status: ${task.title}.`,
      );
      await this.notificationsService.notifyUsers({
        userIds: [task.assignedDeveloperId],
        action: 'Task status changed',
        entityType: 'Task',
        entityId: task.id,
        title: 'Task status updated',
        message: `Your task status has been updated: ${task.title}.`,
      });
    }
    return { success: true };
  }

  async removeFailedStatus(taskId: string, user: AuthenticatedUser) {
    const task = await this.requireTask(taskId);
    if (task.status !== TaskStatus.FAILED) {
      throw new BadRequestException('Only failed tasks can remove failed status.');
    }
    if (user.role !== 'ADMIN') {
      this.requireAssignedDeveloper(task, user);
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: this.statusPatch(task, TaskStatus.IN_PROGRESS, user),
    });

    await this.recordTaskEvent(task, user, 'Failed status removed', 'Failed', 'In Progress');
    await this.notificationsService.notifyAdmins(
      'Failed task update',
      'Task',
      task.id,
      'Failed status removed',
      `${user.name} resumed work on: ${task.title}.`,
    );
    return { success: true };
  }

  async addComment(taskId: string, user: AuthenticatedUser, body: AddCommentDto) {
    const task = await this.requireTask(taskId);
    if (user.role !== 'ADMIN') {
      this.requireAssignedDeveloper(task, user);
    }

    const commentType = commentTypeFromFrontend(body.type);
    await this.prisma.taskComment.create({
      data: {
        taskId,
        authorId: user.id,
        body: body.text,
        type: commentType,
      },
    });

    const action = commentType === CommentType.ISSUE_COMMENT ? 'Issue comment added' : 'Comment added';
    await this.recordTaskEvent(task, user, action, undefined, body.text);
    return { success: true };
  }

  private statusPatch(task: Task, nextStatus: TaskStatus, user: AuthenticatedUser): Prisma.TaskUncheckedUpdateInput {
    const now = new Date();
    const patch: Prisma.TaskUncheckedUpdateInput = {
      status: nextStatus,
    };

    if (nextStatus === TaskStatus.IN_PROGRESS) {
      patch.startedAt = task.startedAt ?? now;
    }
    if (nextStatus === TaskStatus.WAITING_FOR_APPROVAL) {
      patch.submittedForApprovalAt = now;
    }
    if (nextStatus === TaskStatus.COMPLETE) {
      patch.approvedById = user.id;
      patch.approvedAt = now;
      patch.completedAt = now;
    }

    return patch;
  }

  private frontStatus(status: TaskStatus) {
    const map: Record<TaskStatus, string> = {
      [TaskStatus.PENDING]: 'Pending',
      [TaskStatus.IN_PROGRESS]: 'In Progress',
      [TaskStatus.FAILED]: 'Failed',
      [TaskStatus.WAITING_FOR_APPROVAL]: 'Waiting for Approval',
      [TaskStatus.COMPLETE]: 'Complete',
    };
    return map[status];
  }

  private async recordTaskEvent(
    task: Task,
    user: AuthenticatedUser,
    action: string,
    oldValue?: string,
    newValue?: string,
  ) {
    await this.prisma.$transaction([
      this.prisma.taskHistory.create({
        data: {
          taskId: task.id,
          actorId: user.id,
          action,
          oldValue: oldValue ? (oldValue as Prisma.InputJsonValue) : undefined,
          newValue: newValue ? (newValue as Prisma.InputJsonValue) : undefined,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          action,
          entityType: 'Task',
          entityId: task.id,
          entityName: task.title,
          oldValue: oldValue ? (oldValue as Prisma.InputJsonValue) : undefined,
          newValue: newValue ? (newValue as Prisma.InputJsonValue) : undefined,
        },
      }),
    ]);
  }

  private async requireTask(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });
    if (!task || task.deletedAt) {
      throw new NotFoundException('Task not found.');
    }
    return task;
  }

  private requireAdmin(user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }
  }

  private requireAssignedDeveloper(task: Task, user: AuthenticatedUser) {
    if (task.assignedDeveloperId !== user.id) {
      throw new ForbiddenException('You cannot update this task.');
    }
  }
}
