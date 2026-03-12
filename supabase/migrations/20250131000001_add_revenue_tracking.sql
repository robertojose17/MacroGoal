
-- Add revenue tracking columns to revenuecat_events table
ALTER TABLE revenuecat_events 
ADD COLUMN IF NOT EXISTS price_in_purchased_currency NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(10, 2);

-- Create index for revenue queries
CREATE INDEX IF NOT EXISTS idx_revenuecat_events_amount_usd 
ON revenuecat_events(app_user_id, amount_usd) 
WHERE event_type IN ('INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE');

-- Add helpful comment
COMMENT ON COLUMN revenuecat_events.amount_usd IS 'Purchase amount converted to USD for revenue cap calculation';
COMMENT ON COLUMN revenuecat_events.price_in_purchased_currency IS 'Original purchase price in the currency used';
COMMENT ON COLUMN revenuecat_events.currency IS 'Currency code (e.g., USD, EUR, GBP)';
