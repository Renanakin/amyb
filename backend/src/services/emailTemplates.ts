/**
 * Plantillas HTML de los correos transaccionales.
 *
 * Se construyen como funciones: cada una recibe los datos reales del
 * pedido y devuelve el HTML. Se mantienen en un solo archivo para que
 * se vea de un vistazo como se le habla al cliente.
 *
 * REGLA DE ORO: nunca se pone el HTML dentro de la logica del negocio.
 * Un cambio en el diseno del correo no debe tocar el flujo de pago.
 */

const formatCLP = (n: number) => `$${n.toLocaleString('es-CL')}`;

/**
 * Escapa texto que viene del usuario antes de meterlo en el HTML.
 *
 * Sin esto, un cliente que se llamara "<script>...</script>" inyectaria
 * HTML en el correo, y el nombre de otro cliente quedaria exposed al
 * abrirlo. Es una vulnerabilidad real, no teorica: el nombre lo escribe
 * cualquiera al registrarse.
 */
function escapar(texto: string | null | undefined): string {
  if (!texto) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Igual que escapar, pero para URLs: evita un href malicioso. */
function escaparUrl(url: string | null | undefined): string {
  if (!url) return '';
  const limpia = String(url).trim();
  // Solo se permiten http y https. Un javascript: en un href se
  // ejecutaria al hacer clic en el correo.
  if (!/^https?:\/\//i.test(limpia)) return '';
  return escapar(limpia);
}

const COLOR_NAVY = '#0B3C73';
const COLOR_NAVY_DARK = '#051C36';
const COLOR_ORANGE = '#F58220';

/** Envoltorio comun: encabezado, contenido y pie. */
function plantilla(titulo: string, cuerpo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- Encabezado -->
          <tr>
            <td style="background:${COLOR_NAVY_DARK};padding:20px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">amyb</span>
                    <span style="color:#64748b;font-size:10px;margin-left:6px;">Distribuidora</span>
                  </td>
                  <td align="right">
                    <span style="color:#94a3b8;font-size:11px;">Temuco &middot; Padre Las Casas</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Contenido -->
          <tr>
            <td style="padding:28px;">
              ${cuerpo}
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td style="background:#f8fafc;padding:20px 28px;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 6px;font-size:12px;color:#475569;font-weight:700;">
                Amyb Distribuidora Gastronomica
              </p>
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">
                Bodega central en Temuco, Region de La Araucania<br>
                Mesa central: +56 9 8765 4321 &middot; Lun a Sab 08:00 a 19:00<br>
                Este correo fue generado porque realizaste una compra en nuestra tienda.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Etiqueta de estado con su color. */
function badge(texto: string, color: string): string {
  return `<span style="display:inline-block;background:${color}22;color:${color};font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:0.5px;">${texto}</span>`;
}

/** Tabla de productos del pedido. */
function tablaItems(
  items: { nombre: string; cantidad: number; precio: number; subtotal: number }[]
): string {
  const filas = items
    .map(
      (i) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;">
          ${escapar(i.nombre)}
          <span style="color:#94a3b8;"> &times; ${Number(i.cantidad) || 0}</span>
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;white-space:nowrap;">
          ${formatCLP(i.precio)}
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a;white-space:nowrap;">
          ${formatCLP(i.subtotal)}
        </td>
      </tr>`
    )
    .join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="padding-bottom:8px;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Producto</td>
        <td align="right" style="padding-bottom:8px;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Unitario</td>
        <td align="right" style="padding-bottom:8px;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Subtotal</td>
      </tr>
      ${filas}
    </table>`;
}

// =====================================================================
// 1. CONFIRMACION DE PEDIDO
// =====================================================================
export function emailConfirmacionOrden(datos: {
  nombre: string;
  orderNumber: string;
  items: { nombre: string; cantidad: number; precio: number; subtotal: number }[];
  subtotal: number;
  iva: number;
  costoEnvio: number;
  total: number;
  zona: string;
  direccion: string;
  paymentMethod: string;
  esFactura: boolean;
}): { asunto: string; html: string } {
  const metodo =
    datos.paymentMethod === 'webpay'
      ? 'Tarjeta (Webpay Transbank)'
      : datos.paymentMethod === 'transferencia'
        ? 'Transferencia bancaria'
        : 'Pago contra entrega';

  const cuerpo = `
    <h1 style="margin:0 0 6px;font-size:22px;color:#0f172a;font-weight:800;">
      Gracias por tu compra, ${escapar(datos.nombre)}
    </h1>
    <p style="margin:0 0 20px;font-size:14px;color:#64748b;line-height:1.6;">
      Recibimos tu pedido <strong style="color:${COLOR_NAVY}">${escapar(datos.orderNumber)}</strong>.
      Te avisaremos por este mismo correo cuando salga a despacho.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px;">
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#64748b;">Pedido</td>
        <td align="right" style="padding:4px 0;font-size:13px;font-weight:800;color:#0f172a;">${escapar(datos.orderNumber)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#64748b;">Metodo de pago</td>
        <td align="right" style="padding:4px 0;font-size:13px;font-weight:700;color:#0f172a;">${metodo}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#64748b;">Documento</td>
        <td align="right" style="padding:4px 0;font-size:13px;font-weight:700;color:#0f172a;">
          ${datos.esFactura ? 'Factura electronica' : 'Boleta electronica'}
        </td>
      </tr>
    </table>

    <h2 style="margin:0 0 4px;font-size:14px;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">
      Productos
    </h2>
    ${tablaItems(datos.items)}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
      <tr>
        <td style="padding:3px 0;font-size:13px;color:#64748b;">Subtotal</td>
        <td align="right" style="padding:3px 0;font-size:13px;color:#1e293b;">${formatCLP(datos.subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:3px 0;font-size:13px;color:#64748b;">IVA (19%)</td>
        <td align="right" style="padding:3px 0;font-size:13px;color:#1e293b;">${formatCLP(datos.iva)}</td>
      </tr>
      <tr>
        <td style="padding:3px 0;font-size:13px;color:#64748b;">Despacho</td>
        <td align="right" style="padding:3px 0;font-size:13px;color:#1e293b;">
          ${datos.costoEnvio === 0 ? 'Gratis' : formatCLP(datos.costoEnvio)}
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:10px 0 0;border-top:2px solid #e2e8f0;font-size:15px;font-weight:800;color:#0f172a;">
          Total
        </td>
        <td align="right" style="padding:10px 0 0;border-top:2px solid #e2e8f0;font-size:17px;font-weight:800;color:${COLOR_NAVY};">
          ${formatCLP(datos.total)}
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-left:3px solid ${COLOR_NAVY};border-radius:6px;padding:14px 16px;margin-top:24px;">
      <tr>
        <td style="font-size:12px;color:#1e40af;line-height:1.6;">
          <strong>Entrega en ${escapar(datos.zona)}</strong><br>
          ${escapar(datos.direccion)}
        </td>
      </tr>
    </table>`;

  return {
    asunto: `Pedido ${escapar(datos.orderNumber)} confirmado - Amyb Distribuidora`,
    html: plantilla('Pedido confirmado', cuerpo)
  };
}

// =====================================================================
// 2. PAGO APROBADO CON FACTURA
// =====================================================================
export function emailPagoAprobado(datos: {
  nombre: string;
  orderNumber: string;
  total: number;
  dteFolio?: string | null;
  dteTipo?: string | null;
  pdfUrl?: string | null;
  autorizacionCode?: string | null;
  cardNumber?: string | null;
}): { asunto: string; html: string } {
  // La URL viene de FACTO. Se valida el esquema para que un
  // 'javascript:...' en el href no se vuelva ejecutable al hacer clic.
  const urlFactura = escaparUrl(datos.pdfUrl);
  const botonFactura = urlFactura
    ? `<a href="${urlFactura}" style="display:inline-block;background:${COLOR_ORANGE};color:#ffffff;font-size:14px;font-weight:800;padding:13px 28px;border-radius:8px;text-decoration:none;margin-top:6px;">
         Descargar documento tributario
       </a>`
    : '';
  const cuerpo = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:64px;height:64px;border-radius:50%;background:#dcfce7;display:inline-flex;align-items:center;justify-content:center;font-size:32px;line-height:64px;color:#16a34a;">&#10003;</div>
      <h1 style="margin:16px 0 6px;font-size:22px;color:#0f172a;font-weight:800;">
        Pago aprobado
      </h1>
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">
        Hola ${escapar(datos.nombre)}, recibimos tu pago correctamente.
      </p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px;">
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#64748b;">Pedido</td>
        <td align="right" style="padding:4px 0;font-size:13px;font-weight:800;color:#0f172a;">${escapar(datos.orderNumber)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#64748b;">Monto pagado</td>
        <td align="right" style="padding:4px 0;font-size:15px;font-weight:800;color:${COLOR_NAVY};">${formatCLP(datos.total)}</td>
      </tr>
      ${datos.dteFolio ? `
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#64748b;">Folio ${datos.dteTipo === 'factura' ? 'Factura' : 'Boleta'}</td>
        <td align="right" style="padding:4px 0;font-size:13px;font-weight:700;color:#0f172a;">${escapar(datos.dteFolio)}</td>
      </tr>` : ''}
      ${datos.autorizacionCode ? `
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#64748b;">Codigo de autorizacion</td>
        <td align="right" style="padding:4px 0;font-size:13px;font-weight:700;color:#0f172a;">${escapar(datos.autorizacionCode)}</td>
      </tr>` : ''}
      ${datos.cardNumber ? `
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#64748b;">Tarjeta</td>
        <td align="right" style="padding:4px 0;font-size:13px;font-weight:700;color:#0f172a;">**** ${escapar(datos.cardNumber)}</td>
      </tr>` : ''}
    </table>

    ${botonFactura}

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-left:3px solid ${COLOR_NAVY};border-radius:6px;padding:14px 16px;margin-top:24px;">
      <tr>
        <td style="font-size:12px;color:#1e40af;line-height:1.7;">
          <strong>Que sigue ahora</strong><br>
          1. Confirmamos el stock de tu pedido.<br>
          2. Emitimos tu documento tributario electronico.<br>
          3. Te avisamos por este correo cuando salga a despacho.
        </td>
      </tr>
    </table>`;

  return {
    asunto: `Pago aprobado - Pedido ${escapar(datos.orderNumber)}`,
    html: plantilla('Pago aprobado', cuerpo)
  };
}

// =====================================================================
// 3. PEDIDO DESPACHADO
// =====================================================================
export function emailDespacho(datos: {
  nombre: string;
  orderNumber: string;
  zona: string;
  direccion: string | null;
  estimatedHours?: string | null;
}): { asunto: string; html: string } {
  const cuerpo = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:64px;height:64px;border-radius:50%;background:#fef3c7;display:inline-flex;align-items:center;justify-content:center;font-size:30px;line-height:64px;">&#128666;</div>
      <h1 style="margin:16px 0 6px;font-size:22px;color:#0f172a;font-weight:800;">
        Tu pedido salio a despacho
      </h1>
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">
        Hola ${escapar(datos.nombre)}, tu pedido va en camino.
      </p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px;">
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#64748b;">Pedido</td>
        <td align="right" style="padding:4px 0;font-size:13px;font-weight:800;color:#0f172a;">${escapar(datos.orderNumber)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#64748b;">Zona</td>
        <td align="right" style="padding:4px 0;font-size:13px;font-weight:700;color:#0f172a;">${escapar(datos.zona)}</td>
      </tr>
      ${datos.estimatedHours ? `
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#64748b;">Tiempo estimado</td>
        <td align="right" style="padding:4px 0;font-size:13px;font-weight:700;color:#0f172a;">${escapar(datos.estimatedHours)}</td>
      </tr>` : ''}
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-left:3px solid #f59e0b;border-radius:6px;padding:14px 16px;">
      <tr>
        <td style="font-size:12px;color:#92400e;line-height:1.6;">
          <strong>Direccion de entrega</strong><br>
          ${escapar(datos.direccion)}
        </td>
      </tr>
    </table>

    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;">
      Transportamos con cadena de frio certificada. Si no puedes recibir, avisanos con
      antelacion para reprogramar sin costo.
    </p>`;

  return {
    asunto: `Tu pedido ${escapar(datos.orderNumber)} salio a despacho`,
    html: plantilla('Pedido despachado', cuerpo)
  };
}

// =====================================================================
// 4. RECUPERACION DE CONTRASENA
// =====================================================================
export function emailRecuperacion(datos: {
  nombre: string;
  token: string;
  frontendUrl: string;
}): { asunto: string; html: string } {
  // El enlace lleva el token en la URL. El token es aleatorio de 32
  // bytes, de un solo uso y expira en una hora.
  // La base viene de FRONTEND_URL del .env, no del cliente, pero se
  // escapa igual: si alguien manipulara esa variable, no debe poder
  // inyectar un href con javascript:.
  const enlace = escaparUrl(`${datos.frontendUrl}/recuperar-contrasena?token=${datos.token}`);

  const cuerpo = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:64px;height:64px;border-radius:50%;background:#fee2e2;display:inline-flex;align-items:center;justify-content:center;font-size:30px;line-height:64px;">&#128274;</div>
      <h1 style="margin:16px 0 6px;font-size:22px;color:#0f172a;font-weight:800;">
        Recuperar contrasena
      </h1>
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">
        Hola ${escapar(datos.nombre)}, recibimos una solicitud para cambiar tu contrasena.
      </p>
    </div>

    <a href="${enlace}" style="display:block;background:${COLOR_NAVY};color:#ffffff;font-size:15px;font-weight:800;padding:15px;border-radius:8px;text-align:center;text-decoration:none;">
      Cambiar mi contrasena
    </a>

    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.7;">
      Si el boton no funciona, copia esta direccion en tu navegador:<br>
      <span style="word-break:break-all;color:${COLOR_NAVY};">${enlace}</span>
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:3px solid #ef4444;border-radius:6px;padding:14px 16px;margin-top:24px;">
      <tr>
        <td style="font-size:12px;color:#991b1b;line-height:1.6;">
          <strong>Si no solicitaste esto</strong><br>
          Ignora este mensaje. Tu contrasena no cambia y el enlace deja de servir
          en una hora.
        </td>
      </tr>
    </table>`;

  return {
    asunto: 'Recuperar contrasena - Amyb Distribuidora',
    html: plantilla('Recuperar contrasena', cuerpo)
  };
}

// =====================================================================
// 5. PEDIDO ENTREGADO
// =====================================================================
export function emailEntregado(datos: {
  nombre: string;
  orderNumber: string;
}): { asunto: string; html: string } {
  const cuerpo = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:64px;height:64px;border-radius:50%;background:#dcfce7;display:inline-flex;align-items:center;justify-content:center;font-size:32px;line-height:64px;color:#16a34a;">&#10003;</div>
      <h1 style="margin:16px 0 6px;font-size:22px;color:#0f172a;font-weight:800;">
        Pedido entregado
      </h1>
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">
        Hola ${escapar(datos.nombre)}, tu pedido ${escapar(datos.orderNumber)} fue entregado.
      </p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-left:3px solid #16a34a;border-radius:6px;padding:16px;">
      <tr>
        <td style="font-size:13px;color:#166534;line-height:1.7;">
          <strong>Gracias por preferir Amyb.</strong><br>
          Volvemos a estar disponibles en Temuco y Padre Las Casas con
          despacho en 24 horas habiles.
        </td>
      </tr>
    </table>`;

  return {
    asunto: `Pedido ${escapar(datos.orderNumber)} entregado`,
    html: plantilla('Pedido entregado', cuerpo)
  };
}
