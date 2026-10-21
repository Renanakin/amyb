/**
 * Crea el usuario administrador de Amyb.
 *
 * Ejecutar: npx tsx prisma/seed-admin.ts
 *
 * Es idempotente: se puede correr varias veces. Si el usuario ya existe
 * solo actualiza la contrasena y el rol, sin duplicar.
 *
 * La contrasena se lee del .env (ADMIN_PASSWORD). Si no esta definida,
 * se genera una y se imprime en consola para que la cambies al primer
 * ingreso. Nunca se deja una contrasena por defecto en el codigo.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@amybdistribuidora.cl').toLowerCase();

async function main() {
  const passwordFromEnv = process.env.ADMIN_PASSWORD;
  const generada = !passwordFromEnv;
  const password = passwordFromEnv || crypto.randomBytes(9).toString('base64url');

  const existe = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      passwordHash,
      role: 'admin',
      nombre: existe?.nombre || 'Administrador Amyb',
      isActive: true
    },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      role: 'admin',
      nombre: 'Administrador Amyb',
      telefono: '+56 9 0000 0000',
      isActive: true
    }
  });

  console.log('\n[SEED-ADMIN] Usuario administrador listo\n');
  console.log(`  Email:      ${admin.email}`);
  if (generada) {
    console.log(`  Contrasena: ${password}`);
    console.log('  (generada automaticamente, cambiala al primer ingreso)');
  } else {
    console.log('  Contrasena: (la definida en ADMIN_PASSWORD)');
  }
  console.log('  Rol:        admin\n');

  const total = await prisma.user.count();
  const admins = await prisma.user.count({ where: { role: 'admin' } });
  console.log(`  ${total} usuarios en total, ${admins} administrador(es).`);
}

main()
  .catch((e) => {
    console.error('[SEED-ADMIN] Error:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
