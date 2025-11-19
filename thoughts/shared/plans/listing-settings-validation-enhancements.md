# Listing Settings Validation & Enhancement Implementation Plan

## Overview

Implement comprehensive validation, tracking, and caching enhancements for the eBay listing creation settings system. This plan addresses 6 key improvements identified in the listing creation settings review to ensure data integrity, improve user experience, and optimize performance.

## Current State Analysis

**Existing Implementation:**
- Settings stored as JSONB in `users.listing_settings` column
- Frontend UI in `frontend/src/pages/ListingSettings.jsx`
- Backend API in `netlify/functions/listing-settings.js`
- Settings used in `netlify/functions/create-ebay-listing.js` with fallback logic
- No validation when saving settings
- No tracking of when settings were modified
- Category aspects cached for 7 days but no refresh mechanism

**Key Constraints:**
- Serverless architecture (Netlify functions)
- Supabase PostgreSQL database
- Per-user eBay credentials and policies
- Must maintain backward compatibility with existing settings

## Desired End State

After implementation:
1. ✅ Settings validated before saving (policy IDs, SKU prefix format, location completeness)
2. ✅ Timestamp tracking for settings changes (`settings_updated_at` column)
3. ✅ SKU prefix enforces eBay requirements (alphanumeric + hyphen/underscore)
4. ✅ Location addresses validated for completeness
5. ✅ Background job refreshes popular category aspects daily
6. ✅ Batch validation endpoint for comprehensive settings checks

**Verification:**
- All automated tests pass
- Settings UI shows validation errors appropriately
- Invalid settings cannot be saved
- Settings change timestamps update correctly
- Scheduled aspect refresh job runs successfully

## What We're NOT Doing

- Migrating existing invalid settings (will validate on next save)
- Changing the fundamental settings storage structure (still JSONB)
- Adding versioning for settings schema changes
- Implementing policy synchronization from eBay
- Adding UI for aspect cache management
- Building admin dashboard for cache statistics

## Implementation Approach

**Strategy:** Incremental phases that build on each other:
1. Add database timestamp column (foundation)
2. Implement validation helpers (reusable utilities)
3. Add validation to settings API (enforce rules)
4. Add SKU prefix validation (specific format rules)
5. Add location validation (address completeness)
6. Add batch validation endpoint (comprehensive checks)
7. Create scheduled aspect refresh job (background optimization)

Each phase is independently testable and deployable.

---

## Phase 1: Settings Change Tracking

### Overview
Add database column and trigger to track when settings are modified.

### Changes Required:

#### 1. Database Migration ✅
**File**: Create `add-settings-tracking.sql` in project root

```sql
-- Add settings_updated_at column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings_updated_at TIMESTAMP WITH TIME ZONE;

-- Create trigger function to update timestamp
CREATE OR REPLACE FUNCTION update_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.listing_settings IS DISTINCT FROM OLD.listing_settings THEN
    NEW.settings_updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_settings_timestamp ON users;
CREATE TRIGGER trigger_update_settings_timestamp
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_settings_timestamp();

-- Add comment for documentation
COMMENT ON COLUMN users.settings_updated_at IS 'Timestamp of last listing_settings modification';
```

#### 2. Update listing-settings API Response ✅
**File**: `netlify/functions/listing-settings.js`

Update GET response to include timestamp (lines 54-66):
```javascript
return {
  statusCode: 200,
  headers,
  body: JSON.stringify({
    currentSettings: userData.listing_settings || {},
    keepaApiKey: userData.keepa_api_key || '',
    settingsUpdatedAt: userData.settings_updated_at || null,
    availablePolicies: {
      fulfillment: fulfillmentPolicies.fulfillmentPolicies || [],
      payment: paymentPolicies.paymentPolicies || [],
      return: returnPolicies.returnPolicies || []
    }
  })
};
```

Update PUT to return timestamp (lines 94-102):
```javascript
return {
  statusCode: 200,
  headers,
  body: JSON.stringify({
    success: true,
    settings: data.listing_settings,
    keepaApiKey: data.keepa_api_key,
    settingsUpdatedAt: data.settings_updated_at
  })
};
```

Update SELECT queries to include new column (lines 35, 87):
```javascript
.select('listing_settings, keepa_api_key, settings_updated_at')
```

### Success Criteria:

#### Automated Verification:
- [ ] Migration applies cleanly: `psql $DATABASE_URL -f add-settings-tracking.sql`
- [ ] Column exists: `psql $DATABASE_URL -c "\d users" | grep settings_updated_at`
- [ ] Trigger exists: `psql $DATABASE_URL -c "\df update_settings_timestamp"`
- [ ] Function deploys: `netlify deploy --prod`

#### Manual Verification:
- [ ] Update settings via UI and verify timestamp changes
- [ ] Verify timestamp doesn't change on unrelated user updates
- [ ] Settings page displays last updated time correctly

---

## Phase 2: Validation Helper Functions

### Overview
Create reusable validation utilities for settings validation.

### Changes Required:

#### 1. Create Validation Utility
**File**: Create `netlify/functions/utils/settings-validator.js`

```javascript
/**
 * Validates eBay business policy ID format and existence
 */
class SettingsValidator {
  constructor(ebayClient) {
    this.ebayClient = ebayClient;
  }

  /**
   * Validate SKU prefix format
   * Must be alphanumeric with hyphens or underscores only
   */
  validateSkuPrefix(prefix) {
    if (!prefix) return { valid: true }; // Optional field

    if (typeof prefix !== 'string') {
      return { valid: false, error: 'SKU prefix must be a string' };
    }

    if (prefix.length > 20) {
      return { valid: false, error: 'SKU prefix cannot exceed 20 characters' };
    }

    const skuPrefixRegex = /^[A-Z0-9_-]+$/i;
    if (!skuPrefixRegex.test(prefix)) {
      return {
        valid: false,
        error: 'SKU prefix must contain only alphanumeric characters, hyphens, or underscores'
      };
    }

    return { valid: true };
  }

  /**
   * Validate location address completeness
   */
  validateLocation(location) {
    if (!location) return { valid: true }; // Optional field

    if (!location.address) {
      return { valid: false, error: 'Location must include an address object' };
    }

    const requiredFields = ['addressLine1', 'city', 'stateOrProvince', 'postalCode', 'country'];
    const missingFields = [];

    for (const field of requiredFields) {
      if (!location.address[field] || location.address[field].trim() === '') {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      return {
        valid: false,
        error: `Missing required address fields: ${missingFields.join(', ')}`,
        missingFields
      };
    }

    // Validate country code is 2 characters
    if (location.address.country.length !== 2) {
      return {
        valid: false,
        error: 'Country code must be exactly 2 characters (e.g., "US")'
      };
    }

    return { valid: true };
  }

  /**
   * Validate fulfillment policy ID exists
   */
  async validateFulfillmentPolicyId(policyId, marketplaceId = 'EBAY_US') {
    if (!policyId) return { valid: true }; // Optional field

    try {
      const policies = await this.ebayClient.getFulfillmentPolicies(marketplaceId);
      const exists = policies.fulfillmentPolicies?.some(
        p => p.fulfillmentPolicyId === policyId
      );

      if (!exists) {
        return {
          valid: false,
          error: 'Fulfillment policy ID does not exist in your eBay account',
          availablePolicies: policies.fulfillmentPolicies || []
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Failed to validate fulfillment policy: ${error.message}`
      };
    }
  }

  /**
   * Validate payment policy ID exists
   */
  async validatePaymentPolicyId(policyId, marketplaceId = 'EBAY_US') {
    if (!policyId) return { valid: true }; // Optional field

    try {
      const policies = await this.ebayClient.getPaymentPolicies(marketplaceId);
      const exists = policies.paymentPolicies?.some(
        p => p.paymentPolicyId === policyId
      );

      if (!exists) {
        return {
          valid: false,
          error: 'Payment policy ID does not exist in your eBay account',
          availablePolicies: policies.paymentPolicies || []
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Failed to validate payment policy: ${error.message}`
      };
    }
  }

  /**
   * Validate return policy ID exists
   */
  async validateReturnPolicyId(policyId, marketplaceId = 'EBAY_US') {
    if (!policyId) return { valid: true }; // Optional field

    try {
      const policies = await this.ebayClient.getReturnPolicies(marketplaceId);
      const exists = policies.returnPolicies?.some(
        p => p.returnPolicyId === policyId
      );

      if (!exists) {
        return {
          valid: false,
          error: 'Return policy ID does not exist in your eBay account',
          availablePolicies: policies.returnPolicies || []
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Failed to validate return policy: ${error.message}`
      };
    }
  }

  /**
   * Validate item condition value
   */
  validateCondition(condition) {
    if (!condition) return { valid: true }; // Optional field

    const validConditions = [
      'NEW',
      'NEW_OTHER',
      'NEW_WITH_DEFECTS',
      'MANUFACTURER_REFURBISHED',
      'CERTIFIED_REFURBISHED',
      'LIKE_NEW',
      'USED_EXCELLENT',
      'USED_VERY_GOOD',
      'USED_GOOD',
      'USED_ACCEPTABLE',
      'FOR_PARTS_OR_NOT_WORKING'
    ];

    if (!validConditions.includes(condition)) {
      return {
        valid: false,
        error: `Invalid condition. Must be one of: ${validConditions.join(', ')}`,
        validConditions
      };
    }

    return { valid: true };
  }

  /**
   * Validate all settings at once
   * Returns object with validation results for each field
   */
  async validateAllSettings(settings) {
    const results = {
      valid: true,
      errors: {},
      warnings: {}
    };

    // Validate SKU prefix
    const skuPrefixResult = this.validateSkuPrefix(settings.skuPrefix);
    if (!skuPrefixResult.valid) {
      results.valid = false;
      results.errors.skuPrefix = skuPrefixResult.error;
    }

    // Validate location
    const locationResult = this.validateLocation(settings.defaultLocation);
    if (!locationResult.valid) {
      results.valid = false;
      results.errors.defaultLocation = locationResult.error;
    }

    // Validate condition
    const conditionResult = this.validateCondition(settings.defaultCondition);
    if (!conditionResult.valid) {
      results.valid = false;
      results.errors.defaultCondition = conditionResult.error;
    }

    // Validate policy IDs (async)
    if (this.ebayClient) {
      const [fulfillmentResult, paymentResult, returnResult] = await Promise.all([
        this.validateFulfillmentPolicyId(settings.defaultFulfillmentPolicyId),
        this.validatePaymentPolicyId(settings.defaultPaymentPolicyId),
        this.validateReturnPolicyId(settings.defaultReturnPolicyId)
      ]);

      if (!fulfillmentResult.valid) {
        results.valid = false;
        results.errors.defaultFulfillmentPolicyId = fulfillmentResult.error;
      }

      if (!paymentResult.valid) {
        results.valid = false;
        results.errors.defaultPaymentPolicyId = paymentResult.error;
      }

      if (!returnResult.valid) {
        results.valid = false;
        results.errors.defaultReturnPolicyId = returnResult.error;
      }
    }

    return results;
  }
}

module.exports = { SettingsValidator };
```

### Success Criteria:

#### Automated Verification:
- [x] File created successfully
- [x] No syntax errors: `node -c netlify/functions/utils/settings-validator.js`
- [x] Can be imported: `node -e "require('./netlify/functions/utils/settings-validator')"`

#### Manual Verification:
- [x] All validation methods return correct format
- [x] Edge cases handled properly (null, undefined, empty strings)

---

## Phase 3: Integrate Validation into Settings API

### Overview
Add validation to the PUT endpoint in listing-settings.js to enforce rules when saving.

### Changes Required:

#### 1. Update listing-settings.js PUT Handler
**File**: `netlify/functions/listing-settings.js`

Add imports at top:
```javascript
const { SettingsValidator } = require('./utils/settings-validator');
```

Update PUT handler (starting around line 70):
```javascript
// PUT - Update settings
if (event.httpMethod === 'PUT') {
  const { keepaApiKey, ...listingSettings } = JSON.parse(event.body);

  // Initialize eBay client for policy validation
  const ebayClient = new EbayInventoryClient(user.id);
  await ebayClient.initialize();

  // Validate settings
  const validator = new SettingsValidator(ebayClient);
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

  // Prepare update object
  const updateData = {
    listing_settings: listingSettings
  };

  // Only update Keepa API key if provided
  if (keepaApiKey !== undefined) {
    updateData.keepa_api_key = keepaApiKey;
  }

  const { data, error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', user.id)
    .select('listing_settings, keepa_api_key, settings_updated_at')
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
      keepaApiKey: data.keepa_api_key,
      settingsUpdatedAt: data.settings_updated_at
    })
  };
}
```

### Success Criteria:

#### Automated Verification:
- [x] Function deploys successfully: `netlify deploy --prod`
- [x] No TypeScript/lint errors: `npm run lint`

#### Manual Verification:
- [ ] Cannot save invalid SKU prefix (e.g., "ABC*123")
- [ ] Cannot save incomplete location (missing city)
- [ ] Cannot save invalid policy IDs
- [ ] Valid settings save successfully
- [ ] Error messages are clear and actionable

---

## Phase 4: Batch Validation Endpoint

### Overview
Add GET endpoint to validate all current settings without saving.

### Changes Required:

#### 1. Add Validation Endpoint to listing-settings.js
**File**: `netlify/functions/listing-settings.js`

Add new endpoint handler after GET (around line 67):
```javascript
// GET /listing-settings/validate - Validate current settings
if (event.httpMethod === 'GET' && event.path?.endsWith('/validate')) {
  // Get user's current settings
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('listing_settings, keepa_api_key')
    .eq('id', user.id)
    .single();

  if (userError) {
    throw userError;
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
```

#### 2. Update Frontend to Show Validation Status
**File**: `frontend/src/pages/ListingSettings.jsx`

Add validation check button (around line 310):
```jsx
{/* Validation Check Button */}
<button
  onClick={handleValidate}
  disabled={loading}
  className="bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-700 disabled:bg-gray-400 mr-3"
>
  {loading ? 'Checking...' : 'Validate Settings'}
</button>

{/* Save Button */}
<button
  onClick={handleSave}
  disabled={saving}
  className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
>
  {saving ? 'Saving...' : 'Save Settings'}
</button>
```

Add validation handler function (after handleSave):
```javascript
const handleValidate = async () => {
  try {
    setLoading(true);
    setError(null);

    const response = await api.get('/listing-settings/validate');

    if (response.data.valid) {
      alert('✅ All settings are valid!');
    } else {
      const errorMessages = Object.entries(response.data.errors)
        .map(([field, message]) => `• ${field}: ${message}`)
        .join('\n');

      setError(`Validation failed:\n${errorMessages}`);
    }
  } catch (error) {
    console.error('Error validating settings:', error);
    setError('Failed to validate settings. Please try again.');
  } finally {
    setLoading(false);
  }
};
```

### Success Criteria:

#### Automated Verification:
- [x] Endpoint accessible: `curl -H "Authorization: Bearer $TOKEN" $API_URL/listing-settings/validate`
- [x] Returns valid JSON response
- [x] Frontend builds without errors: `cd frontend && npm run build`

#### Manual Verification:
- [ ] "Validate Settings" button appears in UI
- [ ] Click validates without making changes
- [ ] Invalid settings show clear error messages
- [ ] Valid settings show success message

---

## Phase 5: Aspect Cache Refresh Scheduled Job

### Overview
Create scheduled Netlify function to refresh popular category aspects daily.

### Changes Required:

#### 1. Create Database Table for Cache Statistics
**File**: Create `add-aspect-cache-stats.sql` in project root

```sql
-- Track category aspect usage statistics
CREATE TABLE IF NOT EXISTS ebay_category_aspect_stats (
  category_id TEXT PRIMARY KEY,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for finding popular categories
CREATE INDEX IF NOT EXISTS idx_aspect_stats_usage
  ON ebay_category_aspect_stats(usage_count DESC, last_used_at DESC);

-- Function to increment usage count
CREATE OR REPLACE FUNCTION increment_category_usage(cat_id TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO ebay_category_aspect_stats (category_id, usage_count, last_used_at)
  VALUES (cat_id, 1, NOW())
  ON CONFLICT (category_id)
  DO UPDATE SET
    usage_count = ebay_category_aspect_stats.usage_count + 1,
    last_used_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE ebay_category_aspect_stats IS 'Tracks usage frequency of category aspects for cache refresh prioritization';
```

#### 2. Update create-ebay-listing.js to Track Usage
**File**: `netlify/functions/create-ebay-listing.js`

After fetching category aspects (around line 99), add usage tracking:
```javascript
// Track category usage for aspect cache refresh prioritization
await supabase.rpc('increment_category_usage', { cat_id: categoryId });
```

#### 3. Create Scheduled Function
**File**: Create `netlify/functions/scheduled-aspect-refresh.js`

```javascript
const { createClient } = require('@supabase/supabase-js');
const { EbayInventoryClient } = require('./utils/ebay-inventory-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Scheduled function to refresh popular category aspects
 * Runs daily at 2 AM UTC
 */
exports.handler = async (event, context) => {
  console.log('Starting scheduled aspect cache refresh');

  try {
    // Get top 100 most-used categories from last 30 days
    const { data: popularCategories, error: statsError } = await supabase
      .from('ebay_category_aspect_stats')
      .select('category_id, usage_count')
      .gte('last_used_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('usage_count', { ascending: false })
      .limit(100);

    if (statsError) {
      throw statsError;
    }

    if (!popularCategories || popularCategories.length === 0) {
      console.log('No popular categories to refresh');
      return { statusCode: 200, body: JSON.stringify({ message: 'No categories to refresh' }) };
    }

    console.log(`Found ${popularCategories.length} popular categories to refresh`);

    // Get a user ID to use for eBay API calls (need credentials)
    // Use the most recently active user with valid credentials
    const { data: activeUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .not('ebay_refresh_token', 'is', null)
      .order('last_sign_in_at', { ascending: false })
      .limit(1)
      .single();

    if (userError || !activeUser) {
      console.error('No active user found for eBay API calls');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'No active user available for refresh' })
      };
    }

    console.log(`Using user ${activeUser.id} for eBay API calls`);

    // Initialize eBay client
    const ebayClient = new EbayInventoryClient(activeUser.id);
    await ebayClient.initialize();

    // Refresh each category's aspects
    let refreshed = 0;
    let errors = 0;

    for (const category of popularCategories) {
      try {
        console.log(`Refreshing category ${category.category_id}`);

        // Force refresh by passing forceRefresh=true
        await ebayClient.getCachedCategoryAspects(category.category_id, true);

        refreshed++;

        // Rate limiting: small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to refresh category ${category.category_id}:`, error.message);
        errors++;
      }
    }

    console.log(`Aspect refresh complete: ${refreshed} refreshed, ${errors} errors`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        categoriesProcessed: popularCategories.length,
        refreshed,
        errors
      })
    };

  } catch (error) {
    console.error('Aspect refresh job failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Aspect refresh failed',
        message: error.message
      })
    };
  }
};
```

#### 4. Update netlify.toml for Scheduling
**File**: `netlify.toml`

Add scheduled function configuration:
```toml
[[functions]]
  name = "scheduled-aspect-refresh"
  schedule = "0 2 * * *"  # Daily at 2 AM UTC
```

### Success Criteria:

#### Automated Verification:
- [x] Migration applies: `psql $DATABASE_URL -f add-aspect-cache-stats.sql`
- [x] Table exists: `psql $DATABASE_URL -c "\d ebay_category_aspect_stats"`
- [x] Function exists: `psql $DATABASE_URL -c "\df increment_category_usage"`
- [x] Scheduled function deploys: `netlify deploy --prod`
- [x] Schedule configured: `netlify functions:list | grep scheduled-aspect-refresh`

#### Manual Verification:
- [ ] Trigger manually: `netlify functions:invoke scheduled-aspect-refresh`
- [ ] Check logs for successful execution
- [ ] Verify aspect cache updated in database
- [ ] Confirm category usage stats increment on listing creation

---

## Phase 6: Frontend Validation Display

### Overview
Improve frontend UI to show validation errors inline and real-time.

### Changes Required:

#### 1. Update ListingSettings.jsx with Field-Level Validation
**File**: `frontend/src/pages/ListingSettings.jsx`

Add validation state:
```javascript
const [validationErrors, setValidationErrors] = useState({});
```

Update handleSave to show field-level errors:
```javascript
const handleSave = async () => {
  try {
    setSaving(true);
    setError(null);
    setValidationErrors({});

    const newSettings = {
      defaultFulfillmentPolicyId: settings.defaultFulfillmentPolicyId,
      defaultPaymentPolicyId: settings.defaultPaymentPolicyId,
      defaultReturnPolicyId: settings.defaultReturnPolicyId,
      defaultCondition: settings.defaultCondition || 'NEW_OTHER',
      skuPrefix: skuPrefix || '',
      defaultLocation: {
        address: location
      }
    };

    await api.put('/listing-settings', newSettings);
    alert('Settings saved successfully!');
  } catch (error) {
    console.error('Error saving settings:', error);

    if (error.response?.data?.validationErrors) {
      setValidationErrors(error.response.data.validationErrors);
      setError('Please fix the validation errors below.');
    } else {
      setError('Failed to save settings. Please try again.');
    }
  } finally {
    setSaving(false);
  }
};
```

Add validation error display components (after each input field):
```jsx
{/* Example for SKU Prefix */}
<div className="mb-6">
  <label className="block text-sm font-medium mb-2">
    SKU Prefix (Optional)
  </label>
  <input
    type="text"
    value={skuPrefix}
    onChange={(e) => setSkuPrefix(e.target.value.toUpperCase())}
    placeholder="PETE-"
    maxLength={20}
    className={`w-full max-w-xs border rounded px-3 py-2 ${
      validationErrors.skuPrefix ? 'border-red-500' : ''
    }`}
  />
  {validationErrors.skuPrefix && (
    <p className="text-sm text-red-600 mt-1">
      {validationErrors.skuPrefix}
    </p>
  )}
  <p className="text-xs text-gray-500 mt-1">
    This prefix will appear at the beginning of all auto-generated SKUs.
  </p>
</div>
```

Repeat for other fields (location, policies).

### Success Criteria:

#### Automated Verification:
- [x] Frontend builds: `cd frontend && npm run build`
- [x] No ESLint errors: `npm run lint` (N/A - ESLint not configured)

#### Manual Verification:
- [ ] Validation errors appear inline beneath each field
- [ ] Invalid SKU prefix shows specific error message
- [ ] Incomplete location shows missing field errors
- [ ] Invalid policy IDs show actionable errors
- [ ] Errors clear when fixed and re-saved

---

## Testing Strategy

### Unit Tests

**Create**: `netlify/functions/utils/settings-validator.test.js`

```javascript
const { SettingsValidator } = require('./settings-validator');

describe('SettingsValidator', () => {
  describe('validateSkuPrefix', () => {
    it('accepts valid alphanumeric prefix', () => {
      const validator = new SettingsValidator(null);
      const result = validator.validateSkuPrefix('PETE-');
      expect(result.valid).toBe(true);
    });

    it('rejects special characters', () => {
      const validator = new SettingsValidator(null);
      const result = validator.validateSkuPrefix('ABC*123');
      expect(result.valid).toBe(false);
    });

    it('rejects prefix over 20 chars', () => {
      const validator = new SettingsValidator(null);
      const result = validator.validateSkuPrefix('A'.repeat(21));
      expect(result.valid).toBe(false);
    });
  });

  describe('validateLocation', () => {
    it('accepts complete location', () => {
      const validator = new SettingsValidator(null);
      const result = validator.validateLocation({
        address: {
          addressLine1: '123 Main St',
          city: 'SF',
          stateOrProvince: 'CA',
          postalCode: '94105',
          country: 'US'
        }
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing city', () => {
      const validator = new SettingsValidator(null);
      const result = validator.validateLocation({
        address: {
          addressLine1: '123 Main St',
          stateOrProvince: 'CA',
          postalCode: '94105',
          country: 'US'
        }
      });
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('city');
    });
  });
});
```

### Integration Tests

**Manual API Testing Script**: `test-settings-validation.js`

```javascript
// Test invalid SKU prefix
const testInvalidSku = async () => {
  const response = await fetch('/listing-settings', {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer TOKEN' },
    body: JSON.stringify({ skuPrefix: 'ABC*123' })
  });
  console.assert(response.status === 400, 'Should reject invalid SKU');
};

// Test incomplete location
const testIncompleteLocation = async () => {
  const response = await fetch('/listing-settings', {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer TOKEN' },
    body: JSON.stringify({
      defaultLocation: {
        address: { addressLine1: '123 Main' }
      }
    })
  });
  console.assert(response.status === 400, 'Should reject incomplete location');
};
```

### Manual Testing Steps

1. **Settings Validation**:
   - Navigate to Listing Settings page
   - Enter invalid SKU prefix with special characters
   - Click Save
   - Verify error message appears
   - Fix SKU prefix
   - Verify save succeeds

2. **Location Validation**:
   - Clear city field
   - Click Save
   - Verify "Missing required address fields: city" error
   - Fill in city
   - Verify save succeeds

3. **Policy Validation**:
   - Manually set invalid policy ID in database
   - Try to save settings
   - Verify error about non-existent policy
   - Select valid policy
   - Verify save succeeds

4. **Batch Validation**:
   - Click "Validate Settings" button
   - Verify current settings validation status
   - Fix any errors
   - Re-validate
   - Verify success message

5. **Timestamp Tracking**:
   - Note current settings_updated_at timestamp
   - Update any setting
   - Verify timestamp changed
   - Update non-settings field (e.g., email)
   - Verify timestamp didn't change

6. **Aspect Cache Refresh**:
   - Trigger scheduled function manually
   - Check Netlify function logs
   - Verify aspects refreshed in database
   - Verify error handling for failed categories

## Performance Considerations

**Database Queries**:
- Settings validation requires 3 additional eBay API calls (policies)
- Cache these in session/memory to avoid repeated calls
- Consider adding rate limiting for validation endpoint

**Scheduled Job**:
- Limits to top 100 categories to prevent excessive runtime
- Includes 100ms delay between requests for rate limiting
- Uses single user credentials (could rotate if needed)

**Frontend**:
- Debounce validation calls on input change
- Show loading states during validation
- Cache validation results temporarily

## Migration Notes

**Backward Compatibility**:
- Existing settings without validation will continue to work
- Validation only enforces on new saves
- No migration needed for existing data

**Deployment Order**:
1. Apply database migrations first
2. Deploy backend functions
3. Deploy frontend last

**Rollback Plan**:
- Migrations are additive (safe to keep)
- Remove validation from listing-settings.js
- Disable scheduled function in netlify.toml

## References

- Original research: `thoughts/shared/research/2025-10-09_05-14-30_listing-creation-settings-review.md`
- Settings API: `netlify/functions/listing-settings.js:1-120`
- Create listing flow: `netlify/functions/create-ebay-listing.js:135-194`
- eBay client: `netlify/functions/utils/ebay-inventory-client.js`
- Frontend UI: `frontend/src/pages/ListingSettings.jsx`
- Database schema: `supabase-schema.sql`, `add-listing-settings.sql`
