
-- Fix subscriptions table to support both UUID and TEXT user_id
-- This is needed because RevenueCat sends app_user_id as TEXT

-- First, drop the foreign key constraint if it exists
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;

-- Change user_id column from UUID to TEXT
ALTER TABLE subscriptions ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Recreate the index
DROP INDEX IF EXISTS idx_subscriptions_user_id;
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);

-- Update RLS policy to work with TEXT user_id
DROP POLICY IF EXISTS "Users can read own subscription" ON subscriptions;
CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid()::TEXT = user_id);

-- Add helpful comment
COMMENT ON COLUMN subscriptions.user_id IS 'User ID as TEXT to support RevenueCat app_user_id (matches auth.uid()::TEXT)';
