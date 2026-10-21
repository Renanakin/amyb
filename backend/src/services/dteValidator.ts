import { DteInvoiceData } from '../types/index.js';

export class DteValidatorService {
  /**
   * Valida un RUT chileno usando el algoritmo Módulo 11
   */
  public static validateRut(rutCompleto: string): boolean {
    if (!rutCompleto || typeof rutCompleto !== 'string') return false;

    // Limpiar caracteres
    const rutLimpio = rutCompleto.replace(/[^0-9kK]/g, '').toUpperCase();
    if (rutLimpio.length < 8 || rutLimpio.length > 9) return false;

    const cuerpo = rutLimpio.slice(0, -1);
    const dv = rutLimpio.slice(-1);

    // Calcular Dígito Verificador con Módulo 11
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
   * Formatea un RUT a formato estándar 12.345.678-K
   */
  public static formatRut(rut: string): string {
    const rutLimpio = rut.replace(/[^0-9kK]/g, '').toUpperCase();
    if (rutLimpio.length < 2) return rutLimpio;

    const cuerpo = rutLimpio.slice(0, -1);
    const dv = rutLimpio.slice(-1);

    const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${cuerpoFormateado}-${dv}`;
  }

  /**
   * Valida los datos tributarios para emisión de Factura Electrónica
   */
  public static validateDteData(dte: DteInvoiceData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (dte.tipoDocumento === 'factura') {
      if (!dte.rutEmpresa || !this.validateRut(dte.rutEmpresa)) {
        errors.push('El RUT de la Empresa ingresado no es válido para facturación.');
      }
      if (!dte.razonSocial || dte.razonSocial.trim().length < 3) {
        errors.push('La Razón Social es requerida para emitir factura.');
      }
      if (!dte.giroComercial || dte.giroComercial.trim().length < 3) {
        errors.push('El Giro Comercial registrado en el SII es obligatorio.');
      }
      if (!dte.direccionTributaria || dte.direccionTributaria.trim().length < 5) {
        errors.push('La Dirección Tributaria registrada en el SII es obligatoria.');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
