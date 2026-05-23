import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, Role, TaskStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

type NotificationInput = {
  userIds: string[];
  action: string;
  entityType: string;
  entityId?: string | null;
  title: string;
  message: string;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(user: AuthenticatedUser) {
    await this.ensureOverdueTaskNotifications(user.id);

    const notifications = await this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      notifications: notifications.map((item) => ({
        id: item.id,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        title: item.title,
        message: item.message,
        isRead: item.isRead,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  }

  async unreadCountForUser(user: AuthenticatedUser) {
    await this.ensureOverdueTaskNotifications(user.id);

    const count = await this.prisma.notification.count({
      where: {
        userId: user.id,
        isRead: false,
      },
    });

    return { count };
  }

  async markAsRead(notificationId: string, user: AuthenticatedUser) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }
    if (notification.userId !== user.id) {
      throw new ForbiddenException('You cannot update this notification.');
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    return { success: true };
  }

  async notifyAdmins(action: string, entityType: string, entityId: string | null | undefined, title: string, message: string) {
    const admins = await this.prisma.user.findMany({
      where: {
        role: Role.ADMIN,
        accountStatus: AccountStatus.ACTIVE,
      },
      select: { id: true },
    });

    return this.createMany({
      userIds: admins.map((item) => item.id),
      action,
      entityType,
      entityId,
      title,
      message,
    });
  }

  async notifyUsers(input: NotificationInput) {
    return this.createMany(input);
  }

  private async ensureOverdueTaskNotifications(userId: string) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const overdueTasks = await this.prisma.task.findMany({
      where: {
        assignedDeveloperId: userId,
        deletedAt: null,
        status: { not: TaskStatus.COMPLETE },
        dueAt: { lt: startOfToday },
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (overdueTasks.length === 0) {
      return;
    }

    const existingNotifications = await this.prisma.notification.findMany({
      where: {
        userId,
        action: 'Task overdue',
        entityType: 'Task',
        entityId: { in: overdueTasks.map((task) => task.id) },
      },
      select: { entityId: true },
    });

    const existingTaskIds = new Set(existingNotifications.map((item) => item.entityId).filter(Boolean));
    const missingTasks = overdueTasks.filter((task) => !existingTaskIds.has(task.id));

    if (missingTasks.length === 0) {
      return;
    }

    await this.prisma.notification.createMany({
      data: missingTasks.map((task) => ({
        userId,
        action: 'Task overdue',
        entityType: 'Task',
        entityId: task.id,
        title: 'Task overdue',
        message: `Your task has crossed the due date: ${task.title}.`,
      })),
    });
  }

  private async createMany(input: NotificationInput) {
    const userIds = Array.from(new Set(input.userIds.filter(Boolean)));
    if (userIds.length === 0) {
      return;
    }

    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        title: input.title,
        message: input.message,
      })),
    });
  }
}
