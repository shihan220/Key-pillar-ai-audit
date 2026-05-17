import bcrypt from 'bcrypt';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-user';
import { accountStatusFromFrontend, roleFromFrontend } from '../common/frontend-mappers';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(user: AuthenticatedUser, body: CreateUserDto) {
    this.requireAdmin(user);

    const passwordHash = await bcrypt.hash(body.password, 10);
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
        action: 'Developer account created',
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
        action: 'Developer account edited',
        entityType: 'User',
        entityId: updated.id,
        entityName: updated.name,
      },
    });

    return { success: true };
  }

  async changePassword(userId: string, user: AuthenticatedUser, body: ChangePasswordDto) {
    this.requireAdmin(user);
    if (body.password !== body.confirmPassword) {
      throw new ForbiddenException('Passwords do not match.');
    }

    const targetUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      throw new NotFoundException('User not found.');
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
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
        action: 'Developer password changed by admin',
        entityType: 'User',
        entityId: targetUser.id,
        entityName: targetUser.name,
      },
    });

    return { success: true };
  }

  private requireAdmin(user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }
  }
}
