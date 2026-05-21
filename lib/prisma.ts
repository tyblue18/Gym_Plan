import { PrismaClient } from '@prisma/client';

// Prevent multiple PrismaClient instances during Next.js hot-reload in dev.
// In production, the module is only loaded once, so the global guard is a no-op.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
