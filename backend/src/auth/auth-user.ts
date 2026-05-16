import { AccountStatus, Role } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  accountStatus: AccountStatus;
};

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: Role;
};
