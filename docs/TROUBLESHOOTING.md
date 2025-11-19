# eBay Price Reducer - Troubleshooting Guide

This guide helps resolve common technical issues and provides solutions for frequently encountered problems.

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Authentication Issues](#authentication-issues)
3. [eBay Integration Problems](#ebay-integration-problems)
4. [Database Connection Issues](#database-connection-issues)
5. [Performance Problems](#performance-problems)
6. [UI and Frontend Issues](#ui-and-frontend-issues)
7. [Error Code Reference](#error-code-reference)
8. [Contact Support](#contact-support)

## Quick Diagnostics

### System Health Check

Run these commands to quickly diagnose system health:

```bash
# Check application health
curl https://your-app.netlify.app/.netlify/functions/health

# Check specific components
curl https://your-app.netlify.app/.netlify/functions/health | jq '.checks'

# Test eBay connection
curl https://your-app.netlify.app/.netlify/functions/test-ebay-connection

# View recent errors
curl "https://your-app.netlify.app/.netlify/functions/analytics?metric=errors&timeframe=1d"
```

### Browser-Based Diagnostics

1. **Open Developer Tools** (F12)
2. **Check Console**: Look for JavaScript errors
3. **Check Network Tab**: Look for failed requests
4. **Clear Cache**: Hard refresh (Ctrl+Shift+R)
5. **Check Local Storage**: Verify authentication tokens

## Authentication Issues

### "Login Failed" or "Invalid Credentials"

**Symptoms:**
- Unable to log in with correct credentials
- "Authentication failed" error message
- Redirected back to login page

**Diagnosis:**
```javascript
// Check in browser console
localStorage.getItem('supabase.auth.token')

// Check network tab for auth requests
// Look for 401 or 403 responses
```

**Solutions:**

1. **Clear Browser Data:**
   ```javascript
   // In browser console
   localStorage.clear();
   sessionStorage.clear();
   // Then refresh page
   ```

2. **Verify Account Status:**
   - Check email for verification links
   - Ensure account is not suspended
   - Try password reset if necessary

3. **Check Environment:**
   ```bash
   # Verify Supabase configuration
   curl -H "apikey: YOUR_ANON_KEY" \
        -H "Authorization: Bearer YOUR_ANON_KEY" \
        https://YOUR_PROJECT_ID.supabase.co/rest/v1/
   ```

### "Session Expired" Errors

**Symptoms:**
- Randomly logged out
- "Please log in again" messages
- API calls returning 401 errors

**Solutions:**

1. **Check Token Refresh:**
   ```javascript
   // In browser console - check token expiry
   const token = localStorage.getItem('supabase.auth.token');
   if (token) {
     const payload = JSON.parse(atob(token.split('.')[1]));
     console.log('Token expires:', new Date(payload.exp * 1000));
   }
   ```

2. **Refresh Authentication:**
   - Log out and log back in
   - Clear browser cache
   - Check for clock synchronization issues

### "Account Verification Required"

**Symptoms:**
- Cannot access certain features
- Email verification prompts
- Limited functionality

**Solutions:**

1. **Resend Verification Email:**
   - Go to login page
   - Click "Resend verification"
   - Check spam folder

2. **Manual Verification (Admin Only):**
   ```sql
   -- In Supabase SQL editor
   UPDATE auth.users
   SET email_confirmed_at = NOW()
   WHERE email = 'user@example.com';
   ```

## eBay Integration Problems

### "eBay Connection Failed"

**Symptoms:**
- Cannot connect eBay account
- "Authorization failed" messages
- eBay API errors

**Diagnosis:**
```bash
# Check eBay API status
curl "https://api.ebay.com/ws/api.dll" \
  -H "X-EBAY-API-SITEID: 0" \
  -H "X-EBAY-API-COMPATIBILITY-LEVEL: 967" \
  -H "X-EBAY-API-CALL-NAME: GeteBayOfficialTime"

# Test your eBay credentials
curl https://your-app.netlify.app/.netlify/functions/test-ebay-connection
```

**Solutions:**

1. **Verify eBay Credentials:**
   - Check eBay Developer Console
   - Ensure tokens are not expired
   - Verify sandbox vs production environment

2. **Regenerate eBay Tokens:**
   - Go to eBay Developer Console
   - Generate new user token
   - Update environment variables

3. **Check eBay API Limits:**
   ```bash
   # Check current usage
   curl "https://api.ebay.com/ws/api.dll" \
     -H "X-EBAY-API-CALL-NAME: GetApiAccessRules"
   ```

### "Listing Update Failed"

**Symptoms:**
- Price changes not applied
- "Update failed" error messages
- Listings show old prices

**Common Causes:**
- eBay listing policies violated
- Price too low/high for category
- Listing ended or suspended
- API rate limits exceeded

**Solutions:**

1. **Check Listing Status:**
   ```bash
   # Get listing details
   curl https://your-app.netlify.app/.netlify/functions/listings/ITEM_ID
   ```

2. **Verify Price Constraints:**
   - Check eBay category requirements
   - Ensure price is within allowed range
   - Verify listing format allows price changes

3. **Review Rate Limits:**
   - Check error logs for rate limit messages
   - Reduce update frequency
   - Implement exponential backoff

### "Token Expired" Errors

**Symptoms:**
- Sudden loss of eBay connectivity
- "Invalid token" error messages
- 401 responses from eBay API

**Solutions:**

1. **Check Token Expiry:**
   ```bash
   # Decode eBay token (if JWT format)
   echo "YOUR_TOKEN" | base64 -d
   ```

2. **Refresh eBay Token:**
   - Use eBay token refresh endpoint
   - Update environment variables
   - Restart application functions

## Database Connection Issues

### "Database Connection Timeout"

**Symptoms:**
- Slow page loads
- "Connection timeout" errors
- 500 server errors

**Diagnosis:**
```bash
# Check database health
curl https://your-app.netlify.app/.netlify/functions/health | jq '.checks.database'

# Test direct connection (admin only)
psql -h YOUR_HOST -U postgres -d YOUR_DB -c "SELECT NOW();"
```

**Solutions:**

1. **Check Supabase Status:**
   - Visit https://status.supabase.com
   - Check for ongoing incidents
   - Review maintenance windows

2. **Optimize Queries:**
   ```sql
   -- Check slow queries
   SELECT query, mean_time, calls
   FROM pg_stat_statements
   ORDER BY mean_time DESC
   LIMIT 10;

   -- Check active connections
   SELECT count(*) FROM pg_stat_activity;
   ```

3. **Connection Pool Management:**
   - Reduce concurrent connections
   - Implement connection pooling
   - Check for connection leaks

### "Database Locked" or "Constraint Violation"

**Symptoms:**
- Data update failures
- "Row locked" error messages
- Constraint violation errors

**Solutions:**

1. **Check for Blocking Queries:**
   ```sql
   SELECT
     blocked_locks.pid AS blocked_pid,
     blocked_activity.usename AS blocked_user,
     blocking_locks.pid AS blocking_pid,
     blocking_activity.usename AS blocking_user,
     blocked_activity.query AS blocked_statement
   FROM pg_catalog.pg_locks blocked_locks
   JOIN pg_catalog.pg_stat_activity blocked_activity
     ON blocked_activity.pid = blocked_locks.pid
   JOIN pg_catalog.pg_locks blocking_locks
     ON blocking_locks.locktype = blocked_locks.locktype;
   ```

2. **Resolve Data Conflicts:**
   - Check for duplicate data
   - Verify foreign key constraints
   - Review data validation rules

### "Migration Failed" Errors

**Symptoms:**
- Database schema errors
- Missing tables or columns
- Version mismatch errors

**Solutions:**

1. **Check Migration Status:**
   ```sql
   -- Check migration history
   SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;
   ```

2. **Manual Schema Fix:**
   ```sql
   -- Re-run specific migrations
   -- Use the SQL from DATABASE-SETUP-GUIDE.md
   ```

## Performance Problems

### "Slow Page Load Times"

**Symptoms:**
- Pages take >3 seconds to load
- Spinner shows for extended time
- User reports slow performance

**Diagnosis:**
```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://your-app.netlify.app/

# Where curl-format.txt contains:
#     time_namelookup:  %{time_namelookup}\n
#     time_connect:     %{time_connect}\n
#     time_appconnect:  %{time_appconnect}\n
#     time_pretransfer: %{time_pretransfer}\n
#     time_redirect:    %{time_redirect}\n
#     time_starttransfer: %{time_starttransfer}\n
#     ----------\n
#     time_total:       %{time_total}\n
```

**Solutions:**

1. **Frontend Optimization:**
   - Enable browser caching
   - Minimize bundle size
   - Implement lazy loading
   - Use CDN for static assets

2. **Backend Optimization:**
   - Add database indexes
   - Implement result caching
   - Optimize SQL queries
   - Reduce API call frequency

3. **Network Optimization:**
   - Enable compression
   - Use HTTP/2
   - Optimize images
   - Minimize HTTP requests

### "High Memory Usage"

**Symptoms:**
- Function timeout errors
- Out of memory errors
- Slow garbage collection

**Solutions:**

1. **Memory Profiling:**
   ```javascript
   // Add to function for monitoring
   console.log('Memory usage:', process.memoryUsage());
   ```

2. **Optimization Strategies:**
   - Implement streaming for large datasets
   - Use pagination for queries
   - Clear unnecessary variables
   - Optimize object creation

### "Rate Limit Exceeded"

**Symptoms:**
- "Too many requests" errors
- API calls being rejected
- Temporary service unavailability

**Solutions:**

1. **Implement Backoff:**
   ```javascript
   async function withRetry(fn, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await fn();
       } catch (error) {
         if (error.status === 429 && i < maxRetries - 1) {
           await new Promise(resolve =>
             setTimeout(resolve, Math.pow(2, i) * 1000)
           );
           continue;
         }
         throw error;
       }
     }
   }
   ```

2. **Rate Limit Monitoring:**
   ```bash
   # Check current rate limit status
   curl -I https://your-app.netlify.app/.netlify/functions/listings
   # Look for X-RateLimit-* headers
   ```

## UI and Frontend Issues

### "White Screen" or "Application Won't Load"

**Symptoms:**
- Blank page displayed
- JavaScript errors in console
- "Failed to load resource" errors

**Diagnosis:**
1. Check browser console for errors
2. Check network tab for failed requests
3. Verify JavaScript is enabled
4. Check for ad blockers

**Solutions:**

1. **Clear Browser Cache:**
   ```javascript
   // Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   // Or clear cache manually in developer tools
   ```

2. **Check for JavaScript Errors:**
   - Look for syntax errors
   - Check for missing dependencies
   - Verify environment variables

3. **Disable Browser Extensions:**
   - Try incognito/private mode
   - Disable ad blockers
   - Check for conflicting extensions

### "Styles Not Loading" or "Layout Broken"

**Symptoms:**
- Unstyled content
- Broken layout
- Missing CSS

**Solutions:**

1. **Check CSS Loading:**
   ```bash
   # Verify CSS files are accessible
   curl -I https://your-app.netlify.app/assets/style.css
   ```

2. **Clear Style Cache:**
   - Hard refresh browser
   - Clear browser cache
   - Check for CSS syntax errors

### "Form Submission Fails"

**Symptoms:**
- Forms don't submit
- "Validation error" messages
- Data not saving

**Solutions:**

1. **Check Form Validation:**
   ```javascript
   // In browser console - check form data
   const form = document.querySelector('form');
   const formData = new FormData(form);
   for (let [key, value] of formData.entries()) {
     console.log(key, value);
   }
   ```

2. **Verify API Endpoints:**
   ```bash
   # Test form submission endpoint
   curl -X POST https://your-app.netlify.app/.netlify/functions/submit-form \
        -H "Content-Type: application/json" \
        -d '{"test": "data"}'
   ```

## Error Code Reference

### Application Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| AUTH_001 | Invalid credentials | Check username/password |
| AUTH_002 | Session expired | Log in again |
| AUTH_003 | Account not verified | Check email verification |
| EBAY_001 | eBay API connection failed | Check eBay credentials |
| EBAY_002 | eBay token expired | Refresh eBay token |
| EBAY_003 | eBay rate limit exceeded | Reduce API calls |
| DB_001 | Database connection timeout | Check database status |
| DB_002 | Query execution failed | Review query syntax |
| DB_003 | Constraint violation | Check data validation |
| API_001 | Rate limit exceeded | Implement backoff |
| API_002 | Invalid request format | Check API documentation |
| API_003 | Server timeout | Retry request |

### HTTP Status Codes

| Status | Meaning | Common Causes |
|--------|---------|---------------|
| 400 | Bad Request | Invalid input data |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |
| 502 | Bad Gateway | Upstream service error |
| 503 | Service Unavailable | Maintenance mode |
| 504 | Gateway Timeout | Upstream timeout |

## Contact Support

### Before Contacting Support

1. **Gather Information:**
   - Error messages (exact text)
   - Steps to reproduce
   - Browser and version
   - Time when error occurred
   - User account details

2. **Try Basic Solutions:**
   - Clear browser cache
   - Try different browser
   - Check internet connection
   - Restart browser

3. **Check System Status:**
   - Visit status pages for dependencies
   - Check known issues documentation
   - Review recent announcements

### Support Channels

**Self-Service:**
- Documentation: `/docs/`
- Knowledge Base: In-app help section
- Video Tutorials: Link to tutorial library

**Direct Support:**
- **Email**: support@ebaypriceReducer.com
- **Live Chat**: Available in application (business hours)
- **Phone**: +1-555-0123 (emergencies only)

**Developer Support:**
- **GitHub Issues**: For bug reports and feature requests
- **Developer Forum**: Community discussions
- **API Documentation**: Technical integration help

### Support Priority Levels

**P0 - Critical (Response: 1 hour)**
- Application completely down
- Security incidents
- Data loss

**P1 - High (Response: 4 hours)**
- Core features not working
- eBay integration failures
- Performance severely degraded

**P2 - Medium (Response: 24 hours)**
- Minor feature issues
- UI/UX problems
- Non-critical errors

**P3 - Low (Response: 48 hours)**
- Feature requests
- General questions
- Documentation updates

### Emergency Escalation

**For Critical Issues:**
1. Call emergency hotline: +1-555-0199
2. Email: emergency@ebaypriceReducer.com
3. Include "URGENT" in subject line
4. Provide detailed incident description

---

*Last updated: [Current Date]*
*Version: 1.0.0*