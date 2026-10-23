import { PrismaClient } from '@prisma/client';

/**
 * Instância singleton do PrismaClient.
 * Em desenvolvimento ou testes, evita múltiplas instâncias abertas.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
