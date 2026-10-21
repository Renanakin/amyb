/**
 * Inventario por bodega.
 *
 * products.stock es la SUMA de todas las bodegas: sirve para mostrar
 * "tenemos" en el catalogo, pero no dice si lo tenemos donde el cliente
 * necesita. Este servicio resuelve esa pregunta.
 *
 * QUIEN ELIGE LA BODEGA: el sistema, nunca el cliente. El cliente ve su
 * zona de despacho y su costo. La bodega es un detalle interno de la
 * operacion: poner un selector de bodega en el carrito le resolveria un
 * problema que no tiene, porque no sabe que bodega tiene que mercaderia.
 *
 * COMO SE ELIGE:
 *   1. Se prefiere la bodega asignada a la zona (la que la cubre).
 *   2. Si esa no puede cumplir el pedido completo, se busca otra que si.
 *   3. Si ninguna puede, el pedido se rechaza con el detalle de que falta.
 *
 * El punto 2 es deliberado: es una distribuidora de un radio corto, no
 * una red logistica nacional. Bloquear una venta porque la mercaderia esta
 * a tres cuadras seria peor que despacharla desde ahi. Y el pedido guarda
 * de que bodega salio, asi que siempre queda registro.
 */
import { prisma } from '../lib/prisma.js';

export interface ItemPedido {
  productId: string;
  quantity: number;
}

export interface ResultadoAsignacion {
  ok: boolean;
  warehouseId: string | null;
  warehouseName: string | null;
  /** SeSirvioDesdeLaZona: la bodega elegida es la que cubre la zona. */
  seSirvioDesdeLaZona: boolean;
  /** Bodegas descartadas con el motivo, para explicarle al operador. */
  descartadas: Array<{ warehouseId: string; name: string; motivo: string }>;
  /** Productos que no alcanzan en ninguna bodega. */
  faltantes: Array<{ productId: string; solicitado: number; disponible: number }>;
}

/** Unidades disponibles de un producto en una bodega. */
export async function disponibleEnBodega(
  warehouseId: string,
  productId: string
): Promise<number> {
  const fila = await prisma.warehouseStock.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } }
  });
  if (!fila) return 0;
  // Lo reservado son unidades comprometidas en carritos que todavia no se
  // cobraron: no se pueden prometer a otro cliente.
  return Math.max(0, fila.quantity - fila.reserved);
}

/** Bodega que cubre una zona. */
async function bodegaDeLaZona(zoneId: string): Promise<string | null> {
  const zona = await prisma.shippingZone.findUnique({ where: { id: zoneId } });
  return zona?.warehouseId ?? null;
}

/**
 * Elige de que bodega sale el pedido.
 *
 * No adivina: si ninguna bodega puede cumplir el pedido completo, lo dice
 * con el detalle. Un pedido sin bodega asignada no se despacha.
 */
export async function elegirBodegaParaPedido(
  zoneId: string | null | undefined,
  items: ItemPedido[]
): Promise<ResultadoAsignacion> {
  const descartadas: ResultadoAsignacion['descartadas'] = [];

  const todas = await prisma.warehouse.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' }
  });

  if (todas.length === 0) {
    throw new Error(
      `CONFIGURACION_FALTANTE: no hay ninguna bodega activa. El pedido no se ` +
        `puede despachar. Revisar la configuracion de bodegas en el panel.`
    );
  }

  const preferidaId = zoneId ? await bodegaDeLaZona(zoneId) : null;

  // La de la zona primero; despues el resto.
  const candidatas = [
    ...todas.filter((b) => b.id === preferidaId),
    ...todas.filter((b) => b.id !== preferidaId)
  ];

  // Maximo disponible de cada producto, para el diagnostico cuando
  // ninguna bodega alcanza.
  const maxPorProducto = new Map<string, number>();
  for (const b of candidatas) {
    const stocks = await prisma.warehouseStock.findMany({
      where: { warehouseId: b.id, productId: { in: items.map((i) => i.productId) } }
    });
    for (const s of stocks) {
      const disponible = Math.max(0, s.quantity - s.reserved);
      maxPorProducto.set(
        s.productId,
        Math.max(maxPorProducto.get(s.productId) ?? 0, disponible)
      );
    }
  }

  const faltantesGlobal: ResultadoAsignacion['faltantes'] = items
    .filter((i) => (maxPorProducto.get(i.productId) ?? 0) < i.quantity)
    .map((i) => ({
      productId: i.productId,
      solicitado: i.quantity,
      disponible: maxPorProducto.get(i.productId) ?? 0
    }));

  for (const bodega of candidatas) {
    const stocks = await prisma.warehouseStock.findMany({
      where: {
        warehouseId: bodega.id,
        productId: { in: items.map((i) => i.productId) }
      }
    });
    const porProducto = new Map(stocks.map((s) => [s.productId, s]));

    const faltanAqui: string[] = [];
    for (const item of items) {
      const fila = porProducto.get(item.productId);
      const disponible = fila ? Math.max(0, fila.quantity - fila.reserved) : 0;
      if (disponible < item.quantity) {
        faltanAqui.push(item.productId);
      }
    }

    if (faltanAqui.length === 0) {
      return {
        ok: true,
        warehouseId: bodega.id,
        warehouseName: bodega.name,
        seSirvioDesdeLaZona: bodega.id === preferidaId,
        descartadas,
        faltantes: []
      };
    }

    descartadas.push({
      warehouseId: bodega.id,
      name: bodega.name,
      motivo: `no alcanza para ${faltanAqui.length} producto(s) del pedido`
    });
  }

  return {
    ok: false,
    warehouseId: null,
    warehouseName: null,
    seSirvioDesdeLaZona: false,
    descartadas,
    faltantes: faltantesGlobal
  };
}

/**
 * Bodegas donde hay stock de un producto, con la cantidad.
 * Lo usa el panel para mostrar el inventario disperso.
 */
export async function distribucionDeProducto(productId: string) {
  return prisma.warehouseStock.findMany({
    where: { productId },
    include: { warehouse: true },
    orderBy: { warehouse: { code: 'asc' } }
  });
}

// =====================================================================
// KARDEX
// =====================================================================

export type TipoMovimiento =
  | 'entrada'
  | 'salida'
  | 'ajuste'
  | 'traspaso_entrada'
  | 'traspaso_salida';

export interface MovimientoStock {
  warehouseId: string;
  productId: string;
  type: TipoMovimiento;
  /** Positivo suma, negativo resta. */
  quantity: number;
  reason: string;
  orderId?: string | null;
  userId?: string | null;
  reference?: string | null;
  correctsId?: string | null;
}

export type ClienteTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type ResultadoMovimiento =
  | { ok: true; saldo: number }
  | { ok: false; error: 'STOCK_INSUFICIENTE' | 'SIN_FILA_STOCK' | 'CARRERA'; saldo: number };

/**
 * Aplica un movimiento de inventario y deja su asiento en el kardex.
 *
 * Es la UNICA forma de mover stock en el sistema. Todo lo que toca
 * inventario pasa por aca: venta, anulacion, ajuste, merma, traspaso.
 *
 * Por que esta sola:
 *   - Si el movimiento y su asiento se escribieran por separado, un
 *     fallo en el medio deja el stock movido sin registro, o al reves: un
 *     kardex que no corresponde con la realidad. Aqui van en la misma
 *     transaccion, o pasan los dos.
 *   - products.stock se actualiza en el MISMO paso. Es una cache
 *     agregada; que quede al dia aqui y se verifique con stock:verificar
 *     es mejor que mantenerla a mano en cada pantalla.
 *
 * Concurrencia: dos ventas simultaneas sobre la ultima unidad tienen que
 * dejar una sola ganadora. Se lee, se calcula y se escribe condicionando
 * a que el saldo siga siendo el que se leyo. Si otra transaccion lo movio
 * entre medio, el write no aplica y se reintenta: no se pierde la
 * operacion ni se descuenta de mas.
 */
export async function registrarMovimiento(
  tx: ClienteTx,
  args: MovimientoStock
): Promise<ResultadoMovimiento> {
  const { warehouseId, productId, type, quantity, reason } = args;

  if (!Number.isInteger(quantity) || quantity === 0) {
    throw new Error(
      `MOVIMIENTO_INVALIDO: la cantidad debe ser un entero distinto de cero (llego ${quantity}).`
    );
  }

  const clave = { warehouseId_productId: { warehouseId, productId } };

  for (let intento = 0; intento < 4; intento++) {
    const fila = await tx.warehouseStock.findUnique({ where: clave });
    if (!fila) {
      return { ok: false, error: 'SIN_FILA_STOCK', saldo: 0 };
    }

    const saldoNuevo = fila.quantity + quantity;

    if (saldoNuevo < 0) {
      return { ok: false, error: 'STOCK_INSUFICIENTE', saldo: fila.quantity };
    }

    // Condicionado al saldo leido: si otra transaccion lo movio entre
    // medio, esto no aplica y hay que reintentar con el saldo nuevo.
    const actualizado = await tx.warehouseStock.updateMany({
      where: { warehouseId, productId, quantity: fila.quantity },
      data: { quantity: saldoNuevo }
    });

    if (actualizado.count === 0) continue;

    await tx.stockMovement.create({
      data: {
        warehouseId,
        productId,
        type,
        quantity,
        balanceAfter: saldoNuevo,
        reason,
        orderId: args.orderId ?? null,
        userId: args.userId ?? null,
        reference: args.reference ?? null,
        correctsId: args.correctsId ?? null
      }
    });

    // Cache agregada. Se mueve con el mismo signo, en el mismo paso.
    await tx.product.update({
      where: { id: productId },
      data: { stock: { increment: quantity } }
    });

    return { ok: true, saldo: saldoNuevo };
  }

  return { ok: false, error: 'CARRERA', saldo: 0 };
}

/**
 * Resuelve en que bodega se repone la mercaderia de un pedido antiguo.
 *
 * Es distinto de elegir bodega para una venta, y por eso NO reutiliza esa
 * funcion: al reponer no se necesita poder armar un pedido, solo un lugar
 * donde la mercaderia vuelva a existir. Un pedido pagado antes de que
 * existieran las bodegas no tiene warehouse_id, y si eso hiciera fallar
 * la anulacion, esas ventas quedarian con la plata devuelta y el stock
 * sin reponer, sin salida.
 *
 * Se elige la bodega que ya tiene el producto, y se deja registrado en el
 * log y en el asiento por que se uso esa.
 */
export async function resolverBodegaParaReposicion(
  tx: ClienteTx,
  pedido: { id: string; warehouseId: string | null; productId: string }
): Promise<string> {
  if (pedido.warehouseId) return pedido.warehouseId;

  const conElProducto = await tx.warehouseStock.findMany({
    where: { productId: pedido.productId },
    include: { warehouse: true },
    orderBy: { warehouse: { code: 'asc' } }
  });

  if (conElProducto.length > 0) {
    console.warn(
      `[INVENTARIO] El pedido ${pedido.id} se creo sin bodega. La mercaderia ` +
        `vuelve a ${conElProducto[0].warehouse.name} por ser la bodega que ` +
        `tiene el producto.`
    );
    return conElProducto[0].warehouseId;
  }

  const principal = await tx.warehouse.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' }
  });

  if (!principal) {
    throw new Error(
      `INVENTARIO_SIN_BODEGA: no hay ninguna bodega activa donde reponer la ` +
        `mercaderia del pedido ${pedido.id}.`
    );
  }

  console.warn(
    `[INVENTARIO] El pedido ${pedido.id} se creo sin bodega y ningunaBodega ` +
      `tiene el producto: la mercaderia vuelve a ${principal.name} y se crea ` +
      `la fila de stock ahi.`
  );

  await tx.warehouseStock.upsert({
    where: {
      warehouseId_productId: {
        warehouseId: principal.id,
        productId: pedido.productId
      }
    },
    update: {},
    create: { warehouseId: principal.id, productId: pedido.productId, quantity: 0 }
  });

  return principal.id;
}

/**
 * Resuelve de que bodega sale un pedido que ya existe pero que se creo
 * antes de existir las bodegas, o sin asignacion.
 *
 * Se persiste en el pedido: de donde sale cada venta tiene que quedar
 * dicho, y decidirlo en cada consulta haria que la respuesta cambiara
 * con el stock.
 */
export async function resolverBodegaDePedido(
  tx: ClienteTx,
  pedido: { id: string; shippingZoneId: string; warehouseId: string | null },
  items: Array<{ productId: string; quantity: number }>
): Promise<string> {
  if (pedido.warehouseId) return pedido.warehouseId;

  const asignacion = await elegirBodegaParaPedido(
    pedido.shippingZoneId,
    items
  );

  if (!asignacion.warehouseId) {
    throw new Error(
      `INVENTARIO_SIN_BODEGA: el pedido ${pedido.id} no tiene bodega asignada y ` +
        `ninguna puede armarlo. Revisar el stock antes de cobrar.`
    );
  }

  await tx.order.update({
    where: { id: pedido.id },
    data: { warehouseId: asignacion.warehouseId }
  });

  console.warn(
    `[INVENTARIO] El pedido ${pedido.id} se creo sin bodega; se le asigno ` +
      `${asignacion.warehouseName} al confirmar el pago.`
  );

  return asignacion.warehouseId;
}