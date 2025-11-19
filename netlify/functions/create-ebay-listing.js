const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');
const { EbayInventoryClient } = require('./utils/ebay-inventory-client');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Comprehensive validation for listing data
 */
function validateListingData(data) {
  const errors = [];

  // Title
  if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
    errors.push('Title must be a non-empty string');
  } else if (data.title.length > 80) {
    errors.push('Title must be 80 characters or less');
  }

  // Description
  if (!data.description || typeof data.description !== 'string' || data.description.trim().length === 0) {
    errors.push('Description must be a non-empty string');
  }

  // Price
  const price = parseFloat(data.price);
  if (isNaN(price) || price < 0 || price > 999999) {
    errors.push('Price must be a number between 0 and 999999');
  }

  // Quantity
  const quantity = parseInt(data.quantity, 10);
  if (isNaN(quantity) || quantity < 0 || quantity > 10000) {
    errors.push('Quantity must be a number between 0 and 10000');
  }

  // Images
  if (!Array.isArray(data.images) || data.images.length === 0) {
    errors.push('Images must be a non-empty array');
  } else if (data.images.length > 12) {
    errors.push('Maximum 12 images allowed (eBay limit)');
  } else {
    const invalidUrls = data.images.filter(url =>
      typeof url !== 'string' || !url.match(/^https?:\/\/.+/)
    );
    if (invalidUrls.length > 0) {
      errors.push('All image URLs must be valid HTTP(S) URLs');
    }
  }

  // Condition (if provided)
  if (data.condition && typeof data.condition !== 'string') {
    errors.push('Condition must be a string');
  }

  // Minimum Price (if provided)
  if (data.minimumPrice !== undefined) {
    const minPrice = parseFloat(data.minimumPrice);
    if (isNaN(minPrice) || minPrice < 0) {
      errors.push('Minimum price must be a non-negative number');
    } else if (!isNaN(price) && minPrice > price) {
      errors.push('Minimum price cannot be higher than current price');
    }
  }

  return errors;
}

/**
 * Generate deterministic SKU for idempotency
 */
function generateDeterministicSku(userId, listingData, userSettings = {}) {
  // Use custom prefix if configured, otherwise use default
  const prefix = userSettings.skuPrefix || 'SKU-';

  // Simple format: PREFIX-ASIN (e.g., "AIP-B095Y23DRL")
  if (listingData.asin) {
    return `${prefix}${listingData.asin}`;
  }

  // Fallback: if no ASIN, use hash for uniqueness
  const hash = crypto.createHash('md5')
    .update(`${userId}-${listingData.title}-${listingData.price}`)
    .digest('hex')
    .substring(0, 16);

  return `${prefix}${hash}`;
}

/**
 * Validate and auto-fill aspects using eBay's allowed values
 * @param {Array} requiredAspects - Aspects from eBay API
 * @param {Object} providedAspects - User-provided aspect values
 * @returns {Object} - { aspects: validatedAspects, warnings: [] }
 */
function validateAndAutoFillAspects(requiredAspects, providedAspects = {}) {
  const validatedAspects = { ...providedAspects };
  const warnings = [];

  // Product identifiers that should always be preserved if provided
  // These don't have "allowed values" and are free-form text
  const IDENTIFIER_ASPECTS = ['UPC', 'EAN', 'ISBN', 'MPN', 'Brand'];

  for (const aspect of requiredAspects) {
    const aspectName = aspect.localizedAspectName;
    const allowedValues = aspect.aspectValues?.map(v => v.localizedValue) || [];
    const constraint = aspect.aspectConstraint || {};
    const isIdentifier = IDENTIFIER_ASPECTS.includes(aspectName);

    // Case 1: Aspect not provided by user
    if (!validatedAspects[aspectName] || validatedAspects[aspectName].length === 0) {

      // Special handling for identifier aspects (UPC, EAN, etc.)
      if (isIdentifier && allowedValues.length === 0) {
        // Identifier aspect required but not provided - try "Does Not Apply"
        console.warn(`⚠️ Required identifier aspect "${aspectName}" not provided by Keepa data`);

        // Some categories allow "Does Not Apply" for identifiers
        validatedAspects[aspectName] = ['Does Not Apply'];
        warnings.push(`Missing ${aspectName} - using "Does Not Apply"`);
        continue;
      }

      // Try to find a sensible default from allowed values
      let defaultValue = null;

      // Priority 1: "Does not apply" or "Does Not Apply"
      defaultValue = allowedValues.find(v =>
        v.toLowerCase() === 'does not apply'
      );

      // Priority 2: "Unbranded" for Brand/Model
      if (!defaultValue && ['Brand', 'Model'].includes(aspectName)) {
        defaultValue = allowedValues.find(v =>
          v.toLowerCase() === 'unbranded'
        );
      }

      // Priority 3: "Regular" for size/fit aspects
      if (!defaultValue && ['Size Type', 'Fit'].includes(aspectName)) {
        defaultValue = allowedValues.find(v =>
          v.toLowerCase() === 'regular'
        );
      }

      // Fallback: Use first allowed value
      if (!defaultValue && allowedValues.length > 0) {
        defaultValue = allowedValues[0];
        warnings.push(`Auto-filled ${aspectName} with first allowed value: "${defaultValue}"`);
      }

      if (defaultValue) {
        validatedAspects[aspectName] = [defaultValue];
        console.log(`✓ Auto-filled ${aspectName} with "${defaultValue}"`);
      } else {
        // No allowed values provided by eBay (rare)
        console.warn(`⚠️ No auto-fill available for ${aspectName} - eBay provided no allowed values`);
      }
    }

    // Case 2: Aspect provided by user - validate against allowed values
    else if (allowedValues.length > 0 && !isIdentifier) {
      // Skip validation for identifiers (they're free-form)
      const userValues = validatedAspects[aspectName];
      const invalidValues = userValues.filter(v => !allowedValues.includes(v));

      if (invalidValues.length > 0) {
        console.warn(`⚠️ Invalid values for ${aspectName}:`, invalidValues);
        console.warn(`   Allowed values:`, allowedValues.slice(0, 10)); // Show first 10

        // Use first allowed value as fallback
        validatedAspects[aspectName] = [allowedValues[0]];
        warnings.push(`Replaced invalid ${aspectName} values with "${allowedValues[0]}"`);
      }
    }
    // Case 3: Identifier aspect provided by user - always keep it
    else if (isIdentifier) {
      console.log(`✓ Preserving identifier aspect ${aspectName}: ${validatedAspects[aspectName]}`);
    }
  }

  return { aspects: validatedAspects, warnings };
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // 1. Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // Validate Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Authorization header must use Bearer scheme' })
      };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    // 2. Parse request body with error handling
    let listingData;
    try {
      listingData = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    console.log('Creating eBay listing for user:', user.id, 'Data:', listingData);

    // 3. Comprehensive validation
    const validationErrors = validateListingData(listingData);
    if (validationErrors.length > 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Validation failed',
          errors: validationErrors
        })
      };
    }

    // Parse and validate data once
    const validatedData = {
      title: listingData.title.substring(0, 80).trim(),
      description: listingData.description.trim(),
      price: parseFloat(listingData.price),
      quantity: parseInt(listingData.quantity, 10),
      images: listingData.images.slice(0, 12),
      minimumPrice: listingData.minimumPrice
        ? parseFloat(listingData.minimumPrice)
        : parseFloat(listingData.price) * 0.5
    }

    // 4. Initialize eBay client with TokenError handling
    console.log('Step 4: Initializing eBay client for user:', user.id);
    const ebayClient = new EbayInventoryClient(user.id);

    try {
      await ebayClient.initialize();
      console.log('✓ eBay client initialized successfully');
    } catch (error) {
      if (error.name === 'TokenError') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            error: error.message,
            code: error.code,
            action: error.action,
            requiresUserAction: true
          })
        };
      }
      throw error; // Re-throw for outer catch
    }

    // 5. Get category suggestions from title with validation
    let categoryId = listingData.categoryId;
    let categoryName = '';

    console.log('Step 5: Category detection - provided categoryId:', categoryId);
    if (!categoryId) {
      console.log('Step 5a: Auto-suggesting category from title:', validatedData.title);
      try {
        const suggestions = await ebayClient.getCategorySuggestions(validatedData.title);

        if (!suggestions?.categorySuggestions?.length) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              error: 'Could not determine eBay category',
              suggestion: 'Try a more descriptive title or manually select a category'
            })
          };
        }

        const bestMatch = suggestions.categorySuggestions[0];
        if (!bestMatch?.category?.categoryId) {
          throw new Error('Invalid category suggestion response format');
        }

        categoryId = bestMatch.category.categoryId;
        categoryName = bestMatch.category.categoryName;

        console.log(`Suggested category: ${categoryName} (${categoryId})`);
      } catch (error) {
        console.error('Category suggestion failed:', error);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Failed to determine category',
            details: error.message,
            solution: 'Please provide a categoryId in your request'
          })
        };
      }
    }

    // 6. Get required item aspects for category (WITH CACHING)
    console.log('Fetching item aspects for category:', categoryId);
    let aspectsData;
    let cacheInfo;

    try {
      const result = await ebayClient.getCachedCategoryAspects(categoryId);
      aspectsData = { aspects: result.aspects };
      cacheInfo = {
        fromCache: result.fromCache,
        lastFetched: result.lastFetched
      };

      console.log(`✓ Aspects loaded (${result.fromCache ? 'from cache' : 'fresh from eBay'})`);

      // Update category name in cache if we have it and fetched from API
      if (categoryName && !result.fromCache) {
        await ebayClient.updateCachedCategoryName(categoryId, categoryName);
      }

    } catch (error) {
      console.error('Failed to fetch item aspects:', error);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: 'Failed to fetch category requirements from eBay',
          categoryId: categoryId,
          details: error.message
        })
      };
    }

    // 6.5. Get and validate category condition policies
    console.log('Step 6.5: Fetching condition policies for category:', categoryId);
    let conditionPolicies = { conditionRequired: false, allowedConditions: [] };

    try {
      conditionPolicies = await ebayClient.getCategoryConditionPolicies(categoryId);
      console.log(`✓ Condition policies loaded: ${conditionPolicies.allowedConditions.length} allowed conditions, required: ${conditionPolicies.conditionRequired}`);
    } catch (error) {
      console.error('⚠️ Failed to fetch condition policies, will use fallback validation:', error.message);
      // Non-fatal: Continue with empty policies and use fallback validation
      // This allows the listing to proceed even if condition API fails
    }

    if (!aspectsData?.aspects) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Invalid aspects response from eBay',
          categoryId: categoryId
        })
      };
    }

    // Track category usage for aspect cache refresh prioritization
    try {
      await supabase.rpc('increment_category_usage', { cat_id: categoryId });
    } catch (trackingError) {
      // Non-fatal: log but continue
      console.warn('Failed to track category usage:', trackingError.message);
    }

    const requiredAspects = aspectsData.aspects.filter(a =>
      a.aspectConstraint?.aspectRequired === true
    );

    console.log(`Found ${requiredAspects.length} required aspects:`, requiredAspects.map(a => a.localizedAspectName));

    // 7. Validate and auto-fill aspects using eBay's allowed values (DYNAMIC - no hardcoding)
    const providedAspects = listingData.aspects || {};

    console.log('Provided aspects:', Object.keys(providedAspects));

    // Use dynamic validation against eBay's aspectValues
    const { aspects: validatedAspects, warnings } = validateAndAutoFillAspects(
      requiredAspects,
      providedAspects
    );

    if (warnings.length > 0) {
      console.log('⚠️ Aspect validation warnings:', warnings);
    }

    // Check for still-missing required aspects (edge case: no allowed values provided by eBay)
    const missingAspects = requiredAspects
      .filter(a => !validatedAspects[a.localizedAspectName] ||
                   validatedAspects[a.localizedAspectName].length === 0)
      .map(a => ({
        name: a.localizedAspectName,
        constraint: a.aspectConstraint,
        allowedValues: a.aspectValues?.map(v => v.localizedValue).slice(0, 20) || []
      }));

    if (missingAspects.length > 0) {
      console.error('❌ Missing required aspects:', missingAspects.map(a => a.name));
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required product aspects',
          missingAspects: missingAspects,
          categoryId,
          categoryName,
          suggestion: 'Please provide values for the required aspects'
        })
      };
    }

    console.log('✓ All required aspects satisfied:', Object.keys(validatedAspects));

    // 7.5. Get user's default settings with error handling
    const { data: userData, error: settingsError } = await supabase
      .from('users')
      .select('listing_settings')
      .eq('id', user.id)
      .single();

    if (settingsError) {
      console.error('Failed to load user settings:', settingsError);
      // Non-fatal: continue with defaults but log warning
    }

    const userSettings = userData?.listing_settings || {};
    console.log('📋 User Settings Retrieved:', JSON.stringify(userSettings, null, 2));

    // 8. Determine business policy IDs to use
    // Priority: request data > user settings > error if none provided
    console.log('Determining business policies to use');

    const fulfillmentPolicyId = listingData.fulfillmentPolicyId ||
                                 userSettings.defaultFulfillmentPolicyId;
    const paymentPolicyId = listingData.paymentPolicyId ||
                           userSettings.defaultPaymentPolicyId;
    const returnPolicyId = listingData.returnPolicyId ||
                          userSettings.defaultReturnPolicyId;

    // Validate that we have all required policies
    const missingPolicies = [];
    if (!fulfillmentPolicyId) missingPolicies.push('fulfillment/shipping');
    if (!paymentPolicyId) missingPolicies.push('payment');
    if (!returnPolicyId) missingPolicies.push('return');

    if (missingPolicies.length > 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Missing required business policy IDs: ${missingPolicies.join(', ')}`,
          solution: 'Please configure your default business policies in Listing Settings or provide them in the request',
          settingsUrl: '/listing-settings'
        })
      };
    }

    console.log('Using policies:', { fulfillmentPolicyId, paymentPolicyId, returnPolicyId });

    // 9. Ensure inventory location exists
    // eBay has 36 char limit on merchantLocationKey
    const merchantLocationKey = `loc-${user.id.substring(0, 32)}`;

    // Extract address from defaultLocation structure
    // userSettings.defaultLocation = { address: { addressLine1, city, ... } }
    console.log('🏠 Address Resolution:');
    console.log('  - listingData.location:', listingData.location);
    console.log('  - userSettings.defaultLocation:', JSON.stringify(userSettings.defaultLocation, null, 2));
    console.log('  - userSettings.defaultLocation?.address:', JSON.stringify(userSettings.defaultLocation?.address, null, 2));

    const defaultAddress = listingData.location ||
                          userSettings.defaultLocation?.address ||
                          {
                            addressLine1: '123 Main St',
                            city: 'San Francisco',
                            stateOrProvince: 'CA',
                            postalCode: '94105',
                            country: 'US'
                          };

    console.log('  - Final defaultAddress used:', JSON.stringify(defaultAddress, null, 2));

    const locationPayload = {
      location: {
        address: defaultAddress
      },
      locationTypes: ['WAREHOUSE'],
      name: 'Primary Warehouse Location',
      phone: '555-555-5555'  // Required by eBay API
    };

    console.log('Step 9: Creating inventory location with payload:', JSON.stringify(locationPayload, null, 2));

    try {
      await ebayClient.ensureInventoryLocation(merchantLocationKey, locationPayload);
      console.log('✓ Step 9 complete: Inventory location ensured:', merchantLocationKey);
    } catch (error) {
      console.error('❌ Step 9 FAILED - Inventory location error:', error.message);
      console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      throw error;
    }

    // 10. Generate deterministic SKU for idempotency
    // Priority: request SKU > user settings default SKU > idempotency key > generated SKU
    const sku = listingData.sku ||
                userSettings.defaultSku ||
                listingData.idempotencyKey ||
                generateDeterministicSku(user.id, listingData, userSettings);

    // 11. Create inventory item
    console.log('Step 11: Creating inventory item with SKU:', sku);

    // Validate and normalize condition
    let requestedCondition = listingData.condition ||
                             userSettings.defaultCondition ||
                             '1000'; // Default: NEW (ID 1000)

    // Map common string conditions to eBay numeric IDs
    const conditionStringToIdMap = {
      'NEW': '1000',
      'NEW_OTHER': '1500',
      'NEW_WITH_DEFECTS': '1750',
      'MANUFACTURER_REFURBISHED': '2000',
      'CERTIFIED_REFURBISHED': '2000',
      'SELLER_REFURBISHED': '2500',
      'LIKE_NEW': '2750',
      'USED_EXCELLENT': '3000',
      'USED_VERY_GOOD': '4000',
      'USED_GOOD': '5000',
      'USED_ACCEPTABLE': '6000',
      'FOR_PARTS_OR_NOT_WORKING': '7000'
    };

    // Convert to numeric ID if string provided
    let conditionId = requestedCondition;
    if (isNaN(requestedCondition)) {
      const upperCondition = requestedCondition.toUpperCase();
      conditionId = conditionStringToIdMap[upperCondition] || requestedCondition;
    }

    console.log(`📋 Requested condition: "${requestedCondition}" → ID: ${conditionId}`);

    // Validate condition against category's allowed conditions
    if (conditionPolicies.allowedConditions && conditionPolicies.allowedConditions.length > 0) {
      const allowedIds = conditionPolicies.allowedConditions.map(c => String(c.conditionId));
      const isValid = allowedIds.includes(String(conditionId));

      console.log(`🔍 Validating condition ${conditionId} against allowed: [${allowedIds.join(', ')}]`);

      if (!isValid) {
        console.error(`❌ Condition ${conditionId} not allowed for category ${categoryId}`);
        console.error('   Allowed conditions:', conditionPolicies.allowedConditions);

        // Auto-select first allowed condition as fallback
        const fallbackCondition = conditionPolicies.allowedConditions[0];
        conditionId = fallbackCondition.conditionId;

        console.log(`⚠️ Auto-selecting fallback condition: ${fallbackCondition.conditionDisplayName} (${conditionId})`);
      } else {
        const selectedCondition = conditionPolicies.allowedConditions.find(c => c.conditionId === conditionId);
        console.log(`✅ Condition validated: ${selectedCondition?.conditionDisplayName || conditionId}`);
      }
    } else {
      // No condition policies available - use safest default (NEW = 1000)
      console.warn(`⚠️ No condition policies available for category ${categoryId}, using default validation`);

      // If user selected something obviously invalid, default to NEW
      const validBasicConditions = ['1000', '1500', '3000', '7000']; // NEW, NEW_OTHER, USED, PARTS
      if (!validBasicConditions.includes(String(conditionId))) {
        console.log(`⚠️ Condition ${conditionId} not in basic valid set, defaulting to 1000 (NEW)`);
        conditionId = '1000';
      }
    }

    const condition = conditionId;

    const inventoryItemPayload = {
      availability: {
        shipToLocationAvailability: {
          quantity: parseInt(listingData.quantity)
        }
      },
      condition: condition,
      conditionDescription: listingData.conditionDescription || 'New item in opened packaging. All original accessories included.',
      product: {
        title: listingData.title.substring(0, 80), // eBay 80 char limit
        description: listingData.description,
        imageUrls: listingData.images.slice(0, 12), // eBay max 12 images
        aspects: validatedAspects  // ✅ Using validated aspects (no hardcoded values)
      }
    };

    console.log('Inventory item payload:', JSON.stringify(inventoryItemPayload, null, 2));

    try {
      await ebayClient.createOrReplaceInventoryItem(sku, inventoryItemPayload);
      console.log('✓ Step 11 complete: Inventory item created');
    } catch (error) {
      console.error('❌ Step 11 FAILED - Create inventory item error:', error.message);
      console.error('eBay error response:', JSON.stringify(error.ebayErrorResponse, null, 2));
      // Return detailed error for debugging
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Step 11 Failed: Create Inventory Item',
          step: 11,
          message: error.message,
          ebayErrorResponse: error.ebayErrorResponse,
          payloadSent: inventoryItemPayload,
          sku: sku
        })
      };
    }

    // 12. Check for existing offer and create/update accordingly
    console.log('Step 12: Checking for existing offer for SKU:', sku);

    const offerPayload = {
      sku: sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: parseInt(listingData.quantity),
      categoryId: categoryId,
      merchantLocationKey: merchantLocationKey,
      pricingSummary: {
        price: {
          value: parseFloat(listingData.price).toFixed(2),
          currency: 'USD'
        }
      },
      listingPolicies: {
        fulfillmentPolicyId: fulfillmentPolicyId,
        paymentPolicyId: paymentPolicyId,
        returnPolicyId: returnPolicyId
      }
    };

    let offerResponse;
    let existingOfferId = null;

    // Check if offer already exists for this SKU
    try {
      const existingOffers = await ebayClient.getOffersBySku(sku);
      if (existingOffers.offers && existingOffers.offers.length > 0) {
        existingOfferId = existingOffers.offers[0].offerId;
        console.log('Found existing offer:', existingOfferId);
      }
    } catch (error) {
      // If error getting offers, continue to create new
      console.log('No existing offers found, will create new');
    }

    console.log('Offer payload:', JSON.stringify(offerPayload, null, 2));

    try {
      if (existingOfferId) {
        console.log('Step 12a: Updating existing offer:', existingOfferId);
        offerResponse = await ebayClient.updateOffer(existingOfferId, offerPayload);
        offerResponse.offerId = existingOfferId;
        console.log('✓ Step 12 complete: Offer updated with ID:', existingOfferId);
      } else {
        console.log('Step 12b: Creating new offer');
        offerResponse = await ebayClient.createOffer(offerPayload);
        console.log('✓ Step 12 complete: Offer created with ID:', offerResponse.offerId);
      }
    } catch (error) {
      console.error('❌ Step 12 FAILED - Create/update offer error:', error.message);
      console.error('eBay error response:', JSON.stringify(error.ebayErrorResponse, null, 2));
      // Return detailed error for debugging
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Step 12 Failed: Create/Update Offer',
          step: 12,
          message: error.message,
          ebayErrorResponse: error.ebayErrorResponse,
          payloadSent: offerPayload,
          sku: sku,
          existingOfferId: existingOfferId
        })
      };
    }

    // 13. Publish offer (only if not already published)
    console.log('Step 13: Publishing offer ID:', offerResponse.offerId);
    let publishResponse;

    try {
      publishResponse = await ebayClient.publishOffer(offerResponse.offerId);
      console.log('Listing published:', publishResponse.listingId);
    } catch (error) {
      // If offer is already published, get the listing ID from the offer
      if (error.ebayStatusCode === 500 && error.message.includes('Product not found')) {
        console.log('Offer already published, retrieving existing listing ID...');
        const existingOffers = await ebayClient.getOffersBySku(sku);
        if (existingOffers.offers && existingOffers.offers.length > 0) {
          const offer = existingOffers.offers[0];
          publishResponse = {
            listingId: offer.listing?.listingId || offer.offerId,
            warnings: ['Offer was already published']
          };
          console.log('Using existing listing ID:', publishResponse.listingId);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    // 14. Store listing in Supabase (upsert to handle duplicates)
    const listingPayload = {
      user_id: user.id,
      ebay_item_id: publishResponse.listingId,
      sku: sku,
      title: validatedData.title,
      current_price: validatedData.price,
      original_price: validatedData.price,
      minimum_price: validatedData.minimumPrice,
      quantity: validatedData.quantity,
      category_id: categoryId,
      category: categoryName,
      image_urls: validatedData.images,
      listing_status: 'Active',
      start_time: new Date().toISOString()
    };

    const { data: listing, error: dbError } = await supabase
      .from('listings')
      .upsert(listingPayload, {
        onConflict: 'user_id,ebay_item_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    // CRITICAL: Handle database save failure properly
    if (dbError) {
      console.error('🔴 CRITICAL: Listing published but DB save failed:', {
        listingId: publishResponse.listingId,
        sku: sku,
        userId: user.id,
        error: dbError
      });

      return {
        statusCode: 207, // Multi-Status
        headers,
        body: JSON.stringify({
          partialSuccess: true,
          ebayListingLive: true,
          databaseSaveFailed: true,
          listingId: publishResponse.listingId,
          sku: sku,
          viewUrl: `https://www.ebay.com/itm/${publishResponse.listingId}`,
          action: 'CONTACT_SUPPORT_FOR_SYNC',
          message: 'Listing is live on eBay but failed to save to your account. Please contact support with this listing ID to sync it.',
          error: dbError.message
        })
      };
    }

    // 15. Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        wasUpdated: existingOfferId ? true : false,
        listingId: publishResponse.listingId,
        offerId: offerResponse.offerId,
        sku: sku,
        categoryId: categoryId,
        categoryName: categoryName,
        viewUrl: `https://www.ebay.com/itm/${publishResponse.listingId}`,
        listing: listing,
        warnings: publishResponse.warnings || [],
        message: existingOfferId
          ? `Listing updated successfully! Previously listed as ${publishResponse.listingId}`
          : 'New listing created successfully!'
      })
    };

  } catch (error) {
    console.error('Create listing error:', {
      message: error.message,
      stack: error.stack,
      ebayErrorResponse: error.ebayErrorResponse || null,
      ebayStatusCode: error.ebayStatusCode || null,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
    });

    // Classify errors for better error handling
    if (error.name === 'TokenError') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error: error.message,
          code: error.code,
          action: error.action,
          requiresUserAction: true
        })
      };
    }

    if (error.ebayStatusCode) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: 'eBay API error',
          message: error.message,
          ebayStatusCode: error.ebayStatusCode,
          ebayError: error.ebayErrorResponse
        })
      };
    }

    // Generic server error
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to create eBay listing',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
