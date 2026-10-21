import type { PrismaClient } from '@prisma/client';

export type ProductoParaPrueba = {
  id: string;
  sku: string;
  name: string;
  stock: number;
  minWholesaleQty: number;
  price: number;
};

/**
 * Elige un producto que se pueda pedir en la cantidad pedida.
 *
 * Sin esto, `findFirst({ isActive: true })` devuelve el primer producto
 * que entregue la base, y si ese exige presentaciones minimas de 10
 * unidades, pedir 3 falla con 422 BELOW_MINIMUM. La prueba moria por el
 * caso limite del negocio (minimo mayorista) y no por el comportamiento
 * que queria verificar.
 *
 * El orden por SKU hace la eleccion determinista: sin el, el resultado
 * depende del plan fisico de la tabla y las pruebas cambian de verdict
 * entre una ejecucion y otra sin que cambie el codigo.
 */
export async function productoParaCantidad(
  prisma: PrismaClient,
  cantidad: number,
  minimoStock: number = cantidad
): Promise<ProductoParaPrueba> {
  const producto = await prisma.product.findFirst({
    where: {
      isActive: true,
      minWholesaleQty: { lte: cantidad },
      stock: { gte: Math.max(cantidad, minimoStock) }
    },
    orderBy: { sku: 'asc' }
  });

  if (!producto) {
    throw new Error(
      `No hay ningun producto activo que se pueda pedir en ${cantidad} unidades ` +
        `(se necesita min_wholesale_qty <= ${cantidad} y stock >= ${minimoStock}). ` +
        `Revisar el catalogo seedeado o ajustar la cantidad de la prueba.`
    );
  }

  return producto;
}
