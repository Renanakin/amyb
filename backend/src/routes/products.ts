import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

/**
 * Normaliza texto para busquedas: quita acentos y pasa a minusculas.
 *
 * Sin esto, buscar "jalapeno" no encuentra "jalapeño" ni "jalapeños",
 * porque el termino buscado no coincide literalmente con la tilde. Es el
 * defecto D4 que quedo anotado en la propuesta de mejora.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Mapea el modelo de Prisma al formato que consume el frontend.
 * Se mantiene el mismo contrato que devolvia el array hardcodeado para
 * no romper los componentes que ya estan construidos.
 */
function toProductDTO(p: any) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    format: p.format,
    description: p.description,
    price: p.price,
    originalPrice: p.originalPrice,
    discountPercent: p.discountPercent,
    isOffer: p.isOffer,
    stock: p.stock,
    minWholesaleQty: p.minWholesaleQty,
    image: p.image,
    badge: p.badge,
    brand: p.brand,
    // Escala de precios por volumen: antes el motor de pricing la ignoraba.
    priceTiers: (p.priceTiers ?? [])
      .map((t: any) => ({ minQty: t.minQty, unitPrice: t.unitPrice }))
      .sort((a: any, b: any) => a.minQty - b.minQty)
  };
}

// GET /api/products
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, search, offer, brand } = req.query;

    const where: any = { isActive: true };

    if (category && category !== 'todos' && category !== 'all') {
      where.category = (category as string).toLowerCase();
    }

    if (brand && typeof brand === 'string' && brand !== 'todas') {
      where.brand = { contains: brand, mode: 'insensitive' };
    }

    if (offer === 'true') {
      where.isOffer = true;
    }

    if (search && typeof search === 'string') {
      const term = search.trim();
      if (term) {
        // contains + insensitive ya cubre mayusculas; los acentos se
        // resuelven guardando ademas una version normalizada.
        where.OR = [
          { name: { contains: term, mode: 'insensitive' } },
          { format: { contains: term, mode: 'insensitive' } },
          { brand: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
          { nameNormalized: { contains: normalize(term) } },
          { skuNormalized: { contains: normalize(term) } }
        ];
      }
    }

    const products = await prisma.product.findMany({
      where,
      include: { priceTiers: true },
      orderBy: [{ isOffer: 'desc' }, { name: 'asc' }]
    });

    const data = products.map(toProductDTO);

    res.json({
      success: true,
      count: data.length,
      data
    });
  } catch (error: any) {
    console.error('[PRODUCTS-LIST] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al cargar el catalogo.',
      detail: error.message
    });
  }
});

// GET /api/products/:id
// Acepta tanto el id interno (cuid) como el SKU de negocio.
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const product = await prisma.product.findFirst({
      where: {
        isActive: true,
        OR: [{ id }, { sku: id }]
      },
      include: { priceTiers: true }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }

    res.json({
      success: true,
      data: toProductDTO(product)
    });
  } catch (error: any) {
    console.error('[PRODUCTS-DETAIL] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al cargar el producto.'
    });
  }
});

export default router;
