require('dotenv').config();
const EbayClient = require('./netlify/functions/utils/ebay-client');

async function testEbayIntegration() {
  console.log('🚀 Testing eBay API Integration...\n');

  try {
    // Initialize eBay client
    const ebayClient = new EbayClient();
    console.log('✅ eBay Client initialized successfully');

    // Display environment info
    const envInfo = ebayClient.getEnvironmentInfo();
    console.log('\n📊 Environment Info:');
    console.log('- Environment:', envInfo.environment);
    console.log('- Base URL:', envInfo.baseUrl);
    console.log('- Site ID:', envInfo.siteId);
    console.log('- API Version:', envInfo.apiVersion);
    console.log('- Has User Token:', envInfo.hasUserToken);

    // Test connection
    console.log('\n🔌 Testing API Connection...');
    const connectionResult = await ebayClient.testConnection();

    if (connectionResult.success) {
      console.log('✅ Connection test successful!');
      console.log('- eBay Official Time:', connectionResult.timestamp);
      console.log('- Environment:', connectionResult.environment);
    } else {
      console.log('❌ Connection test failed:');
      console.log('- Error:', connectionResult.error);
      return;
    }

    // Test getting listings (this might fail without proper user token)
    console.log('\n📋 Testing Get Listings...');
    try {
      const listings = await ebayClient.getMyeBaySelling(1, 5);
      console.log('✅ Listings retrieved successfully!');

      if (listings.ActiveList && listings.ActiveList.ItemArray) {
        console.log('- Found listings:', listings.ActiveList.PaginationResult.TotalNumberOfEntries);
      } else {
        console.log('- No active listings found');
      }
    } catch (listingError) {
      console.log('⚠️  Listings test failed (this is expected without proper user token):');
      console.log('- Error:', listingError.message);
    }

    console.log('\n🎉 eBay API Integration test completed!');
    console.log('\n📝 Next Steps:');
    console.log('1. Set up eBay Developer Account');
    console.log('2. Generate API credentials');
    console.log('3. Create user access token');
    console.log('4. Update .env file with credentials');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check that .env file exists with eBay credentials');
    console.log('2. Verify API credentials are correct');
    console.log('3. Ensure environment is set to "sandbox" for testing');
  }
}

// Run the test
testEbayIntegration();