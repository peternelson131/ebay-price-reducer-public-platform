# Phase 3: eBay API Integration and Authentication

## 🎯 Goal
Set up eBay Developer account, configure API credentials, and establish secure connections to eBay's Trading and Shopping APIs.

---

## 📋 **Step-by-Step Implementation**

### Step 1: Create eBay Developer Account (20 minutes)

1. **Go to [developer.ebay.com](https://developer.ebay.com)**
2. **Click "Join"** to create developer account
3. **Fill out registration**:
   - Use your existing eBay account or create new one
   - Provide business/personal details
   - Accept developer agreement
4. **Verify your email** and complete setup
5. **Complete developer profile**:
   - Add company/personal information
   - Select your development goals
   - Choose APIs you'll use: "Trading API" and "Shopping API"

### Step 2: Create Application Keyset (15 minutes)

1. **Go to "My Account" > "Application Keysets"**
2. **Click "Create a Keyset"**
3. **Fill in application details**:
   - **Application Title**: `eBay Price Reducer`
   - **Application Type**: `Server-side`
   - **Platform**: `Web Application`
   - **Description**: `Automated price reduction tool for eBay sellers`
   - **Primary Contact**: Your email
4. **Choose Environment**: Start with `Sandbox` for testing
5. **Select APIs**:
   - ✅ Trading API (for listing management)
   - ✅ Shopping API (for market research)
   - ✅ OAuth API (for authentication)
6. **Submit application** and wait for approval (usually instant)

### Step 3: Get Your API Credentials (10 minutes)

Once approved, you'll get these credentials:

```
App ID (Client ID): YourApp-YourName-SBX-1234567890-abcdefgh
Dev ID: 12345678-1234-1234-1234-123456789012
Cert ID (Client Secret): SBX-1234567890abcdef-ghijklmn-opqrstuv-wxyzabcd
```

**Copy and save these securely!**

### Step 4: Configure OAuth Redirect URLs (10 minutes)

1. **In your keyset settings**, find "OAuth redirect URIs"
2. **Add these URLs**:
   ```
   Development: http://localhost:3000/auth/ebay/callback
   Production: https://yourdomain.com/auth/ebay/callback
   ```
3. **Save settings**

### Step 5: Generate User Access Token (15 minutes)

1. **Go to "User Tokens" in developer console**
2. **Click "Generate User Token"**
3. **Select scopes**:
   ```
   https://api.ebay.com/oauth/api_scope/sell.item
   https://api.ebay.com/oauth/api_scope/sell.item.draft
   ```
4. **Complete OAuth flow**:
   - Login with your eBay seller account
   - Grant permissions to your app
   - Copy the generated token
5. **Save token securely** (expires in 2 hours for sandbox, longer for production)

### Step 6: Test API Connection (15 minutes)

Let's test the connection with a simple API call:

1. **Create test file** `test-ebay-connection.js`:
   ```javascript
   const axios = require('axios');

   const testEbayConnection = async () => {
     try {
       const response = await axios.get('https://api.sandbox.ebay.com/ws/api.dll', {
         headers: {
           'X-EBAY-API-SITEID': '0',
           'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
           'X-EBAY-API-CALL-NAME': 'GeteBayOfficialTime',
           'X-EBAY-API-APP-NAME': 'your-app-id',
           'X-EBAY-API-DEV-NAME': 'your-dev-id',
           'X-EBAY-API-CERT-NAME': 'your-cert-id',
           'Content-Type': 'text/xml'
         },
         data: `<?xml version="1.0" encoding="utf-8"?>
           <GeteBayOfficialTimeRequest xmlns="urn:ebay:apis:eBLBaseComponents">
             <RequesterCredentials>
               <eBayAuthToken>your-user-token</eBayAuthToken>
             </RequesterCredentials>
           </GeteBayOfficialTimeRequest>`
       });

       console.log('eBay API Connection Successful!');
       console.log('Response:', response.data);
     } catch (error) {
       console.error('eBay API Connection Failed:', error.message);
     }
   };

   testEbayConnection();
   ```

2. **Replace placeholders** with your actual credentials
3. **Run test**: `node test-ebay-connection.js`
4. **Should see successful response** with eBay official time

### Step 7: Update Environment Variables (5 minutes)

Add eBay credentials to your `.env` file:

```env
# eBay API Configuration
EBAY_APP_ID=YourApp-YourName-SBX-1234567890-abcdefgh
EBAY_DEV_ID=12345678-1234-1234-1234-123456789012
EBAY_CERT_ID=SBX-1234567890abcdef-ghijklmn-opqrstuv-wxyzabcd
EBAY_USER_TOKEN=your_generated_user_token_here
EBAY_ENVIRONMENT=sandbox
EBAY_SITE_ID=0
EBAY_API_VERSION=967
```

### Step 8: Create eBay API Client Utility (20 minutes)

Create `netlify/functions/utils/ebay-client.js`:

```javascript
const axios = require('axios');
const xml2js = require('xml2js');

class EbayClient {
  constructor() {
    this.appId = process.env.EBAY_APP_ID;
    this.devId = process.env.EBAY_DEV_ID;
    this.certId = process.env.EBAY_CERT_ID;
    this.userToken = process.env.EBAY_USER_TOKEN;
    this.environment = process.env.EBAY_ENVIRONMENT || 'sandbox';
    this.siteId = process.env.EBAY_SITE_ID || '0';
    this.apiVersion = process.env.EBAY_API_VERSION || '967';

    this.baseUrl = this.environment === 'sandbox'
      ? 'https://api.sandbox.ebay.com/ws/api.dll'
      : 'https://api.ebay.com/ws/api.dll';
  }

  async makeRequest(callName, requestBody) {
    const xmlRequest = this.buildXmlRequest(callName, requestBody);

    try {
      const response = await axios.post(this.baseUrl, xmlRequest, {
        headers: {
          'X-EBAY-API-SITEID': this.siteId,
          'X-EBAY-API-COMPATIBILITY-LEVEL': this.apiVersion,
          'X-EBAY-API-CALL-NAME': callName,
          'X-EBAY-API-APP-NAME': this.appId,
          'X-EBAY-API-DEV-NAME': this.devId,
          'X-EBAY-API-CERT-NAME': this.certId,
          'Content-Type': 'text/xml'
        }
      });

      return await this.parseXmlResponse(response.data);
    } catch (error) {
      throw new Error(`eBay API Error: ${error.message}`);
    }
  }

  buildXmlRequest(callName, requestBody) {
    return `<?xml version="1.0" encoding="utf-8"?>
      <${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          <eBayAuthToken>${this.userToken}</eBayAuthToken>
        </RequesterCredentials>
        ${requestBody}
      </${callName}Request>`;
  }

  async parseXmlResponse(xmlData) {
    const parser = new xml2js.Parser();
    return await parser.parseStringPromise(xmlData);
  }

  // Specific API methods
  async getMyeBaySelling() {
    const requestBody = `
      <ActiveList>
        <Include>true</Include>
        <Pagination>
          <EntriesPerPage>100</EntriesPerPage>
          <PageNumber>1</PageNumber>
        </Pagination>
      </ActiveList>
    `;
    return await this.makeRequest('GetMyeBaySelling', requestBody);
  }

  async getItem(itemId) {
    const requestBody = `<ItemID>${itemId}</ItemID>`;
    return await this.makeRequest('GetItem', requestBody);
  }

  async reviseItem(itemId, newPrice) {
    const requestBody = `
      <Item>
        <ItemID>${itemId}</ItemID>
        <StartPrice>${newPrice}</StartPrice>
      </Item>
    `;
    return await this.makeRequest('ReviseItem', requestBody);
  }
}

module.exports = EbayClient;
```

### Step 9: Test eBay Integration (10 minutes)

Create `test-ebay-integration.js`:

```javascript
const EbayClient = require('./netlify/functions/utils/ebay-client');

const testIntegration = async () => {
  try {
    const ebay = new EbayClient();

    // Test getting seller's active listings
    console.log('Testing GetMyeBaySelling...');
    const listings = await ebay.getMyeBaySelling();
    console.log('Success! Found listings:', JSON.stringify(listings, null, 2));

  } catch (error) {
    console.error('Integration test failed:', error.message);
  }
};

testIntegration();
```

Run: `node test-ebay-integration.js`

---

## ✅ **Phase 3 Success Criteria**

Before moving to Phase 4, verify:

### eBay Developer Setup ✅
- [ ] Developer account created and verified
- [ ] Application keyset generated
- [ ] API credentials obtained (App ID, Dev ID, Cert ID)
- [ ] OAuth redirect URLs configured
- [ ] User access token generated

### API Integration ✅
- [ ] Environment variables configured
- [ ] eBay API client utility created
- [ ] Connection test successful
- [ ] Can retrieve seller's listings
- [ ] Error handling implemented

### Security ✅
- [ ] API credentials secured in environment variables
- [ ] User tokens properly managed
- [ ] Sandbox environment working
- [ ] Ready for production environment switch

---

## 🚨 **Common Issues & Solutions**

### Issue: "Invalid App ID"
**Solution**:
- Verify App ID is correct in .env
- Make sure you're using sandbox credentials for sandbox environment

### Issue: "Authentication token invalid"
**Solution**:
- Regenerate user token (they expire)
- Ensure token has correct scopes
- Check eBay account permissions

### Issue: "API call limit exceeded"
**Solution**:
- eBay has daily limits (5000 calls/day for sandbox)
- Implement rate limiting in your code
- Cache responses when possible

### Issue: "XML parsing errors"
**Solution**:
- Check XML structure in requests
- Verify special characters are escaped
- Use xml2js library for parsing

---

## 📊 **API Quotas & Limits**

### Sandbox Environment
- **Daily API calls**: 5,000
- **Rate limit**: 4 calls/second
- **Token validity**: 2 hours
- **Best for**: Development and testing

### Production Environment
- **Daily API calls**: 5,000 (can request increase)
- **Rate limit**: 4 calls/second
- **Token validity**: 18 months
- **Best for**: Live application

---

## 🔐 **Security Best Practices**

1. **Never expose credentials** in frontend code
2. **Use environment variables** for all secrets
3. **Rotate tokens regularly** (especially user tokens)
4. **Implement proper error handling** (don't leak credentials in errors)
5. **Use HTTPS** for all API calls
6. **Monitor API usage** to prevent quota exhaustion

---

## 📚 **Useful eBay API Resources**

- **Trading API Reference**: [developer.ebay.com/api-docs/trading](https://developer.ebay.com/api-docs/trading)
- **OAuth Guide**: [developer.ebay.com/api-docs/static/oauth](https://developer.ebay.com/api-docs/static/oauth)
- **Error Codes**: [developer.ebay.com/api-docs/trading/api-reference](https://developer.ebay.com/api-docs/trading/api-reference)
- **Rate Limits**: [developer.ebay.com/support/kb/article/3885](https://developer.ebay.com/support/kb/article/3885)

---

## ⏭️ **Next: Phase 4 - Core Backend Services**

Once Phase 3 is complete, you'll have:
- ✅ Working eBay API integration
- ✅ Secure credential management
- ✅ Ability to fetch and modify listings
- ✅ Foundation for automated price management

**Ready for Phase 4: Building the core backend functions!** 🚀