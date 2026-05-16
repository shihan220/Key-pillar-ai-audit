import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { mapAudit, mapClockSession, mapComment, mapHistory, mapProject, mapTask, mapUser } from '../common/frontend-mappers';
import { FrontendAppState } from '../common/frontend-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth-user';

@Injectable()
export class AppStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(user: AuthenticatedUser): Promise<FrontendAppState> {
    if (user.role === Role.ADMIN) {
      const [users, projects, tasks, comments, history, auditLogs] = await Promise.all([
        this.prisma.user.findMany({
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.project.findMany({
          where: { deletedAt: null },
          include: { attachments: { orderBy: { createdAt: 'asc' } } },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.task.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.taskComment.findMany({
          include: { author: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.taskHistory.findMany({
          include: { actor: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      return {
        users: users.map(mapUser),
        projects: projects.map(mapProject),
        tasks: tasks.map(mapTask),
        comments: comments.map(mapComment),
        history: history.map(mapHistory),
        auditLogs: auditLogs.map(mapAudit),
        activeClockSession: null,
      };
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        assignedDeveloperId: user.id,
      },
      orderBy: { createdAt: 'asc' },
    });
    const taskIds = tasks.map((task) => task.id);
    const projectIds = Array.from(new Set(tasks.map((task) => task.projectId)));

    const [currentUser, projects, comments, activeClockSession] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      this.prisma.project.findMany({
        where: {
          deletedAt: null,
          id: { in: projectIds.length > 0 ? projectIds : ['__none__'] },
        },
        include: { attachments: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.taskComment.findMany({
        where: {
          taskId: { in: taskIds.length > 0 ? taskIds : ['__none__'] },
        },
        include: { author: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.clockSession.findFirst({
        where: {
          userId: user.id,
          clockOutAt: null,
        },
        orderBy: { clockInAt: 'desc' },
      }),
    ]);

    return {
      users: [mapUser(currentUser)],
      projects: projects.map(mapProject),
      tasks: tasks.map(mapTask),
      comments: comments.map(mapComment),
      history: [],
      auditLogs: [],
      activeClockSession: activeClockSession ? mapClockSession(activeClockSession) : null,
    };
  }
}
