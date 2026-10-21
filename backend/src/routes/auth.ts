import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { datoObligatorio } from '../config.js';
import { authService, requireAuth } from '../services/authService.js';
import { emailService } from '../services/emailService.js';
import { emailRecuperacion } from '../services/emailTemplates.js';

const router = Router();

/**
 * Reglas de contrasena. Para un distribuidor con datos de facturacion,
 * una contrasena debil es un riesgo real: un atacante que entre a la
 * cuenta ve los pedidos y los RUT de los clientes.
 */
function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'La contrasena debe tener al menos 8 caracteres.';
  }
  if (!/[a-z]/.test(password)) {
    return 'La contrasena debe incluir al menos una letra minuscula.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'La contrasena debe incluir al menos una letra mayuscula.';
  }
  if (!/[0-9]/.test(password)) {
    return 'La contrasena debe incluir al menos un numero.';
  }
  return null;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// =====================================================================
// POST /api/auth/register
// =====================================================================
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, nombre, telefono } = req.body;

    if (!email || !password || !nombre) {
      return res.status(400).json({
        success: false,
        message: 'Email, contrasena y nombre son obligatorios.'
      });
    }

    if (!validateEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: 'El email no tiene un formato valido.' });
    }

    const passError = validatePassword(password);
    if (passError) {
      return res.status(400).json({ success: false, message: passError });
    }

    const emailLower = email.toLowerCase().trim();
    const exists = await prisma.user.findUnique({ where: { email: emailLower } });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'Ya existe una cuenta con ese email.',
        code: 'EMAIL_TAKEN'
      });
    }

    const passwordHash = await authService.hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: emailLower,
        passwordHash,
        nombre: nombre.trim(),
        telefono: telefono?.trim() ?? null,
        role: 'customer'
      },
      select: { id: true, email: true, nombre: true, telefono: true, role: true }
    });

    await authService.createSession(user.id, user.email, user.role, res, req);

    res.status(201).json({
      success: true,
      message: `Bienvenido a Amyb, ${user.nombre}.`,
      data: { user }
    });
  } catch (error: any) {
    console.error('[AUTH-REGISTER] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'No se pudo crear la cuenta.',
      detail: error.message
    });
  }
});

// =====================================================================
// POST /api/auth/login
// =====================================================================
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email y contrasena son obligatorios.'
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    // Mismo mensaje para usuario inexistente y contrasena incorrecta:
    // distinction distintas permitirian enumerar que emails estan
    // registrados en la tienda.
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email o contrasena incorrectos.'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Esta cuenta esta deshabilitada. Contacta a soporte.'
      });
    }

    const valid = await authService.verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        message: 'Email o contrasena incorrectos.'
      });
    }

    await authService.createSession(user.id, user.email, user.role, res, req);

    res.json({
      success: true,
      message: `Hola de nuevo, ${user.nombre}.`,
      data: {
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          telefono: user.telefono,
          role: user.role
        }
      }
    });
  } catch (error: any) {
    console.error('[AUTH-LOGIN] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al iniciar sesion.',
      detail: error.message
    });
  }
});

// =====================================================================
// POST /api/auth/logout
// =====================================================================
router.post('/logout', async (req: Request, res: Response) => {
  try {
    if (req.user) {
      await authService.revokeSession(req.user.sessionId, res);
    } else {
      res.clearCookie('amyb_session', { path: '/' });
    }

    res.json({ success: true, message: 'Sesion cerrada.' });
  } catch (error: any) {
    console.error('[AUTH-LOGOUT] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al cerrar sesion.' });
  }
});

// =====================================================================
// POST /api/auth/logout-all
// Cierra la sesion en todos los dispositivos (por robo de celular, etc.)
// =====================================================================
router.post('/logout-all', requireAuth, async (req: Request, res: Response) => {
  try {
    await authService.revokeAllSessions(req.user!.id, res);
    res.json({
      success: true,
      message: 'Se cerraron todas las sesiones abiertas.'
    });
  } catch (error: any) {
    console.error('[AUTH-LOGOUT-ALL] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al cerrar las sesiones.'
    });
  }
});

// =====================================================================
// GET /api/auth/me
// Devuelve el usuario de la sesion actual, o 401 si no hay.
// El frontend lo llama al cargar para saber si hay sesion activa.
// =====================================================================
router.get('/me', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Sin sesion activa.',
      code: 'UNAUTHORIZED'
    });
  }

  // El nivel de precio viaja en /me para que el frontend muestre los
  // precios correctos. El cobro REAL lo decide el servidor de nuevo,
  // asi que un cliente que manipule esto en el navegador paga igual
  // lo que le corresponde.
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      nombre: true,
      telefono: true,
      role: true,
      priceTier: {
        select: {
          id: true,
          nombre: true,
          descuentoPercent: true,
          aplicaSobreEscalon: true,
          isActive: true
        }
      }
    }
  });

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'La cuenta ya no existe.',
      code: 'UNAUTHORIZED'
    });
  }

  res.json({
    success: true,
    data: {
      user: {
        ...user,
        // Un nivel desactivado se omite: el cliente vuelve a ver
        // los precios de lista sin necesidad de tocar su cuenta.
        priceTier:
          user.priceTier && user.priceTier.isActive && user.priceTier.descuentoPercent > 0
            ? {
                id: user.priceTier.id,
                nombre: user.priceTier.nombre,
                descuentoPercent: user.priceTier.descuentoPercent,
                aplicaSobreEscalon: user.priceTier.aplicaSobreEscalon
              }
            : null
      }
    }
  });
});

// =====================================================================
// PUT /api/auth/profile
// Actualiza los datos de contacto y tributarios del cliente.
// =====================================================================
router.put('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      nombre,
      telefono,
      rutEmpresa,
      razonSocial,
      giroComercial,
      direccionTributaria,
      comunaTributaria
    } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(nombre !== undefined && { nombre: nombre.trim() }),
        ...(telefono !== undefined && { telefono: telefono?.trim() || null }),
        ...(rutEmpresa !== undefined && { rutEmpresa: rutEmpresa?.trim() || null }),
        ...(razonSocial !== undefined && { razonSocial: razonSocial?.trim() || null }),
        ...(giroComercial !== undefined && { giroComercial: giroComercial?.trim() || null }),
        ...(direccionTributaria !== undefined && {
          direccionTributaria: direccionTributaria?.trim() || null
        }),
        ...(comunaTributaria !== undefined && { comunaTributaria: comunaTributaria?.trim() || null })
      },
      select: {
        id: true,
        email: true,
        nombre: true,
        telefono: true,
        role: true,
        rutEmpresa: true,
        razonSocial: true,
        giroComercial: true,
        direccionTributaria: true,
        comunaTributaria: true
      }
    });

    res.json({
      success: true,
      message: 'Datos actualizados correctamente.',
      data: { user }
    });
  } catch (error: any) {
    console.error('[AUTH-PROFILE] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'No se pudieron actualizar los datos.',
      detail: error.message
    });
  }
});

// =====================================================================
// POST /api/auth/forgot-password
// =====================================================================
// Siempre responde success, exista o no el email. Responder distinto
// permitiria saber que emails estan registrados en la tienda.
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: 'El email es obligatorio.' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (user && user.isActive) {
      const token = await authService.createPasswordReset(user.id);

      // El enlace apunta al frontend, que es quien muestra el formulario
      // de nueva contrasena. Sin esto en produccion, el correo llega con
      // un link a localhost y el cliente no puede recuperar su clave.
      const frontendUrl = datoObligatorio(
        'FRONTEND_URL',
        (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',')[0].trim(),
        'los enlaces de recuperacion de clave que se envian por correo'
      );

      const mail = emailRecuperacion({
        nombre: user.nombre,
        token,
        frontendUrl
      });

      await emailService.enviar({
        to: user.email,
        asunto: mail.asunto,
        html: mail.html,
        tipo: 'recuperacion_password',
        userId: user.id
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[AUTH-RESET] Token para ${user.email}: ${token}`);
        return res.json({
          success: true,
          message:
            'Si el email esta registrado, te enviaremos un enlace para recuperar tu contrasena.',
          devToken: token,
          devNote: 'Solo visible en desarrollo. En produccion se envia por email.'
        });
      }

      // El envio real ya quedo hecho arriba; no hay nada mas que hacer.
    }

    res.json({
      success: true,
      message:
        'Si el email esta registrado, te enviaremos un enlace para recuperar tu contrasena.'
    });
  } catch (error: any) {
    console.error('[AUTH-FORGOT] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al procesar la solicitud.'
    });
  }
});

// =====================================================================
// POST /api/auth/reset-password
// =====================================================================
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Token y contrasena son obligatorios.' });
    }

    const passError = validatePassword(password);
    if (passError) {
      return res.status(400).json({ success: false, message: passError });
    }

    const userId = await authService.consumePasswordReset(token);
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'El enlace es invalido o expiro. Solicita uno nuevo.'
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await authService.hashPassword(password) }
    });

    // Cierra todas las sesiones: si la contrasena cambio, las sesiones
    // existentes podrian pertenecer a alguien que la conocia.
    const fakeRes = { clearCookie: () => {} } as any;
    await authService.revokeAllSessions(userId, fakeRes);

    res.json({
      success: true,
      message: 'Contrasena actualizada. Ya puedes iniciar sesion.'
    });
  } catch (error: any) {
    console.error('[AUTH-RESET] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al resetting la contrasena.',
      detail: error.message
    });
  }
});

// =====================================================================
// GET /api/auth/sessions
// Lista los dispositivos con sesion activa del usuario.
// =====================================================================
router.get('/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: {
        sessions: sessions.map((s) => ({
          ...s,
          isCurrent: s.id === req.user!.sessionId
        }))
      }
    });
  } catch (error: any) {
    console.error('[AUTH-SESSIONS] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al listar sesiones.' });
  }
});

export default router;
