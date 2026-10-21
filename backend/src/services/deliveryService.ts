import { prisma } from '../lib/prisma.js';

/**
 * Servicio de cobertura geográfica de despacho.
 *
 * REGLA DE NEGOCIO: la bodega solo entrega dentro de un radio. Una
 * venta a una direccion fuera de ese radio NO debe concretarse: se
 * pierde la entrega y el costo del despacho.
 *
 * La validacion SIEMPRE se hace en el servidor, nunca en el navegador.
 * Si el frontend avisara "tu direccion no llega" y el backend la
 * aceptara igual, bastaria llamar la API directamente para saltarselo.
 *
 * SIN GOOGLE API KEY el servicio NO simula una validacion aprovada.
 * Usa distancia en linea recta (formula del haversine) y marca el
 * resultado como aproximado, para que la aplicacion siga funcionando
 * en desarrollo sin depender de un servicio externo.
 */

const RADIO_TIERRA_KM = 6371;

/** Distancia en linea recta entre dos coordenadas, en kilometros. */
function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const aRad = (d: number) => (d * Math.PI) / 180;
  const dLat = aRad(lat2 - lat1);
  const dLng = aRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(aRad(lat1)) * Math.cos(aRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return RADIO_TIERRA_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface ValidacionEntrega {
  /** Indica si la direccion esta dentro del area de cobertura. */
  dentroDelRadio: boolean;
  /** Distancia en linea recta desde la bodega, en km. */
  distanciaKm: number;
  /** Radio configurado, en km. */
  radioMaximoKm: number;
  /** Si la venta debe bloquearse por estar fuera del area. */
  ventaBloqueada: boolean;
  /** Mensaje para mostrar al cliente. */
  mensaje: string;
  /** Si la validacion fue aproximada por falta de Google API Key. */
  aproximado: boolean;
  /** Distancia de ruta real, si Google pudo calcularla. */
  distanciaRutaKm?: number;
  /** Tiempo estimado de viaje en minutos, si Google pudo calcularlo. */
  tiempoRutaMin?: number;
  /** Costo del despacho segun la distancia. */
  costoDespacho: number;
  /** Coordenadas de la direccion del cliente. */
  lat?: number;
  lng?: number;
}

/**
 * Ciudades y servicios de la zona de cobertura de Amyb.
 *
 * Se usan como respaldo cuando NO hay Google API Key configurada: sin
 * coordenadas no se puede calcular la distancia, pero una direccion
 * escrita a mano si menciona el nombre de otra ciudad. Detectar
 * "Santiago" en la direccion y dejar pasar el pedido es perder la
 * entrega y el costo del despacho.
 */
const ZONA_URBANA = [
  'temuco',
  'padre las casas',
  'labranza',
  'pueblo nuevo',
  'pedro de valdivia',
  'santa rosa',
  'los pablos',
  'torremolinos',
  'la florida',
  'chucre',
  'carahue',
  'freire',
  'galvarino',
  'melipeuco',
  'cunaco',
  'villarrica',
  'curarrehue',
  'lautaro',
  'pucón',
  'pucilue',
  'teodoro schmidt',
  'río de la crux',
  'rio de la crux',
  'loncoche'
];

/** Ciudades que quedan claramente fuera de la zona de entrega. */
const FUERA_DE_ZONA = [
  'santiago',
  'pudahuel',
  'huechuraba',
  'lo oscar',
  'penalolen',
  'san bernardo',
  'buin',
  'calera de tango',
  'concepcion',
  'valparaiso',
  'viña del mar',
  'vina del mar',
  'quilpué',
  'quilpue',
  'antequera',
  'los andes',
  'puerto montt',
  'osorno',
  'bariloche',
  'la serena',
  'coquimbo',
  'calama',
  'ancud',
  'panguipulli',
  'loloco'
];

/**
 * Revisa el texto de una direccion para detectar una ciudad claramente
 * fuera de la zona, sin necesidad de geocodificar.
 *
 * No reemplaza a Google: no sabe la distancia real ni si una direccion
 * dentro de la ciudad es deliverable. Solo evita el error mas comun y
 * mas caro, que es despachar a otra region.
 */
/** Primera letra en mayuscula, para nombres de ciudad. */
function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function revisarTextoDireccion(direccion: string): { fuera: boolean; ciudad: string | null } {
  const texto = direccion.toLowerCase();

  for (const ciudad of FUERA_DE_ZONA) {
    if (texto.includes(ciudad)) {
      return { fuera: true, ciudad };
    }
  }

  return { fuera: false, ciudad: null };
}

/** Indica si el texto menciona alguna ciudad de la zona urbana. */
function mencionaZonaUrbana(direccion: string): boolean {
  const texto = direccion.toLowerCase();
  return ZONA_URBANA.some((c) => texto.includes(c));
}

export const deliveryService = {
  /**
   * Configuracion vigente de despacho.
   *
   * Esta fila es la unica fuente de los terminos comerciales: costo base,
   * costo por km, umbral de despacho gratis y radio. NO tienen respaldo
   * inventado: si la fila no existe, es un problema de datos y se dice,
   * porque un radio de 30 km con un costo de $2.990 aplicados en silencio
   * seria inventar las condiciones de venta de un negocio.
   *
   * En desarrollo se usan los valores de referencia para poder trabajar,
   * avisando por consola. En produccion se falla: cobrar con numeros que
   * nadie configuro es peor que no cobrar.
   */
  async obtenerConfig() {
    const config = await prisma.deliveryConfig.findUnique({ where: { id: 'default' } });

    if (config) return config;

    const referencia = {
      id: 'default',
      nombreLocal: 'Amyb Distribuidora - Bodega Central',
      bodegaDireccion: 'Av. Alemania 0890, Temuco',
      bodegaLat: null as number | null,
      bodegaLng: null as number | null,
      radioMaximoKm: 30,
      bloquearFueraDeRadio: true,
      despachoBase: 2990,
      costoPorKm: 150,
      despachoGratisDesde: 35000,
      googleMapsApiKey: null as string | null,
      isActive: true
    };

    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `CONFIGURACION_FALTANTE: no existe la fila de configuracion de despacho ` +
          `(delivery_config id='default') en la base. Sus terminos comerciales ` +
          `(radio, costo base, costo por km, umbral de despacho gratis) no se ` +
          `inventan. Crear la fila con el seed o desde el panel.`
      );
    }

    console.error(
      `[DELIVERY-CONFIG] No existe la fila delivery_config 'default'. Se usan ` +
        `valores de REFERENCIA de desarrollo (radio ${referencia.radioMaximoKm} km, ` +
        `base $${referencia.despachoBase}, por km $${referencia.costoPorKm}, gratis ` +
        `desde $${referencia.despachoGratisDesde}). NO son los terminos reales del ` +
        `negocio.`
    );

    return referencia;
  },

  /**
   * Convierte una direccion en coordenadas usando Google Geocoding.
   * Si no hay API Key, devuelve null y el servicio sigue con la
   * aproximacion.
   */
  async geocodificar(
    direccion: string,
    apiKey?: string | null
  ): Promise<{ lat: number; lng: number } | null> {
    if (!apiKey) return null;
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        direccion
      )}&region=cl&key=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = (await res.json()) as any;

      if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
        return {
          lat: data.results[0].geometry.location.lat,
          lng: data.results[0].geometry.location.lng
        };
      }
      console.warn(`[DELIVERY] Geocoding sin resultado para "${direccion}": ${data.status}`);
      return null;
    } catch (e: any) {
      console.error('[DELIVERY] Error en geocoding:', e.message);
      return null;
    }
  },

  /**
   * Distancia de ruta real con Google Distance Matrix.
   * Devuelve null si no hay API Key o si Google no responde.
   */
  async rutaGoogle(
    origen: { lat: number; lng: number },
    destino: { lat: number; lng: number },
    apiKey: string
  ): Promise<{ km: number; minutos: number } | null> {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/distancematrix/json?` +
        `origins=${origen.lat},${origen.lng}&destinations=${destino.lat},${destino.lng}&` +
        `mode=driving&units=metric&key=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = (await res.json()) as any;

      const el = data.rows?.[0]?.elements?.[0];
      if (el?.status === 'OK') {
        return {
          km: el.distance.value / 1000,
          minutos: Math.round(el.duration.value / 60)
        };
      }
      return null;
    } catch (e: any) {
      console.error('[DELIVERY] Error consultando ruta:', e.message);
      return null;
    }
  },

  /**
   * Valida una direccion de entrega contra el radio configurado.
   *
   * @param direccion  Direccion completa del cliente
   * @param subtotal   Subtotal del pedido, para evaluar el despacho gratis
   */
  async validar(
    direccion: string,
    subtotal: number
  ): Promise<ValidacionEntrega> {
    const config = await this.obtenerConfig();

    // --- 1. Revision por texto de la direccion ---
    // Se hace ANTES de geocodificar, y es la que decide cuando no hay
    // coordenadas. Despachar a otra region es el error que mas cuesta:
    // el pedido se cobra, el pago se confirma y la mercaderia vuelve.
    const porTexto = revisarTextoDireccion(direccion);

    if (porTexto.fuera) {
      const ciudad = capitalizar(porTexto.ciudad!);
      return {
        dentroDelRadio: false,
        distanciaKm: 0,
        radioMaximoKm: config.radioMaximoKm,
        ventaBloqueada: config.bloquearFueraDeRadio,
        mensaje:
          `No entregamos en ${ciudad}. Nuestra cobertura es Temuco, ` +
          `Padre Las Casas y ciudades cercanas. ` +
          `Contactanos para evaluar una entrega en esa ciudad.`,
        aproximado: true,
        costoDespacho: 0
      };
    }

    // --- 2. Geocodificar la direccion del cliente ---
    const destino = await this.geocodificar(direccion, config.googleMapsApiKey);

    if (!destino) {
      // Sin coordenadas no se puede calcular la distancia exacta.
      // Si el texto menciona la zona urbana, la venta se permite pero
      // marcada para confirmacion. Si NO menciona ninguna ciudad
      // conocida, se pide clarify antes de cobrar.
      const reconoceZona = mencionaZonaUrbana(direccion);

      return {
        dentroDelRadio: reconoceZona,
        distanciaKm: 0,
        radioMaximoKm: config.radioMaximoKm,
        ventaBloqueada: false,
        mensaje: reconoceZona
          ? 'Verificaremos la direccion al contactarte antes de despachar.'
          : 'No pudimos identificar la comuna de tu direccion. ' +
            'Agrega el nombre de la ciudad para confirmar la cobertura.',
        aproximado: true,
        costoDespacho: reconoceZona
          ? subtotal >= config.despachoGratisDesde
            ? 0
            : config.despachoBase
          : 0
      };
    }

    // --- 2. Ubicar la bodega ---
    let bodega: { lat: number; lng: number } | null = null;
    if (config.bodegaLat != null && config.bodegaLng != null) {
      bodega = { lat: config.bodegaLat, lng: config.bodegaLng };
    } else {
      bodega = await this.geocodificar(config.bodegaDireccion, config.googleMapsApiKey);
    }

    if (!bodega) {
      return {
        dentroDelRadio: true,
        distanciaKm: 0,
        radioMaximoKm: config.radioMaximoKm,
        ventaBloqueada: false,
        mensaje: 'No pudimos verificar la cobertura de tu direccion.',
        aproximado: true,
        costoDespacho:
          subtotal >= config.despachoGratisDesde ? 0 : config.despachoBase,
        lat: destino.lat,
        lng: destino.lng
      };
    }

    // --- 3. Distancia en linea recta ---
    const distanciaLinea = haversine(
      bodega.lat,
      bodega.lng,
      destino.lat,
      destino.lng
    );

    const dentroDelRadio = distanciaLinea <= config.radioMaximoKm;

    // --- 4. Ruta real, si hay Google disponible ---
    let ruta: { km: number; minutos: number } | null = null;
    if (config.googleMapsApiKey) {
      ruta = await this.rutaGoogle(bodega, destino, config.googleMapsApiKey);
    }

    // La ruta real es siempre mayor que la linea recta. Si el radio se
    // cumple por la ruta pero no por la linea recta, o viceversa, se
    // toma la mas restrictiva: es preferible rechazar una entrega
    // dudosa que aceptar una que no se va a poder cumplir.
    const distanciaEfectiva = ruta ? ruta.km : distanciaLinea;
    const dentroEfectivo = distanciaEfectiva <= config.radioMaximoKm;

    const ventaBloqueada = config.bloquearFueraDeRadio && !dentroEfectivo;

    // --- 5. Costo de despacho por distancia ---
    const kmFacturable = Math.max(0, distanciaEfectiva);
    const despachoBase = config.despachoBase;
    const costoAdicional = Math.round(kmFacturable * config.costoPorKm);
    const costoSinGratis = despachoBase + costoAdicional;
    const costoDespacho =
      subtotal >= config.despachoGratisDesde ? 0 : costoSinGratis;

    let mensaje: string;
    if (ventaBloqueada) {
      mensaje =
        `Tu direccion esta a ${distanciaEfectiva.toFixed(1)} km de nuestra bodega, ` +
        `fuera del radio de entrega de ${config.radioMaximoKm} km. ` +
        `Por ahora no podemos entregar en esa direccion. ` +
        `Contactanos para evaluar una alternativa.`;
    } else if (kmFacturable > config.radioMaximoKm * 0.75) {
      mensaje =
        `Tu direccion esta cerca del limite de entrega ` +
        `(${distanciaEfectiva.toFixed(1)} km de ${config.radioMaximoKm} km).`;
    } else {
      mensaje = `Tu direccion esta dentro de nuestra zona de entrega ` +
        `(${distanciaEfectiva.toFixed(1)} km).`;
    }

    return {
      dentroDelRadio: dentroEfectivo,
      distanciaKm: Math.round(distanciaEfectiva * 10) / 10,
      radioMaximoKm: config.radioMaximoKm,
      ventaBloqueada,
      mensaje,
      aproximado: !ruta,
      distanciaRutaKm: ruta?.km,
      tiempoRutaMin: ruta?.minutos,
      costoDespacho,
      lat: destino.lat,
      lng: destino.lng
    };
  },

  /**
   * Calcula solo el costo de despacho, sin bloquear.
   * Se usa al mostrar el total del carrito, antes de conocer la
   * direccion completa.
   */
  async costoDespacho(subtotal: number): Promise<number> {
    const config = await this.obtenerConfig();
    return subtotal >= config.despachoGratisDesde ? 0 : config.despachoBase;
  },

  /** Actualiza la configuracion (solo admin). */
  async actualizarConfig(datos: {
    nombreLocal?: string;
    bodegaDireccion?: string;
    bodegaLat?: number;
    bodegaLng?: number;
    radioMaximoKm?: number;
    bloquearFueraDeRadio?: boolean;
    despachoBase?: number;
    costoPorKm?: number;
    despachoGratisDesde?: number;
    googleMapsApiKey?: string | null;
  }) {
    const data: any = {};
    for (const [k, v] of Object.entries(datos)) {
      if (v !== undefined) data[k] = v;
    }
    return prisma.deliveryConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data
    });
  }
};
