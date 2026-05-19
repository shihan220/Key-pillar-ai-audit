import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus } from '@prisma/client';
import { mapUser } from '../common/frontend-mappers';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser, AuthTokenPayload } from './auth-user';
import { LoginDto } from './dto/login.dto';
import { hashPassword, isBcryptHash, verifyPassword } from './password.utils';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(body: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: body.email.toLowerCase(),
        accountStatus: AccountStatus.ACTIVE,
      },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email, password, or inactive account.');
    }

    let matches = false;
    try {
      matches = await verifyPassword(body.password, user.passwordHash);
    } catch (error) {
      console.error('[auth.login] Password verification failed.', error);
      matches = false;
    }
    if (!matches) {
      throw new UnauthorizedException('Invalid email, password, or inactive account.');
    }

    const now = new Date();
    let sessionUser = user;

    try {
      const updateData: { lastLoginAt: Date; passwordHash?: string } = {
        lastLoginAt: now,
      };

      if (!isBcryptHash(user.passwordHash)) {
        updateData.passwordHash = await hashPassword(body.password);
      }

      sessionUser = await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    } catch (error) {
      console.error('[auth.login] Failed to update last login timestamp.', error);
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: sessionUser.id,
          actorName: sessionUser.name,
          actorRole: sessionUser.role,
          action: 'User logged in',
          entityType: 'User',
          entityId: sessionUser.id,
          entityName: sessionUser.name,
        },
      });
    } catch (error) {
      console.error('[auth.login] Failed to record login audit log.', error);
    }

    return {
      user: mapUser(sessionUser),
      accessToken: await this.signToken(sessionUser.id, sessionUser.email, sessionUser.role),
    };
  }

  async logout(user: AuthenticatedUser) {
    if (!user.id) {
      throw new BadRequestException('Authenticated user is required.');
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'User logged out',
        entityType: 'User',
        entityId: user.id,
        entityName: user.name,
      },
    });

    return { success: true };
  }

  async me(user: AuthenticatedUser) {
    const current = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!current || current.accountStatus !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('User is no longer active.');
    }

    return { user: mapUser(current) };
  }

  private signToken(userId: string, email: string, role: AuthenticatedUser['role']) {
    const payload: AuthTokenPayload = {
      sub: userId,
      email,
      role,
    };
    return this.jwtService.signAsync(payload);
  }
}
