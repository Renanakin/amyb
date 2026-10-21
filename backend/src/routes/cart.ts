import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../services/authService.js';

const router = Router();

/**
 * Carrito persistente en base de datos.
 *
 * El prototipo lo guardaba en localStorage, que se pierde al cambiar de
 * navegador, no sobrevive a "limpiar datos" y no sigue al usuario entre
 * el celular y el computador. Con esto, el carrito se sincroniza.
 *
 * Todas las rutas exigen sesion: un carrito anonimo sigue en localStorage
 * en el frontend y se sube al servidor al iniciar sesion.
 */

// =====================================================================
// GET /api/cart
// =====================================================================
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const items = await prisma.cartItem.findMany({
      where: { userId: req.user!.id },
      include: { product: { include: { priceTiers: true } } },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      success: true,
      data: {
        items: items.map((i) => ({
          product: {
            id: i.product.id,
            sku: i.product.sku,
            name: i.product.name,
            category: i.product.category,
            format: i.product.format,
            description: i.product.description,
            price: i.product.price,
            originalPrice: i.product.originalPrice,
            discountPercent: i.product.discountPercent,
            isOffer: i.product.isOffer,
            stock: i.product.stock,
            minWholesaleQty: i.product.minWholesaleQty,
            // priceTiers es obligatorio: sin el, el frontend no puede
            // calcular el precio por volumen y muestra el de lista.
            priceTiers: (i.product.priceTiers ?? [])
              .map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice }))
              .sort((a, b) => a.minQty - b.minQty),
            image: i.product.image,
            badge: i.product.badge,
            brand: i.product.brand
          },
          quantity: i.quantity
        }))
      }
    });
  } catch (error: any) {
    console.error('[CART-GET] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar el carrito.' });
  }
});

// =====================================================================
// POST /api/cart/items
// =====================================================================
router.post('/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res
        .status(400)
        .json({ success: false, message: 'productId es obligatorio.' });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      return res
        .status(404)
        .json({ success: false, message: 'Producto no encontrado.' });
    }

    if (product.stock < quantity) {
      return res.status(409).json({
        success: false,
        message: `Solo quedan ${product.stock} unidades de "${product.name}".`,
        code: 'INSUFFICIENT_STOCK'
      });
    }

    // Minimo mayorista: es una condicion de venta del negocio, no una
    // sugerencia. Se valida al agregar para que el cliente no llegue
    // al checkout con un formato que no se despacha.
    if (product.minWholesaleQty > 1 && quantity < product.minWholesaleQty) {
      return res.status(422).json({
        success: false,
        message: `"${product.name}" se vende en Presentationes minimas de ${product.minWholesaleQty} unidades.`,
        code: 'BELOW_MINIMUM',
        minWholesaleQty: product.minWholesaleQty
      });
    }

    const existing = await prisma.cartItem.findUnique({
      where: { userId_productId: { userId: req.user!.id, productId } }
    });

    const newQty = (existing?.quantity ?? 0) + quantity;
    if (newQty > product.stock) {
      return res.status(409).json({
        success: false,
        message: `Solo quedan ${product.stock} unidades de "${product.name}".`,
        code: 'INSUFFICIENT_STOCK'
      });
    }

    const item = await prisma.cartItem.upsert({
      where: { userId_productId: { userId: req.user!.id, productId } },
      create: { userId: req.user!.id, productId, quantity },
      update: { quantity: newQty }
    });

    res.json({
      success: true,
      message: `${product.name} agregado al carrito.`,
      data: { item }
    });
  } catch (error: any) {
    console.error('[CART-ADD] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al agregar al carrito.' });
  }
});

// =====================================================================
// PUT /api/cart/items/:productId
// =====================================================================
router.put('/items/:productId', requireAuth, async (req: Request, res: Response) => {
  try {
    const productId = String(req.params.productId);
    const { quantity } = req.body;

    if (typeof quantity !== 'number' || quantity < 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Cantidad no valida.' });
    }

    if (quantity === 0) {
      await prisma.cartItem.deleteMany({
        where: { userId: req.user!.id, productId }
      });
      return res.json({ success: true, message: 'Producto eliminado del carrito.' });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: 'Producto no encontrado.' });
    }

    if (quantity > product.stock) {
      return res.status(409).json({
        success: false,
        message: `Solo quedan ${product.stock} unidades de "${product.name}".`,
        code: 'INSUFFICIENT_STOCK'
      });
    }

    // Minimo mayorista: se valida tambien al CAMBIAR la cantidad, no
    // solo al agregar. Si no, el cliente podia bajarla a 1 unidad desde
    // el carrito y el checkout la rechazaba mas tarde, con un error
    // dificil de entender a esta altura del proceso.
    if (product.minWholesaleQty > 1 && quantity < product.minWholesaleQty) {
      return res.status(422).json({
        success: false,
        message: `"${product.name}" se vende en presentaciones minimas de ${product.minWholesaleQty} unidades.`,
        code: 'BELOW_MINIMUM',
        minWholesaleQty: product.minWholesaleQty
      });
    }

    await prisma.cartItem.updateMany({
      where: { userId: req.user!.id, productId },
      data: { quantity }
    });

    res.json({ success: true, message: 'Carrito actualizado.' });
  } catch (error: any) {
    console.error('[CART-UPDATE] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al actualizar el carrito.' });
  }
});

// =====================================================================
// DELETE /api/cart/items/:productId
// =====================================================================
router.delete('/items/:productId', requireAuth, async (req: Request, res: Response) => {
  try {
    const productId = String(req.params.productId);
    await prisma.cartItem.deleteMany({
      where: { userId: req.user!.id, productId }
    });
    res.json({ success: true, message: 'Producto eliminado del carrito.' });
  } catch (error: any) {
    console.error('[CART-DELETE] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al eliminar del carrito.' });
  }
});

// =====================================================================
// DELETE /api/cart
// Vacia el carrito del usuario.
// =====================================================================
router.delete('/', requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.cartItem.deleteMany({ where: { userId: req.user!.id } });
    res.json({ success: true, message: 'Carrito vaciado.' });
  } catch (error: any) {
    console.error('[CART-CLEAR] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al vaciar el carrito.' });
  }
});

// =====================================================================
// POST /api/cart/sync
// Sube el carrito anonimo de localStorage al iniciar sesion.
// El frontend lo llama una vez con lo que habia en el navegador,
// fusionandolo con lo que ya existe en el servidor.
// =====================================================================
router.post('/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res
        .status(400)
        .json({ success: false, message: 'items debe ser un arreglo.' });
    }

    for (const item of items) {
      if (!item?.productId || typeof item.quantity !== 'number') continue;
      if (item.quantity <= 0) continue;

      const product = await prisma.product.findUnique({
        where: { id: item.productId }
      });
      if (!product || !product.isActive) continue;

      const existing = await prisma.cartItem.findUnique({
        where: {
          userId_productId: { userId: req.user!.id, productId: item.productId }
        }
      });

      // Fusiona sumando, sin superar el stock disponible.
      const desired = (existing?.quantity ?? 0) + item.quantity;
      let finalQty = Math.min(desired, product.stock);

      // Un carrito anonimo guardado antes de que existiera la regla del
      // minimo mayorista no debe colar cantidades invendibles al iniciar
      // sesion. Se sube al minimo si hay stock; si no cabe, se descarta
      // el producto en vez de dejar una linea que el checkout rejecta.
      if (product.minWholesaleQty > 1 && finalQty < product.minWholesaleQty) {
        if (product.stock >= product.minWholesaleQty) {
          finalQty = product.minWholesaleQty;
        } else {
          continue;
        }
      }

      if (finalQty <= 0) continue;

      await prisma.cartItem.upsert({
        where: {
          userId_productId: { userId: req.user!.id, productId: item.productId }
        },
        create: {
          userId: req.user!.id,
          productId: item.productId,
          quantity: finalQty
        },
        update: { quantity: finalQty }
      });
    }

    // Devuelve el carrito ya fusionado
    const merged = await prisma.cartItem.findMany({
      where: { userId: req.user!.id },
      include: { product: { include: { priceTiers: true } } },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      success: true,
      message: 'Carrito sincronizado.',
      data: {
        items: merged.map((i) => ({
          product: {
            id: i.product.id,
            sku: i.product.sku,
            name: i.product.name,
            category: i.product.category,
            format: i.product.format,
            description: i.product.description,
            price: i.product.price,
            originalPrice: i.product.originalPrice,
            discountPercent: i.product.discountPercent,
            isOffer: i.product.isOffer,
            stock: i.product.stock,
            minWholesaleQty: i.product.minWholesaleQty,
            // priceTiers es obligatorio: sin el, el frontend no puede
            // calcular el precio por volumen y muestra el de lista.
            priceTiers: (i.product.priceTiers ?? [])
              .map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice }))
              .sort((a, b) => a.minQty - b.minQty),
            image: i.product.image,
            badge: i.product.badge,
            brand: i.product.brand
          },
          quantity: i.quantity
        }))
      }
    });
  } catch (error: any) {
    console.error('[CART-SYNC] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al sincronizar el carrito.' });
  }
});

export default router;
