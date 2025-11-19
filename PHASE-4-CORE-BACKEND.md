# Phase 4: Core Backend Services and Functions

## 🎯 Goal
Implement core backend services for automated price reduction, market analysis, and listing synchronization with robust error handling and monitoring.

---

## 📋 **Step-by-Step Implementation**

### Step 1: Create Database Sync Service (30 minutes)

This service will sync eBay listings with our Supabase database.

**Create** `netlify/functions/sync-listings.js`:

```javascript
const { Handler } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const EbayClient = require('./utils/ebay-client');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Get user ID from request
    const { userId } = JSON.parse(event.body || '{}');

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing userId parameter'
        })
      };
    }

    // Initialize eBay client
    const ebayClient = new EbayClient();

    // Fetch listings from eBay
    const ebayResponse = await ebayClient.getMyeBaySelling();

    let syncedCount = 0;
    let errorCount = 0;
    const errors = [];

    if (ebayResponse.ActiveList?.ItemArray?.Item) {
      const items = Array.isArray(ebayResponse.ActiveList.ItemArray.Item)
        ? ebayResponse.ActiveList.ItemArray.Item
        : [ebayResponse.ActiveList.ItemArray.Item];

      for (const item of items) {
        try {
          // Upsert listing to database
          const { error: upsertError } = await supabase
            .from('listings')
            .upsert({
              user_id: userId,
              ebay_item_id: item.ItemID,
              title: item.Title,
              current_price: parseFloat(item.SellingStatus?.CurrentPrice?._ || 0),
              currency: item.SellingStatus?.CurrentPrice?.currencyID || 'USD',
              quantity: parseInt(item.Quantity) || 0,
              listing_type: item.ListingType,
              category_id: item.PrimaryCategory?.CategoryID,
              category_name: item.PrimaryCategory?.CategoryName,
              end_time: item.EndTime,
              watch_count: parseInt(item.WatchCount) || 0,
              hit_count: parseInt(item.HitCount) || 0,
              listing_url: item.ListingDetails?.ViewItemURL,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id,ebay_item_id'
            });

          if (upsertError) {
            errors.push(`Item ${item.ItemID}: ${upsertError.message}`);
            errorCount++;
          } else {
            syncedCount++;
          }
        } catch (itemError) {
          errors.push(`Item ${item.ItemID}: ${itemError.message}`);
          errorCount++;
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        syncedCount,
        errorCount,
        errors: errors.slice(0, 5), // Return first 5 errors
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Sync failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

module.exports = { handler };
```

### Step 2: Create Price Reduction Engine (45 minutes)

This service implements the core price reduction logic.

**Create** `netlify/functions/price-reduction-engine.js`:

```javascript
const { Handler } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const EbayClient = require('./utils/ebay-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Get listings that need price reduction
    const { data: listings, error: fetchError } = await supabase
      .from('listings')
      .select(`
        *,
        reduction_strategies (*)
      `)
      .eq('price_reduction_enabled', true)
      .gte('end_time', new Date().toISOString())
      .order('created_at', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch listings: ${fetchError.message}`);
    }

    const ebayClient = new EbayClient();
    let processedCount = 0;
    let reducedCount = 0;
    const results = [];

    for (const listing of listings) {
      try {
        // Check if price reduction is needed
        const shouldReduce = await checkPriceReductionConditions(listing);

        if (shouldReduce.reduce) {
          // Calculate new price
          const newPrice = calculateNewPrice(listing, shouldReduce.strategy);

          // Update price on eBay
          const ebayResponse = await ebayClient.reviseItemPrice(
            listing.ebay_item_id,
            newPrice
          );

          if (ebayResponse.Ack === 'Success') {
            // Update database
            await supabase
              .from('listings')
              .update({
                current_price: newPrice,
                updated_at: new Date().toISOString()
              })
              .eq('id', listing.id);

            // Log price change
            await supabase
              .from('price_history')
              .insert({
                listing_id: listing.id,
                old_price: listing.current_price,
                new_price: newPrice,
                change_reason: shouldReduce.reason,
                created_at: new Date().toISOString()
              });

            reducedCount++;
            results.push({
              itemId: listing.ebay_item_id,
              title: listing.title,
              oldPrice: listing.current_price,
              newPrice: newPrice,
              reason: shouldReduce.reason,
              status: 'success'
            });
          }
        }

        processedCount++;
      } catch (itemError) {
        console.error(`Error processing item ${listing.ebay_item_id}:`, itemError);
        results.push({
          itemId: listing.ebay_item_id,
          title: listing.title,
          status: 'error',
          error: itemError.message
        });
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        processedCount,
        reducedCount,
        results: results.slice(0, 10), // Return first 10 results
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Price reduction engine failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

// Helper function to check if price reduction is needed
async function checkPriceReductionConditions(listing) {
  const now = new Date();
  const endTime = new Date(listing.end_time);
  const timeRemaining = endTime.getTime() - now.getTime();
  const daysRemaining = timeRemaining / (1000 * 60 * 60 * 24);

  // Default strategy if none exists
  const strategy = listing.reduction_strategies || {
    reduction_percentage: 5,
    minimum_price: listing.current_price * 0.7,
    time_trigger_days: 3,
    watch_count_threshold: 5
  };

  // Check time-based trigger
  if (daysRemaining <= strategy.time_trigger_days && daysRemaining > 0) {
    return {
      reduce: true,
      strategy,
      reason: `Time trigger: ${daysRemaining.toFixed(1)} days remaining`
    };
  }

  // Check watch count trigger
  if (listing.watch_count < strategy.watch_count_threshold) {
    return {
      reduce: true,
      strategy,
      reason: `Low interest: ${listing.watch_count} watchers`
    };
  }

  return { reduce: false };
}

// Helper function to calculate new price
function calculateNewPrice(listing, strategy) {
  const currentPrice = listing.current_price;
  const reductionAmount = currentPrice * (strategy.reduction_percentage / 100);
  const newPrice = currentPrice - reductionAmount;

  // Ensure price doesn't go below minimum
  const minimumPrice = strategy.minimum_price || (currentPrice * 0.5);

  return Math.max(newPrice, minimumPrice);
}

module.exports = { handler };
```

### Step 3: Create Market Analysis Service (30 minutes)

**Create** `netlify/functions/market-analysis.js`:

```javascript
const { Handler } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const EbayClient = require('./utils/ebay-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { itemId, keywords, categoryId } = JSON.parse(event.body || '{}');

    if (!itemId && !keywords) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Either itemId or keywords is required'
        })
      };
    }

    const ebayClient = new EbayClient();
    let searchQuery = keywords;

    // If itemId provided, get item details first
    if (itemId) {
      const itemResponse = await ebayClient.getItem(itemId);
      searchQuery = extractKeywords(itemResponse.Item.Title);
    }

    // Search for similar items
    const searchResponse = await ebayClient.getSearchResults(
      searchQuery,
      categoryId,
      50
    );

    // Analyze results
    const analysis = analyzeMarketData(searchResponse);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        query: searchQuery,
        analysis,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Market analysis failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

// Helper function to extract keywords from title
function extractKeywords(title) {
  // Remove common words and extract meaningful keywords
  const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
  const words = title.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(' ')
    .filter(word => word.length > 2 && !commonWords.includes(word));

  return words.slice(0, 5).join(' ');
}

// Helper function to analyze market data
function analyzeMarketData(searchResponse) {
  const items = searchResponse.ItemArray?.Item || [];
  const prices = items
    .map(item => parseFloat(item.CurrentPrice?._ || 0))
    .filter(price => price > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return {
      averagePrice: 0,
      medianPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      totalItems: 0,
      priceDistribution: {
        low: 0,
        medium: 0,
        high: 0
      }
    };
  }

  const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const medianPrice = prices[Math.floor(prices.length / 2)];
  const minPrice = prices[0];
  const maxPrice = prices[prices.length - 1];

  // Price distribution
  const lowThreshold = averagePrice * 0.8;
  const highThreshold = averagePrice * 1.2;

  const priceDistribution = {
    low: prices.filter(p => p < lowThreshold).length,
    medium: prices.filter(p => p >= lowThreshold && p <= highThreshold).length,
    high: prices.filter(p => p > highThreshold).length
  };

  return {
    averagePrice: parseFloat(averagePrice.toFixed(2)),
    medianPrice: parseFloat(medianPrice.toFixed(2)),
    minPrice: parseFloat(minPrice.toFixed(2)),
    maxPrice: parseFloat(maxPrice.toFixed(2)),
    totalItems: items.length,
    priceDistribution,
    recommendations: generatePriceRecommendations(averagePrice, medianPrice, minPrice, maxPrice)
  };
}

// Helper function to generate pricing recommendations
function generatePriceRecommendations(avg, median, min, max) {
  return {
    competitive: parseFloat((avg * 0.95).toFixed(2)),
    aggressive: parseFloat((avg * 0.85).toFixed(2)),
    conservative: parseFloat((avg * 1.05).toFixed(2)),
    quickSale: parseFloat((median * 0.9).toFixed(2))
  };
}

module.exports = { handler };
```

### Step 4: Create Notification System (25 minutes)

**Create** `netlify/functions/notification-service.js`:

```javascript
const { Handler } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { userId, type, title, message, data } = JSON.parse(event.body || '{}');

    if (!userId || !type || !title || !message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required fields: userId, type, title, message'
        })
      };
    }

    // Create notification
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        data: data || {},
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }

    // Get user's notification preferences
    const { data: user } = await supabase
      .from('users')
      .select('email, notification_preferences')
      .eq('id', userId)
      .single();

    // Send email if enabled (placeholder - implement actual email service)
    if (user?.notification_preferences?.email && process.env.EMAIL_HOST) {
      await sendEmailNotification(user.email, title, message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        notification,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Notification service failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

// Placeholder for email service
async function sendEmailNotification(email, title, message) {
  // TODO: Implement actual email service (SendGrid, AWS SES, etc.)
  console.log(`Email notification sent to ${email}: ${title}`);
}

module.exports = { handler };
```

### Step 5: Create Scheduled Job Handler (20 minutes)

**Create** `netlify/functions/scheduled-jobs.js`:

```javascript
const { Handler, schedule } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Main handler for scheduled jobs
const handler = async (event, context) => {
  try {
    const jobType = event.queryStringParameters?.job || 'all';

    console.log(`Running scheduled job: ${jobType}`);

    switch (jobType) {
      case 'sync':
        return await runSyncJob();
      case 'price-reduction':
        return await runPriceReductionJob();
      case 'cleanup':
        return await runCleanupJob();
      case 'all':
      default:
        return await runAllJobs();
    }

  } catch (error) {
    console.error('Scheduled job failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

// Run all active users' sync jobs
async function runSyncJob() {
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('active', true);

  let syncedUsers = 0;
  for (const user of users || []) {
    try {
      // Call sync-listings function for each user
      const response = await fetch(`${process.env.URL}/.netlify/functions/sync-listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });

      if (response.ok) syncedUsers++;
    } catch (error) {
      console.error(`Sync failed for user ${user.id}:`, error);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      job: 'sync',
      syncedUsers,
      timestamp: new Date().toISOString()
    })
  };
}

// Run price reduction engine
async function runPriceReductionJob() {
  try {
    const response = await fetch(`${process.env.URL}/.netlify/functions/price-reduction-engine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        job: 'price-reduction',
        result,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    throw new Error(`Price reduction job failed: ${error.message}`);
  }
}

// Clean up old data
async function runCleanupJob() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Clean up old notifications
  const { error: notifyError } = await supabase
    .from('notifications')
    .delete()
    .lt('created_at', thirtyDaysAgo.toISOString());

  // Clean up old sync errors
  const { error: errorCleanup } = await supabase
    .from('sync_errors')
    .delete()
    .lt('created_at', thirtyDaysAgo.toISOString());

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      job: 'cleanup',
      timestamp: new Date().toISOString()
    })
  };
}

// Run all jobs in sequence
async function runAllJobs() {
  const results = {};

  try {
    results.sync = await runSyncJob();
    results.priceReduction = await runPriceReductionJob();
    results.cleanup = await runCleanupJob();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        job: 'all',
        results,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        results,
        timestamp: new Date().toISOString()
      })
    };
  }
}

// Export handler for Netlify
module.exports = { handler };
```

---

## ✅ **Phase 4 Success Criteria**

### Core Services ✅
- [ ] Database sync service implemented
- [ ] Price reduction engine working
- [ ] Market analysis service functional
- [ ] Notification system operational
- [ ] Scheduled job handler created

### Data Flow ✅
- [ ] eBay → Database synchronization
- [ ] Automated price reduction logic
- [ ] Market data analysis
- [ ] User notifications
- [ ] Background job processing

### Error Handling ✅
- [ ] Comprehensive error logging
- [ ] Graceful failure handling
- [ ] Sync error tracking
- [ ] Notification fallbacks
- [ ] Job failure recovery

### Performance ✅
- [ ] Efficient database queries
- [ ] Batch processing for large datasets
- [ ] Rate limiting compliance
- [ ] Memory usage optimization
- [ ] Response time targets met

---

## 🚨 **Common Issues & Solutions**

### Issue: "Rate limit exceeded"
**Solution**: Implement exponential backoff and request queuing

### Issue: "Database connection timeout"
**Solution**: Optimize queries and implement connection pooling

### Issue: "eBay API authentication failures"
**Solution**: Implement token refresh logic and error recovery

### Issue: "Memory usage too high"
**Solution**: Process data in smaller batches and cleanup variables

---

## 📊 **Estimated Time: 2.5-3 hours**

- Database sync service: 30 minutes
- Price reduction engine: 45 minutes
- Market analysis service: 30 minutes
- Notification system: 25 minutes
- Scheduled jobs: 20 minutes
- Testing and refinement: 30 minutes

---

## 🎉 **Next Steps**

Once Phase 4 is complete, you'll have:
- ✅ Fully automated backend services
- ✅ Real-time data synchronization
- ✅ Intelligent price reduction
- ✅ Market analysis capabilities
- ✅ Comprehensive notification system
- ✅ Reliable scheduled job processing

**Ready for Phase 5: Frontend Core Features Implementation!** 🚀