import { Request, Response, NextFunction } from 'express';

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  clientType: 'mobile' | 'tablet' | 'desktop';
  userAgent: string;
  source: 'header' | 'user-agent' | 'query';
}

declare global {
  namespace Express {
    interface Request {
      device?: DeviceInfo;
    }
  }
}

export const deviceDetector = (req: Request, res: Response, next: NextFunction) => {
  const ua = req.headers['user-agent'] || '';
  const clientDeviceHeader = req.headers['x-client-device'] as string | undefined;
  const deviceQuery = req.query.device as string | undefined;

  let isMobile = false;
  let isTablet = false;
  let source: DeviceInfo['source'] = 'user-agent';

  // 1. Explicit override via query or custom header
  if (deviceQuery === 'mobile' || clientDeviceHeader === 'mobile') {
    isMobile = true;
    source = deviceQuery ? 'query' : 'header';
  } else if (deviceQuery === 'desktop' || clientDeviceHeader === 'desktop') {
    isMobile = false;
    source = deviceQuery ? 'query' : 'header';
  } else {
    // 2. Client Hints header (modern browsers)
    const chMobile = req.headers['sec-ch-ua-mobile'];
    if (chMobile === '?1') {
      isMobile = true;
      source = 'header';
    } else {
      // 3. User-Agent regex check
      const mobileRegex = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i;
      const tabletRegex = /iPad|Android(?!.*Mobile)|Tablet/i;

      if (tabletRegex.test(ua)) {
        isTablet = true;
      } else if (mobileRegex.test(ua)) {
        isMobile = true;
      }
    }
  }

  const clientType: DeviceInfo['clientType'] = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  req.device = {
    isMobile: isMobile || isTablet,
    isTablet,
    isDesktop: !isMobile && !isTablet,
    clientType,
    userAgent: ua,
    source
  };

  // Inform client of detected device type in response headers
  res.setHeader('x-device-type', clientType);
  res.setHeader('x-mobile-supported', 'true');

  next();
};
