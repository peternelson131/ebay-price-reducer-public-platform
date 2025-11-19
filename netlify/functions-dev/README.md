# Development & Testing Functions

These functions are excluded from production deployment and are only for local testing.

## Available Functions

### Test Functions
- `test-ebay-token.js` - Test eBay token validation
- `test-ebay-connection.js` - Test eBay API connectivity
- `test-oauth-flow.js` - Test complete OAuth flow
- `test-oauth-callback.js` - Test OAuth callback handling
- `test-save-credentials.js` - Test credential saving
- `test-disconnect.js` - Test eBay account disconnection
- `test-function.js` - General function testing

### Debug Functions
- `debug-ebay-oauth.js` - Debug OAuth issues
- `debug-ebay-connection.js` - Debug eBay connection problems

### Utility Functions
- `check-stored-token.js` - Verify token storage in database
- `fix-ebay-token.js` - Manual token repair utility

## Usage

To test locally:
```bash
netlify dev
curl http://localhost:8888/.netlify/functions/test-ebay-connection
```

Or open in browser:
```
http://localhost:8888/.netlify/functions/test-function
```

## Security Note

These functions should NEVER be deployed to production as they may:
- Expose sensitive configuration
- Bypass authentication
- Provide debugging information
- Allow unauthorized access to user data

## Deployment Protection

These functions are excluded from production deployment via `netlify.toml`:
```toml
[functions]
  directory = "netlify/functions"
  excluded_patterns = ["**/functions-dev/**"]
```

This ensures that even if accidentally committed, they will not be deployed to production.

## Local Development Only

To run these functions:
1. Start local Netlify dev server: `netlify dev`
2. Access functions at: `http://localhost:8888/.netlify/functions/<function-name>`
3. Check console logs for debugging output

## Adding New Test Functions

When creating new test/debug functions:
1. Create the file in this directory (`netlify/functions-dev/`)
2. Follow the same pattern as existing test functions
3. Add authentication bypass for testing if needed
4. Document the function in this README
5. Never reference test functions from production code
