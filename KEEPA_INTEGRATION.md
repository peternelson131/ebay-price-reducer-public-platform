# Keepa Integration Setup Guide

## Overview
This application now includes comprehensive Keepa API integration for Amazon market data analysis, price tracking, and competitive pricing intelligence. The integration is designed with security, performance, and scalability in mind.

## Features Implemented

### 🔐 Security Features
- **AES-256 Encryption**: All API keys are encrypted before storage
- **Secure Key Management**: API keys never transmitted in plain text
- **Row-Level Security**: Database enforces user data isolation
- **Rate Limiting**: Prevents API abuse and manages costs
- **Token Tracking**: Monitors API usage to prevent overages

### 📊 Core Functionality
- **Product Data Retrieval**: Get comprehensive Amazon product information
- **Price History Analysis**: Track historical price trends
- **Competitor Monitoring**: Batch analyze up to 100 competitor products
- **Best Sellers Tracking**: Monitor category best sellers
- **Price Alerts**: Create automated price drop notifications
- **Market Analysis**: Get pricing recommendations based on market data

### ⚡ Performance Optimizations
- **5-Minute Cache**: Reduces redundant API calls
- **Batch Operations**: Process multiple products in single requests
- **Async Processing**: Non-blocking API operations
- **Connection Pooling**: Efficient database connections

## Setup Instructions

### 1. Database Migration
Run the Supabase migration to create required tables:

```sql
-- Execute in Supabase SQL Editor
-- File: backend/src/database/migrations/003_add_keepa_integration.sql
```

### 2. Environment Configuration

Create a `.env` file in the backend directory with:

```bash
# Generate encryption key
openssl rand -hex 32

# Add to .env
ENCRYPTION_KEY=your-generated-32-byte-hex-key
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-supabase-service-key
```

### 3. Install Dependencies

```bash
# Backend
cd backend
npm install axios @supabase/supabase-js crypto

# Frontend
cd frontend
npm install
```

### 4. Start Services

```bash
# Backend
npm run dev

# Frontend
npm run dev
```

## API Endpoints

### Authentication Required
All Keepa endpoints require Bearer token authentication.

### Available Endpoints

#### Save API Key
```http
POST /api/keepa/api-key
Content-Type: application/json
Authorization: Bearer <token>

{
  "apiKey": "your-keepa-api-key"
}
```

#### Test Connection
```http
GET /api/keepa/test-connection
Authorization: Bearer <token>
```

#### Get Product Data
```http
GET /api/keepa/product/:asin?domain=com
Authorization: Bearer <token>
```

#### Search Products
```http
GET /api/keepa/search?q=query&domain=com&page=0
Authorization: Bearer <token>
```

#### Get Pricing Recommendations
```http
GET /api/keepa/pricing-recommendation/:asin?domain=com
Authorization: Bearer <token>
```

#### Monitor Competitors
```http
POST /api/keepa/monitor-competitors
Content-Type: application/json
Authorization: Bearer <token>

{
  "asins": ["B001234567", "B007654321"],
  "domain": "com"
}
```

#### Create Price Tracker
```http
POST /api/keepa/price-tracker
Content-Type: application/json
Authorization: Bearer <token>

{
  "asin": "B001234567",
  "targetPrice": 29.99,
  "domain": "com"
}
```

#### Get Usage Statistics
```http
GET /api/keepa/usage-stats
Authorization: Bearer <token>
```

## Frontend Integration

### Using the Keepa Service

```javascript
import keepaApi from '../services/keepaApi';

// Save API key
const result = await keepaApi.saveApiKey('your-api-key');

// Test connection
const status = await keepaApi.testConnection();

// Get product data
const product = await keepaApi.getProduct('B001234567');

// Get pricing recommendations
const recommendations = await keepaApi.getPricingRecommendations('B001234567');

// Monitor competitors
const analysis = await keepaApi.monitorCompetitors(['B001', 'B002']);

// Find Amazon equivalent for eBay listing
const matches = await keepaApi.findAmazonEquivalent('iPhone 13 Pro Max 256GB');
```

## Security Considerations

### API Key Storage
- Keys are encrypted using AES-256-CBC before database storage
- Encryption keys should be rotated periodically
- Never commit encryption keys to version control

### Rate Limiting
- 10 requests per second maximum per user
- Token-based usage tracking
- Automatic retry with exponential backoff

### Access Control
- Row-level security in database
- User-specific API key isolation
- Audit logging for all API usage

## Performance Metrics

### Cache Strategy
- 5-minute TTL for product data
- Automatic cache invalidation on updates
- Memory-based caching for speed

### Batch Operations
- Up to 100 products per batch request
- Automatic chunking for larger datasets
- Parallel processing where possible

## Cost Management

### Token Usage
- Product lookup: 2 tokens
- Search: 2 tokens
- Batch operations: 1 token per 10 items
- Price tracking: 1 token per tracker

### Monitoring
- Real-time token balance tracking
- Daily usage reports
- Automatic alerts for low balance

## Error Handling

### Common Errors

#### Invalid API Key
```json
{
  "success": false,
  "message": "Invalid Keepa API key",
  "error": "INVALID_API_KEY"
}
```

#### Insufficient Tokens
```json
{
  "success": false,
  "message": "Insufficient Keepa API tokens",
  "error": "INSUFFICIENT_TOKENS"
}
```

#### Rate Limit Exceeded
```json
{
  "success": false,
  "message": "Rate limit exceeded",
  "error": "RATE_LIMIT_EXCEEDED"
}
```

## Testing

### Test the Integration

1. **Save API Key**
   - Go to Account > Integrations > Keepa
   - Enter your API key
   - Click "Save API Key"

2. **Test Connection**
   - Click "Test Connection"
   - Verify tokens remaining

3. **Test Product Lookup**
   ```bash
   curl -X GET "http://localhost:3001/api/keepa/product/B08N5WRWNW" \
     -H "Authorization: Bearer your-token"
   ```

## Troubleshooting

### API Key Not Saving
- Check Supabase connection
- Verify encryption key is set
- Check user permissions

### Connection Tests Failing
- Verify API key is valid
- Check token balance
- Review rate limiting

### No Data Returned
- Check cache settings
- Verify product ASIN
- Check domain parameter

## Future Enhancements

- [ ] Webhook support for price alerts
- [ ] Advanced analytics dashboard
- [ ] Bulk import/export functionality
- [ ] Machine learning price predictions
- [ ] Automated repricing strategies
- [ ] Multi-marketplace synchronization

## Support

For issues or questions about the Keepa integration:
1. Check the error logs in `/backend/logs/`
2. Review API usage in Account > Integrations
3. Contact support with your user ID and timestamp

## License

This integration is proprietary and confidential. Do not share API keys or implementation details.