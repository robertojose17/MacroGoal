-- referral_codes: one row per user, stores their shareable code
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  custom_code TEXT UNIQUE,
  tier TEXT NOT NULL DEFAULT 'user',
  affiliate_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_codes_user_id_unique UNIQUE (user_id)
);

-- referrals: one row per successful referral
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_used TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  converted_to_premium BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referrals_referred_id_unique UNIQUE (referred_id)
);

-- affiliate_applications
CREATE TABLE IF NOT EXISTS affiliate_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code_id UUID REFERENCES referral_codes(id),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  instagram_handle TEXT,
  tiktok_handle TEXT,
  youtube_handle TEXT,
  how_they_plan_to_promote TEXT,
  total_referrals_at_apply INTEGER DEFAULT 0,
  total_premium_at_apply INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT affiliate_applications_user_id_unique UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_applications ENABLE ROW LEVEL SECURITY;

-- referral_codes policies
CREATE POLICY "Users can manage their own referral code"
  ON referral_codes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone authenticated can look up a referral code"
  ON referral_codes FOR SELECT
  USING (auth.role() = 'authenticated');

-- referrals policies
CREATE POLICY "Users can read referrals where they are referrer or referred"
  ON referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

CREATE POLICY "Authenticated users can insert a referral"
  ON referrals FOR INSERT
  WITH CHECK (auth.uid() = referred_id);

-- affiliate_applications policies
CREATE POLICY "Users can manage their own affiliate application"
  ON affiliate_applications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
