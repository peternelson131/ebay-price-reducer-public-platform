const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

/**
 * Configure Helmet for security headers
 */
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.ebay.com", "https://svcs.ebay.com", "https://*.supabase.co"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

/**
 * Rate limiting middleware
 */
const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests') => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

/**
 * Speed limiter - slows down repeated requests
 */
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // allow 50 requests per windowMs without delay
  delayMs: 500, // add 500ms delay per request after delayAfter
  maxDelayMs: 20000, // max delay of 20 seconds
});

/**
 * API-specific rate limiters
 */
const apiRateLimiters = {
  // General API rate limiter
  general: createRateLimiter(15 * 60 * 1000, 100, 'Too many API requests'),

  // Strict rate limiter for authentication endpoints
  auth: createRateLimiter(15 * 60 * 1000, 5, 'Too many authentication attempts'),

  // eBay API rate limiter (more restrictive due to eBay limits)
  ebay: createRateLimiter(60 * 1000, 10, 'Too many eBay API requests'),

  // Price update rate limiter
  priceUpdate: createRateLimiter(5 * 60 * 1000, 20, 'Too many price update requests')
};

/**
 * Input sanitization middleware
 */
const sanitizeInput = (req, res, next) => {
  // Remove potentially dangerous characters from strings
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/[<>]/g, '') // Remove potential XSS characters
        .trim();
    }
    if (typeof obj === 'object' && obj !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);

  next();
};

/**
 * Request logging middleware (security events)
 */
const securityLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log security-relevant information
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer')
  };

  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\.\//, // Directory traversal
    /<script/i, // Potential XSS
    /union.*select/i, // SQL injection
    /javascript:/i, // JavaScript protocol
    /vbscript:/i, // VBScript protocol
    /on\w+\s*=/i // Event handlers
  ];

  const fullUrl = req.url;
  const body = JSON.stringify(req.body || {});

  const isSuspicious = suspiciousPatterns.some(pattern =>
    pattern.test(fullUrl) || pattern.test(body)
  );

  if (isSuspicious) {
    console.warn('🚨 Suspicious request detected:', {
      ...logData,
      body: req.body,
      query: req.query
    });
  }

  // Log response time for monitoring
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (duration > 5000) { // Log slow requests
      console.warn('⚠️ Slow request detected:', {
        ...logData,
        duration,
        statusCode: res.statusCode
      });
    }
  });

  next();
};

/**
 * API key validation middleware
 */
const validateApiKey = (req, res, next) => {
  // Skip for development environment
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      error: 'API key required',
      code: 'MISSING_API_KEY'
    });
  }

  // In a real implementation, validate against a database or known keys
  // For now, we'll implement basic validation
  if (apiKey.length < 32) {
    return res.status(401).json({
      error: 'Invalid API key format',
      code: 'INVALID_API_KEY'
    });
  }

  next();
};

/**
 * Content-Type validation
 */
const validateContentType = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');

    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({
        error: 'Content-Type must be application/json',
        code: 'INVALID_CONTENT_TYPE'
      });
    }
  }

  next();
};

/**
 * Request size limiter
 */
const requestSizeLimiter = (req, res, next) => {
  const maxSize = 1024 * 1024; // 1MB

  if (req.get('Content-Length') && parseInt(req.get('Content-Length')) > maxSize) {
    return res.status(413).json({
      error: 'Request payload too large',
      maxSize: '1MB',
      code: 'PAYLOAD_TOO_LARGE'
    });
  }

  next();
};

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Feature-Policy', "camera 'none'; microphone 'none'; geolocation 'none'");

  // Remove server identification
  res.removeHeader('X-Powered-By');

  next();
};

/**
 * Error handling for security middleware
 */
const securityErrorHandler = (err, req, res, next) => {
  // Log security-related errors
  if (err.type === 'entity.too.large') {
    console.warn('🚨 Large payload attack attempt:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url
    });

    return res.status(413).json({
      error: 'Request payload too large',
      code: 'PAYLOAD_TOO_LARGE'
    });
  }

  if (err.type === 'entity.parse.failed') {
    console.warn('🚨 Malformed request body:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url
    });

    return res.status(400).json({
      error: 'Invalid request format',
      code: 'INVALID_REQUEST_FORMAT'
    });
  }

  // Pass other errors to default handler
  next(err);
};

module.exports = {
  helmetConfig,
  apiRateLimiters,
  speedLimiter,
  sanitizeInput,
  securityLogger,
  validateApiKey,
  validateContentType,
  requestSizeLimiter,
  securityHeaders,
  securityErrorHandler,
  createRateLimiter
};