# eBay Price Reducer - Administrator Guide

This guide provides comprehensive information for administrators and developers managing the eBay Price Reducer application.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Environment Management](#environment-management)
3. [User Management](#user-management)
4. [Monitoring and Alerts](#monitoring-and-alerts)
5. [Maintenance Procedures](#maintenance-procedures)
6. [Security Management](#security-management)
7. [Troubleshooting](#troubleshooting)
8. [API Documentation](#api-documentation)

## System Architecture

### Technology Stack

**Frontend:**
- React 18 with Vite
- Tailwind CSS for styling
- Supabase client for authentication and data

**Backend:**
- Netlify Functions (serverless)
- Node.js runtime
- Express.js middleware

**Database:**
- Supabase (PostgreSQL)
- Row Level Security (RLS)
- Real-time subscriptions

**External APIs:**
- eBay Trading API
- eBay Finding API

### Infrastructure

**Hosting:**
- Frontend: Netlify
- Functions: Netlify Functions
- Database: Supabase Cloud
- CDN: Netlify Edge Network

**CI/CD:**
- GitHub Actions
- Automated testing
- Security audits
- Deployment verification

## Environment Management

### Environment Variables

#### Frontend (VITE_ prefix)
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_APP_NAME=eBay Price Reducer
VITE_API_BASE_URL=https://your-app.netlify.app/.netlify/functions
```

#### Backend (Netlify Functions)
```bash
NODE_ENV=production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=your_32_character_secret
EBAY_APP_ID=your_ebay_app_id
EBAY_DEV_ID=your_ebay_dev_id
EBAY_CERT_ID=your_ebay_cert_id
EBAY_USER_TOKEN=your_ebay_user_token
EBAY_ENVIRONMENT=production
LOG_LEVEL=info
```

### Configuration Management

**Netlify Environment Variables:**
1. Go to Netlify Dashboard → Site Settings → Environment Variables
2. Add production variables
3. Variables are encrypted and secured
4. Separate staging/production environments

**Supabase Configuration:**
1. Database settings in Supabase Dashboard
2. RLS policies for data security
3. API keys and service roles
4. Backup and recovery settings

### Deployment Environments

#### Development
- Local development server
- Sandbox eBay API
- Development database
- Debug logging enabled

#### Staging
- Netlify preview deployments
- Sandbox eBay API
- Staging database
- Full feature testing

#### Production
- Netlify production deployment
- Live eBay API
- Production database
- Error monitoring enabled

## User Management

### User Account Administration

**Supabase Auth Dashboard:**
- View all registered users
- Manage user permissions
- Reset passwords
- Disable/enable accounts

**User Data Management:**
```sql
-- View user statistics
SELECT
  auth.users.email,
  users.created_at,
  COUNT(listings.id) as total_listings,
  COUNT(CASE WHEN listings.price_reduction_enabled THEN 1 END) as enabled_listings
FROM auth.users
LEFT JOIN users ON auth.users.id = users.id
LEFT JOIN listings ON users.id = listings.user_id
GROUP BY auth.users.id, auth.users.email, users.created_at;
```

### Role-Based Access Control

**User Roles:**
- `user`: Standard user access
- `admin`: Administrative access
- `support`: Customer support access

**Permission Management:**
```sql
-- Grant admin role
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';

-- Check user permissions
SELECT users.email, users.role, auth.users.created_at
FROM users
JOIN auth.users ON users.id = auth.users.id;
```

## Monitoring and Alerts

### Health Monitoring

**Health Check Endpoint:**
```bash
curl https://your-app.netlify.app/.netlify/functions/health
```

**Key Metrics:**
- Database connectivity
- eBay API status
- Memory usage
- Response times
- Error rates

### Analytics Dashboard

**Access Analytics:**
```bash
# Overview metrics
curl "https://your-app.netlify.app/.netlify/functions/analytics?metric=overview&timeframe=7d"

# Price reduction analytics
curl "https://your-app.netlify.app/.netlify/functions/analytics?metric=price-reductions&timeframe=30d"

# User analytics
curl "https://your-app.netlify.app/.netlify/functions/analytics?metric=users&timeframe=7d"

# Error analytics
curl "https://your-app.netlify.app/.netlify/functions/analytics?metric=errors&timeframe=7d"
```

### Log Management

**Structured Logging:**
- All logs in JSON format
- Contextual information included
- Error tracking and alerting
- Performance monitoring

**Log Levels:**
- `error`: Critical errors requiring immediate attention
- `warn`: Warning conditions
- `info`: General information
- `debug`: Detailed debugging information

**Accessing Logs:**
1. Netlify Functions logs in Netlify Dashboard
2. Supabase logs in Supabase Dashboard
3. Real-time monitoring with log streaming

### Alerting Configuration

**Critical Alerts:**
- Database connection failures
- eBay API errors
- High error rates (>5%)
- Memory usage spikes
- Security incidents

**Alert Channels:**
- Email notifications
- Slack integration
- PagerDuty for critical issues
- Dashboard notifications

## Maintenance Procedures

### Regular Maintenance Tasks

#### Daily
- Monitor health checks
- Review error logs
- Check system performance
- Verify eBay API status

#### Weekly
- Database maintenance
- Performance analysis
- User activity review
- Security audit logs

#### Monthly
- Backup verification
- Dependency updates
- Security patches
- Performance optimization

### Database Maintenance

**Backup Procedures:**
```sql
-- Create manual backup
pg_dump -h your-host -U postgres -d your-db > backup_$(date +%Y%m%d).sql

-- Verify backup integrity
psql -h your-host -U postgres -d test_db < backup_file.sql
```

**Performance Optimization:**
```sql
-- Analyze table statistics
ANALYZE;

-- Reindex tables
REINDEX DATABASE your_database;

-- Clean up old data
DELETE FROM price_history WHERE created_at < NOW() - INTERVAL '1 year';
DELETE FROM sync_errors WHERE resolved = true AND created_at < NOW() - INTERVAL '30 days';
```

### Application Updates

**Deployment Process:**
1. Create pull request with changes
2. Automated testing runs
3. Security audit executes
4. Manual review and approval
5. Merge to main branch
6. Automatic production deployment
7. Post-deployment verification

**Rollback Procedure:**
```bash
# Using Netlify CLI
netlify deploy --prod --dir=previous_build_dir

# Or use Netlify Dashboard
# 1. Go to Deploys tab
# 2. Find previous successful deploy
# 3. Click "Publish deploy"
```

## Security Management

### Security Monitoring

**Key Security Metrics:**
- Failed login attempts
- API rate limiting violations
- Suspicious user activity
- Database access patterns

**Security Audit Queries:**
```sql
-- Failed login attempts
SELECT COUNT(*) as failed_attempts, ip_address, created_at::date
FROM auth_audit_log
WHERE event_type = 'failed_login'
AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY ip_address, created_at::date
HAVING COUNT(*) > 5;

-- Unusual data access patterns
SELECT user_id, COUNT(*) as api_calls, created_at::date
FROM api_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id, created_at::date
HAVING COUNT(*) > 100;
```

### Access Control

**API Rate Limiting:**
- Authentication endpoints: 5 requests per 15 minutes
- General API: 100 requests per hour
- eBay API calls: 10 requests per minute

**IP Whitelisting:**
```javascript
// Configure in netlify/functions security middleware
const allowedIPs = [
  '192.168.1.0/24',  // Office network
  '10.0.0.0/8'       // VPN range
];
```

### Incident Response

**Security Incident Procedure:**
1. **Detect**: Automated monitoring alerts
2. **Analyze**: Investigate scope and impact
3. **Contain**: Isolate affected systems
4. **Eradicate**: Remove threat vectors
5. **Recover**: Restore normal operations
6. **Document**: Create incident report

**Emergency Contacts:**
- Security Team: security@company.com
- On-call Engineer: +1-555-0123
- Management: management@company.com

## Troubleshooting

### Common Issues

#### "Database Connection Timeout"
**Diagnosis:**
```bash
# Check database health
curl https://your-app.netlify.app/.netlify/functions/health | jq '.checks.database'

# Check Supabase status
curl https://status.supabase.com/api/v2/status.json
```

**Resolution:**
1. Verify environment variables
2. Check Supabase dashboard for issues
3. Restart Netlify functions if needed
4. Contact Supabase support if persistent

#### "eBay API Rate Limit Exceeded"
**Diagnosis:**
```javascript
// Check rate limit status in logs
grep "rate.limit" netlify-functions.log | tail -20
```

**Resolution:**
1. Reduce API call frequency
2. Implement exponential backoff
3. Contact eBay for rate limit increase
4. Optimize API usage patterns

#### "High Memory Usage"
**Diagnosis:**
```bash
# Monitor function memory usage
curl https://your-app.netlify.app/.netlify/functions/analytics?metric=performance
```

**Resolution:**
1. Optimize database queries
2. Implement result caching
3. Reduce concurrent operations
4. Upgrade function memory limits

### Performance Optimization

**Database Query Optimization:**
```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY idx_listings_user_id ON listings(user_id);
CREATE INDEX CONCURRENTLY idx_price_history_listing_id ON price_history(listing_id);
CREATE INDEX CONCURRENTLY idx_price_history_created_at ON price_history(created_at);

-- Analyze slow queries
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

**Function Optimization:**
- Implement connection pooling
- Use async/await properly
- Cache frequently accessed data
- Minimize external API calls

## API Documentation

### Authentication Endpoints

#### POST /auth/login
**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "jwt_token",
  "refresh_token": "refresh_token",
  "expires_in": 3600,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

### Listings Management

#### GET /listings
**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50)
- `status`: Filter by status
- `category`: Filter by category

**Response:**
```json
{
  "listings": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

### Analytics Endpoints

#### GET /analytics
**Query Parameters:**
- `metric`: overview|price-reductions|users|performance|errors
- `timeframe`: 1d|7d|30d|90d

**Response:**
```json
{
  "success": true,
  "metric": "overview",
  "timeframe": "7d",
  "generatedAt": "2023-01-01T00:00:00Z",
  "data": { ... }
}
```

### Error Handling

**Standard Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": { ... }
  },
  "requestId": "req_123456789"
}
```

**Error Codes:**
- `VALIDATION_ERROR`: Invalid input data
- `AUTHENTICATION_ERROR`: Invalid credentials
- `AUTHORIZATION_ERROR`: Insufficient permissions
- `RATE_LIMIT_ERROR`: Too many requests
- `EXTERNAL_API_ERROR`: eBay API issues
- `DATABASE_ERROR`: Database connection issues

---

## Support and Escalation

**Internal Support:**
- Development Team: dev@company.com
- DevOps Team: devops@company.com
- Security Team: security@company.com

**External Support:**
- Netlify Support: https://support.netlify.com
- Supabase Support: https://supabase.com/support
- eBay Developer Support: https://developer.ebay.com/support

**Emergency Procedures:**
1. Assess severity (P0: Critical, P1: High, P2: Medium, P3: Low)
2. Contact appropriate team
3. Create incident ticket
4. Notify stakeholders
5. Implement immediate fixes
6. Conduct post-mortem

---

*Last updated: [Current Date]*
*Version: 1.0.0*