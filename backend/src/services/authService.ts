import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

/**
 * Servicio de autenticacion por JWT en cookie httpOnly.
 *
 * Decisiones de seguridad aplicadas:
 * - La contrasena se guarda con bcrypt (hash + sal), nunca en texto plano.
 * - El JWT viaja en una cookie httpOnly: el JavaScript del frontend no
 *   puede leerla, asi que un XSS no puede robar la sesion.
 * - En la base se guarda el SHA-256 del token, no el token. Si alguien
 *   lee la base de datos, no puede suplantar la sesion de nadie.
 * - sameSite=lazy evita que el navegador mande la cookie en peticiones
 *   originadas por otro sitio (proteccion CSRF).
 */

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const COOKIE_NAME = 'amyb_session';

const SESSION_DAYS = 7;

/** Verifica que el secreto esté configurado. Sin esto, firmaría tokens con "" */
function assertSecret(): string {
  if (!JWT_SECRET) {
    throw new Error(
      'JWT_SECRET no esta configurado en el .env. Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }
  return JWT_SECRET;
}

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: string;
  sid: string; // sessionId
}

export const authService = {
  /** Hashea una contrasena con bcrypt. */
  async hashPassword(plain: string): Promise<string> {
    // 12 rondas: equilibrio entre seguridad y tiempo de respuesta
    // (~200ms), aceptable para un login y resistente a fuerza bruta.
    return await bcrypt.hash(plain, 12);
  },

  /** Compara contrasena en texto plano contra el hash guardado. */
  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(plain, hash);
  },

  /**
   * Crea una sesion: firma el JWT, guarda el hash del token en la base
   * y configura la cookie httpOnly en la respuesta.
   */
  async createSession(
    userId: string,
    email: string,
    role: string,
    res: Response,
    req?: Request
  ): Promise<{ token: string; sessionId: string }> {
    const secret = assertSecret();

    // El token se firma ANTES de crear el registro, para poder guardar
    // su hash de una vez: si se creara la sesion vacia y se actualizara
    // despues, un corte de red dejaria una sesion sin hash, inutilizable.
    const sessionId = crypto.randomBytes(16).toString('hex');
    const payload: JwtPayload = {
      sub: userId,
      email,
      role,
      sid: sessionId
    };
    const token = jwt.sign(payload, secret, { expiresIn: JWT_EXPIRES_IN } as any);
    const tokenHash = authService.hashToken(token);

    await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        tokenHash,
        userAgent: req?.headers['user-agent']?.toString().slice(0, 255) ?? null,
        ipAddress:
          (req?.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
          req?.socket.remoteAddress ??
          null,
        expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
      }
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true, // invisible al JavaScript del navegador
      secure: process.env.NODE_ENV === 'production', // solo HTTPS en produccion
      sameSite: 'lax', // proteccion CSRF
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
      path: '/'
    });

    return { token, sessionId };
  },

  /** SHA-256 en hexadecimal. */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  },

  /**
   * Verifica un JWT y confirma que la sesion siga vigente en la base.
   * Consultar la base permite que un logout en otro dispositivo
   * invalide el token de inmediato.
   */
  async verifyToken(token: string): Promise<JwtPayload | null> {
    try {
      const secret = assertSecret();
      const payload = jwt.verify(token, secret) as JwtPayload;

      const session = await prisma.session.findUnique({
        where: { id: payload.sid }
      });

      if (!session) return null;
      if (session.revokedAt) return null;
      if (session.expiresAt < new Date()) return null;

      // defense in depth: el hash guardado debe coincidir
      if (session.tokenHash !== authService.hashToken(token)) return null;

      return payload;
    } catch {
      return null;
    }
  },

  /** Revoca la sesion actual (logout de un dispositivo). */
  async revokeSession(sessionId: string, res: Response): Promise<void> {
    await prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    res.clearCookie(COOKIE_NAME, { path: '/' });
  },

  /** Revoca todas las sesiones del usuario (logout de todos los dispositivos). */
  async revokeAllSessions(userId: string, res: Response): Promise<void> {
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    res.clearCookie(COOKIE_NAME, { path: '/' });
  },

  /**
   * Genera un token aleatorio para recuperacion de contrasena y guarda
   * solo su hash. El token plano se envia por email.
   */
  async createPasswordReset(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');

    // Invalida los resets anteriores: solo el ultimo emailed sirve
    await prisma.passwordReset.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() }
    });

    await prisma.passwordReset.create({
      data: {
        userId,
        tokenHash: authService.hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hora
      }
    });

    return token;
  },

  /** Valida y consume un token de recuperacion. */
  async consumePasswordReset(token: string): Promise<string | null> {
    const reset = await prisma.passwordReset.findUnique({
      where: { tokenHash: authService.hashToken(token) }
    });

    if (!reset) return null;
    if (reset.usedAt) return null;
    if (reset.expiresAt < new Date()) return null;

    await prisma.passwordReset.update({
      where: { id: reset.id },
      data: { usedAt: new Date() }
    });

    return reset.userId;
  },

  /** Limpia sesiones y tokens vencidos. */
  async purgeExpired(): Promise<{ sessions: number; resets: number }> {
    const now = new Date();
    const [sessions, resets] = await Promise.all([
      prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: now } } })
    ]);
    return { sessions: sessions.count, resets: resets.count };
  }
};

// ---------------------------------------------------------------------
// MIDDLEWARES
// ---------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: string; sessionId: string };
    }
  }
}

/** Adjunta req.user si hay sesion valida. No bloquea la ruta. */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    const payload = await authService.verifyToken(token);
    if (payload) {
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        sessionId: payload.sid
      };
    }
  }
  next();
};

/** Exige sesion valida. Responde 401 si no la hay. */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Debes iniciar sesion para continuar.',
      code: 'UNAUTHORIZED'
    });
  }
  next();
};

/** Exige rol admin. Usar siempre despues de requireAuth. */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta operacion.',
      code: 'FORBIDDEN'
    });
  }
  next();
};

export { COOKIE_NAME };
