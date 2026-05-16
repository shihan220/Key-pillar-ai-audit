import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser, AuthTokenPayload } from './auth-user';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
    }>();
    const token = this.extractToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    let payload: AuthTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        accountStatus: AccountStatus.ACTIVE,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User is no longer active.');
    }

    request.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
    };
    return true;
  }

  private extractToken(header?: string | string[]) {
    const value = Array.isArray(header) ? header[0] : header;
    if (!value?.startsWith('Bearer ')) {
      return null;
    }
    return value.slice('Bearer '.length).trim();
  }
}
