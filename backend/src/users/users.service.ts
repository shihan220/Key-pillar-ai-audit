import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-user';
import { hashPassword, verifyPassword } from '../auth/password.utils';
import { accountStatusFromFrontend, roleFromFrontend } from '../common/frontend-mappers';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(user: AuthenticatedUser, body: CreateUserDto) {
    this.requireAdmin(user);

    const passwordHash = await hashPassword(body.password);
    const createdUser = await this.prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        role: roleFromFrontend(body.role),
        passwordHash,
        accountStatus: accountStatusFromFrontend(body.accountStatus),
        deactivatedAt: body.accountStatus === 'Inactive' ? new Date() : null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'User account created',
        entityType: 'User',
        entityId: createdUser.id,
        entityName: createdUser.name,
      },
    });

    return { success: true, id: createdUser.id };
  }

  async updateUser(userId: string, user: AuthenticatedUser, body: UpdateUserDto) {
    this.requireAdmin(user);

    const existingUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    const nextStatus = body.accountStatus
      ? accountStatusFromFrontend(body.accountStatus)
      : existingUser.accountStatus;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: body.name ?? existingUser.name,
        email: body.email?.toLowerCase() ?? existingUser.email,
        role: body.role ? roleFromFrontend(body.role) : existingUser.role,
        accountStatus: nextStatus,
        deactivatedAt: nextStatus === AccountStatus.INACTIVE ? new Date() : null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'User account edited',
        entityType: 'User',
        entityId: updated.id,
        entityName: updated.name,
      },
    });

    return { success: true };
  }

  async changePassword(userId: string, user: AuthenticatedUser, body: ChangePasswordDto) {
    this.requireAdmin(user);

    const targetUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      throw new NotFoundException('User not found.');
    }

    if (body.password !== body.confirmPassword) {
      throw new ForbiddenException('New password and confirm password do not match.');
    }

    if (userId === user.id) {
      if (!body.currentPassword) {
        throw new ForbiddenException('Current password is required.');
      }

      const currentPasswordMatches = await verifyPassword(body.currentPassword, targetUser.passwordHash);
      if (!currentPasswordMatches) {
        throw new ForbiddenException('Current password is incorrect.');
      }
    }

    const passwordHash = await hashPassword(body.password);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: userId === user.id ? 'Admin password changed from settings' : 'Developer password changed by admin',
        entityType: 'User',
        entityId: targetUser.id,
        entityName: targetUser.name,
      },
    });

    return { success: true };
  }

  async deleteUser(userId: string, user: AuthenticatedUser) {
    this.requireAdmin(user);

    if (user.id === userId) {
      throw new ForbiddenException('You cannot delete your own account.');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    const [assignedTaskCount] = await this.prisma.$transaction([
      this.prisma.task.count({
        where: {
          assignedDeveloperId: userId,
          deletedAt: null,
        },
      }),
    ]);

    if (assignedTaskCount > 0) {
      throw new ForbiddenException('Cannot delete this user while tasks are still assigned. Reassign or remove the tasks first.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.taskComment.deleteMany({
        where: {
          authorId: userId,
        },
      });

      await tx.task.deleteMany({
        where: {
          assignedDeveloperId: userId,
          deletedAt: { not: null },
        },
      });

      await tx.user.delete({
        where: { id: userId },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          action: 'User account deleted',
          entityType: 'User',
          entityId: existingUser.id,
          entityName: existingUser.name,
        },
      });
    });

    return { success: true };
  }

  private requireAdmin(user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }
  }
}
