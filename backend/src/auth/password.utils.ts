import bcrypt from 'bcrypt';

const PASSWORD_SALT_ROUNDS = 10;

export function isBcryptHash(value: string) {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

export function verifyPassword(plainTextPassword: string, passwordHash: string) {
  if (!isBcryptHash(passwordHash)) {
    return Promise.resolve(plainTextPassword === passwordHash);
  }

  return bcrypt.compare(plainTextPassword, passwordHash);
}

export function hashPassword(plainTextPassword: string) {
  return bcrypt.hash(plainTextPassword, PASSWORD_SALT_ROUNDS);
}
