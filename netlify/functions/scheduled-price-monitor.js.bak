const { schedule } = require('@netlify/functions')
const { supabase } = require('./utils/supabase')
const EbayService = require('./utils/ebay')

// This function runs every hour
const handler = schedule('0 * * * *', async (event, context) => {
  console.log('Starting scheduled price monitoring...')

  try {
    // Get all listings due for price reduction
    const { data: listings, error } = await supabase
      .from('listings')
      .select(`
        *,
        users!inner(ebay_user_token)
      `)
      .eq('listing_status', 'Active')
      .eq('price_reduction_enabled', true)
      .gt('current_price', 'minimum_price')
      .or(`next_price_reduction.is.null,next_price_reduction.lte.${new Date().toISOString()}`)

    if (error) {
      console.error('Error fetching listings:', error)
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Database error' })
      }
    }

    console.log(`Found ${listings.length} listings due for price reduction`)

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    }

    const ebayService = new EbayService()

    for (const listing of listings) {
      results.processed++

      try {
        // Calculate new price based on strategy
        let newPrice

        switch (listing.reduction_strategy) {
          case 'fixed_percentage':
            newPrice = listing.current_price * (1 - listing.reduction_percentage / 100)
            break

          case 'market_based':
            try {
              // Get market data
              const keywords = listing.title.split(' ').slice(0, 5).join(' ')
              const completedListings = await ebayService.searchCompletedListings(
                keywords,
                listing.category_id,
                30
              )

              const suggestedPrice = ebayService.calculateSuggestedPrice(
                completedListings,
                listing.current_price,
                listing.reduction_percentage / 100
              )

              newPrice = suggestedPrice
            } catch (marketError) {
              console.error(`Market analysis failed for ${listing.id}:`, marketError)
              // Fall back to fixed percentage
              newPrice = listing.current_price * (1 - listing.reduction_percentage / 100)
            }
            break

          case 'time_based':
            // More aggressive reduction over time
            const daysListed = Math.ceil((new Date() - new Date(listing.start_time)) / (1000 * 60 * 60 * 24))
            const aggressiveFactor = Math.min(1 + (daysListed / 30) * 0.5, 2)
            newPrice = listing.current_price * (1 - (listing.reduction_percentage / 100) * aggressiveFactor)
            break

          default:
            newPrice = listing.current_price * (1 - listing.reduction_percentage / 100)
        }

        // Ensure we don't go below minimum price
        newPrice = Math.max(newPrice, listing.minimum_price)
        newPrice = Math.round(newPrice * 100) / 100

        // Skip if new price would be the same or higher
        if (newPrice >= listing.current_price) {
          console.log(`No price reduction needed for listing ${listing.id}`)
          continue
        }

        // Update price on eBay (if token is available)
        let ebayUpdateSuccess = false
        if (listing.users.ebay_user_token) {
          try {
            await ebayService.updateItemPrice(
              listing.ebay_item_id,
              newPrice,
              listing.currency,
              listing.users.ebay_user_token
            )
            ebayUpdateSuccess = true
          } catch (ebayError) {
            console.error(`eBay update failed for ${listing.id}:`, ebayError)

            // Log sync error
            await supabase
              .from('sync_errors')
              .insert({
                listing_id: listing.id,
                error_message: `Failed to update price on eBay: ${ebayError.message}`,
                resolved: false
              })
          }
        }

        // Update listing in database regardless of eBay success (for demo purposes)
        const nextReduction = new Date()
        nextReduction.setDate(nextReduction.getDate() + listing.reduction_interval)

        const { error: updateError } = await supabase
          .from('listings')
          .update({
            current_price: newPrice,
            last_price_reduction: new Date().toISOString(),
            next_price_reduction: nextReduction.toISOString()
          })
          .eq('id', listing.id)

        if (updateError) {
          throw updateError
        }

        // Add to price history
        await supabase
          .from('price_history')
          .insert({
            listing_id: listing.id,
            price: newPrice,
            reason: `${listing.reduction_strategy}_reduction`
          })

        console.log(`Successfully reduced price for ${listing.id}: ${listing.current_price} -> ${newPrice}`)
        results.succeeded++

      } catch (error) {
        console.error(`Error processing listing ${listing.id}:`, error)
        results.failed++
        results.errors.push({
          listingId: listing.id,
          error: error.message
        })

        // Log sync error
        await supabase
          .from('sync_errors')
          .insert({
            listing_id: listing.id,
            error_message: error.message,
            resolved: false
          })
      }
    }

    // Log job completion
    await supabase
      .from('monitor_jobs')
      .insert({
        job_type: 'price_check',
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        metadata: results
      })

    console.log('Price monitoring completed:', results)

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Price monitoring completed',
        results
      })
    }

  } catch (error) {
    console.error('Scheduled price monitoring error:', error)

    // Log job failure
    await supabase
      .from('monitor_jobs')
      .insert({
        job_type: 'price_check',
        status: 'failed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        error_message: error.message
      })

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Price monitoring failed',
        message: error.message
      })
    }
  }
})

module.exports = { handler }