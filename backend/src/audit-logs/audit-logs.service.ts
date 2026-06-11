import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth-user';
import { mapAudit } from '../common/frontend-mappers';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLogs(user: AuthenticatedUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required.');
    }

    const logs = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { logs: logs.map(mapAudit) };
  }

  async clearAllLogs(user: AuthenticatedUser) {
    this.requireAdmin(user);

    await this.prisma.auditLog.deleteMany({});
    return { success: true };
  }

  async clearLogsForUser(user: AuthenticatedUser, userName: string) {
    this.requireAdmin(user);

    const normalizedName = userName.trim();
    if (!normalizedName) {
      return { success: true, count: 0 };
    }

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorName: normalizedName },
          {
            entityType: 'User',
            entityName: normalizedName,
          },
        ],
      },
    });

    return { success: true, count: result.count };
  }

  private requireAdmin(user: AuthenticatedUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required.');
    }
  }
}
