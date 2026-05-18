import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../backend/src/auth/password.utils";

const ADMIN_EMAIL = "admin@keypillarai.local";
const TEMPORARY_PASSWORD = "admin123";

for (const candidate of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) {
    loadEnv({ path, override: false });
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? ""
  })
});

async function main() {
  const adminUser = await prisma.user.findFirst({
    where: {
      email: ADMIN_EMAIL.toLowerCase()
    }
  });

  if (!adminUser) {
    throw new Error(`Admin user not found for email: ${ADMIN_EMAIL}`);
  }

  const passwordHash = await hashPassword(TEMPORARY_PASSWORD);

  await prisma.user.update({
    where: { id: adminUser.id },
    data: { passwordHash }
  });

  console.log(`Admin password reset successfully for ${ADMIN_EMAIL}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
