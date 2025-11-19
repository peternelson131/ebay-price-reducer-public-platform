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

    const { ebayUserId, userToken } = JSON.parse(event.body)

    // Get user's eBay credentials from profile
    const { data: userProfile } = await supabase
      .from('users')
      .select('ebay_user_token, default_reduction_strategy, default_reduction_percentage, default_reduction_interval')
      .eq('id', user.id)
      .single()

    const ebayTokenToUse = userToken || userProfile?.ebay_user_token

    if (!ebayTokenToUse) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'eBay user token required' })
      }
    }

    const ebayService = new EbayService()

    // Get listings from eBay
    const response = await ebayService.getSellerListings(ebayUserId, 1, 100, ebayTokenToUse)
    const ebayListings = ebayService.parseListingResponse(response)

    const importedListings = []
    const errors = []

    for (const ebayListing of ebayListings) {
      try {
        // Check if listing already exists
        const { data: existingListing } = await supabase
          .from('listings')
          .select('id')
          .eq('ebay_item_id', ebayListing.ebay_item_id)
          .eq('user_id', user.id)
          .single()

        if (!existingListing) {
          // Create new listing with user defaults
          const newListing = {
            ...ebayListing,
            user_id: user.id,
            minimum_price: ebayListing.current_price * 0.7, // Default 70% of current price
            price_reduction_enabled: true,
            reduction_strategy: userProfile?.default_reduction_strategy || 'fixed_percentage',
            reduction_percentage: userProfile?.default_reduction_percentage || 5,
            reduction_interval: userProfile?.default_reduction_interval || 7
          }

          const { data: listing, error } = await supabase
            .from('listings')
            .insert(newListing)
            .select()
            .single()

          if (error) {
            errors.push(`Failed to import ${ebayListing.title}: ${error.message}`)
          } else {
            // Log initial price (price_history table removed)
            console.log(`Initial price logged for imported listing ${listing.id}: $${listing.current_price}`);

            importedListings.push(listing)
          }
        }
      } catch (error) {
        errors.push(`Error processing ${ebayListing.title}: ${error.message}`)
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Imported ${importedListings.length} new listings`,
        imported: importedListings.length,
        total: ebayListings.length,
        listings: importedListings,
        errors
      })
    }

  } catch (error) {
    console.error('Import listings error:', error)

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