-- Add condition policy columns to ebay_category_aspects table
-- Migration: add-category-condition-policies.sql
-- Purpose: Store allowed condition IDs for each category to prevent invalid submissions
-- Date: 2025-10-20

-- Add columns for condition policies
ALTER TABLE ebay_category_aspects
ADD COLUMN IF NOT EXISTS allowed_conditions JSONB,
ADD COLUMN IF NOT EXISTS condition_required BOOLEAN DEFAULT false;

-- Create index for faster condition lookups
CREATE INDEX IF NOT EXISTS idx_category_aspects_conditions ON ebay_category_aspects USING GIN(allowed_conditions);

-- Comments for documentation
COMMENT ON COLUMN ebay_category_aspects.allowed_conditions IS 'Array of allowed condition objects [{conditionId, conditionDisplayName}] from eBay Metadata API';
COMMENT ON COLUMN ebay_category_aspects.condition_required IS 'Boolean indicating if this category requires a condition to be specified';
