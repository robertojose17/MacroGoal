
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FITNESS_WORDS = ['fit', 'gym', 'lift', 'run', 'gains', 'macro', 'lean', 'strong', 'fuel', 'grind']

// Keep database diagnostics bounded; never log messages, details, values, or identities.
function safeDatabaseError(error: unknown): { code?: string; constraint?: string } {
  if (!error || typeof error !== 'object') return {}
  const fields = error as Record<string, unknown>
  const code = typeof fields.code === 'string' && /^[0-9A-Z]{5}$/.test(fields.code)
    ? fields.code : undefined
  const candidate = typeof fields.constraint === 'string'
    ? fields.constraint
    : typeof fields.message === 'string'
      ? fields.message.match(/unique constraint "([A-Za-z_][A-Za-z0-9_]{0,62})"/)?.[1]
      : undefined
  const constraint = candidate && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(candidate)
    ? candidate : undefined
  return { ...(code ? { code } : {}), ...(constraint ? { constraint } : {}) }
}

function profileCreationFailure(): Response {
  return new Response(
    JSON.stringify({ error: 'Could not create profile, please try again.' }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

function slugifyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)
}

function generateUsername(name: string): string {
  const slug = slugifyName(name)
  const word = FITNESS_WORDS[Math.floor(Math.random() * FITNESS_WORDS.length)]
  const digits = (1000 + Math.floor(Math.random() * 9000)).toString()

  // Build candidate and ensure total length <= 20
  // Format: {slug}_{word}_{digits} or {word}_{digits} if slug is empty
  // Max overhead: '_' + word(6) + '_' + digits(4) = 12 chars
  // So slug can be at most 20 - 12 = 8 chars when word is 'strong'/'gains'
  const maxSlugLen = 20 - 1 - word.length - 1 - digits.length // 20 - '_' - word - '_' - 4digits
  const trimmedSlug = slug.slice(0, Math.max(0, maxSlugLen))

  if (trimmedSlug.length === 0) {
    return `${word}_${digits}`
  }
  return `${trimmedSlug}_${word}_${digits}`
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[CreateUserProfile] Starting user profile creation...')

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('[CreateUserProfile] No authorization header')
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role key (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get the user from the auth header
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      console.error('[CreateUserProfile] Error getting user')
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[CreateUserProfile] User authenticated')

    // Get request body
    const { name } = await req.json()

    console.log('[CreateUserProfile] Creating profile')

    // Check if profile already exists
    const { data: existingUser, error: existingError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (existingError || (existingUser && existingUser.id !== user.id)) {
      console.error('[CreateUserProfile] Could not verify existing profile:', safeDatabaseError(existingError))
      return profileCreationFailure()
    }

    if (existingUser?.id === user.id) {
      console.log('[CreateUserProfile] Profile already exists')
      return new Response(
        JSON.stringify({ success: true, message: 'Profile already exists' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const displayName = name || user.email?.split('@')[0] || 'User'

    // Attempt insert with collision retry (up to 5 times)
    let data = null
    let lastError = null

    for (let attempt = 0; attempt < 5; attempt++) {
      const username = generateUsername(displayName)
      console.log(`[CreateUserProfile] Profile insert attempt ${attempt + 1}`)

      const { data: inserted, error } = await supabaseAdmin
        .from('users')
        .insert({
          id: user.id,
          email: user.email,
          name: displayName,
          username,
          user_type: 'free',
          onboarding_completed: false,
        })
        .select()
        .single()

      if (!error) {
        data = inserted
        lastError = null
        break
      }

      lastError = error

      // A unique violation can come from another constraint or a trigger.
      // Only an exact authenticated-id lookup can establish idempotent success.
      const safeError = safeDatabaseError(error)
      if (error.code === '23505') {
        console.warn('[CreateUserProfile] Unique conflict:', safeError)
        const { data: confirmedUser, error: verificationError } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()

        if (verificationError || (confirmedUser && confirmedUser.id !== user.id)) {
          console.error('[CreateUserProfile] Could not verify profile after conflict:', safeDatabaseError(verificationError))
          return profileCreationFailure()
        }

        if (confirmedUser?.id === user.id) {
          console.log('[CreateUserProfile] Profile already exists (verified)')
          return new Response(
            JSON.stringify({ success: true, message: 'Profile already exists' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (safeError.constraint === 'users_username_lower_unique') {
          console.log(`[CreateUserProfile] Username collision on attempt ${attempt + 1}, retrying...`)
          continue
        }
      }

      // An unverified unique conflict or any other error must not report success.
      console.error('[CreateUserProfile] Error creating profile:', safeError)
      return profileCreationFailure()
    }

    if (lastError) {
      console.error('[CreateUserProfile] All username attempts failed:', safeDatabaseError(lastError))
      return new Response(
        JSON.stringify({ error: 'Could not generate a unique username, please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[CreateUserProfile] ✅ Profile created successfully')

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch {
    console.error('[CreateUserProfile] Unexpected error')
    return profileCreationFailure()
  }
})
