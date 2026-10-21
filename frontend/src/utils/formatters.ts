/**
 * Formatea un número al estándar monetario chileno ($XX.XXX CLP)
 */
export function formatCLP(amount: number): string {
  return `$${Math.round(amount).toLocaleString('es-CL')} CLP`;
}

/**
 * Formato numérico simple ($XX.XXX)
 */
export function formatCLPSimple(amount: number): string {
  return `$${Math.round(amount).toLocaleString('es-CL')}`;
}

/**
 * Valida un RUT chileno usando Módulo 11
 */
export function validateChileanRut(rutCompleto: string): boolean {
  if (!rutCompleto || typeof rutCompleto !== 'string') return false;

  const rutLimpio = rutCompleto.replace(/[^0-9kK]/g, '').toUpperCase();
  if (rutLimpio.length < 8 || rutLimpio.length > 9) return false;

  const cuerpo = rutLimpio.slice(0, -1);
  const dv = rutLimpio.slice(-1);

  let suma = 0;
  let multiplo = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }

  const dvEsperadoCalculado = 11 - (suma % 11);
  let dvEsperado = '';

  if (dvEsperadoCalculado === 11) {
    dvEsperado = '0';
  } else if (dvEsperadoCalculado === 10) {
    dvEsperado = 'K';
  } else {
    dvEsperado = dvEsperadoCalculado.toString();
  }

  return dv === dvEsperado;
}

/**
 * Formatea un RUT a 12.345.678-K en tiempo real mientras el usuario escribe
 */
export function formatChileanRut(rut: string): string {
  const rutLimpio = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (rutLimpio.length <= 1) return rutLimpio;

  const cuerpo = rutLimpio.slice(0, -1);
  const dv = rutLimpio.slice(-1);

  const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpoFormateado}-${dv}`;
}
