const Joi = require('joi');

// Define environment schema
const envSchema = Joi.object({
  // Node environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  // Server configuration
  PORT: Joi.number()
    .port()
    .default(3000),

  // Database configuration (Supabase)
  SUPABASE_URL: Joi.string()
    .uri()
    .required()
    .messages({
      'string.uri': 'SUPABASE_URL must be a valid URL',
      'any.required': 'SUPABASE_URL is required for database connection'
    }),

  SUPABASE_SERVICE_ROLE_KEY: Joi.string()
    .required()
    .min(50)
    .messages({
      'string.min': 'SUPABASE_SERVICE_ROLE_KEY appears to be invalid (too short)',
      'any.required': 'SUPABASE_SERVICE_ROLE_KEY is required for database operations'
    }),

  // JWT Secret
  JWT_SECRET: Joi.string()
    .required()
    .min(32)
    .messages({
      'string.min': 'JWT_SECRET must be at least 32 characters for security',
      'any.required': 'JWT_SECRET is required for authentication'
    }),

  // eBay API Configuration
  EBAY_APP_ID: Joi.string()
    .required()
    .messages({
      'any.required': 'EBAY_APP_ID is required for eBay API integration'
    }),

  EBAY_DEV_ID: Joi.string()
    .required()
    .messages({
      'any.required': 'EBAY_DEV_ID is required for eBay API integration'
    }),

  EBAY_CERT_ID: Joi.string()
    .required()
    .messages({
      'any.required': 'EBAY_CERT_ID is required for eBay API integration'
    }),

  EBAY_USER_TOKEN: Joi.string()
    .required()
    .messages({
      'any.required': 'EBAY_USER_TOKEN is required for eBay API operations'
    }),

  EBAY_ENVIRONMENT: Joi.string()
    .valid('sandbox', 'production')
    .default('sandbox')
    .messages({
      'any.only': 'EBAY_ENVIRONMENT must be either "sandbox" or "production"'
    }),

  EBAY_SITE_ID: Joi.string()
    .default('0'),

  EBAY_API_VERSION: Joi.string()
    .default('967'),

  // Optional email configuration
  EMAIL_HOST: Joi.string()
    .hostname()
    .allow(''),

  EMAIL_PORT: Joi.number()
    .port()
    .allow(''),

  EMAIL_USER: Joi.string()
    .email()
    .allow(''),

  EMAIL_PASS: Joi.string()
    .allow(''),

  // Application configuration
  APP_NAME: Joi.string()
    .default('eBay Price Reducer'),

  APP_VERSION: Joi.string()
    .default('1.0.0'),

  // Security configuration
  CORS_ORIGIN: Joi.alternatives()
    .try(
      Joi.string().uri(),
      Joi.array().items(Joi.string().uri()),
      Joi.boolean()
    )
    .default('*'),

  RATE_LIMIT_WINDOW_MS: Joi.number()
    .positive()
    .default(900000), // 15 minutes

  RATE_LIMIT_MAX_REQUESTS: Joi.number()
    .positive()
    .default(100),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info')
});

/**
 * Validates environment variables against the schema
 * @returns {Object} Validated environment variables
 * @throws {Error} If validation fails
 */
function validateEnvironment() {
  const { error, value } = envSchema.validate(process.env, {
    allowUnknown: true,
    stripUnknown: false,
    abortEarly: false
  });

  if (error) {
    const errorMessages = error.details.map(detail => detail.message);
    const formattedError = `Environment validation failed:\n${errorMessages.join('\n')}`;

    console.error('\n🚨 ENVIRONMENT VALIDATION FAILED 🚨');
    console.error('=' .repeat(50));
    errorMessages.forEach((msg, index) => {
      console.error(`${index + 1}. ${msg}`);
    });
    console.error('=' .repeat(50));
    console.error('Please check your .env file and environment variables.\n');

    throw new Error(formattedError);
  }

  return value;
}

/**
 * Validates that we're not using placeholder values in production
 * @param {Object} env - Validated environment variables
 */
function validateProductionSecurity(env) {
  if (env.NODE_ENV !== 'production') {
    return; // Skip validation for non-production environments
  }

  const securityIssues = [];

  // Check for placeholder/demo values
  const placeholderPatterns = [
    { key: 'SUPABASE_URL', pattern: /your[-_]project[-_]id/i },
    { key: 'EBAY_APP_ID', pattern: /your[-_]ebay[-_]application[-_]id/i },
    { key: 'EBAY_DEV_ID', pattern: /your[-_]ebay[-_]developer[-_]id/i },
    { key: 'EBAY_CERT_ID', pattern: /your[-_]ebay[-_]certificate[-_]id/i },
    { key: 'EBAY_USER_TOKEN', pattern: /your[-_]ebay[-_]user[-_]access[-_]token/i },
    { key: 'JWT_SECRET', pattern: /^(secret|password|changeme)/i }
  ];

  placeholderPatterns.forEach(({ key, pattern }) => {
    if (env[key] && pattern.test(env[key])) {
      securityIssues.push(`${key} appears to contain a placeholder value`);
    }
  });

  // Check for weak JWT secrets
  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) {
    securityIssues.push('JWT_SECRET is too short for production use (minimum 32 characters)');
  }

  // Check if using sandbox in production
  if (env.EBAY_ENVIRONMENT === 'sandbox') {
    securityIssues.push('EBAY_ENVIRONMENT is set to "sandbox" in production');
  }

  if (securityIssues.length > 0) {
    console.error('\n🚨 PRODUCTION SECURITY ISSUES DETECTED 🚨');
    console.error('=' .repeat(50));
    securityIssues.forEach((issue, index) => {
      console.error(`${index + 1}. ${issue}`);
    });
    console.error('=' .repeat(50));
    console.error('Please fix these security issues before deploying to production.\n');

    throw new Error(`Production security validation failed: ${securityIssues.join(', ')}`);
  }
}

/**
 * Logs environment configuration (safely, without secrets)
 * @param {Object} env - Validated environment variables
 */
function logEnvironmentInfo(env) {
  const safeConfig = {
    NODE_ENV: env.NODE_ENV,
    PORT: env.PORT,
    APP_NAME: env.APP_NAME,
    APP_VERSION: env.APP_VERSION,
    EBAY_ENVIRONMENT: env.EBAY_ENVIRONMENT,
    EBAY_SITE_ID: env.EBAY_SITE_ID,
    EBAY_API_VERSION: env.EBAY_API_VERSION,
    LOG_LEVEL: env.LOG_LEVEL,
    SUPABASE_URL: env.SUPABASE_URL ? '✓ Configured' : '✗ Missing',
    EBAY_APP_ID: env.EBAY_APP_ID ? '✓ Configured' : '✗ Missing',
    EBAY_DEV_ID: env.EBAY_DEV_ID ? '✓ Configured' : '✗ Missing',
    EBAY_CERT_ID: env.EBAY_CERT_ID ? '✓ Configured' : '✗ Missing',
    EBAY_USER_TOKEN: env.EBAY_USER_TOKEN ? '✓ Configured' : '✗ Missing',
    JWT_SECRET: env.JWT_SECRET ? '✓ Configured' : '✗ Missing',
    EMAIL_CONFIGURED: env.EMAIL_HOST && env.EMAIL_USER ? '✓ Yes' : '✗ No'
  };

  console.log('\n📋 Environment Configuration');
  console.log('=' .repeat(40));
  Object.entries(safeConfig).forEach(([key, value]) => {
    console.log(`${key.padEnd(20)}: ${value}`);
  });
  console.log('=' .repeat(40) + '\n');
}

/**
 * Main validation function - validates and returns environment configuration
 * @returns {Object} Validated environment variables
 */
function initializeEnvironment() {
  try {
    console.log('🔍 Validating environment configuration...');

    const env = validateEnvironment();
    validateProductionSecurity(env);

    if (env.NODE_ENV !== 'test') {
      logEnvironmentInfo(env);
    }

    console.log('✅ Environment validation successful\n');
    return env;

  } catch (error) {
    console.error('❌ Environment validation failed');
    process.exit(1);
  }
}

module.exports = {
  validateEnvironment,
  validateProductionSecurity,
  logEnvironmentInfo,
  initializeEnvironment,
  envSchema
};