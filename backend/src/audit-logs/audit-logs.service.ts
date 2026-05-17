import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-user';
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
}
