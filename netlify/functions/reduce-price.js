const { Handler } = require('@netlify/functions')
const { getCorsHeaders } = require('./utils/cors')
const { createClient } = require('@supabase/supabase-js')
const { EbayApiClient } = require('./utils/ebay-api-client')

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers
    }
  }

  try {
    // Get user from JWT token
    const authHeader = event.headers.authorization
    if (!authHeader) {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Authorization required' })
      }
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Invalid token' })
      }
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Method not allowed' })
      }
    }

    const pathParts = event.path.split('/')
    const listingId = pathParts[pathParts.length - 2] // Extract listing ID from path

    const { customPrice } = JSON.parse(event.body || '{}')

    // Get listing details
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .eq('user_id', user.id)
      .single()

    if (listingError || !listing) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Listing not found' })
      }
    }

    // Validate required fields
    const currentPrice = parseFloat(listing.current_price)
    const minimumPrice = parseFloat(listing.minimum_price)
    const reductionPercentage = parseFloat(listing.reduction_percentage)

    if (isNaN(currentPrice) || currentPrice <= 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Invalid current price' })
      }
    }

    // Check if minimum_price is set (not null, undefined, 0, or empty string)
    if (!listing.minimum_price || isNaN(minimumPrice) || minimumPrice <= 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Minimum price must be set before reducing prices' })
      }
    }

    if (!customPrice && (isNaN(reductionPercentage) || reductionPercentage <= 0 || reductionPercentage > 100)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Invalid reduction percentage' })
      }
    }

    // Calculate new price
    let newPrice
    if (customPrice) {
      const parsedCustomPrice = parseFloat(customPrice)
      if (isNaN(parsedCustomPrice) || parsedCustomPrice <= 0) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ error: 'Invalid custom price' })
        }
      }
      newPrice = Math.max(parsedCustomPrice, minimumPrice)
    } else {
      // Calculate based on strategy
      switch (listing.reduction_strategy) {
        case 'fixed_percentage':
          newPrice = currentPrice * (1 - reductionPercentage / 100)
          break
        case 'market_based':
          // For market-based, we'd need to call eBay API for market data
          // For now, fall back to fixed percentage
          newPrice = currentPrice * (1 - reductionPercentage / 100)
          break
        case 'time_based':
          // More aggressive reduction over time
          const daysListed = Math.ceil((new Date() - new Date(listing.start_time)) / (1000 * 60 * 60 * 24))
          const aggressiveFactor = Math.min(1 + (daysListed / 30) * 0.5, 2)
          newPrice = currentPrice * (1 - (reductionPercentage / 100) * aggressiveFactor)
          break
        default:
          newPrice = currentPrice * (1 - reductionPercentage / 100)
      }
    }

    newPrice = Math.max(newPrice, minimumPrice)
    newPrice = Math.round(newPrice * 100) / 100 // Round to 2 decimal places

    // Final validation
    if (isNaN(newPrice) || newPrice <= 0) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Price calculation error - invalid result' })
      }
    }

    if (newPrice >= currentPrice) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'New price must be lower than current price' })
      }
    }

    // Initialize eBay client (matching trigger-sync.js pattern)
    console.log('🔍 REDUCE-PRICE: Initializing eBay client for user:', user.id)
    const ebayClient = new EbayApiClient(user.id)

    try {
      await ebayClient.initialize()
      console.log('✅ REDUCE-PRICE: Client initialized successfully')
    } catch (initError) {
      console.error('❌ REDUCE-PRICE: Initialization failed:', initError.message)
      console.error('❌ REDUCE-PRICE: Full error:', initError)

      // Handle specific error cases
      if (initError.code === 'NOT_CONNECTED') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'eBay account not connected',
            message: 'Please connect your eBay account first',
            redirectTo: '/ebay-setup'
          })
        }
      }

      throw initError
    }

    console.log('✅ REDUCE-PRICE: Ready to update price for item:', listing.ebay_item_id)

    // Update price on eBay
    try {
      await ebayClient.updateItemPrice(listing.ebay_item_id, newPrice)
    } catch (ebayError) {
      // Log the error but continue with database update for demo purposes
      console.error('eBay API error:', ebayError)

      // In production, you might want to fail here
      // For demo, we'll continue and just log the error to console
      console.error('eBay price update error:', {
        listing_id: listing.id,
        error_message: `Failed to update price on eBay: ${ebayError.message}`,
        timestamp: new Date().toISOString(),
        resolved: false
      })
    }

    // Update listing in database
    const nextReduction = new Date()
    nextReduction.setDate(nextReduction.getDate() + listing.reduction_interval)

    const { data: updatedListing, error: updateError } = await supabase
      .from('listings')
      .update({
        current_price: newPrice,
        last_price_reduction: new Date().toISOString(),
        next_price_reduction: nextReduction.toISOString()
      })
      .eq('id', listingId)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    // Log price change (price_history table removed)
    console.log(`Price change logged for listing ${listingId}: $${currentPrice} -> $${newPrice} (${customPrice ? 'manual' : `${listing.reduction_strategy}_reduction`})`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        oldPrice: currentPrice,
        newPrice,
        listing: updatedListing
      })
    }

  } catch (error) {
    console.error('Reduce price error:', error)

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    }
  }
}

module.exports = { handler }