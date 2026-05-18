import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus } from '@prisma/client';
import { mapUser } from '../common/frontend-mappers';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser, AuthTokenPayload } from './auth-user';
import { LoginDto } from './dto/login.dto';
import { verifyPassword } from './password.utils';

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

    const matches = await verifyPassword(body.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid email, password, or inactive account.');
    }

    const now = new Date();
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: updatedUser.id,
        actorName: updatedUser.name,
        actorRole: updatedUser.role,
        action: 'User logged in',
        entityType: 'User',
        entityId: updatedUser.id,
        entityName: updatedUser.name,
      },
    });

    return {
      user: mapUser(updatedUser),
      accessToken: await this.signToken(updatedUser.id, updatedUser.email, updatedUser.role),
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
