
-- Add Apple In-App Purchase fields to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS apple_transaction_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT,
ADD COLUMN IF NOT EXISTS apple_product_id TEXT,
ADD COLUMN IF NOT EXISTS apple_receipt_data TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_apple_transaction_id 
ON subscriptions(apple_transaction_id);

-- Add comment
COMMENT ON COLUMN subscriptions.apple_transaction_id IS 'Apple transaction ID for IAP purchases';
COMMENT ON COLUMN subscriptions.apple_original_transaction_id IS 'Apple original transaction ID for subscription tracking';
COMMENT ON COLUMN subscriptions.apple_product_id IS 'Apple product ID (e.g., macrogoal_premium_monthly)';
COMMENT ON COLUMN subscriptions.apple_receipt_data IS 'Apple receipt data for validation';
