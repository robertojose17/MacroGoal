
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TranscribeRequest {
  audioBase64: string;
  mimeType?: string;
}

console.log('[transcribe-audio] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('[transcribe-audio] Edge Function initializing...');
console.log('[transcribe-audio] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Validate environment variables on startup
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

if (!SUPABASE_URL) {
  console.error('[transcribe-audio] ❌ CRITICAL: SUPABASE_URL is missing!');
} else {
  console.log('[transcribe-audio] ✅ SUPABASE_URL configured');
}

if (!SUPABASE_SERVICE_KEY) {
  console.error('[transcribe-audio] ❌ CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing!');
} else {
  console.log('[transcribe-audio] ✅ SUPABASE_SERVICE_ROLE_KEY configured');
}

if (!OPENAI_API_KEY) {
  console.error('[transcribe-audio] ❌ CRITICAL: OPENAI_API_KEY is missing!');
  console.error('[transcribe-audio] ❌ The transcription service will not work without this key!');
  console.error('[transcribe-audio] ❌ Please set it in Supabase Dashboard → Settings → Edge Functions → Secrets');
} else {
  console.log('[transcribe-audio] ✅ OPENAI_API_KEY configured (length:', OPENAI_API_KEY.length, ')');
}

console.log('[transcribe-audio] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log('[transcribe-audio] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[transcribe-audio] 📥 New request:', requestId);
  console.log('[transcribe-audio] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Check if OPENAI_API_KEY is configured
    if (!OPENAI_API_KEY) {
      console.error('[transcribe-audio] ❌ OPENAI_API_KEY not configured!');
      return new Response(
        JSON.stringify({
          error: 'Configuration Error',
          detail: 'OPENAI_API_KEY environment variable is not set. Please configure it in Supabase Dashboard.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[transcribe-audio] ❌ No authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('[transcribe-audio] ❌ Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Configuration Error', detail: 'Missing Supabase configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify user authentication
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[transcribe-audio] ❌ Invalid user token:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: 'Invalid user token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[transcribe-audio] ✅ User authenticated:', user.id);

    // Check subscription status
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (subError) {
      console.error('[transcribe-audio] ⚠️ Error checking subscription:', subError);
    }

    const isSubscribed = subscription?.status === 'active' || subscription?.status === 'trialing';

    if (!isSubscribed) {
      console.error('[transcribe-audio] ❌ User not subscribed');
      return new Response(
        JSON.stringify({
          error: 'Subscription Required',
          detail: 'An active subscription is required to use voice input',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[transcribe-audio] ✅ Subscription verified:', subscription.status);

    // Parse request body
    const body: TranscribeRequest = await req.json();
    const { audioBase64, mimeType = 'audio/m4a' } = body;

    if (!audioBase64) {
      console.error('[transcribe-audio] ❌ Missing audioBase64');
      return new Response(
        JSON.stringify({ error: 'Bad Request', detail: 'Missing audioBase64' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[transcribe-audio] 📊 Audio base64 length:', audioBase64.length);

    // Validate base64 is not empty
    if (audioBase64.length < 100) {
      console.error('[transcribe-audio] ❌ Audio data too short, likely empty');
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          detail: 'Audio data is empty or too short',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[transcribe-audio] 🎤 Transcribing audio...');

    // Convert base64 to binary
    let audioData: Uint8Array;
    try {
      audioData = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
      console.log('[transcribe-audio] 📦 Audio data size:', audioData.length, 'bytes');

      if (audioData.length === 0) {
        throw new Error('Audio data is empty after decoding');
      }
    } catch (decodeError) {
      console.error('[transcribe-audio] ❌ Error decoding base64:', decodeError);
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          detail: 'Invalid base64 audio data',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create form data for OpenAI Whisper API
    const formData = new FormData();
    const audioBlob = new Blob([audioData], { type: mimeType });

    // Determine file extension based on mime type
    let fileExtension = 'm4a';
    if (mimeType.includes('wav')) {
      fileExtension = 'wav';
    } else if (mimeType.includes('webm')) {
      fileExtension = 'webm';
    } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      fileExtension = 'mp3';
    } else if (mimeType.includes('mp4')) {
      fileExtension = 'm4a';
    }

    console.log('[transcribe-audio] 📝 File extension:', fileExtension);

    formData.append('file', audioBlob, `audio.${fileExtension}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en'); // English language
    formData.append('response_format', 'json');

    console.log('[transcribe-audio] 📤 Calling OpenAI Whisper API...');
    const startTime = performance.now();

    let whisperResponse;
    try {
      whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      });
    } catch (fetchError: any) {
      console.error('[transcribe-audio] ❌ Network error calling OpenAI:', fetchError);
      return new Response(
        JSON.stringify({
          error: 'Network Error',
          detail: `Failed to connect to OpenAI API: ${fetchError.message}`,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const duration = Math.round(performance.now() - startTime);
    console.log('[transcribe-audio] 📥 OpenAI response received');
    console.log('[transcribe-audio]   - Status:', whisperResponse.status);
    console.log('[transcribe-audio]   - Duration:', duration, 'ms');

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('[transcribe-audio] ❌ OpenAI API error:');
      console.error('[transcribe-audio]   - Status:', whisperResponse.status);
      console.error('[transcribe-audio]   - Response:', errorText);

      // Parse error for better user feedback
      let errorDetail = 'Failed to transcribe audio';
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorDetail = errorJson.error.message;
        }
      } catch (e) {
        // Use raw error text if not JSON
        errorDetail = errorText.substring(0, 200);
      }

      return new Response(
        JSON.stringify({
          error: 'Transcription Error',
          detail: errorDetail,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const transcription = await whisperResponse.json();
    console.log('[transcribe-audio] ✅ Transcription successful');
    console.log('[transcribe-audio] 📝 Transcribed text:', transcription.text);
    console.log('[transcribe-audio] ⏱️  Total duration:', duration, 'ms');
    console.log('[transcribe-audio] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return new Response(
      JSON.stringify({
        text: transcription.text || '',
        duration: transcription.duration,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[transcribe-audio] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('[transcribe-audio] ❌ UNHANDLED ERROR');
    console.error('[transcribe-audio] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('[transcribe-audio] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[transcribe-audio] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[transcribe-audio] Error stack:', error instanceof Error ? error.stack : 'N/A');
    console.error('[transcribe-audio] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
