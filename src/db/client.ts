import { PrismaClient } from '@prisma/client';

// Singleton pattern for Prisma client
let prisma: PrismaClient | null = null;
let dbEnabled = true;

export function isDatabaseEnabled(): boolean {
  return dbEnabled && !!process.env.DATABASE_URL;
}

export function getPrismaClient(): PrismaClient | null {
  if (!isDatabaseEnabled()) {
    return null;
  }
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
