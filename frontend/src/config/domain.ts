// Domain and SSL configuration
export const DOMAIN_CONFIG = {
  // Your custom domain
  PRODUCTION_DOMAIN: process.env.VITE_DOMAIN || 'your-domain.com',
  
  // SSL/HTTPS settings
  FORCE_HTTPS: process.env.VITE_FORCE_HTTPS === 'true' || true,
  
  // Development settings
  DEV_PORT: 8080,
  DEV_HOST: '::',
  
  // Security headers
  SECURITY_HEADERS: {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  }
};

// Function to check if we're on the correct domain
export const isValidDomain = (): boolean => {
  if (typeof window === 'undefined') return true;
  
  const currentDomain = window.location.hostname;
  const validDomains = [
    DOMAIN_CONFIG.PRODUCTION_DOMAIN,
    `www.${DOMAIN_CONFIG.PRODUCTION_DOMAIN}`,
    'localhost',
    '127.0.0.1'
  ];
  
  return validDomains.includes(currentDomain);
};

// Force HTTPS redirect
export const enforceHTTPS = (): void => {
  if (typeof window === 'undefined') return;
  
  if (DOMAIN_CONFIG.FORCE_HTTPS && 
      window.location.protocol === 'http:' && 
      !window.location.hostname.includes('localhost')) {
    window.location.href = window.location.href.replace('http:', 'https:');
  }
};