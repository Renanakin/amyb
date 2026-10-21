import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

// =====================================================================
// GET /api/shipping/zones
// =====================================================================
// Zonas de despacho activas.
//
// ANTES: este endpoint devolvia SHIPPING_ZONES_DATA, una constante en
// memoria, mientras que orders.ts cobraba usando la tabla shipping_zones.
// Dos fuentes de verdad para lo mismo: el cliente podia ver una zona con un
// costo y al checkout se le cobrara el de otra, si divergieran.
//
// Ahora la tabla es la unica fuente, igual que en el cobro.
router.get('/zones', async (_req: Request, res: Response) => {
  try {
    const zonas = await prisma.shippingZone.findMany({
      where: { isActive: true },
      orderBy: { cost: 'asc' }
    });

    if (zonas.length === 0) {
      // Sin zonas no hay informacion de despacho que vender. Es un
      // problema de datos (falta el seed), no del cliente, asi que se dice
      // explicitamente en vez de devolver un catalogo que miente.
      console.error(
        '[SHIPPING-ZONES] La tabla shipping_zones esta vacia: no se puede ' +
          'vender porque no hay informacion de despacho. Correr: npm run db:seed'
      );
      return res.status(503).json({
        success: false,
        message:
          'No hay zonas de despacho configuradas. Contactanos o recarga la pagina.'
      });
    }

    res.json({
      success: true,
      data: zonas.map((z) => ({
        id: z.id,
        name: z.name,
        comuna: z.comuna,
        cost: z.cost,
        estimatedHours: z.estimatedHours,
        freeShippingThreshold: z.freeShippingThreshold
      }))
    });
  } catch (error: any) {
    console.error('[SHIPPING-ZONES] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'No se pudieron cargar las zonas de despacho.'
    });
  }
});

export default router;