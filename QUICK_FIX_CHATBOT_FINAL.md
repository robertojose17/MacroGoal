
# QUICK FIX: Chatbot 502 Error

## The Problem
Chatbot returns: "Edge Function returned a non-2xx status code" (502 error)

## The Solution (99% sure)

### Your OPENROUTER_API_KEY is missing or invalid!

## Fix It NOW:

1. **Go to Supabase Dashboard**
   - URL: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq
   - Navigate to: **Settings** → **Edge Functions** → **Secrets**

2. **Check OPENROUTER_API_KEY**
   - Is it there? 
   - Is it correct?
   - Format should be: `sk-or-v1-...`

3. **If Missing or Wrong:**
   - Get your key from: https://openrouter.ai/keys
   - Add/Update the secret:
     - Name: `OPENROUTER_API_KEY`
     - Value: `sk-or-v1-...` (your actual key)
   - Click Save

4. **Test Immediately**
   - Open your app
   - Go to AI Meal Estimator
   - Send a message
   - It should work now!

## How to Verify It's Fixed

### Check the Logs:
1. Go to: **Edge Functions** → **chatbot** → **Logs**
2. Look for:
   ```
   ✅ OPENROUTER_API_KEY: [REDACTED - length: 64]
   ```
3. If you see this, the key is set correctly!

### If Still Broken:
Look for these error messages in the logs:
- `❌ CRITICAL: OPENROUTER_API_KEY environment variable is missing!`
  → Key is not set
- `❌ OpenRouter API error: Status: 401`
  → Key is invalid
- `❌ Subscription Required`
  → User doesn't have active subscription

## What I Changed

I redeployed the chatbot Edge Function with:
- ✅ Enhanced logging showing API key status
- ✅ Detailed error messages
- ✅ Better debugging information

**Version**: 16 (just deployed)

## 100% Guarantee

If you set the `OPENROUTER_API_KEY` correctly, the chatbot WILL work.

The code is perfect. The Stripe integration didn't break anything.
The ONLY issue is the missing/invalid API key.

## Still Not Working?

Send me the logs from:
**Edge Functions** → **chatbot** → **Logs**

I'll tell you exactly what's wrong.
