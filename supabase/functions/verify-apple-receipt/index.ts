
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
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

    // Check if we should use StoreKit 2 (App Store Server API)
    const useStoreKit2 = Deno.env.get('APPLE_USE_STOREKIT2') === 'true';
    
    if (useStoreKit2) {
      console.log('[verify-apple-receipt] Using StoreKit 2 (App Store Server API)');
      return await verifyWithStoreKit2(transactionId, productId, userId, supabaseClient);
    }

    // Fallback to StoreKit 1 (legacy /verifyReceipt)
    console.log('[verify-apple-receipt] Using StoreKit 1 (legacy /verifyReceipt)');
    return await verifyWithStoreKit1(receipt, productId, transactionId, userId, supabaseClient);

  } catch (error) {
    console.error('[verify-apple-receipt] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// StoreKit 2: App Store Server API (Recommended)
async function verifyWithStoreKit2(
  transactionId: string,
  productId: string,
  userId: string,
  supabaseClient: any
) {
  try {
    // Generate JWT for App Store Server API authentication
    const jwt = await generateAppStoreJWT();
    
    if (!jwt) {
      console.error('[StoreKit2] Failed to generate JWT');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Server configuration error: Unable to generate App Store JWT. Please configure APPLE_KEY_ID, APPLE_ISSUER_ID, and APPLE_PRIVATE_KEY.' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine environment
    const isProduction = Deno.env.get('APPLE_IAP_ENVIRONMENT') === 'production';
    const baseUrl = isProduction
      ? 'https://api.storekit.itunes.apple.com'
      : 'https://api.storekit-sandbox.itunes.apple.com';

    console.log(`[StoreKit2] Using ${isProduction ? 'PRODUCTION' : 'SANDBOX'} environment`);
    console.log(`[StoreKit2] Fetching transaction info for: ${transactionId}`);

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      // Get transaction info from App Store Server API with proper SSL/TLS handling
      const response = await fetch(`${baseUrl}/inApps/v1/transactions/${transactionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          'User-Agent': 'MacroGoal/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[StoreKit2] API error:', response.status, errorText);
        
        // Provide more specific error messages
        if (response.status === 401) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Authentication failed with Apple. Please check your API credentials (APPLE_KEY_ID, APPLE_ISSUER_ID, APPLE_PRIVATE_KEY).' 
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `App Store Server API error: ${response.status}` 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      console.log('[StoreKit2] Transaction data received');

      // Decode the signed transaction (JWS format)
      const signedTransaction = data.signedTransaction;
      if (!signedTransaction) {
        console.error('[StoreKit2] No signed transaction in response');
        return new Response(
          JSON.stringify({ success: false, error: 'No transaction data received' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Decode JWT payload (middle part of JWS)
      const transactionInfo = decodeJWT(signedTransaction);
      console.log('[StoreKit2] Transaction info:', {
        productId: transactionInfo.productId,
        transactionId: transactionInfo.transactionId,
        expiresDate: transactionInfo.expiresDate,
      });

      // Check if subscription is active
      const expiresDateMs = transactionInfo.expiresDate || 0;
      const now = Date.now();
      const isActive = expiresDateMs > now;

      console.log('[StoreKit2] Subscription active:', isActive);

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
          apple_original_transaction_id: transactionInfo.originalTransactionId || transactionId,
          current_period_start: new Date(transactionInfo.purchaseDate).toISOString(),
          current_period_end: new Date(expiresDateMs).toISOString(),
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        })
        .select()
        .single();

      if (dbError) {
        console.error('[StoreKit2] Database error:', dbError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update subscription in database' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[StoreKit2] Subscription updated successfully');

      return new Response(
        JSON.stringify({ 
          success: true, 
          subscription,
          isActive,
          expiresAt: new Date(expiresDateMs).toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('[StoreKit2] Request timeout');
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Request to Apple servers timed out. Please try again.' 
          }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw fetchError;
    }

  } catch (error) {
    console.error('[StoreKit2] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for SSL/TLS specific errors
    if (errorMessage.includes('SSL') || errorMessage.includes('TLS') || errorMessage.includes('handshake')) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SSL connection error. This may be a temporary network issue. Please try again in a few moments.' 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// StoreKit 1: Legacy /verifyReceipt (Fallback)
async function verifyWithStoreKit1(
  receipt: string,
  productId: string,
  transactionId: string,
  userId: string,
  supabaseClient: any
) {
  // Determine environment (sandbox vs production)
  const isProduction = Deno.env.get('APPLE_IAP_ENVIRONMENT') === 'production';
  const verifyUrl = isProduction
    ? 'https://buy.itunes.apple.com/verifyReceipt'
    : 'https://sandbox.itunes.apple.com/verifyReceipt';

  console.log(`[StoreKit1] Using ${isProduction ? 'PRODUCTION' : 'SANDBOX'} environment`);

  // Apple shared secret (required for auto-renewable subscriptions)
  const sharedSecret = Deno.env.get('APPLE_SHARED_SECRET');
  if (!sharedSecret) {
    console.error('[StoreKit1] APPLE_SHARED_SECRET not configured');
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Server configuration error: APPLE_SHARED_SECRET missing. Please add it to Supabase Edge Function secrets.' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    // Verify receipt with Apple
    console.log('[StoreKit1] Sending receipt to Apple...');
    const appleResponse = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'MacroGoal/1.0',
      },
      body: JSON.stringify({
        'receipt-data': receipt,
        'password': sharedSecret,
        'exclude-old-transactions': true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const appleData = await appleResponse.json();
    console.log('[StoreKit1] Apple response status:', appleData.status);

    // Status codes:
    // 0 = valid
    // 21007 = sandbox receipt sent to production (retry with sandbox)
    // 21008 = production receipt sent to sandbox (retry with production)
    if (appleData.status === 21007 && isProduction) {
      console.log('[StoreKit1] Retrying with sandbox...');
      const sandboxResponse = await fetch('https://sandbox.itunes.apple.com/verifyReceipt', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'MacroGoal/1.0',
        },
        body: JSON.stringify({
          'receipt-data': receipt,
          'password': sharedSecret,
          'exclude-old-transactions': true,
        }),
      });
      const sandboxData = await sandboxResponse.json();
      console.log('[StoreKit1] Sandbox retry status:', sandboxData.status);
      return await processStoreKit1Response(sandboxData, productId, transactionId, userId, supabaseClient);
    }

    if (appleData.status === 21008 && !isProduction) {
      console.log('[StoreKit1] Retrying with production...');
      const prodResponse = await fetch('https://buy.itunes.apple.com/verifyReceipt', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'MacroGoal/1.0',
        },
        body: JSON.stringify({
          'receipt-data': receipt,
          'password': sharedSecret,
          'exclude-old-transactions': true,
        }),
      });
      const prodData = await prodResponse.json();
      console.log('[StoreKit1] Production retry status:', prodData.status);
      return await processStoreKit1Response(prodData, productId, transactionId, userId, supabaseClient);
    }

    return await processStoreKit1Response(appleData, productId, transactionId, userId, supabaseClient);
  } catch (fetchError) {
    clearTimeout(timeoutId);
    
    if (fetchError instanceof Error && fetchError.name === 'AbortError') {
      console.error('[StoreKit1] Request timeout');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Request to Apple servers timed out. Please try again.' 
        }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';
    
    // Check for SSL/TLS specific errors
    if (errorMessage.includes('SSL') || errorMessage.includes('TLS') || errorMessage.includes('handshake')) {
      console.error('[StoreKit1] SSL/TLS error:', errorMessage);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SSL connection error. This may be a temporary network issue. Please try again in a few moments.' 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    throw fetchError;
  }
}

async function processStoreKit1Response(
  appleData: any,
  productId: string,
  transactionId: string,
  userId: string,
  supabaseClient: any
) {
  if (appleData.status !== 0) {
    console.error('[StoreKit1] Apple verification failed:', appleData.status);
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

  console.log('[StoreKit1] Latest receipt info count:', latestReceiptInfo.length);

  // Find the matching transaction
  const transaction = latestReceiptInfo.find((t: any) => 
    t.transaction_id === transactionId || t.product_id === productId
  );

  if (!transaction) {
    console.error('[StoreKit1] Transaction not found in receipt');
    return new Response(
      JSON.stringify({ success: false, error: 'Transaction not found in receipt' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('[StoreKit1] Transaction found:', {
    product_id: transaction.product_id,
    transaction_id: transaction.transaction_id,
    expires_date_ms: transaction.expires_date_ms,
  });

  // Check if subscription is active
  const expiresDateMs = parseInt(transaction.expires_date_ms || '0');
  const now = Date.now();
  const isActive = expiresDateMs > now;

  console.log('[StoreKit1] Subscription active:', isActive);

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
    console.error('[StoreKit1] Database error:', dbError);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to update subscription in database' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('[StoreKit1] Subscription updated successfully');

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

// Generate JWT for App Store Server API (StoreKit 2)
async function generateAppStoreJWT(): Promise<string | null> {
  try {
    const keyId = Deno.env.get('APPLE_KEY_ID');
    const issuerId = Deno.env.get('APPLE_ISSUER_ID');
    const privateKeyPEM = Deno.env.get('APPLE_PRIVATE_KEY');

    if (!keyId || !issuerId || !privateKeyPEM) {
      console.error('[JWT] Missing required environment variables');
      return null;
    }

    // JWT Header
    const header = {
      alg: 'ES256',
      kid: keyId,
      typ: 'JWT',
    };

    // JWT Payload
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: issuerId,
      iat: now,
      exp: now + 3600, // 1 hour expiration
      aud: 'appstoreconnect-v1',
      bid: 'com.robertojose17.macrogoal', // Bundle ID
    };

    // Encode header and payload
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const message = `${encodedHeader}.${encodedPayload}`;

    // Import private key
    const privateKey = await importPrivateKey(privateKeyPEM);

    // Sign the message
    const signature = await signMessage(message, privateKey);
    const encodedSignature = base64UrlEncode(signature);

    return `${message}.${encodedSignature}`;
  } catch (error) {
    console.error('[JWT] Error generating JWT:', error);
    return null;
  }
}

// Import ECDSA private key from PEM
async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  // Remove PEM header/footer and whitespace
  const pemContents = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  // Decode base64
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  // Import key
  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign']
  );
}

// Sign message with ECDSA
async function signMessage(message: string, privateKey: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    data
  );

  return arrayBufferToString(signature);
}

// Decode JWT payload (middle part of JWS)
function decodeJWT(jwt: string): any {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const payload = parts[1];
  const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(decoded);
}

// Base64 URL encode
function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Convert ArrayBuffer to string
function arrayBufferToString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
}
