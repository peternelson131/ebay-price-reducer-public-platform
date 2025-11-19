const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { EnhancedEbayClient } = require('./utils/enhanced-ebay-client');
const { CompetitivePricingService } = require('./utils/competitive-pricing-service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Analyze competitive pricing for listings that haven't been analyzed yet
 */
exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Authentication required' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid authentication' })
      };
    }

    console.log(`Starting competitive pricing analysis for user ${user.id}`);

    // Get user's eBay app credentials and seller ID
    const { data: userData } = await supabase
      .from('users')
      .select('ebay_user_id, ebay_app_id, ebay_cert_id_encrypted')
      .eq('id', user.id)
      .single();

    const userEbaySellerId = userData?.ebay_user_id;
    const appId = userData?.ebay_app_id;

    // Decrypt cert ID
    let certId = null;
    if (userData?.ebay_cert_id_encrypted) {
      const { decrypt } = require('./utils/ebay-oauth-helpers');
      certId = decrypt(userData.ebay_cert_id_encrypted);
    }

    if (!appId || !certId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'eBay app credentials not found. Please save your eBay credentials first.'
        })
      };
    }

    // Get listings that need analysis
    const { data: listingsToAnalyze, error: fetchError } = await supabase
      .from('listings')
      .select('*')
      .eq('user_id', user.id)
      .eq('price_analysis_completed', false)
      .limit(20); // Process in batches to avoid rate limits

    if (fetchError) {
      throw new Error(`Failed to fetch listings: ${fetchError.message}`);
    }

    if (!listingsToAnalyze || listingsToAnalyze.length === 0) {
      console.log('No listings to analyze');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No listings to analyze',
          analyzed: 0
        })
      };
    }

    console.log(`Found ${listingsToAnalyze.length} listings to analyze`);

    // Initialize pricing service with app credentials
    const pricingService = new CompetitivePricingService(
      appId,
      certId,
      userEbaySellerId
    );

    let analyzedCount = 0;
    let errorCount = 0;

    // Analyze each listing
    for (const listing of listingsToAnalyze) {
      try {
        console.log(`Analyzing listing: ${listing.sku || listing.ebay_item_id} - ${listing.title}`);

        const analysis = await pricingService.analyzeListingPricing(listing);

        // Update listing in database
        const { error: updateError } = await supabase
          .from('listings')
          .update({
            market_average_price: analysis.suggestedAvgPrice,
            market_lowest_price: analysis.suggestedMinPrice,
            market_highest_price: analysis.marketHighestPrice,
            market_competitor_count: analysis.competitorCount,
            price_match_tier: analysis.matchTier,
            last_market_analysis: new Date().toISOString(),
            price_analysis_completed: true
          })
          .eq('id', listing.id);

        if (updateError) {
          console.error(`Failed to update listing ${listing.id}:`, updateError);
          errorCount++;
        } else {
          analyzedCount++;
          console.log(`✓ Successfully analyzed listing ${listing.id}`);
        }

        // Rate limiting: 200ms delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`Error analyzing listing ${listing.id}:`, error);
        errorCount++;

        // Mark as analyzed even if failed (to avoid infinite retries)
        await supabase
          .from('listings')
          .update({
            price_analysis_completed: true,
            last_market_analysis: new Date().toISOString(),
            price_match_tier: 'error'
          })
          .eq('id', listing.id);
      }
    }

    console.log(`Analysis complete: ${analyzedCount} analyzed, ${errorCount} errors`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        analyzed: analyzedCount,
        errors: errorCount,
        total: listingsToAnalyze.length
      })
    };

  } catch (error) {
    console.error('Analysis failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to analyze competitive pricing',
        message: error.message
      })
    };
  }
};
