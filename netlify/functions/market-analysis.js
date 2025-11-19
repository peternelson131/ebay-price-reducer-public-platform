const { Handler } = require('@netlify/functions')
const { supabase } = require('./utils/supabase')
const EbayService = require('./utils/ebay')

const handler = async (event, context) => {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE'
      }
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

    if (event.httpMethod !== 'GET') {
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

    const ebayService = new EbayService()

    // Use first few words of title as keywords for market search
    const keywords = listing.title.split(' ').slice(0, 5).join(' ')

    let marketAnalysis = {
      hasData: false,
      message: 'No recent sales data found'
    }

    try {
      const completedListings = await ebayService.searchCompletedListings(
        keywords,
        listing.category_id,
        30 // last 30 days
      )

      if (completedListings && completedListings.findCompletedItemsResponse) {
        const items = completedListings.findCompletedItemsResponse[0].searchResult[0].item || []

        if (items.length > 0) {
          const prices = items
            .filter(item => item.sellingStatus && item.sellingStatus[0].currentPrice)
            .map(item => parseFloat(item.sellingStatus[0].currentPrice[0].__value__))

          if (prices.length > 0) {
            const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length
            const lowestPrice = Math.min(...prices)
            const highestPrice = Math.max(...prices)

            marketAnalysis = {
              hasData: true,
              averagePrice: Math.round(averagePrice * 100) / 100,
              lowestPrice,
              highestPrice,
              totalSales: prices.length,
              currentPricePosition: listing.current_price <= averagePrice ? 'below_average' : 'above_average',
              suggestedPrice: Math.max(
                averagePrice * 0.95,
                listing.minimum_price
              ),
              lastUpdated: new Date().toISOString()
            }

            // Update listing with market data
            await supabase
              .from('listings')
              .update({
                market_average_price: averagePrice,
                market_lowest_price: lowestPrice,
                market_highest_price: highestPrice,
                market_competitor_count: prices.length,
                last_market_analysis: new Date().toISOString()
              })
              .eq('id', listingId)
          }
        }
      }
    } catch (ebayError) {
      console.error('eBay market analysis error:', ebayError)

      // Return cached market data if available
      if (listing.market_average_price) {
        marketAnalysis = {
          hasData: true,
          averagePrice: listing.market_average_price,
          lowestPrice: listing.market_lowest_price,
          highestPrice: listing.market_highest_price,
          totalSales: listing.market_competitor_count,
          currentPricePosition: listing.current_price <= listing.market_average_price ? 'below_average' : 'above_average',
          suggestedPrice: Math.max(
            listing.market_average_price * 0.95,
            listing.minimum_price
          ),
          lastUpdated: listing.last_market_analysis,
          cached: true,
          error: 'Unable to fetch fresh market data, showing cached results'
        }
      } else {
        marketAnalysis.error = 'Market analysis temporarily unavailable'
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(marketAnalysis)
    }

  } catch (error) {
    console.error('Market analysis error:', error)

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