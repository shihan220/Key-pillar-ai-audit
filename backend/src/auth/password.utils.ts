import bcrypt from 'bcrypt';

const PASSWORD_SALT_ROUNDS = 10;

export function verifyPassword(plainTextPassword: string, passwordHash: string) {
  return bcrypt.compare(plainTextPassword, passwordHash);
}

export function hashPassword(plainTextPassword: string) {
  return bcrypt.hash(plainTextPassword, PASSWORD_SALT_ROUNDS);
}
