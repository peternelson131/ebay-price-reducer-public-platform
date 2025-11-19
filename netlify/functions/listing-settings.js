const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');
const { EbayInventoryClient } = require('./utils/ebay-inventory-client');
const { SettingsValidator } = require('./utils/settings-validator');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    // GET - Retrieve settings and available policies
    if (event.httpMethod === 'GET') {
      // Get user's current settings
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('listing_settings, ebay_connection_status, settings_updated_at')
        .eq('id', user.id)
        .single();

      if (userError) {
        throw userError;
      }

      // Check if eBay is connected
      const ebayConnected = userData.ebay_connection_status === 'connected';
      let availablePolicies = {
        fulfillment: [],
        payment: [],
        return: []
      };

      // Optionally fetch policies if eBay is connected (for reference only)
      if (ebayConnected) {
        try {
          const ebayClient = new EbayInventoryClient(user.id);
          await ebayClient.initialize();

          const [fulfillmentPolicies, paymentPolicies, returnPolicies] = await Promise.all([
            ebayClient.getFulfillmentPolicies('EBAY_US'),
            ebayClient.getPaymentPolicies('EBAY_US'),
            ebayClient.getReturnPolicies('EBAY_US')
          ]);

          availablePolicies = {
            fulfillment: fulfillmentPolicies.fulfillmentPolicies || [],
            payment: paymentPolicies.paymentPolicies || [],
            return: returnPolicies.returnPolicies || []
          };
        } catch (ebayError) {
          console.error('Error fetching eBay policies:', ebayError);
          // Continue without policies - user can manually enter policy IDs
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          currentSettings: userData.listing_settings || {},
          settingsUpdatedAt: userData.settings_updated_at || null,
          ebayConnected: ebayConnected,
          availablePolicies: availablePolicies,
          requiresEbayConnection: false // Changed to false - eBay connection not required for manual entry
        })
      };
    }

    // GET /listing-settings/validate - Validate current settings
    if (event.httpMethod === 'GET' && event.path?.endsWith('/validate')) {
      // Get user's current settings
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('listing_settings, ebay_connection_status')
        .eq('id', user.id)
        .single();

      if (userError) {
        throw userError;
      }

      // Check if eBay is connected
      const ebayConnected = userData.ebay_connection_status === 'connected';
      if (!ebayConnected) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'eBay account not connected',
            requiresEbayConnection: true
          })
        };
      }

      // Initialize eBay client
      const ebayClient = new EbayInventoryClient(user.id);
      await ebayClient.initialize();

      // Validate current settings
      const validator = new SettingsValidator(ebayClient);
      const validationResult = await validator.validateAllSettings(
        userData.listing_settings || {}
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: validationResult.valid,
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          settings: userData.listing_settings
        })
      };
    }

    // PUT - Update settings
    if (event.httpMethod === 'PUT') {
      const listingSettings = JSON.parse(event.body);

      console.log('💾 Saving Listing Settings for user:', user.id);
      console.log('📦 Settings being saved:', JSON.stringify(listingSettings, null, 2));

      // Basic validation without requiring eBay connection
      const validator = new SettingsValidator(null); // Pass null - we'll skip eBay API validation
      const validationResult = await validator.validateAllSettings(listingSettings);

      if (!validationResult.valid) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Invalid settings',
            validationErrors: validationResult.errors,
            validationWarnings: validationResult.warnings
          })
        };
      }

      // Save settings to database - no eBay validation required
      // Note: settings_updated_at will be automatically updated by the trigger
      const { data, error } = await supabase
        .from('users')
        .update({
          listing_settings: listingSettings
        })
        .eq('id', user.id)
        .select('listing_settings, settings_updated_at')
        .single();

      if (error) {
        throw error;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          settings: data.listing_settings,
          settingsUpdatedAt: data.settings_updated_at,
          message: 'Settings saved successfully'
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Settings error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
