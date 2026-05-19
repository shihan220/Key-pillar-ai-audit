import bcrypt from 'bcrypt';

const PASSWORD_SALT_ROUNDS = 10;

export function isBcryptHash(value: string) {
  return typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);
}

export function verifyPassword(plainTextPassword: string, passwordHash: string) {
  if (typeof passwordHash !== 'string' || passwordHash.length === 0) {
    return Promise.resolve(false);
  }

  if (!isBcryptHash(passwordHash)) {
    return Promise.resolve(plainTextPassword === passwordHash);
  }

  return bcrypt.compare(plainTextPassword, passwordHash).catch(() => false);
}

export function hashPassword(plainTextPassword: string) {
  return bcrypt.hash(plainTextPassword, PASSWORD_SALT_ROUNDS);
}
