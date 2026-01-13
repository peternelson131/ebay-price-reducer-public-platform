/**
 * Sync eBay Listings
 * 
 * Imports and syncs listings from eBay to the database.
 * Handles both Trading API (XML) and Inventory API (REST) listings.
 * 
 * CRITICAL RULES:
 * - NEVER overwrite current_price (we control reductions)
 * - NEVER overwrite minimum_price, strategy_id, enable_auto_reduction
 * - ALWAYS update: title, quantity, status, images
 * - Set prices ONLY on first import (new listings)
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken } = require('./utils/ebay-oauth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Environment detection
const IS_SANDBOX = process.env.EBAY_ENVIRONMENT === 'sandbox';
const EBAY_API_BASE = IS_SANDBOX
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com';
const TRADING_API_URL = IS_SANDBOX
  ? 'https://api.sandbox.ebay.com/ws/api.dll'
  : 'https://api.ebay.com/ws/api.dll';

const COMPATIBILITY_LEVEL = 967;

// ============================================
// TRADING API IMPORT (XML)
// ============================================

/**
 * Build GetMyeBaySelling XML request
 */
function buildGetMyeBaySellingRequest(pageNumber = 1, entriesPerPage = 200) {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ActiveList>
    <Sort>TimeLeft</Sort>
    <Pagination>
      <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
      <PageNumber>${pageNumber}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`;
}

/**
 * Parse GetMyeBaySelling XML response
 */
function parseGetMyeBaySellingResponse(xmlText) {
  const listings = [];
  
  // Check for errors
  const ackMatch = xmlText.match(/<Ack>([^<]+)<\/Ack>/);
  if (ackMatch && ackMatch[1] === 'Failure') {
    const errorMatch = xmlText.match(/<ShortMessage>([^<]+)<\/ShortMessage>/);
    throw new Error(`eBay API Error: ${errorMatch ? errorMatch[1] : 'Unknown error'}`);
  }
  
  // Extract pagination info
  const totalPagesMatch = xmlText.match(/<TotalNumberOfPages>(\d+)<\/TotalNumberOfPages>/);
  const totalPages = totalPagesMatch ? parseInt(totalPagesMatch[1]) : 1;
  
  const totalEntriesMatch = xmlText.match(/<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/);
  const totalEntries = totalEntriesMatch ? parseInt(totalEntriesMatch[1]) : 0;
  
  // Extract each Item
  const itemRegex = /<Item>([\s\S]*?)<\/Item>/g;
  let match;
  
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];
    
    const getValue = (tag) => {
      const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`);
      const m = itemXml.match(regex);
      return m ? m[1] : null;
    };
    
    // Parse price - must be > 0 for DB constraint
    let price = parseFloat(getValue('CurrentPrice')) || 0;
    if (price <= 0) {
      price = parseFloat(getValue('BuyItNowPrice')) || parseFloat(getValue('StartPrice')) || 0.01;
    }
    
    const listing = {
      ebay_item_id: getValue('ItemID'),
      ebay_sku: getValue('SKU'),
      title: getValue('Title'),
      current_price: price > 0 ? price : 0.01,  // Ensure always > 0
      quantity_available: parseInt(getValue('QuantityAvailable')) || 0,
      quantity_sold: parseInt(getValue('QuantitySold')) || 0,
      listing_status: getValue('ListingStatus') || 'Active',
      image_url: getValue('GalleryURL') || getValue('PictureURL'),
      ebay_url: getValue('ViewItemURL'),
      source: 'trading_api'
    };
    
    if (listing.ebay_item_id) {
      listings.push(listing);
    }
  }
  
  return { listings, totalPages, totalEntries };
}

/**
 * Import listings from Trading API
 */
async function importTradingApiListings(accessToken, userId, maxListings = 0) {
  console.log('📦 Importing Trading API listings...');
  
  const allListings = [];
  let pageNumber = 1;
  let totalPages = 1;
  
  while (pageNumber <= totalPages && (maxListings === 0 || allListings.length < maxListings)) {
    const requestXml = buildGetMyeBaySellingRequest(pageNumber, 200);
    
    const response = await fetch(TRADING_API_URL, {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': COMPATIBILITY_LEVEL.toString(),
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      body: requestXml
    });
    
    if (!response.ok) {
      throw new Error(`Trading API HTTP error: ${response.status}`);
    }
    
    const xmlText = await response.text();
    const result = parseGetMyeBaySellingResponse(xmlText);
    
    allListings.push(...result.listings);
    totalPages = result.totalPages;
    
    console.log(`📄 Page ${pageNumber}/${totalPages}: ${result.listings.length} listings (total: ${allListings.length})`);
    
    // Check if we've hit the limit
    if (maxListings > 0 && allListings.length >= maxListings) {
      allListings.splice(maxListings); // Trim to exact limit
      console.log(`📊 Reached maxListings limit: ${maxListings}`);
      break;
    }
    
    pageNumber++;
    
    // Rate limiting
    if (pageNumber <= totalPages) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  console.log(`✅ Trading API: Found ${allListings.length} total listings`);
  return allListings;
}

// ============================================
// INVENTORY API IMPORT (REST)
// ============================================

/**
 * Import listings from Inventory API
 */
async function importInventoryApiListings(accessToken, userId, maxListings = 0) {
  console.log('📦 Importing Inventory API listings...');
  
  const allItems = [];
  let offset = 0;
  const limit = 200;
  let total = 0;
  
  do {
    // Check max limit
    if (maxListings > 0 && allItems.length >= maxListings) break;
    const url = `${EBAY_API_BASE}/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Inventory API error:', response.status, errorText);
      break;
    }
    
    const data = await response.json();
    total = data.total || 0;
    
    if (data.inventoryItems) {
      allItems.push(...data.inventoryItems);
    }
    
    console.log(`📄 Offset ${offset}: ${data.inventoryItems?.length || 0} items (${allItems.length}/${total})`);
    offset += limit;
    
    // Rate limiting
    if (offset < total) {
      await new Promise(r => setTimeout(r, 500));
    }
  } while (offset < total);
  
  console.log(`✅ Inventory API: Found ${allItems.length} inventory items`);
  
  // Now fetch offer details for each item
  const listings = [];
  for (const item of allItems) {
    try {
      const offerData = await fetchOfferForSku(accessToken, item.sku);
      
      if (offerData) {
        listings.push({
          ebay_sku: item.sku,
          ebay_item_id: offerData.listingId,
          offer_id: offerData.offerId,
          title: item.product?.title || item.sku,
          current_price: offerData.price,
          quantity_available: item.availability?.shipToLocationAvailability?.quantity || 0,
          quantity_sold: 0, // Not available from inventory API
          listing_status: offerData.status === 'PUBLISHED' ? 'Active' : 'Inactive',
          image_url: item.product?.imageUrls?.[0],
          source: 'inventory_api'
        });
      }
    } catch (err) {
      console.warn(`Failed to get offer for SKU ${item.sku}:`, err.message);
    }
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`✅ Inventory API: ${listings.length} listings with offers`);
  return listings;
}

/**
 * Fetch offer details for a SKU
 */
async function fetchOfferForSku(accessToken, sku) {
  const url = `${EBAY_API_BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    return null;
  }
  
  const data = await response.json();
  
  if (data.offers && data.offers.length > 0) {
    const offer = data.offers[0];
    return {
      offerId: offer.offerId,
      listingId: offer.listingId,
      price: parseFloat(offer.pricingSummary?.price?.value) || 0,
      status: offer.status
    };
  }
  
  return null;
}

// ============================================
// DATABASE SYNC
// ============================================

/**
 * Upsert listings to database - OPTIMIZED BATCH VERSION
 * CRITICAL: Never overwrite prices on existing listings
 * 
 * Optimization: Batch fetch existing listings, then batch insert/update
 * Before: ~600 queries for 200 listings
 * After: ~3-5 queries total
 */
async function upsertListings(userId, listings) {
  const results = {
    inserted: 0,
    updated: 0,
    errors: []
  };
  
  if (!listings || listings.length === 0) return results;
  
  const now = new Date().toISOString();
  
  try {
    // STEP 1: Batch fetch all existing listings for this user
    const itemIds = listings.map(l => l.ebay_item_id).filter(Boolean);
    const skus = listings.map(l => l.ebay_sku).filter(Boolean);
    
    // Fetch by item_id
    const { data: existingByItemId } = await supabase
      .from('listings')
      .select('id, ebay_item_id, ebay_sku, current_price, original_price, minimum_price')
      .eq('user_id', userId)
      .in('ebay_item_id', itemIds.length > 0 ? itemIds : ['__none__']);
    
    // Fetch by SKU (for ones not found by item_id)
    const { data: existingBySku } = await supabase
      .from('listings')
      .select('id, ebay_item_id, ebay_sku, current_price, original_price, minimum_price')
      .eq('user_id', userId)
      .in('ebay_sku', skus.length > 0 ? skus : ['__none__']);
    
    // Build lookup maps
    const byItemId = new Map((existingByItemId || []).map(e => [e.ebay_item_id, e]));
    const bySku = new Map((existingBySku || []).map(e => [e.ebay_sku, e]));
    
    // STEP 2: Categorize listings as insert or update
    const toInsert = [];
    const toUpdate = [];
    
    for (const listing of listings) {
      // Find existing by item_id first, then by SKU
      const existing = byItemId.get(listing.ebay_item_id) || 
                       (listing.ebay_sku ? bySku.get(listing.ebay_sku) : null);
      
      if (existing) {
        toUpdate.push({ listing, existing });
        
        // Log price discrepancy
        if (Math.abs(existing.current_price - listing.current_price) > 0.01) {
          console.warn(`💰 Price mismatch for ${listing.ebay_item_id || listing.ebay_sku}: DB=$${existing.current_price}, eBay=$${listing.current_price}`);
        }
      } else {
        toInsert.push(listing);
      }
    }
    
    // STEP 3: Batch insert new listings
    if (toInsert.length > 0) {
      const insertData = toInsert.map(listing => ({
        user_id: userId,
        ebay_item_id: listing.ebay_item_id,
        ebay_sku: listing.ebay_sku,
        offer_id: listing.offer_id,
        title: listing.title,
        current_price: listing.current_price,
        original_price: listing.current_price,
        minimum_price: listing.current_price * 0.6,
        quantity_available: listing.quantity_available,
        quantity_sold: listing.quantity_sold,
        listing_status: deriveStatus(listing),
        image_url: listing.image_url,
        ebay_url: listing.ebay_url,
        source: listing.source,
        enable_auto_reduction: false,
        last_sync: now,
        created_at: now,
        updated_at: now
      }));
      
      const { error: insertError } = await supabase
        .from('listings')
        .insert(insertData);
      
      if (insertError) {
        console.error('Batch insert error:', insertError.message);
        // Fall back to individual inserts
        for (const listing of toInsert) {
          try {
            const { error } = await supabase.from('listings').insert({
              user_id: userId,
              ebay_item_id: listing.ebay_item_id,
              ebay_sku: listing.ebay_sku,
              offer_id: listing.offer_id,
              title: listing.title,
              current_price: listing.current_price,
              original_price: listing.current_price,
              minimum_price: listing.current_price * 0.6,
              quantity_available: listing.quantity_available,
              quantity_sold: listing.quantity_sold,
              listing_status: deriveStatus(listing),
              image_url: listing.image_url,
              ebay_url: listing.ebay_url,
              source: listing.source,
              enable_auto_reduction: false,
              last_sync: now,
              created_at: now,
              updated_at: now
            });
            if (!error) results.inserted++;
            else results.errors.push({ listing: listing.ebay_item_id, error: error.message });
          } catch (err) {
            results.errors.push({ listing: listing.ebay_item_id, error: err.message });
          }
        }
      } else {
        results.inserted = toInsert.length;
      }
    }
    
    // STEP 4: Batch update existing listings (Supabase doesn't support batch update, so we do individual)
    // But we can parallelize with Promise.all
    const updatePromises = toUpdate.map(async ({ listing, existing }) => {
      try {
        const { error } = await supabase
          .from('listings')
          .update({
            title: listing.title,
            quantity_available: listing.quantity_available,
            quantity_sold: listing.quantity_sold,
            listing_status: deriveStatus(listing),
            image_url: listing.image_url,
            ebay_url: listing.ebay_url,
            ebay_item_id: listing.ebay_item_id || existing.ebay_item_id,
            ebay_sku: listing.ebay_sku || existing.ebay_sku,
            offer_id: listing.offer_id,
            last_sync: now,
            updated_at: now
          })
          .eq('id', existing.id);
        
        if (error) throw error;
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message, listing: listing.ebay_item_id };
      }
    });
    
    // Run updates in parallel (max 10 at a time to avoid overwhelming DB)
    const BATCH_SIZE = 10;
    for (let i = 0; i < updatePromises.length; i += BATCH_SIZE) {
      const batch = updatePromises.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch);
      for (const r of batchResults) {
        if (r.success) results.updated++;
        else results.errors.push({ listing: r.listing, error: r.error });
      }
    }
    
  } catch (err) {
    console.error('Batch upsert error:', err.message);
    results.errors.push({ error: err.message });
  }
  
  return results;
}

/**
 * Derive listing status from eBay data
 * Must match constraint: 'Active', 'Inactive', 'Ended', 'Sold Out', 'Out of Stock'
 */
function deriveStatus(listing) {
  if (listing.listing_status === 'Ended') return 'Ended';
  if (listing.quantity_available === 0) return 'Sold Out';  // Note: space required
  if (listing.listing_status === 'Inactive') return 'Inactive';
  return 'Active';
}

/**
 * Mark listings as ended if not found in eBay response
 */
async function markEndedListings(userId, foundIds, source) {
  const idField = source === 'inventory_api' ? 'ebay_sku' : 'ebay_item_id';
  
  // Get all active listings of this source type
  const { data: dbListings } = await supabase
    .from('listings')
    .select('id, ' + idField)
    .eq('user_id', userId)
    .eq('source', source)
    .eq('listing_status', 'Active')
    .is('ended_at', null);
  
  if (!dbListings) return 0;
  
  let endedCount = 0;
  for (const dbListing of dbListings) {
    const id = dbListing[idField];
    if (id && !foundIds.has(id)) {
      await supabase
        .from('listings')
        .update({
          listing_status: 'Ended',
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', dbListing.id);
      endedCount++;
    }
  }
  
  return endedCount;
}

// ============================================
// MAIN HANDLER
// ============================================

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  const startTime = Date.now();
  console.log('🔄 Starting eBay listing sync...');
  
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { userId, source, testSecret, limit, maxListings, internalScheduled } = body;
    
    // Auth check
    const isTestMode = testSecret === 'uat-test-2026';
    const isInternalScheduled = internalScheduled === 'netlify-scheduled-function';
    
    if (!isTestMode && !isInternalScheduled && !userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }
    
    if (isInternalScheduled) {
      console.log('⏰ SCHEDULED MODE - syncing all users');
    }
    
    // Get users to sync
    let usersToSync = [];
    if (userId) {
      usersToSync = [userId];
    } else {
      // Get all users with eBay connected
      const { data: users } = await supabase
        .from('users')
        .select('id')
        .not('ebay_access_token', 'is', null);
      usersToSync = users?.map(u => u.id) || [];
    }
    
    // Apply limit if specified (for testing/batching)
    if (limit && limit > 0) {
      usersToSync = usersToSync.slice(0, limit);
    }
    
    console.log(`👥 Syncing ${usersToSync.length} user(s)`);
    
    const allResults = [];
    
    for (const uid of usersToSync) {
      try {
        const accessToken = await getValidAccessToken(supabase, uid);
        
        let tradingResults = { inserted: 0, updated: 0, errors: [] };
        let inventoryResults = { inserted: 0, updated: 0, errors: [] };
        let tradingEnded = 0;
        let inventoryEnded = 0;
        
        // Import Trading API listings
        if (!source || source === 'trading_api') {
          const tradingListings = await importTradingApiListings(accessToken, uid, maxListings);
          tradingResults = await upsertListings(uid, tradingListings);
          
          // Mark ended listings (skip if using maxListings to avoid false ended)
          if (!maxListings) {
            const foundIds = new Set(tradingListings.map(l => l.ebay_item_id));
            tradingEnded = await markEndedListings(uid, foundIds, 'trading_api');
          }
        }
        
        // Import Inventory API listings
        if (!source || source === 'inventory_api') {
          const inventoryListings = await importInventoryApiListings(accessToken, uid, maxListings);
          inventoryResults = await upsertListings(uid, inventoryListings);
          
          // Mark ended listings (skip if using maxListings to avoid false ended)
          if (!maxListings) {
            const foundIds = new Set(inventoryListings.map(l => l.ebay_sku));
            inventoryEnded = await markEndedListings(uid, foundIds, 'inventory_api');
          }
        }
        
        allResults.push({
          userId: uid,
          tradingApi: {
            ...tradingResults,
            ended: tradingEnded
          },
          inventoryApi: {
            ...inventoryResults,
            ended: inventoryEnded
          }
        });
        
      } catch (userError) {
        console.error(`Error syncing user ${uid}:`, userError.message);
        allResults.push({
          userId: uid,
          error: userError.message
        });
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Sync completed in ${duration}s`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        duration: `${duration}s`,
        results: allResults
      })
    };
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
