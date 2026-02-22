
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerifyReceiptRequest {
  receipt: string;
  productId: string;
  transactionId: string;
  userId: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[verify-apple-receipt] Request received');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { receipt, productId, transactionId, userId } = await req.json() as VerifyReceiptRequest;

    console.log('[verify-apple-receipt] Payload:', {
      productId,
      transactionId,
      userId,
      receiptLength: receipt?.length || 0,
    });

    if (!receipt || !productId || !transactionId || !userId) {
      console.error('[verify-apple-receipt] Missing required fields');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine environment (sandbox vs production)
    // For TestFlight and development, use sandbox
    const isProduction = Deno.env.get('APPLE_IAP_ENVIRONMENT') === 'production';
    const verifyUrl = isProduction
      ? 'https://buy.itunes.apple.com/verifyReceipt'
      : 'https://sandbox.itunes.apple.com/verifyReceipt';

    console.log(`[verify-apple-receipt] Using ${isProduction ? 'PRODUCTION' : 'SANDBOX'} environment`);

    // Apple shared secret (required for auto-renewable subscriptions)
    const sharedSecret = Deno.env.get('APPLE_SHARED_SECRET');
    if (!sharedSecret) {
      console.error('[verify-apple-receipt] APPLE_SHARED_SECRET not configured');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Server configuration error: APPLE_SHARED_SECRET missing. Please add it to Supabase Edge Function secrets.' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify receipt with Apple
    console.log('[verify-apple-receipt] Sending receipt to Apple...');
    const appleResponse = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receipt,
        'password': sharedSecret,
        'exclude-old-transactions': true,
      }),
    });

    const appleData = await appleResponse.json();
    console.log('[verify-apple-receipt] Apple response status:', appleData.status);

    // Status codes:
    // 0 = valid
    // 21007 = sandbox receipt sent to production (retry with sandbox)
    // 21008 = production receipt sent to sandbox (retry with production)
    if (appleData.status === 21007 && isProduction) {
      console.log('[verify-apple-receipt] Retrying with sandbox...');
      const sandboxResponse = await fetch('https://sandbox.itunes.apple.com/verifyReceipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'receipt-data': receipt,
          'password': sharedSecret,
          'exclude-old-transactions': true,
        }),
      });
      const sandboxData = await sandboxResponse.json();
      console.log('[verify-apple-receipt] Sandbox retry status:', sandboxData.status);
      return await processAppleResponse(sandboxData, productId, transactionId, userId, supabaseClient);
    }

    if (appleData.status === 21008 && !isProduction) {
      console.log('[verify-apple-receipt] Retrying with production...');
      const prodResponse = await fetch('https://buy.itunes.apple.com/verifyReceipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'receipt-data': receipt,
          'password': sharedSecret,
          'exclude-old-transactions': true,
        }),
      });
      const prodData = await prodResponse.json();
      console.log('[verify-apple-receipt] Production retry status:', prodData.status);
      return await processAppleResponse(prodData, productId, transactionId, userId, supabaseClient);
    }

    return await processAppleResponse(appleData, productId, transactionId, userId, supabaseClient);

  } catch (error) {
    console.error('[verify-apple-receipt] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processAppleResponse(
  appleData: any,
  productId: string,
  transactionId: string,
  userId: string,
  supabaseClient: any
) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (appleData.status !== 0) {
    console.error('[verify-apple-receipt] Apple verification failed:', appleData.status);
    const errorMessages: Record<number, string> = {
      21000: 'App Store could not read the receipt',
      21002: 'Receipt data is malformed',
      21003: 'Receipt could not be authenticated',
      21004: 'Shared secret does not match',
      21005: 'Receipt server is not available',
      21006: 'Receipt is valid but subscription has expired',
      21007: 'Sandbox receipt sent to production',
      21008: 'Production receipt sent to sandbox',
      21010: 'Receipt could not be authorized',
    };
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessages[appleData.status] || `Apple verification failed with status ${appleData.status}` 
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Extract subscription info from latest_receipt_info
  const latestReceiptInfo = appleData.latest_receipt_info || [];
  const pendingRenewalInfo = appleData.pending_renewal_info || [];

  console.log('[verify-apple-receipt] Latest receipt info count:', latestReceiptInfo.length);

  // Find the matching transaction
  const transaction = latestReceiptInfo.find((t: any) => 
    t.transaction_id === transactionId || t.product_id === productId
  );

  if (!transaction) {
    console.error('[verify-apple-receipt] Transaction not found in receipt');
    return new Response(
      JSON.stringify({ success: false, error: 'Transaction not found in receipt' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('[verify-apple-receipt] Transaction found:', {
    product_id: transaction.product_id,
    transaction_id: transaction.transaction_id,
    expires_date_ms: transaction.expires_date_ms,
  });

  // Check if subscription is active
  const expiresDateMs = parseInt(transaction.expires_date_ms || '0');
  const now = Date.now();
  const isActive = expiresDateMs > now;

  console.log('[verify-apple-receipt] Subscription active:', isActive);

  // Determine plan type
  const planType = productId.includes('yearly') ? 'yearly' : 'monthly';

  // Upsert subscription in database
  const { data: subscription, error: dbError } = await supabaseClient
    .from('subscriptions')
    .upsert({
      user_id: userId,
      status: isActive ? 'active' : 'inactive',
      plan_type: planType,
      apple_product_id: productId,
      apple_transaction_id: transactionId,
      apple_original_transaction_id: transaction.original_transaction_id,
      current_period_start: new Date(parseInt(transaction.purchase_date_ms)).toISOString(),
      current_period_end: new Date(expiresDateMs).toISOString(),
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    })
    .select()
    .single();

  if (dbError) {
    console.error('[verify-apple-receipt] Database error:', dbError);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to update subscription in database' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('[verify-apple-receipt] Subscription updated successfully');

  return new Response(
    JSON.stringify({ 
      success: true, 
      subscription,
      isActive,
      expiresAt: new Date(expiresDateMs).toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
