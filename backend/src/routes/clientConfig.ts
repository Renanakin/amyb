import { Router, Request, Response } from 'express';

const router = Router();

// In-memory fallback logs for diagnostics
interface FallbackLog {
  id: string;
  reason: string;
  errorDetail?: string;
  device?: any;
  timestamp: string;
}

const fallbackHistory: FallbackLog[] = [];

// GET /api/client-config
router.get('/', (req: Request, res: Response) => {
  const device = req.device || {
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    clientType: 'desktop',
    userAgent: req.headers['user-agent'] || '',
    source: 'user-agent'
  };

  res.json({
    success: true,
    device,
    config: {
      appName: 'Amyb Distribuidora Gastronómica',
      city: 'Temuco & Padre Las Casas',
      mobileFirst: {
        enabled: true,
        version: '2.0.0-mobilefirst',
        fallbackVersion: '1.0.0-web-responsive',
        autoDetect: true,
        features: {
          bottomNavigation: true,
          touchGestures: true,
          quickSearchDrawer: true,
          floatingQuickCart: true,
          hapticFeedback: true
        }
      },
      fallbackStrategy: {
        enabled: true,
        triggerOnError: true,
        manualSwitchAllowed: true,
        telemetryUrl: '/api/client-config/fallback'
      },
      support: {
        whatsapp: '+56 9 8765 4321',
        phone: '+56 9 8765 4321',
        email: 'contacto@amybdistribuidora.cl',
        address: 'Temuco, Región de La Araucanía'
      }
    }
  });
});

// POST /api/client-config/fallback (telemetry when mobile-first view triggers fallback to web responsive)
router.post('/fallback', (req: Request, res: Response) => {
  const { reason, errorDetail, device } = req.body;

  const logEntry: FallbackLog = {
    id: `fb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    reason: reason || 'unknown',
    errorDetail: errorDetail || 'None provided',
    device: device || req.device,
    timestamp: new Date().toISOString()
  };

  fallbackHistory.unshift(logEntry);
  if (fallbackHistory.length > 50) fallbackHistory.pop();

  console.warn(`[MOBILE-FALLBACK] Fallback activado a versión Web Responsive: "${logEntry.reason}" - Error: ${logEntry.errorDetail}`);

  res.json({
    success: true,
    message: 'Evento de fallback registrado correctamente en el backend.',
    logId: logEntry.id
  });
});

// GET /api/client-config/fallback-logs
router.get('/fallback-logs', (_req: Request, res: Response) => {
  res.json({
    success: true,
    count: fallbackHistory.length,
    data: fallbackHistory
  });
});

export default router;
