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
