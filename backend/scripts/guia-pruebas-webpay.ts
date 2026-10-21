/**
 * Guia de pruebas manuales de Webpay con Transbank.
 *
 * Suite automatizada:  npm run test:webpay:estados  (78 pruebas)
 * Este documento cubre lo que NO se puede automatizar: el paso donde el
 * cliente digita la tarjeta en el navegador de Transbank.
 *
 * Uso: sigue los pasos en orden, uno por uno.
 */
import { TARJETAS_PRUEBA, BANCO_PRUEBA } from '../src/data/testCards.js';

const linea = '─'.repeat(72);

console.log(`
${linea}
  GUIA DE PRUEBAS MANUALES - TRANSBANK WEBPAY PLUS (AMBIENTE INTEGRACION)
${linea}

  Servidor de pruebas:  ${BANCO_PRUEBA.rut.slice(0, 2)}.${BANCO_PRUEBA.rut.slice(2, 4)}.${BANCO_PRUEBA.rut.slice(4, 7)}.${BANCO_PRUEBA.rut.slice(7)}  (RUT)
  Clave:                ${BANCO_PRUEBA.clave}
  Codigo de comercio:    597055555532
${linea}

  COMO ARRANCAR

    1) Base de datos
       npm run db:up

    2) Backend (puerto 3001)
       npm run dev:backend

    3) Frontend (puerto 5173)
       npm run dev:frontend

    4) Abrir http://localhost:5173
${linea}

  TARJETAS OFICIALES DE TRANSBANK
${linea}
`);

console.table(
  TARJETAS_PRUEBA.map((t) => ({
    descripcion: t.descripcion,
    pan: t.pan.replace(/(\d{4})(?=\d)/g, '$1 '),
    cvv: t.cvv ?? 'no pide',
    resultado: t.resultado
  }))
);

console.log(`
${linea}
  ESCENARIO 1: PAGO APROBADO (control)
${linea}

  1. Agrega productos al carrito y pulsa "Proceder al Pago"
  2. En el paso 3 elige "Webpay Plus (Transbank)"
  3. Pulsa "Confirmar Pedido"
  4. En la pasarela: Tarjetas -> 4051 8856 0044 6623, CVV 123, 12/29
  5. Banco simulado: RUT 11.111.111-1, clave 123
  6. En "ELIJA UNA OPCION" selecciona ACEPTAR

  ESPERADO: pantalla "Pago aprobado" con numero de pedido, monto y
  codigo de autorizacion.
  ADEMAS: el stock del producto debe bajar.

  COMPROBAR:
    npm run pedido:verificar
${linea}

  ESCENARIO 2: PAGO RECHAZADO POR EL BANCO
${linea}

  Mismo recorrido, pero usa la tarjeta 5186 0595 5959 0568
  (MASTERCARD, que Transbank rechaza siempre).

  ESPERADO: pantalla "Pago rechazado", mensaje de que no se realizo
  ningun cargo.
  ADEMAS: el pedido queda 'rechazado' y el stock NO debe bajar.

  ESTE ES EL ESCENARIO MAS IMPORTANTE: si el banco rechaza, el cliente
  jamas debe ver un mensaje de exito, y no se debe descontar stock.

  COMPROBAR:
    npm run pedido:verificar
${linea}

  ESCENARIO 3: USUARIO CANCELA EN LA PASARELA
${linea}

  Llega a la pantalla de Transbank y pulsa "Anular compra y volver".

  ESPERADO: pantalla "Pago cancelado", el pedido sigue reservado
  (estado 'pendiente'), sin cobro y sin descuento de stock.

  COMPROBAR:
    npm run webpay:diagnostico
  El estado local debe aparecer como ABORTED.
${linea}

  ESCENARIO 4: RECARGA DE LA PAGINA DE RETORNO (idempotencia)
${linea}

  1. Completa un pago aprobado
  2. Con la pagina de resultado abierta, presiona F5 varias veces

  ESPERADO: sigue mostrando "Pago aprobado". Nunca "rechazado".

  POR QUE IMPORTA: el commit de Transbank es de un solo uso. La
  segunda llamada responde "Transaction already locked by another
  process". El backend consulta el estado real en vez de tratar eso
  como fallo, y el frontend hace lo mismo antes de mostrar un rechazo.

  Un cliente que SI pagó jamas debe ver "rechazado".
${linea}

  ESCENARIO 5: TARJETA SIN SALDO (debito)
${linea}

  Usa 5186 0085 4123 3829 (Redcompra rechazada).

  ESPERADO: mismo resultado que el escenario 2, rechazo sin cargo.
${linea}

  ESCENARIO 6: MONTO Y PEDIDO COINCIDEN
${linea}

  Tras un pago aprobado, confirma que el monto cobrado por Transbank
  es EXACTAMENTE el total del pedido.

  El backend ya valida esto: si el monto o el buy_order devueltos no
  coinciden con los registrados, marca la orden como cancelada en vez
  de cobrarla.

  COMPROBAR:
    npm run webpay:diagnostico
  Compara "amount" con el total del pedido.
${linea}

  ESCENARIO 7: SIN STOCK (control de negocio)
${linea}

  1. Deja un producto en 5 unidades de stock
  2. Intenta comprar 50 desde otra sesion
  3. El backend debe rechazar con INSUFFICIENT_STOCK ANTES de abrir
     la pasarela de pago

  ESPERADO: mensaje de stock insuficiente. El cliente nunca debe
  pasar por Transbank si el pedido no se puede despachar.
${linea}

  ESCENARIO 8: ANULACION (refund)
${linea}

  1. Completa un pago aprobado
  2. Llama al endpoint de anulacion:

     curl -X POST http://localhost:3001/api/webpay/refund \\
       -H "Content-Type: application/json" \\
       -d '{"orderId":"AMYB-2026-XXXXXX"}'

  ESPERADO: pago anulado y el stock re-integrado.
  NOTA: en debito solo se puede anular dentro de los 30 minutos.
${linea}

  RESUMEN DE COBERTURA AUTOMATIZADA
${linea}

  78 pruebas que corren sin tocar el navegador:
    - 8 tarjetas oficiales validadas (formato, CVV, duplicados)
    - Los 6 response_code de Transbank traducidos a mensajes utiles
    - init real contra Transbank para las 8 tarjetas
    - Matriz de 5 estados (aprobado, rechazado, cancelado, expirado)
    - Traduccion entre estados de Transbank y estados locales

  ESTOS ESCENARIOS REQUIEREN TUS MANOS porque el paso de digitar la
  tarjeta ocurre en el navegador de Transbank:
    1. Pago aprobado
    2. Pago rechazado
    3. Cancelacion
    4. Recarga de la pagina de retorno
    5. Debito sin saldo
${linea}
`);
