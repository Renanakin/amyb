import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { prisma } from './lib/prisma.js';

// El primer import carga el entorno antes de evaluar servicios que leen
// process.env al inicializarse (JWT_SECRET, Transbank).

import productsRouter from './routes/products.js';
import shippingRouter from './routes/shipping.js';
import ordersRouter from './routes/orders.js';
import clientConfigRouter from './routes/clientConfig.js';
import factoLedgerRouter from './routes/factoLedger.js';
import webpayRouter from './routes/webpay.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import cartRouter from './routes/cart.js';
import { deviceDetector } from './middleware/deviceDetector.js';
import { optionalAuth } from './services/authService.js';
import { datoObligatorio, validarArranque } from './config.js';
import { evaluarSalud } from './salud.js';
import {
  requestId,
  manejadorDeErrores,
  noEncontrado
} from './middleware/errores.js';

// Se valida ANTES de escuchar. Un .env incompleto tiene que notarse al
// reiniciar el servidor, no a mitad de una venta: "el cliente pagÃ³ y no
// le llegÃ³ nada" es infinitamente mas caro que "el servidor no arrancÃ³".
try {
  validarArranque();
} catch (error: any) {
  console.error(`\n[CONFIG] ${error.message}\n`);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Lista de origenes permitidos. Antes era '*', que dejaba la API abierta
// a cualquier sitio: cualquiera podia llamar a /api/orders desde su pagina.
//
// Sin CORS_ORIGIN en produccion el sitio real queda bloqueado y el
// sintoma es "la pagina no carga", que es dificil de diagnosticar. Por
// eso aqui no hay valor por defecto en produccion.
const ALLOWED_ORIGINS = datoObligatorio(
  'CORS_ORIGIN',
  'http://localhost:3000',
  'definir que navegador puede llamar a esta API (si no, el sitio no carga)'
)
  .split(',')
  .map((o) => o.trim());

// Middlewares
app.use(
  cors({
    origin: (origin, callback) => {
      // Sin origin = peticiones server-to-server (curl, health checks)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      console.warn(`[CORS] Origen bloqueado: ${origin}`);
      callback(new Error('Origen no permitido por CORS'));
    },
    credentials: true, // necesario para enviar/recibir la cookie de sesion
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-client-device']
  })
);
app.use(express.json());
// Identificador de peticion: va en cada linea de log y en cada respuesta de
// error, para poder reconstruir un caso completo con una busqueda.
app.use(requestId);
app.use(cookieParser()); // lee la cookie httpOnly de la sesion
app.use(deviceDetector);
// Resuelve req.user en todas las rutas. Las que exigen sesion agregan
// requireAuth. Asi /api/orders puede asociar el pedido al usuario.
app.use(optionalAuth);

// Routes
app.use('/api/client-config', clientConfigRouter);
app.use('/api/facto/ledger', factoLedgerRouter);
app.use('/api/products', productsRouter);
app.use('/api/shipping', shippingRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/webpay', webpayRouter);
app.use('/api/auth', authRouter);
app.use('/api/cart', cartRouter);
app.use('/api/admin', adminRouter);

// ---------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------
// /live: solo "el proceso responde". Es lo que debe usar el balanceador:
// si el proceso esta muerto no tiene sentido seguir preguntandole.
// /health: "el servicio puede atender". Revisa PostgreSQL y responde 503
//          si no puede, porque sin base la tienda no vende nada.
//
// Antes /health respondia 200 siempre sin mirar nada, asi que reportaba
// sano un servicio incapaz de vender.
app.get('/api/health/live', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptimeSegundos: Math.round(process.uptime()) });
});

app.get('/api/health', async (req: Request, res: Response) => {
  const salud = await evaluarSalud(() => prisma.$queryRaw`SELECT 1`);

  res.status(salud.ok ? 200 : 503).json({
    status: salud.estado,
    service: 'Amyb Distribuidora API',
    version: salud.version,
    detectedClient: req.device,
    timestamp: new Date().toISOString(),
    checks: salud.checks,
    avisos: salud.avisos,
    uptimeSegundos: salud.uptimeSegundos
  });
});
// Una sola puerta para los errores: el status lo decide el tipo del
// error, no cada ruta por su cuenta.
app.use(noEncontrado);
app.use(manejadorDeErrores);

app.listen(PORT, () => {
  console.log(`[BACKEND] Amyb API corriendo en http://localhost:${PORT}`);
  console.log(`[BACKEND] Endpoints disponibles:`);
  console.log(`  - GET  /api/health`);
  console.log(`  - GET  /api/client-config`);
  console.log(`  - POST /api/client-config/fallback`);
  console.log(`  - GET  /api/products`);
  console.log(`  - GET  /api/products/:id`);
  console.log(`  - GET  /api/shipping/zones`);
  console.log(`  - POST /api/orders/calculate`);
  console.log(`  - POST /api/orders`);
  console.log(`  - POST /api/webpay/init        (crea transaccion Transbank)`);
  console.log(`  - POST /api/webpay/commit      (confirma el pago)`);
  console.log(`  - GET  /api/webpay/return      (retorno de la pasarela)`);
  console.log(`  - GET  /api/webpay/status/:tok (reconciliacion)`);
  console.log(`  - POST /api/webpay/refund      (anulacion)`);
  console.log(`  - POST /api/auth/register      (crear cuenta)`);
  console.log(`  - POST /api/auth/login         (iniciar sesion)`);
  console.log(`  - POST /api/auth/logout        (cerrar sesion)`);
  console.log(`  - GET  /api/auth/me            (usuario actual)`);
  console.log(`  - PUT  /api/auth/profile       (datos del cliente)`);
  console.log(`  - POST /api/auth/forgot-password`);
  console.log(`  - POST /api/auth/reset-password`);
  console.log(`  - GET  /api/auth/sessions      (dispositivos activos)`);
  console.log(`  - GET  /api/cart               (carrito del usuario)`);
  console.log(`  - POST /api/cart/items         (agregar producto)`);
  console.log(`  - POST /api/cart/sync          (fusionar carrito anonimo)`);
  console.log(`  - GET  /api/admin/dashboard     (metricas, solo admin)`);
  console.log(`  - GET  /api/admin/products      (listar, solo admin)`);
  console.log(`  - POST /api/admin/products      (crear producto)`);
  console.log(`  - PUT  /api/admin/products/:id  (editar producto)`);
  console.log(`  - PATCH /api/admin/products/:id/stock`);
  console.log(`  - GET  /api/admin/orders        (pedidos con filtros)`);
  console.log(`  - PATCH /api/admin/orders/:id/status`);
  console.log(`  - GET  /api/admin/clients       (clientes registrados)`);
});
