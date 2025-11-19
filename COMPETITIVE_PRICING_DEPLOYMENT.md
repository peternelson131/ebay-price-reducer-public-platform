# eBay Competitive Pricing Analysis - Deployment Guide

## ✅ Implementation Complete

All phases of the competitive pricing analysis feature have been successfully implemented.

**Implementation Plan**: `thoughts/shared/plans/competitive_pricing_analysis.md`

---

## 🚀 Quick Start - 3 Steps to Deploy

### Step 1: Run Database Migration

Open your Supabase SQL Editor and run:

```sql
-- File: add-competitive-pricing-tracking.sql

ALTER TABLE listings
ADD COLUMN IF NOT EXISTS price_analysis_completed BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_listings_analysis_status
ON listings(price_analysis_completed)
WHERE price_analysis_completed = FALSE;

ALTER TABLE listings
ADD COLUMN IF NOT EXISTS price_match_tier TEXT;

UPDATE listings
SET price_analysis_completed = FALSE
WHERE price_analysis_completed IS NULL;

COMMENT ON COLUMN listings.price_analysis_completed IS 'Indicates if competitive pricing analysis has been completed for this listing';
COMMENT ON COLUMN listings.price_match_tier IS 'Which search tier was used: gtin, title_category, title_only, no_matches, or error';
```

### Step 2: Commit and Push

```bash
git add .
git commit -m "Add competitive pricing analysis feature"
git push origin main
```

Netlify will automatically deploy.

### Step 3: Test

1. Go to Listings page
2. Click "Import from eBay"
3. Wait 1-2 minutes
4. Refresh page
5. See suggested prices in new column!

---

## 📋 What Was Implemented

### New Files Created

**Backend**:
- `netlify/functions/utils/ebay-browse-client.js` - eBay Browse API client
- `netlify/functions/utils/competitive-pricing-service.js` - Pricing analysis logic
- `netlify/functions/analyze-competitive-pricing.js` - Main analysis function

**Database**:
- `add-competitive-pricing-tracking.sql` - Migration script

**Frontend**:
- Updated `frontend/src/pages/Listings.jsx` with new UI

**Modified**:
- `netlify/functions/trigger-sync.js` - Triggers analysis after import

---

## 🎯 How It Works

### Matching Strategy (Waterfall)

For each listing, searches for competitors in this order:

1. **GTIN/UPC** (if available) → Most precise
2. **Title + Category** → High precision
3. **Title only** → Broadest search

Stops at first tier with ≥5 results.

### Calculations

- **Suggested Min** = Lowest competitor price
- **Suggested Avg** = Mean of all prices
- Excludes your own listings
- Removes outliers (>3x or <0.3x median)

### One-Time Analysis

- Each listing analyzed only once
- Prevents wasting API calls
- Flag: `price_analysis_completed`

---

## 📱 UI Features

### Desktop Table
- New "Suggested Pricing" column
- Shows Avg and Min prices
- "Accept" buttons for one-click updates
- Competitor count + match tier
- ⚠️ Warning for <5 competitors

### Mobile Cards
- Suggested Pricing section
- Same functionality
- Responsive design

### States
- "Analyzing..." - In progress
- "No competitors found" - No matches
- Prices + buttons - Complete
- ⚠️ - Low data warning

---

## 🧪 Testing Checklist

After deployment:

- [ ] Run migration in Supabase SQL Editor
- [ ] Import listings from eBay
- [ ] Wait 1-2 minutes for analysis
- [ ] Refresh page
- [ ] Verify suggested prices appear
- [ ] Click "Accept" on Avg price
- [ ] Confirm price updates
- [ ] Test on mobile device
- [ ] Check Netlify function logs

---

## 🐛 Troubleshooting

### "Analyzing..." Never Completes

**Check Netlify Logs**:
- Go to Netlify Dashboard → Functions → Logs
- Look for `analyze-competitive-pricing` errors

**Manual Trigger**:
```bash
curl -X POST https://your-domain.netlify.app/.netlify/functions/analyze-competitive-pricing \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### No Competitors Found

This is normal for:
- Niche/unique products
- Custom/handmade items
- Very specific categories

The system will mark these as analyzed and show "No competitors found".

### Accept Button Not Working

**Check**:
1. Browser console for errors
2. Network tab - look for failed API calls
3. Verify listing has `market_average_price` in database

---

## ⚙️ Configuration

### Change Minimum Price Formula

Default: Sets min to 80% of suggested price

**File**: `frontend/src/pages/Listings.jsx:216`

```javascript
// Current
minimum_price: suggestedPrice * 0.8

// Change to 70%
minimum_price: suggestedPrice * 0.7
```

### Adjust Batch Size

Default: 20 listings at a time

**File**: `netlify/functions/analyze-competitive-pricing.js:61`

```javascript
// Current
.limit(20)

// Increase to 50
.limit(50)
```

---

## 📊 Database Schema

New columns in `listings` table:

| Column | Type | Purpose |
|--------|------|---------|
| `price_analysis_completed` | BOOLEAN | Analysis done flag |
| `price_match_tier` | TEXT | Match tier used |

Existing columns (used for results):

| Column | Type | Purpose |
|--------|------|---------|
| `market_average_price` | DECIMAL | Suggested avg |
| `market_lowest_price` | DECIMAL | Suggested min |
| `market_competitor_count` | INTEGER | # competitors |
| `last_market_analysis` | TIMESTAMP | Analysis date |

---

## 🔒 Security & Performance

### API Usage
- Uses existing OAuth token
- No additional authentication needed
- ~5000 calls/day limit
- 200ms delay between requests

### Rate Limiting
- Batch processing (20 at a time)
- Background execution
- One-time analysis only

### Performance
- Doesn't block listing import
- Runs in background
- Results appear in 1-2 minutes

---

## 📈 Success Metrics

After deployment:
- ✅ Suggested prices for most listings
- ✅ One-click price updates working
- ✅ Analysis completes in <2 minutes
- ✅ No re-analysis on re-import
- ✅ Mobile-responsive UI

---

## 🎉 What's Next

This implementation provides the foundation. Future enhancements could include:

1. Manual re-analysis button
2. Sold items data (when API available)
3. Price trend charts
4. Bulk accept all suggestions
5. Smart pricing rules

---

**Status**: ✅ Ready for deployment
**Date**: 2025-10-04
**Author**: Claude Code
