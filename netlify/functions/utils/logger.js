/**
 * Advanced Logging Service for eBay Price Reducer
 * Provides structured logging with different levels and contexts
 */

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.environment = process.env.NODE_ENV || 'development';
    this.appName = process.env.APP_NAME || 'eBay Price Reducer';
    this.appVersion = process.env.APP_VERSION || '1.0.0';

    // Define log levels
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  /**
   * Check if a log level should be output
   */
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  /**
   * Format log entry with standard structure
   */
  formatLog(level, message, context = {}, error = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      application: this.appName,
      version: this.appVersion,
      environment: this.environment,
      message,
      ...context
    };

    // Add error details if provided
    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code || 'UNKNOWN'
      };
    }

    // Add request context if available
    if (context.requestId) {
      logEntry.request = {
        id: context.requestId,
        method: context.method,
        url: context.url,
        userAgent: context.userAgent,
        ip: context.ip
      };
    }

    return logEntry;
  }

  /**
   * Output log to console with appropriate formatting
   */
  output(logEntry) {
    const formatted = JSON.stringify(logEntry, null, this.environment === 'development' ? 2 : 0);

    switch (logEntry.level) {
      case 'ERROR':
        console.error(formatted);
        break;
      case 'WARN':
        console.warn(formatted);
        break;
      case 'INFO':
        console.info(formatted);
        break;
      case 'DEBUG':
        console.log(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  /**
   * Log error level messages
   */
  error(message, context = {}, error = null) {
    if (!this.shouldLog('error')) return;

    const logEntry = this.formatLog('error', message, context, error);
    this.output(logEntry);

    // In production, could send to external monitoring service
    if (this.environment === 'production') {
      this.sendToMonitoring(logEntry);
    }
  }

  /**
   * Log warning level messages
   */
  warn(message, context = {}) {
    if (!this.shouldLog('warn')) return;

    const logEntry = this.formatLog('warn', message, context);
    this.output(logEntry);
  }

  /**
   * Log info level messages
   */
  info(message, context = {}) {
    if (!this.shouldLog('info')) return;

    const logEntry = this.formatLog('info', message, context);
    this.output(logEntry);
  }

  /**
   * Log debug level messages
   */
  debug(message, context = {}) {
    if (!this.shouldLog('debug')) return;

    const logEntry = this.formatLog('debug', message, context);
    this.output(logEntry);
  }

  /**
   * Log eBay API interactions
   */
  ebayApi(operation, details = {}, error = null) {
    const context = {
      category: 'ebay_api',
      operation,
      environment: process.env.EBAY_ENVIRONMENT,
      ...details
    };

    if (error) {
      this.error(`eBay API Error: ${operation}`, context, error);
    } else {
      this.info(`eBay API Success: ${operation}`, context);
    }
  }

  /**
   * Log database operations
   */
  database(operation, details = {}, error = null) {
    const context = {
      category: 'database',
      operation,
      ...details
    };

    if (error) {
      this.error(`Database Error: ${operation}`, context, error);
    } else {
      this.debug(`Database Operation: ${operation}`, context);
    }
  }

  /**
   * Log price reduction activities
   */
  priceReduction(itemId, oldPrice, newPrice, strategy, error = null) {
    const context = {
      category: 'price_reduction',
      itemId,
      oldPrice,
      newPrice,
      strategy,
      reduction: oldPrice - newPrice,
      percentage: ((oldPrice - newPrice) / oldPrice * 100).toFixed(2)
    };

    if (error) {
      this.error(`Price Reduction Failed: ${itemId}`, context, error);
    } else {
      this.info(`Price Reduction Success: ${itemId}`, context);
    }
  }

  /**
   * Log user authentication events
   */
  auth(event, userId, details = {}, error = null) {
    const context = {
      category: 'authentication',
      event,
      userId,
      ...details
    };

    if (error) {
      this.warn(`Auth Event Failed: ${event}`, context, error);
    } else {
      this.info(`Auth Event: ${event}`, context);
    }
  }

  /**
   * Log security events
   */
  security(event, details = {}, severity = 'medium') {
    const context = {
      category: 'security',
      event,
      severity,
      ...details
    };

    if (severity === 'high') {
      this.error(`Security Alert: ${event}`, context);
    } else if (severity === 'medium') {
      this.warn(`Security Warning: ${event}`, context);
    } else {
      this.info(`Security Event: ${event}`, context);
    }
  }

  /**
   * Log performance metrics
   */
  performance(operation, duration, details = {}) {
    const context = {
      category: 'performance',
      operation,
      duration: `${duration}ms`,
      ...details
    };

    if (duration > 5000) {
      this.warn(`Slow Operation: ${operation}`, context);
    } else if (duration > 2000) {
      this.info(`Performance: ${operation}`, context);
    } else {
      this.debug(`Performance: ${operation}`, context);
    }
  }

  /**
   * Create a logger with request context
   */
  withContext(context) {
    return {
      error: (message, additionalContext = {}, error = null) =>
        this.error(message, { ...context, ...additionalContext }, error),
      warn: (message, additionalContext = {}) =>
        this.warn(message, { ...context, ...additionalContext }),
      info: (message, additionalContext = {}) =>
        this.info(message, { ...context, ...additionalContext }),
      debug: (message, additionalContext = {}) =>
        this.debug(message, { ...context, ...additionalContext }),
      ebayApi: (operation, details = {}, error = null) =>
        this.ebayApi(operation, { ...context, ...details }, error),
      database: (operation, details = {}, error = null) =>
        this.database(operation, { ...context, ...details }, error),
      priceReduction: (itemId, oldPrice, newPrice, strategy, error = null) =>
        this.priceReduction(itemId, oldPrice, newPrice, strategy, error),
      auth: (event, userId, details = {}, error = null) =>
        this.auth(event, userId, { ...context, ...details }, error),
      security: (event, details = {}, severity = 'medium') =>
        this.security(event, { ...context, ...details }, severity),
      performance: (operation, duration, details = {}) =>
        this.performance(operation, duration, { ...context, ...details })
    };
  }

  /**
   * Send critical logs to external monitoring service
   * In a real implementation, this would integrate with services like:
   * - Datadog, New Relic, Sentry, LogRocket, etc.
   */
  sendToMonitoring(logEntry) {
    // Placeholder for external monitoring integration
    if (logEntry.level === 'ERROR') {
      // Could send to Sentry, Rollbar, etc.
      console.log('🚨 Critical error logged - would send to monitoring service');
    }
  }

  /**
   * Create middleware for Express-like frameworks
   */
  middleware() {
    return (req, res, next) => {
      const requestId = Math.random().toString(36).substring(2, 15);
      const startTime = Date.now();

      req.logger = this.withContext({
        requestId,
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress
      });

      // Log request
      req.logger.info('Request started');

      // Log response when finished
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        req.logger.performance('Request completed', duration, {
          statusCode: res.statusCode,
          contentLength: res.get('Content-Length')
        });
      });

      next();
    };
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;