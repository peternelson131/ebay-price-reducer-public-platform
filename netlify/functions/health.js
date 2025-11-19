const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Health check function
exports.handler = async (event, context) => {
  const startTime = Date.now();
  const checks = {};
  let overallStatus = 'healthy';

  try {
    // 1. Basic service check
    checks.service = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    };

    // 2. Database connectivity check
    try {
      const { data, error } = await supabase
        .from('users')
        .select('count')
        .limit(1);

      if (error) {
        throw error;
      }

      checks.database = {
        status: 'healthy',
        latency: Date.now() - startTime,
        connection: 'active'
      };
    } catch (dbError) {
      checks.database = {
        status: 'unhealthy',
        error: dbError.message,
        connection: 'failed'
      };
      overallStatus = 'degraded';
    }

    // 3. eBay API configuration check
    const requiredEbayVars = [
      'EBAY_APP_ID',
      'EBAY_DEV_ID',
      'EBAY_CERT_ID',
      'EBAY_USER_TOKEN'
    ];

    const missingVars = requiredEbayVars.filter(varName => !process.env[varName]);

    checks.ebayConfig = {
      status: missingVars.length === 0 ? 'healthy' : 'unhealthy',
      environment: process.env.EBAY_ENVIRONMENT || 'sandbox',
      missingVariables: missingVars,
      configured: requiredEbayVars.length - missingVars.length,
      total: requiredEbayVars.length
    };

    if (missingVars.length > 0) {
      overallStatus = 'unhealthy';
    }

    // 4. Memory and performance check
    const memoryUsage = process.memoryUsage();
    checks.performance = {
      status: 'healthy',
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
      },
      uptime: process.uptime(),
      responseTime: Date.now() - startTime + 'ms'
    };

    // 5. Environment validation
    const criticalEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'JWT_SECRET'
    ];

    const missingCriticalVars = criticalEnvVars.filter(varName => !process.env[varName]);

    checks.environment = {
      status: missingCriticalVars.length === 0 ? 'healthy' : 'unhealthy',
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      missingCriticalVars
    };

    if (missingCriticalVars.length > 0) {
      overallStatus = 'unhealthy';
    }

    // 6. Function execution check
    checks.functions = {
      status: 'healthy',
      context: {
        functionName: context.functionName,
        functionVersion: context.functionVersion,
        requestId: context.awsRequestId
      },
      region: process.env.AWS_REGION || 'unknown',
      runtime: process.env.AWS_EXECUTION_ENV || 'unknown'
    };

    // Determine HTTP status code
    let statusCode = 200;
    if (overallStatus === 'unhealthy') {
      statusCode = 503; // Service Unavailable
    } else if (overallStatus === 'degraded') {
      statusCode = 200; // OK but with warnings
    }

    // Build response
    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      totalResponseTime: Date.now() - startTime + 'ms',
      checks
    };

    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check': 'true'
      },
      body: JSON.stringify(response, null, 2)
    };

  } catch (error) {
    console.error('Health check error:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check': 'true'
      },
      body: JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          type: error.constructor.name
        },
        totalResponseTime: Date.now() - startTime + 'ms'
      }, null, 2)
    };
  }
};