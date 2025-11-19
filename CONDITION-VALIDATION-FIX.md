# eBay Condition Validation Fix

**Issue**: Error 25021 - "The provided condition id is invalid for the selected primary category id"

**Date**: October 20, 2025

## Root Cause Analysis

### Frontend Issue
The condition dropdown in `CreateListing.jsx` was using **invalid string values** instead of eBay's numeric condition IDs:
- ❌ Was using: `NEW_OTHER`, `LIKE_NEW`, `USED_EXCELLENT`, etc.
- ✅ Should use: `1000`, `1500`, `3000`, etc.

### Backend Issue
The `create-ebay-listing.js` function:
1. Accepted any condition value without validation
2. Did not check if condition was valid for the specific category
3. Different eBay categories support different condition IDs

## Solution Implemented

### 1. **Database Schema Update**
**File**: `add-category-condition-policies.sql`

Added two columns to `ebay_category_aspects` table:
- `allowed_conditions` (JSONB) - Array of valid condition objects
- `condition_required` (BOOLEAN) - Whether category requires condition

```sql
ALTER TABLE ebay_category_aspects
ADD COLUMN IF NOT EXISTS allowed_conditions JSONB,
ADD COLUMN IF NOT EXISTS condition_required BOOLEAN DEFAULT false;
```

### 2. **eBay API Integration**
**File**: `netlify/functions/utils/ebay-inventory-client.js`

Added new method `getCategoryConditionPolicies()` that:
- Calls eBay Metadata API: `GET /marketplace/{marketplaceId}/get_item_condition_policies`
- Fetches allowed condition IDs for a specific category
- Caches results in database to reduce API calls
- Returns: `{ conditionRequired, allowedConditions: [{conditionId, conditionDisplayName}] }`

**Changes**:
- Line 32: Added `metadata: 'https://api.ebay.com/sell/metadata/v1'` to API base URLs
- Lines 214-274: New `getCategoryConditionPolicies()` method with caching

### 3. **Backend Validation**
**File**: `netlify/functions/create-ebay-listing.js`

Added condition validation logic:

**Step 6.5** (Lines 353-371): Fetch category condition policies
```javascript
conditionPolicies = await ebayClient.getCategoryConditionPolicies(categoryId);
```

**Step 11** (Lines 539-589): Validate and auto-correct condition
- Maps string conditions to numeric IDs (e.g., 'NEW' → '1000')
- Validates condition against category's allowed conditions
- Auto-selects first valid condition if invalid condition provided
- Logs warnings when auto-correction occurs

### 4. **Frontend Fix**
**File**: `frontend/src/pages/CreateListing.jsx`

Updated condition dropdown to use **correct eBay condition IDs**:

**Before** (Invalid):
```jsx
<option value="NEW_OTHER">New Open Box</option>
<option value="LIKE_NEW">Like New</option>
<option value="USED_EXCELLENT">Used - Excellent</option>
```

**After** (Valid):
```jsx
<option value="1000">New</option>
<option value="1500">New (Other)</option>
<option value="2750">Like New</option>
<option value="3000">Used</option>
```

Added user notice: "Note: Not all conditions are valid for all categories. Invalid selections will be auto-corrected."

### 5. **New API Endpoint** (Optional)
**File**: `netlify/functions/get-category-conditions.js`

Created endpoint for frontend to fetch valid conditions dynamically:
```
GET /.netlify/functions/get-category-conditions?categoryId=12345
```

Returns:
```json
{
  "categoryId": "12345",
  "conditionRequired": true,
  "allowedConditions": [
    { "conditionId": "1000", "conditionDisplayName": "New" },
    { "conditionId": "3000", "conditionDisplayName": "Used" }
  ]
}
```

## eBay Condition ID Reference

| ID   | Display Name               | Description                    |
|------|---------------------------|--------------------------------|
| 1000 | New                       | Brand new, unopened            |
| 1500 | New (Other)               | New, open box or packaging     |
| 1750 | New with Defects          | New but has defects            |
| 2000 | Certified Refurbished     | Manufacturer certified         |
| 2500 | Seller Refurbished        | Refurbished by seller          |
| 2750 | Like New                  | Used but in like-new condition |
| 3000 | Used                      | Previously used                |
| 4000 | Very Good                 | Used - Very Good               |
| 5000 | Good                      | Used - Good                    |
| 6000 | Acceptable                | Used - Acceptable              |
| 7000 | For Parts/Not Working     | For parts or repair            |

## Deployment Instructions

### 1. Apply Database Migration

**Locally** (if DATABASE_URL is set):
```bash
cd ~/Projects/ebay-price-reducer
psql $DATABASE_URL -f add-category-condition-policies.sql
```

**Production** (via Netlify or Supabase):
```bash
# Option A: Run via psql
psql "postgresql://user:pass@host:port/database" -f add-category-condition-policies.sql

# Option B: Execute in Supabase SQL Editor
# Copy contents of add-category-condition-policies.sql and run in SQL editor
```

### 2. Deploy Code Changes

```bash
cd ~/Projects/ebay-price-reducer

# Stage all changes
git add -A

# Commit
git commit -m "Fix: Add category-specific condition validation to prevent eBay error 25021

- Add database columns for caching allowed conditions per category
- Integrate eBay Metadata API to fetch valid conditions
- Validate condition IDs before creating listings
- Auto-correct invalid conditions with fallback
- Update frontend to use proper eBay condition ID format
- Add new API endpoint for fetching category conditions

Fixes issue where invalid condition IDs were being sent to eBay,
causing error 25021: 'The provided condition id is invalid for the
selected primary category id.'"

# Push to deploy
git push origin main
```

### 3. Netlify will automatically:
- Install dependencies
- Build frontend
- Deploy functions
- Deploy to production

## Testing Instructions

### Manual Testing

1. **Create a new listing**:
   - Go to Create Listing page
   - Enter ASIN and fetch product
   - Select a condition from dropdown
   - Create listing

2. **Verify in logs**:
   - Check Netlify function logs for:
     - `✓ Condition policies loaded: X allowed conditions`
     - `✅ Condition validated: [Name] ([ID])`
     - OR `⚠️ Auto-selecting fallback condition: [Name] ([ID])`

3. **Test invalid condition** (should auto-correct):
   - Manually send a request with invalid condition
   - Backend should log warning and auto-select valid condition
   - Listing should still be created successfully

### Expected Behavior

**Before Fix**:
- ❌ eBay returns error 25021
- ❌ Listing creation fails
- ❌ User sees error message

**After Fix**:
- ✅ Invalid condition is auto-corrected to valid one
- ✅ Warning logged but listing still created
- ✅ User sees success message
- ✅ Logs show which condition was selected

## Files Modified

### Backend
1. `netlify/functions/utils/ebay-inventory-client.js` - Added condition policy fetching
2. `netlify/functions/create-ebay-listing.js` - Added validation logic
3. `netlify/functions/get-category-conditions.js` - New API endpoint

### Frontend
4. `frontend/src/pages/CreateListing.jsx` - Fixed condition dropdown values

### Database
5. `add-category-condition-policies.sql` - Schema migration

### Documentation
6. `CONDITION-VALIDATION-FIX.md` - This file

## Monitoring

After deployment, monitor for:

1. **Success Indicators**:
   - No more error 25021 in logs
   - Listings created successfully
   - Log messages showing condition validation

2. **Warning Indicators** (not errors, just FYI):
   - `⚠️ Auto-selecting fallback condition` - User selected invalid condition, auto-corrected
   - `⚠️ No condition policies found for category` - Rare, but category might not have policies

3. **Error Indicators** (investigate if seen):
   - `Failed to fetch condition policies` - API issue or token problem
   - Still seeing error 25021 - Validation logic not working

## Rollback Plan

If issues occur after deployment:

1. **Quick fix**: Comment out validation in `create-ebay-listing.js` lines 353-371 and 569-587
2. **Revert migration**:
   ```sql
   ALTER TABLE ebay_category_aspects DROP COLUMN IF EXISTS allowed_conditions;
   ALTER TABLE ebay_category_aspects DROP COLUMN IF EXISTS condition_required;
   ```
3. **Full rollback**: `git revert HEAD && git push origin main`

## Future Enhancements

1. **Dynamic Frontend Dropdown**: Update frontend to fetch and display only valid conditions for the selected category
2. **Category Selection UI**: Allow users to see and confirm category before setting condition
3. **Bulk Validation**: Add script to validate existing listings in database
4. **Condition Presets**: Save user's preferred conditions per category

---

**Status**: ✅ Ready for deployment
**Tested**: ✅ Code syntax validated
**Migration**: ⏳ Needs manual application to database
