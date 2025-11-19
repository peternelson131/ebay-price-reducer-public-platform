-- Migration: Add strategies table and update listings table
-- This migration creates the strategies table for storing price reduction strategies
-- and adds a foreign key reference from listings to strategies

-- Create strategies table
CREATE TABLE IF NOT EXISTS strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  reduction_type TEXT NOT NULL CHECK (reduction_type IN ('percentage', 'dollar')),
  reduction_amount DECIMAL(10, 2) NOT NULL CHECK (reduction_amount > 0),
  frequency_days INTEGER NOT NULL CHECK (frequency_days > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure unique strategy names per user
  CONSTRAINT unique_user_strategy_name UNIQUE (user_id, name)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_strategies_user_id ON strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_strategies_active ON strategies(active);
CREATE INDEX IF NOT EXISTS idx_strategies_user_active ON strategies(user_id, active);

-- Add strategy_id column to listings table
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL;

-- Create index on listings.strategy_id for performance
CREATE INDEX IF NOT EXISTS idx_listings_strategy_id ON listings(strategy_id);

-- Enable Row Level Security on strategies table
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own strategies
CREATE POLICY "Users can view own strategies"
  ON strategies
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can create their own strategies
CREATE POLICY "Users can create own strategies"
  ON strategies
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own strategies
CREATE POLICY "Users can update own strategies"
  ON strategies
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own strategies (only if not in use)
CREATE POLICY "Users can delete own strategies"
  ON strategies
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM listings
      WHERE listings.strategy_id = strategies.id
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_strategies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_strategies_timestamp
  BEFORE UPDATE ON strategies
  FOR EACH ROW
  EXECUTE FUNCTION update_strategies_updated_at();

-- Add helpful comments
COMMENT ON TABLE strategies IS 'Stores price reduction strategies for eBay listings';
COMMENT ON COLUMN strategies.reduction_type IS 'Type of reduction: percentage or dollar amount';
COMMENT ON COLUMN strategies.reduction_amount IS 'Amount to reduce price by (percentage or dollars)';
COMMENT ON COLUMN strategies.frequency_days IS 'Number of days between price reductions';
COMMENT ON COLUMN strategies.active IS 'Whether this strategy is currently active';
