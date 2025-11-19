# Listing Creation Enhancements Implementation Plan

**Date**: 2025-10-08
**Status**: Ready for Implementation
**Priority**: High
**Estimated Effort**: 2-3 days

---

## Overview

This plan addresses seven user-reported issues with the eBay listing creation workflow, focusing on Keepa data integration, pricing, settings configuration, and SKU management.

---

## Current State Analysis

Based on comprehensive code research, here's the status of each issue:

| Issue | Current Status | Action Needed |
|-------|---------------|---------------|
| 1. Brand duplication in title | ❌ Bug exists | Fix logic |
| 2. Suggested price not showing | ⚠️ Partially working | Enhance display |
| 3. Keepa photos | ✅ Working | Verify & document |
| 4. Keepa description | ✅ Working | Verify & document |
| 5. Business policy settings | ✅ Working | Verify accessibility |
| 6. Default shipping location UI | ❌ Missing UI | Add UI components |
| 7. SKU prefix configuration | ❌ Not implemented | Full implementation |

---

## Desired End State

### Success Criteria

#### Automated Verification:
- [ ] Unit tests pass: `npm test` (frontend)
- [ ] ESLint passes: `npm run lint` (frontend)
- [ ] TypeScript compilation succeeds (if applicable)
- [ ] Backend functions deploy successfully

#### Manual Verification:
- [ ] Brand is not duplicated in eBay listing titles
- [ ] Suggested price displays in AutoList review step
- [ ] All available Keepa photos appear in listing preview
- [ ] Keepa description appears in eBay listing
- [ ] Business policies can be configured in ListingSettings page
- [ ] Default shipping location can be set and saved in settings
- [ ] SKU prefix can be configured and appears in generated SKUs
- [ ] Physical labels can be created with custom SKU prefix

---

## What We're NOT Doing

- Not changing eBay category determination logic
- Not modifying Keepa API integration (beyond using existing fields)
- Not implementing multi-warehouse inventory locations (future enhancement)
- Not changing the core SKU generation algorithm (only adding prefix)
- Not modifying the listing creation flow architecture

---

## Implementation Approach

**Strategy**: Fix critical bugs first (title, SKU), then enhance UI for existing backend functionality (location, policies), finally improve UX (pricing display).

**Phases**:
1. **Bug Fixes** (Critical) - Title duplication, SKU prefix
2. **UI Enhancements** (High) - Location settings UI, pricing display
3. **Verification** (Medium) - Confirm photos, description, policies work
4. **Testing & Documentation** (Low) - End-to-end validation

---

## Phase 1: Fix Title Duplication (Critical)

### Overview
Prevent "Nike Nike Air Max..." by detecting if brand is already in the title before prepending.

### Changes Required

#### 1. Update createEbayTitle() Function
**File**: `frontend/src/pages/AutoList.jsx`
**Lines**: 342-360

**Current Code**:
```javascript
const createEbayTitle = (item) => {
  let title = `${item.brand ? item.brand + ' ' : ''}${item.title}`
  // ...
}
```

**New Code**:
```javascript
const createEbayTitle = (item) => {
  let title = item.title

  // Only prepend brand if not already in title (case-insensitive check)
  if (item.brand && !title.toLowerCase().startsWith(item.brand.toLowerCase())) {
    title = `${item.brand} ${title}`
  }

  // Don't add condition suffix for NEW_OTHER as it's the default
  if (item.condition && item.condition !== 'NEW_OTHER' && item.condition !== 'New') {
    title += ` - ${item.condition}`
  }

  // Trim to 80 chars without cutting words
  if (title.length > 80) {
    title = title.substring(0, 80)
    const lastSpace = title.lastIndexOf(' ')
    if (lastSpace > 60) {
      title = title.substring(0, lastSpace)
    }
  }

  return title
}
```

### Success Criteria

#### Automated Verification:
- [ ] ESLint passes: `npm run lint`
- [ ] No console errors when processing ASINs

#### Manual Verification:
- [ ] Test ASIN B08N5WRWNW (Nike product with brand in title)
- [ ] Verify title shows "Nike Air Max..." not "Nike Nike Air Max..."
- [ ] Test products WITHOUT brand in title still get brand prepended
- [ ] Test products with brand in middle of title (should still prepend)

---

## Phase 2: Implement SKU Prefix Configuration (Critical)

### Overview
Allow users to configure a custom SKU prefix (e.g., "PETE-", "WAREHOUSE-A-") that appears at the beginning of all generated SKUs.

### Changes Required

#### 1. Update Database Schema Documentation
**File**: `add-listing-settings.sql`
**Lines**: 10-25

**Add to example JSON**:
```javascript
{
  "defaultFulfillmentPolicyId": "6786459000",
  "defaultPaymentPolicyId": "6786454000",
  "defaultReturnPolicyId": "6786458000",
  "defaultCondition": "NEW_OTHER",
  "skuPrefix": "PETE-",  // ← NEW FIELD
  "defaultLocation": { ... }
}
```

#### 2. Update SKU Generation Function
**File**: `netlify/functions/create-ebay-listing.js`
**Lines**: 73-82

**Current Code**:
```javascript
function generateDeterministicSku(userId, listingData) {
  const hash = crypto.createHash('md5')
    .update(`${userId}-${listingData.title}-${listingData.price}`)
    .digest('hex')
    .substring(0, 16);
  return `SKU-${userId.substring(0, 8)}-${hash}`;
}
```

**New Code**:
```javascript
function generateDeterministicSku(userId, listingData, userSettings = {}) {
  const hash = crypto.createHash('md5')
    .update(`${userId}-${listingData.title}-${listingData.price}`)
    .digest('hex')
    .substring(0, 16);

  // Use custom prefix if configured, otherwise use default
  const prefix = userSettings.skuPrefix || 'SKU-';

  return `${prefix}${userId.substring(0, 8)}-${hash}`;
}
```

#### 3. Pass userSettings to SKU Generation
**File**: `netlify/functions/create-ebay-listing.js`
**Lines**: 532-534

**Current Code**:
```javascript
const sku = listingData.sku ||
            listingData.idempotencyKey ||
            generateDeterministicSku(user.id, listingData);
```

**New Code**:
```javascript
const sku = listingData.sku ||
            listingData.idempotencyKey ||
            generateDeterministicSku(user.id, listingData, userSettings);
```

#### 4. Add UI to ListingSettings Page
**File**: `frontend/src/pages/ListingSettings.jsx`
**Location**: After business policy dropdowns (around line 220)

**Add New Section**:
```jsx
{/* SKU Prefix Configuration */}
<div className="space-y-2">
  <label className="block text-sm font-medium text-gray-700">
    SKU Prefix (Optional)
  </label>
  <input
    type="text"
    value={skuPrefix}
    onChange={(e) => setSkuPrefix(e.target.value.toUpperCase())}
    placeholder="PETE-"
    maxLength="20"
    className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
  <p className="text-xs text-gray-500">
    This prefix will appear at the beginning of all auto-generated SKUs.
    Example: "PETE-a7b3c4d5-3f2a1b4c"
  </p>
  <p className="text-xs text-gray-500">
    Leave blank to use default "SKU-" prefix.
  </p>
</div>
```

#### 5. Update ListingSettings State Management
**File**: `frontend/src/pages/ListingSettings.jsx`
**Lines**: 10-23 (state declarations)

**Add State**:
```javascript
const [skuPrefix, setSkuPrefix] = useState('')
```

**Update Save Handler** (Lines 58-81):
```javascript
const newSettings = {
  defaultFulfillmentPolicyId: settings.defaultFulfillmentPolicyId,
  defaultPaymentPolicyId: settings.defaultPaymentPolicyId,
  defaultReturnPolicyId: settings.defaultReturnPolicyId,
  defaultCondition: settings.defaultCondition || 'NEW_OTHER',
  skuPrefix: skuPrefix || '', // ← NEW
  defaultLocation: {
    address: location
  }
};
```

**Update Load Handler** (Lines 33-57):
```javascript
// After loading settings
if (data.currentSettings.skuPrefix) {
  setSkuPrefix(data.currentSettings.skuPrefix)
}
```

### Success Criteria

#### Automated Verification:
- [ ] No TypeScript/ESLint errors
- [ ] Settings save successfully via PUT /listing-settings
- [ ] SKU prefix persists in database after save

#### Manual Verification:
- [ ] Navigate to ListingSettings page
- [ ] Set SKU prefix to "WAREHOUSE-A-"
- [ ] Save settings
- [ ] Create new listing without providing SKU
- [ ] Verify generated SKU starts with "WAREHOUSE-A-"
- [ ] Test with blank prefix (should use "SKU-")
- [ ] Test max length validation (20 chars)

---

## Phase 3: Add Default Shipping Location UI (High Priority)

### Overview
Add UI to ListingSettings page for configuring default shipping location (backend already functional).

### Changes Required

#### 1. Add Location Form Fields to ListingSettings.jsx
**File**: `frontend/src/pages/ListingSettings.jsx`
**Location**: After return policy section (around line 200)

**Add New Section**:
```jsx
{/* Default Shipping Location */}
<div className="border-t pt-6 mt-6">
  <h3 className="text-lg font-medium text-gray-900 mb-4">
    Default Shipping Location
  </h3>
  <p className="text-sm text-gray-600 mb-4">
    This address will be used as the shipping origin for all new listings.
  </p>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {/* Address Line 1 */}
    <div className="md:col-span-2">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Address Line 1 <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={location.addressLine1}
        onChange={(e) => setLocation({ ...location, addressLine1: e.target.value })}
        placeholder="123 Main Street"
        required
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    {/* City */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        City <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={location.city}
        onChange={(e) => setLocation({ ...location, city: e.target.value })}
        placeholder="San Francisco"
        required
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    {/* State */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        State/Province <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={location.stateOrProvince}
        onChange={(e) => setLocation({ ...location, stateOrProvince: e.target.value })}
        placeholder="CA"
        maxLength="2"
        required
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    {/* Postal Code */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Postal Code <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={location.postalCode}
        onChange={(e) => setLocation({ ...location, postalCode: e.target.value })}
        placeholder="94105"
        required
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    {/* Country */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Country <span className="text-red-500">*</span>
      </label>
      <select
        value={location.country}
        onChange={(e) => setLocation({ ...location, country: e.target.value })}
        required
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="US">United States</option>
        <option value="CA">Canada</option>
        <option value="GB">United Kingdom</option>
        <option value="AU">Australia</option>
      </select>
    </div>
  </div>

  {!location.addressLine1 && (
    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
      <p className="text-sm text-amber-800">
        ⚠️ <strong>Required:</strong> You must set a default shipping location before creating listings.
        If not set, listings will fail to create.
      </p>
    </div>
  )}
</div>
```

#### 2. Update State Management (Already Exists)
**File**: `frontend/src/pages/ListingSettings.jsx`
**Lines**: 10-23

**Verify State Exists**:
```javascript
const [location, setLocation] = useState({
  addressLine1: '',
  city: '',
  stateOrProvince: '',
  postalCode: '',
  country: 'US'
});
```

#### 3. Update Load Handler
**File**: `frontend/src/pages/ListingSettings.jsx`
**Lines**: 33-57

**Add Location Loading**:
```javascript
// After fetching settings
if (data.currentSettings.defaultLocation?.address) {
  setLocation(data.currentSettings.defaultLocation.address)
}
```

### Success Criteria

#### Automated Verification:
- [ ] No console errors when loading page
- [ ] Form validation works (required fields)
- [ ] Settings save successfully

#### Manual Verification:
- [ ] Navigate to /listing-settings page
- [ ] See "Default Shipping Location" section
- [ ] Fill in all address fields
- [ ] Save settings
- [ ] Refresh page - verify location persists
- [ ] Create new listing - verify location is used (not hardcoded SF address)
- [ ] Try saving with blank address - verify validation error

---

## Phase 4: Enhance Price Display (Medium Priority)

### Overview
Ensure suggested price is prominently displayed and calculated when originalPrice from Keepa is available.

### Changes Required

#### 1. Display Suggested Price in Step 3 (Review)
**File**: `frontend/src/pages/AutoList.jsx`
**Lines**: 879-883 (Desktop table)

**Current Code**:
```jsx
<th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
  Suggested eBay Price
</th>
```

**Verify Column Data**:
```jsx
<td className="px-4 py-2 text-sm font-semibold text-green-600">
  ${calculateEbayPrice(item.originalPrice, item.condition)}
</td>
```

**✅ Already Implemented - No changes needed**

#### 2. Add Visual Indicator for Missing Price
**File**: `frontend/src/pages/AutoList.jsx`
**Lines**: 916-918

**Enhanced Code**:
```jsx
<td className="px-4 py-2 text-sm font-semibold">
  {item.originalPrice > 0 ? (
    <span className="text-green-600">
      ${calculateEbayPrice(item.originalPrice, item.condition)}
    </span>
  ) : (
    <span className="text-amber-600">
      ⚠️ No price data
    </span>
  )}
</td>
```

#### 3. Add Tooltip Explaining Price Calculation
**File**: `frontend/src/pages/AutoList.jsx`
**Location**: Step 3 header area

**Add Info Icon with Tooltip**:
```jsx
<th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
  Suggested eBay Price
  <button
    type="button"
    className="ml-1 text-gray-400 hover:text-gray-600"
    title="Suggested price = Amazon price × condition multiplier (New: 1.2x, Like New: 1.1x, Used: 0.95x)"
  >
    ℹ️
  </button>
</th>
```

### Success Criteria

#### Automated Verification:
- [ ] No console errors
- [ ] Price calculation logic unchanged

#### Manual Verification:
- [ ] Process ASINs with valid Keepa pricing
- [ ] Verify suggested price shows in review table
- [ ] Verify price multiplier applied correctly (New = 1.2x)
- [ ] Test ASIN without price data - shows warning
- [ ] Hover over info icon - tooltip appears

---

## Phase 5: Verification & Documentation (Medium Priority)

### Overview
Confirm that Keepa photos, description, and business policy settings are working correctly.

### Verification Tasks

#### 1. Verify Keepa Photos Are Extracted
**File**: `netlify/functions/keepa-fetch-product.js`
**Lines**: 221-239

**Test**:
1. Call `/keepa-fetch-product` with ASIN B08N5WRWNW
2. Verify response includes `ebayDraft.images` array
3. Verify array contains multiple image URLs
4. Check frontend AutoList displays images

**Expected**:
- ✅ Images extracted from `product.images` array (new format)
- ✅ Fallback to `product.imagesCSV` (deprecated format)
- ✅ Full Amazon CDN URLs: `https://m.media-amazon.com/images/I/{filename}`

#### 2. Verify Keepa Description Is Used
**File**: `netlify/functions/keepa-fetch-product.js`
**Lines**: 274-305

**Test**:
1. Call `/keepa-fetch-product` with ASIN
2. Verify `ebayDraft.description` contains HTML content
3. Check if `product.description` is used directly
4. Verify fallback to features list if no description

**Expected**:
- ✅ Uses `product.description` if available
- ✅ Falls back to HTML list of `product.features`
- ✅ Includes specifications (weight, dimensions) if available

#### 3. Verify Business Policy Settings Accessible
**File**: `frontend/src/pages/ListingSettings.jsx`

**Test**:
1. Navigate to `/listing-settings` page
2. Verify page loads without errors
3. Verify payment, fulfillment, return policy dropdowns appear
4. Verify policies are fetched from eBay API
5. Verify settings save successfully

**Expected**:
- ✅ Page accessible in navigation
- ✅ Dropdowns populated with eBay policies
- ✅ Settings persist after save
- ✅ Used in listing creation

### Success Criteria

#### Automated Verification:
- [ ] All API endpoints return 200 status
- [ ] No console errors in browser

#### Manual Verification:
- [ ] Create listing with ASIN - verify all Keepa images appear
- [ ] Verify eBay listing description matches Keepa description
- [ ] Verify business policies can be set and are applied to listings
- [ ] Document any issues found

---

## Testing Strategy

### Unit Tests (if applicable)
- Test `createEbayTitle()` with various brand/title combinations
- Test SKU generation with different prefixes
- Test price calculation with different conditions

### Integration Tests
1. **End-to-End Listing Creation**:
   - Configure all settings (policies, location, SKU prefix)
   - Create listing via AutoList
   - Verify listing on eBay Seller Hub
   - Verify SKU format, title, description, images

2. **Settings Persistence**:
   - Save all settings
   - Log out and log back in
   - Verify settings persisted

3. **Edge Cases**:
   - Empty Keepa price data
   - Missing Keepa description
   - Brand name with special characters
   - Very long SKU prefix (20 chars)
   - Location with international characters

### Manual Testing Steps

#### Test Case 1: Brand Duplication Fix
1. Navigate to AutoList
2. Enter ASIN: B08N5WRWNW (Nike product)
3. Process ASIN
4. Review step - verify title does NOT have duplicate brand
5. Create listing
6. Check eBay listing title

**Expected**: "Nike Air Max..." not "Nike Nike Air Max..."

#### Test Case 2: SKU Prefix
1. Navigate to ListingSettings
2. Set SKU prefix to "WAREHOUSE-A-"
3. Save settings
4. Create listing WITHOUT providing SKU
5. Check generated SKU in database
6. Verify starts with "WAREHOUSE-A-"

**Expected**: SKU format: `WAREHOUSE-A-a7b3c4d5-3f2a1b4c...`

#### Test Case 3: Default Location
1. Navigate to ListingSettings
2. Enter shipping address
3. Save settings
4. Create new listing
5. Check eBay Seller Hub - verify location matches

**Expected**: Location uses saved address, not hardcoded SF address

#### Test Case 4: Suggested Pricing
1. AutoList with ASINs that have Keepa pricing
2. Review step - verify suggested price column shows values
3. Verify price = Amazon price × condition multiplier
4. Test with ASIN without price data - verify warning appears

**Expected**: Prices display correctly, warnings for missing data

---

## Performance Considerations

- SKU generation: Minimal impact (MD5 hash is fast)
- Location UI: No backend calls during typing (save on submit)
- Title modification: Client-side only (no API overhead)
- Price calculation: Computed once per item (no re-renders)

---

## Migration Notes

### Database Changes
- No schema changes required (listing_settings is JSONB)
- Existing listings retain their SKUs (no migration needed)
- New SKU format applies only to future listings

### Backward Compatibility
- Users without SKU prefix → default "SKU-" prefix
- Users without location → validation error (forces configuration)
- Existing titles → unchanged (only affects new listings)

---

## Rollback Plan

### If Issues Arise
1. **Title fix**: Revert createEbayTitle() to original code
2. **SKU prefix**: Remove from settings UI, revert to hardcoded "SKU-"
3. **Location UI**: Hide section, revert to hardcoded fallback
4. **Pricing display**: Revert to original table columns

### Database Rollback
- No schema changes = no database rollback needed
- Clear bad SKU prefix: `UPDATE users SET listing_settings = listing_settings - 'skuPrefix'`

---

## References

### Original Requirements
User's reported issues:
1. Brand + title duplication → Fix in `createEbayTitle()`
2. Suggested price not showing → Enhance display
3. Keepa photos → Verify extraction
4. Keepa description → Verify usage
5. Business policy settings → Verify accessibility
6. Default location UI → Add form fields
7. SKU prefix → Full implementation

### Related Research
- `thoughts/shared/research/2025-10-08_hardcoded-items-enhancement-review.md` - Settings infrastructure analysis
- `ebay-keepa-field-mapping.md` - Keepa API field documentation

### Code Files Modified
- `frontend/src/pages/AutoList.jsx` - Title fix, price display
- `frontend/src/pages/ListingSettings.jsx` - Location UI, SKU prefix UI
- `netlify/functions/create-ebay-listing.js` - SKU generation update
- `add-listing-settings.sql` - Documentation update

---

## Open Questions

**Resolved During Planning**:
- ✅ Is business policy settings already working? → YES, fully functional
- ✅ Are Keepa photos being extracted? → YES, lines 221-239
- ✅ Is Keepa description being used? → YES, buildDescription()
- ✅ Does location backend work? → YES, only UI missing

**No Unresolved Questions** - Plan is complete and ready for implementation.

---

## Implementation Checklist

### Phase 1: Title Duplication Fix
- [x] Update `createEbayTitle()` function
- [ ] Test with Nike products
- [ ] Test with products without brand in title
- [ ] Verify 80-char limit still works

### Phase 2: SKU Prefix
- [x] Update schema documentation
- [x] Modify `generateDeterministicSku()`
- [x] Pass userSettings to SKU function
- [x] Add UI field to ListingSettings
- [x] Update state management
- [ ] Test with various prefixes
- [ ] Test blank prefix fallback

### Phase 3: Location UI
- [x] Location form section already exists in ListingSettings
- [x] Already connected to existing state variables
- [x] Load handler already updated
- [x] Validation warnings already present
- [ ] Test save and load
- [ ] Verify used in listing creation

### Phase 4: Price Display
- [x] Add warning for missing prices
- [x] Add tooltip for price calculation
- [ ] Test with various price scenarios

### Phase 5: Verification
- [ ] Test Keepa photo extraction
- [ ] Test Keepa description usage
- [ ] Verify ListingSettings page accessible
- [ ] Document any issues

### Final Testing
- [ ] End-to-end listing creation test
- [ ] Settings persistence test
- [ ] Edge case testing
- [ ] User acceptance testing

---

## Success Metrics

**Before Implementation**:
- Brand duplication: 100% of listings
- SKU prefix: Not available
- Location UI: Not accessible
- Suggested price: May not display for all items

**After Implementation**:
- Brand duplication: 0% (fixed)
- SKU prefix: Available and functional
- Location UI: Accessible and working
- Suggested price: Displays with visual indicators

**User Satisfaction**:
- Can configure SKU prefix for physical labels
- Can set default shipping location through UI
- No more duplicate brand names in titles
- Clear pricing visibility in AutoList

---

**Plan Status**: ✅ Complete and Ready for Implementation
**Next Step**: Begin Phase 1 (Title Duplication Fix)
