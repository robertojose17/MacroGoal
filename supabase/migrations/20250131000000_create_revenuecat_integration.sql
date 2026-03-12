
-- Create RevenueCat webhook events table for audit trail
CREATE TABLE IF NOT EXISTS revenuecat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  app_user_id TEXT NOT NULL,
  original_app_user_id TEXT,
  product_id TEXT,
  entitlement_ids TEXT[],
  period_type TEXT,
  purchased_at TIMESTAMPTZ,
  expiration_at TIMESTAMPTZ,
  store TEXT,
  environment TEXT,
  raw_event JSONB NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX idx_revenuecat_events_app_user_id ON revenuecat_events(app_user_id);
CREATE INDEX idx_revenuecat_events_event_type ON revenuecat_events(event_type);
CREATE INDEX idx_revenuecat_events_created_at ON revenuecat_events(created_at DESC);

-- Update subscriptions table to include RevenueCat fields
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS revenuecat_app_user_id TEXT,
ADD COLUMN IF NOT EXISTS revenuecat_original_app_user_id TEXT,
ADD COLUMN IF NOT EXISTS entitlement_ids TEXT[],
ADD COLUMN IF NOT EXISTS store TEXT,
ADD COLUMN IF NOT EXISTS environment TEXT,
ADD COLUMN IF NOT EXISTS product_id TEXT,
ADD COLUMN IF NOT EXISTS period_type TEXT,
ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS expiration_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS will_renew BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS unsubscribe_detected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billing_issues_detected_at TIMESTAMPTZ;

-- Create index for RevenueCat app_user_id
CREATE INDEX IF NOT EXISTS idx_subscriptions_revenuecat_app_user_id 
ON subscriptions(revenuecat_app_user_id);

-- Enable RLS on revenuecat_events
ALTER TABLE revenuecat_events ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can insert events (for webhooks)
CREATE POLICY "Service role can insert events"
  ON revenuecat_events FOR INSERT
  WITH CHECK (true);

-- Policy: Users can read their own events
CREATE POLICY "Users can read own events"
  ON revenuecat_events FOR SELECT
  USING (app_user_id = auth.uid()::text);

-- Add helpful comments
COMMENT ON TABLE revenuecat_events IS 'Stores all webhook events from RevenueCat for audit trail and debugging';
COMMENT ON COLUMN subscriptions.revenuecat_app_user_id IS 'RevenueCat app_user_id (usually matches Supabase user_id)';
COMMENT ON COLUMN subscriptions.entitlement_ids IS 'Array of active entitlement identifiers from RevenueCat';
COMMENT ON COLUMN subscriptions.will_renew IS 'Whether the subscription will auto-renew';
COMMENT ON COLUMN subscriptions.unsubscribe_detected_at IS 'When user cancelled subscription (still active until expiration)';
COMMENT ON COLUMN subscriptions.billing_issues_detected_at IS 'When billing issues were detected';
