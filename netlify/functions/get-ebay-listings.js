const { Handler } = require('@netlify/functions');
const { EbayApiClient } = require('./utils/ebay-api-client');
const { createClient } = require('@supabase/supabase-js');

const handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: 'Method not allowed',
        message: 'Only GET requests are supported'
      })
    };
  }

  try {
    // Get authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
          message: 'Please provide a valid authentication token'
        })
      };
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Verify user authentication
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid authentication token',
          message: 'Please log in again'
        })
      };
    }

    // Initialize eBay client
    const ebayClient = new EbayApiClient(user.id);

    try {
      await ebayClient.initialize();
    } catch (initError) {
      if (initError.code === 'NOT_CONNECTED') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'eBay account not connected',
            message: 'Please connect your eBay account first',
            redirectTo: '/ebay-setup'
          })
        };
      }
      throw initError;
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const pageNumber = parseInt(queryParams.page) || 1;
    const entriesPerPage = parseInt(queryParams.limit) || 100;

    // Get seller's active listings using user's eBay connection
    const response = await ebayClient.getActiveListings(pageNumber, entriesPerPage);

    // Extract useful listing data
    const listings = [];
    if (response && response.ActiveList && response.ActiveList.ItemArray && response.ActiveList.ItemArray.Item) {
      const items = Array.isArray(response.ActiveList.ItemArray.Item)
        ? response.ActiveList.ItemArray.Item
        : [response.ActiveList.ItemArray.Item];

      items.forEach(item => {
        listings.push({
          itemId: item.ItemID,
          title: item.Title,
          currentPrice: item.SellingStatus ? item.SellingStatus.CurrentPrice : null,
          quantity: item.Quantity,
          listingType: item.ListingType,
          endTime: item.EndTime,
          watchCount: item.WatchCount || 0,
          hitCount: item.HitCount || 0,
          timeLeft: item.TimeLeft,
          categoryId: item.PrimaryCategory ? item.PrimaryCategory.CategoryID : null,
          categoryName: item.PrimaryCategory ? item.PrimaryCategory.CategoryName : null,
          listingUrl: item.ListingDetails ? item.ListingDetails.ViewItemURL : null
        });
      });
    }

    // Get pagination info
    const paginationResult = response && response.ActiveList && response.ActiveList.PaginationResult;
    const pagination = {
      totalPages: paginationResult ? parseInt(paginationResult.TotalNumberOfPages) : 1,
      totalEntries: paginationResult ? parseInt(paginationResult.TotalNumberOfEntries) : listings.length,
      currentPage: pageNumber,
      entriesPerPage: entriesPerPage
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        listings: listings,
        pagination: pagination,
        environment: process.env.EBAY_ENVIRONMENT || 'sandbox',
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Failed to fetch eBay listings:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Failed to fetch eBay listings',
        timestamp: new Date().toISOString()
      })
    };
  }
};

module.exports = { handler };