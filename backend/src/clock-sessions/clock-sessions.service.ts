import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth-user';
import { mapClockSession } from '../common/frontend-mappers';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClockSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async clockIn(user: AuthenticatedUser) {
    this.requireDeveloper(user);

    const existing = await this.prisma.clockSession.findFirst({
      where: {
        userId: user.id,
        clockOutAt: null,
      },
      orderBy: { clockInAt: 'desc' },
    });

    if (existing) {
      return { session: mapClockSession(existing) };
    }

    const session = await this.prisma.clockSession.create({
      data: {
        userId: user.id,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'Developer clocked in',
        entityType: 'Clock Session',
        entityId: session.id,
        entityName: user.name,
      },
    });

    return { session: mapClockSession(session) };
  }

  async clockOut(user: AuthenticatedUser) {
    this.requireDeveloper(user);

    const existing = await this.prisma.clockSession.findFirst({
      where: {
        userId: user.id,
        clockOutAt: null,
      },
      orderBy: { clockInAt: 'desc' },
    });

    if (!existing) {
      return { session: null };
    }

    const session = await this.prisma.clockSession.update({
      where: { id: existing.id },
      data: {
        clockOutAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'Developer clocked out',
        entityType: 'Clock Session',
        entityId: session.id,
        entityName: user.name,
      },
    });

    return { session: mapClockSession(session) };
  }

  async getCurrent(user: AuthenticatedUser) {
    this.requireDeveloper(user);

    const session = await this.prisma.clockSession.findFirst({
      where: {
        userId: user.id,
        clockOutAt: null,
      },
      orderBy: { clockInAt: 'desc' },
    });

    return { session: session ? mapClockSession(session) : null };
  }

  async getHistory(user: AuthenticatedUser) {
    this.requireDeveloper(user);

    const sessions = await this.prisma.clockSession.findMany({
      where: { userId: user.id },
      orderBy: { clockInAt: 'desc' },
    });

    return { sessions: sessions.map(mapClockSession) };
  }

  async getHistoryForUser(user: AuthenticatedUser, userId: string) {
    this.requireAdmin(user);

    const sessions = await this.prisma.clockSession.findMany({
      where: { userId },
      orderBy: { clockInAt: 'desc' },
    });

    return { sessions: sessions.map(mapClockSession) };
  }

  private requireDeveloper(user: AuthenticatedUser) {
    if (!user?.id) {
      throw new BadRequestException('Authenticated user is required.');
    }
    if (user.role !== Role.DEVELOPER) {
      throw new ForbiddenException('Developer access required.');
    }
  }

  private requireAdmin(user: AuthenticatedUser) {
    if (!user?.id) {
      throw new BadRequestException('Authenticated user is required.');
    }
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required.');
    }
  }
}
