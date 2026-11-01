-- Source-only repair; apply only after separate deployment approval.
-- Baseline pg_get_functiondef MD5: 88ffe31e4cef22c12cb6278a7f6e6b53
-- Expected definition MD5 after repair: d41d5955d4101e37aec6d30353a40ecf
-- Preserve owner postgres, SECURITY DEFINER, NULL proconfig and existing ACL.
-- Only the subscriptions.user_id comparison gains ::text; commission policy is unchanged.
BEGIN;
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.handle_user_becomes_premium()'::regprocedure))
      IS DISTINCT FROM '88ffe31e4cef22c12cb6278a7f6e6b53' THEN
    RAISE EXCEPTION 'handle_user_becomes_premium baseline drift; stop for review';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.handle_user_becomes_premium()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_referral RECORD;
  v_product_id text;
  v_purchase_amount numeric;
  v_commission numeric;
BEGIN
  IF NEW.user_type = 'premium' AND (OLD.user_type IS DISTINCT FROM 'premium') THEN
    SELECT r.id, r.referrer_id, r.referred_id
    INTO v_referral
    FROM referrals r
    WHERE r.referred_id = NEW.id
      AND r.converted_to_premium = false
    LIMIT 1;

    IF v_referral.id IS NOT NULL THEN
      -- Only create commission if webhook hasn't already created one
      IF NOT EXISTS (
        SELECT 1 FROM referral_commissions rc
        WHERE rc.referred_id = NEW.id
      ) THEN
        -- Look up from revenuecat_events (both columns)
        SELECT re.product_id, re.amount_usd
        INTO v_product_id, v_purchase_amount
        FROM revenuecat_events re
        WHERE (re.app_user_id = NEW.id::text OR re.user_id = NEW.id)
          AND re.event_type IN ('INITIAL_PURCHASE', 'RENEWAL')
          AND re.amount_usd > 0
        ORDER BY re.created_at DESC
        LIMIT 1;

        -- Fallback to subscriptions table
        IF v_product_id IS NULL THEN
          SELECT s.product_id INTO v_product_id
          FROM subscriptions s
          WHERE s.user_id = NEW.id::text AND s.status = 'active'
          ORDER BY s.updated_at DESC LIMIT 1;
        END IF;

        -- Price fallback based on product name
        IF v_purchase_amount IS NULL OR v_purchase_amount = 0 THEN
          IF v_product_id IS NOT NULL AND (
            lower(v_product_id) LIKE '%year%' OR lower(v_product_id) LIKE '%annual%'
          ) THEN
            v_purchase_amount := 59.99;
          ELSE
            v_purchase_amount := 9.99;
          END IF;
        END IF;

        v_commission := round(v_purchase_amount * 0.35, 2);

        INSERT INTO referral_commissions (
          referrer_id, referred_id, referral_id, revenuecat_event_id,
          product_id, purchase_amount, commission_amount, status, available_at
        ) VALUES (
          v_referral.referrer_id, v_referral.referred_id, v_referral.id,
          'trigger_fallback_' || NEW.id::text,
          COALESCE(v_product_id, 'unknown'),
          v_purchase_amount, v_commission, 'pending',
          now() + interval '35 days'
        )
        ON CONFLICT (revenuecat_event_id) DO NOTHING;

        UPDATE referrals SET converted_to_premium = true, premium_converted_at = now()
        WHERE id = v_referral.id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.handle_user_becomes_premium()'::regprocedure))
      IS DISTINCT FROM 'd41d5955d4101e37aec6d30353a40ecf' THEN
    RAISE EXCEPTION 'handle_user_becomes_premium result differs from reviewed definition';
  END IF;
END;
$guard$;
COMMIT;
