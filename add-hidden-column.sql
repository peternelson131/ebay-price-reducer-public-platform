-- Add 'hidden' column to listings table
-- This tracks whether a user has manually closed/hidden a listing
-- Syncs will mark listings as 'Ended' but NOT hidden (so they appear in "Ended" tab)
-- Manual closes will mark as both 'Ended' AND hidden (so they disappear completely)

ALTER TABLE listings
ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false NOT NULL;

-- Add index for better query performance when filtering hidden listings
CREATE INDEX IF NOT EXISTS idx_listings_hidden ON listings(user_id, hidden);

-- Leave all existing 'Ended' listings as NOT hidden (hidden=false)
-- This allows users to review them in the "Ended" tab before manually closing them
