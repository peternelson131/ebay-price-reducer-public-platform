const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { decrypt } = require('./utils/ebay-oauth-helpers');

// =============================================
// CONFIGURATION
// =============================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// Initialize Supabase client with service key for admin operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Sync configuration
const SYNC_CONFIG = {
  BATCH_SIZE: 10, // Number of listings to sync at once
  MAX_API_CALLS_PER_RUN: 50, // eBay rate limit protection
  PRIORITY_THRESHOLDS: {
    CRITICAL: 3,   // Inventory updates
    HIGH: 5,       // Price updates
    NORMAL: 7,     // Description updates
    LOW: 9         // Historical data
  },
  SYNC_INTERVALS: {
    HOT_DATA: 5 * 60 * 1000,      // 5 minutes for critical items
    WARM_DATA: 30 * 60 * 1000,    // 30 minutes for active listings
    COLD_DATA: 24 * 60 * 60 * 1000 // 24 hours for inactive listings
  }
};

// =============================================
// EBAY API HELPERS
// =============================================

// Note: decrypt() function now imported from shared module ./utils/ebay-oauth-helpers

// Get access token from refresh token
async function getAccessToken(refreshToken, appId, certId) {
  const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.marketing'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${appId}:${certId}`).toString('base64')
    },
    body: params
  });

  if (!response.ok) {
    throw new Error('Failed to get access token from eBay');
  }

  const data = await response.json();
  return data.access_token;
}

// =============================================
// SYNC STRATEGIES
// =============================================

// Calculate listing priority based on various factors
function calculatePriority(listing) {
  let priority = SYNC_CONFIG.PRIORITY_THRESHOLDS.NORMAL;

  // Higher priority for recently updated listings
  const hoursSinceSync = (Date.now() - new Date(listing.last_synced).getTime()) / (1000 * 60 * 60);
  if (hoursSinceSync > 24) {
    priority -= 2;
  } else if (hoursSinceSync > 6) {
    priority -= 1;
  }

  // Higher priority for active listings with price reduction enabled
  if (listing.price_reduction_enabled && listing.listing_status === 'Active') {
    priority -= 2;
  }

  // Higher priority for high-value items
  if (listing.current_price > 100) {
    priority -= 1;
  }

  // Higher priority for items with low stock
  if (listing.quantity_available <= 5) {
    priority -= 1;
  }

  return Math.max(1, priority); // Ensure priority is at least 1
}

// Delta sync - only update changed fields
async function deltaSync(existingListing, newData) {
  const changes = {};
  const fieldsToCheck = [
    'current_price', 'quantity', 'quantity_available',
    'title', 'description', 'listing_status'
  ];

  let hasChanges = false;

  for (const field of fieldsToCheck) {
    if (existingListing[field] !== newData[field]) {
      changes[field] = newData[field];
      hasChanges = true;
    }
  }

  // Calculate new checksum
  const newChecksum = calculateChecksum(newData);
  if (existingListing.data_checksum !== newChecksum) {
    changes.data_checksum = newChecksum;
    hasChanges = true;
  }

  if (hasChanges) {
    changes.last_synced = new Date().toISOString();
    changes.sync_status = 'synced';

    // Update the listing
    const { error } = await supabase
      .from('listings')
      .update(changes)
      .eq('id', existingListing.id);

    if (error) {
      throw error;
    }

    // Log price changes
    if (changes.current_price && changes.current_price !== existingListing.current_price) {
      await supabase.from('price_history').insert({
        listing_id: existingListing.id,
        price: changes.current_price,
        previous_price: existingListing.current_price,
        change_type: 'sync',
        change_reason: 'eBay sync update'
      });
    }

    return true;
  }

  return false;
}

// Calculate checksum for change detection
function calculateChecksum(data) {
  const relevantData = {
    price: data.current_price,
    quantity: data.quantity,
    status: data.listing_status,
    title: data.title
  };
  return crypto.createHash('sha256')
    .update(JSON.stringify(relevantData))
    .digest('hex');
}

// =============================================
// BATCH PROCESSING
// =============================================

// Process a batch of listings
async function processBatch(listings, accessToken, userId) {
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  for (const listing of listings) {
    try {
      // Fetch latest data from eBay
      const ebayData = await fetchEbayListing(accessToken, listing.sku);

      if (!ebayData) {
        results.skipped++;
        continue;
      }

      // Perform delta sync
      const updated = await deltaSync(listing, ebayData);

      if (updated) {
        results.success++;
      } else {
        results.skipped++;
      }

    } catch (error) {
      results.failed++;
      results.errors.push({
        listing_id: listing.id,
        sku: listing.sku,
        error: error.message
      });

      // Update sync status to error
      await supabase
        .from('listings')
        .update({
          sync_status: 'error',
          sync_error: error.message,
          last_synced: new Date().toISOString()
        })
        .eq('id', listing.id);
    }
  }

  return results;
}

// Fetch single listing from eBay
async function fetchEbayListing(accessToken, sku) {
  try {
    // Fetch inventory item
    const inventoryUrl = `https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
    const inventoryResponse = await fetch(inventoryUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!inventoryResponse.ok) {
      return null;
    }

    const inventoryData = await inventoryResponse.json();

    // Fetch offers
    const offersUrl = `https://api.ebay.com/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`;
    const offersResponse = await fetch(offersUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    let offerData = null;
    if (offersResponse.ok) {
      const offersJson = await offersResponse.json();
      if (offersJson.offers && offersJson.offers.length > 0) {
        offerData = offersJson.offers[0];
      }
    }

    // Combine data
    return {
      title: inventoryData.product?.title,
      description: inventoryData.product?.description,
      quantity: inventoryData.availability?.shipToLocationAvailability?.quantity || 1,
      quantity_available: inventoryData.availability?.shipToLocationAvailability?.quantity || 1,
      current_price: offerData?.pricingSummary?.price?.value || 0,
      listing_status: offerData?.status === 'PUBLISHED' ? 'Active' : 'Ended',
      condition: inventoryData.condition,
      image_urls: inventoryData.product?.imageUrls || []
    };

  } catch (error) {
    console.error(`Error fetching listing ${sku}:`, error);
    return null;
  }
}

// =============================================
// QUEUE MANAGEMENT
// =============================================

// Get next batch of jobs from queue
async function getNextJobs(limit = SYNC_CONFIG.BATCH_SIZE) {
  const { data: jobs, error } = await supabase
    .from('sync_queue')
    .select('*')
    .in('status', ['pending', 'processing'])
    .lte('scheduled_for', new Date().toISOString())
    .order('priority')
    .order('scheduled_for')
    .limit(limit);

  if (error) {
    throw error;
  }

  // Mark jobs as processing
  if (jobs && jobs.length > 0) {
    const jobIds = jobs.map(j => j.id);
    await supabase
      .from('sync_queue')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempts: supabase.rpc('increment', { x: 1 })
      })
      .in('id', jobIds);
  }

  return jobs || [];
}

// Complete a job
async function completeJob(jobId, success = true, error = null) {
  const update = {
    status: success ? 'completed' : 'failed',
    completed_at: new Date().toISOString()
  };

  if (error) {
    update.error_message = error;
  }

  await supabase
    .from('sync_queue')
    .update(update)
    .eq('id', jobId);
}

// =============================================
// MAIN SYNC HANDLER
// =============================================

exports.handler = async (event, context) => {
  console.log('🔄 Sync Service started');

  const startTime = Date.now();
  const results = {
    jobs_processed: 0,
    listings_synced: 0,
    errors: [],
    duration: 0
  };

  try {
    // Get next batch of sync jobs
    const jobs = await getNextJobs();

    if (jobs.length === 0) {
      console.log('📭 No sync jobs in queue');
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No jobs to process',
          results
        })
      };
    }

    console.log(`📋 Processing ${jobs.length} sync jobs`);

    // Group jobs by user for efficient processing
    const jobsByUser = {};
    for (const job of jobs) {
      if (!jobsByUser[job.user_id]) {
        jobsByUser[job.user_id] = [];
      }
      jobsByUser[job.user_id].push(job);
    }

    // Process jobs for each user
    for (const [userId, userJobs] of Object.entries(jobsByUser)) {
      try {
        // Get user credentials
        const { data: user } = await supabase
          .from('users')
          .select('ebay_app_id, ebay_cert_id, ebay_refresh_token')
          .eq('id', userId)
          .single();

        if (!user || !user.ebay_refresh_token) {
          // Mark jobs as failed
          for (const job of userJobs) {
            await completeJob(job.id, false, 'User eBay credentials not found');
          }
          continue;
        }

        // Get access token
        const refreshToken = decrypt(user.ebay_refresh_token);
        const accessToken = await getAccessToken(refreshToken, user.ebay_app_id, user.ebay_cert_id);

        // Process each job for this user
        for (const job of userJobs) {
          try {
            if (job.job_type === 'full_sync') {
              // Get all listings for this user
              const { data: listings } = await supabase
                .from('listings')
                .select('*')
                .eq('user_id', userId)
                .is('archived_at', null)
                .order('last_synced', { ascending: true })
                .limit(SYNC_CONFIG.BATCH_SIZE);

              if (listings && listings.length > 0) {
                const batchResults = await processBatch(listings, accessToken, userId);
                results.listings_synced += batchResults.success;
                results.errors.push(...batchResults.errors);
              }

            } else if (job.job_type === 'price_update') {
              // Process specific listings for price updates
              const listingIds = job.payload?.listing_ids || [];
              if (listingIds.length > 0) {
                const { data: listings } = await supabase
                  .from('listings')
                  .select('*')
                  .in('id', listingIds);

                if (listings) {
                  const batchResults = await processBatch(listings, accessToken, userId);
                  results.listings_synced += batchResults.success;
                  results.errors.push(...batchResults.errors);
                }
              }
            }

            await completeJob(job.id, true);
            results.jobs_processed++;

          } catch (jobError) {
            console.error(`Error processing job ${job.id}:`, jobError);
            await completeJob(job.id, false, jobError.message);
            results.errors.push({
              job_id: job.id,
              error: jobError.message
            });
          }
        }

      } catch (userError) {
        console.error(`Error processing user ${userId}:`, userError);
        for (const job of userJobs) {
          await completeJob(job.id, false, userError.message);
        }
      }
    }

    // Record metrics
    results.duration = Date.now() - startTime;
    await supabase.from('sync_metrics').insert({
      metric_type: 'sync_duration',
      value: results.duration,
      metadata: {
        jobs_processed: results.jobs_processed,
        listings_synced: results.listings_synced,
        error_count: results.errors.length
      }
    });

    // Schedule next sync for active users
    await scheduleNextSync();

    console.log(`✅ Sync completed: ${results.listings_synced} listings updated in ${results.duration}ms`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Sync completed successfully',
        results
      })
    };

  } catch (error) {
    console.error('❌ Sync service error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Sync service failed',
        message: error.message,
        results
      })
    };
  }
};

// =============================================
// SCHEDULING HELPERS
// =============================================

// Schedule next sync based on listing activity
async function scheduleNextSync() {
  // Get users with active listings
  const { data: activeUsers } = await supabase
    .from('user_listing_stats')
    .select('user_id, active_listings, last_sync');

  if (!activeUsers) return;

  for (const user of activeUsers) {
    const timeSinceSync = Date.now() - new Date(user.last_sync).getTime();

    // Determine sync interval based on activity
    let interval = SYNC_CONFIG.SYNC_INTERVALS.COLD_DATA;
    if (user.active_listings > 50) {
      interval = SYNC_CONFIG.SYNC_INTERVALS.HOT_DATA;
    } else if (user.active_listings > 10) {
      interval = SYNC_CONFIG.SYNC_INTERVALS.WARM_DATA;
    }

    // Schedule if due
    if (timeSinceSync > interval) {
      await supabase.from('sync_queue').insert({
        user_id: user.user_id,
        job_type: 'full_sync',
        priority: calculatePriorityForUser(user),
        scheduled_for: new Date(Date.now() + 60000).toISOString() // 1 minute from now
      });
    }
  }
}

// Calculate priority for user sync job
function calculatePriorityForUser(user) {
  if (user.active_listings > 100) return 3;
  if (user.active_listings > 50) return 5;
  if (user.active_listings > 10) return 7;
  return 9;
}

// This function can also be triggered by a cron schedule
exports.schedule = "@every 5m"; // Run every 5 minutes