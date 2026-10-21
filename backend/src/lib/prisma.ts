import { PrismaClient } from '@prisma/client';

/**
 * Instancia unica del cliente Prisma.
 *
 * En desarrollo con tsx watch, el modulo se recarga en cada cambio de archivo.
 * Guardar el cliente en globalThis evita abrir un pool nuevo de conexiones
 * a Postgres en cada recarga, que termina agotando el limite del servidor.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
