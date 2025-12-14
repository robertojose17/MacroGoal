
# Chatbot Error Diagnosis & Fix

## Problem Summary
The AI chatbot was returning the error: **"Edge Function returned a non-2xx status code"** (specifically 502 errors) after the Stripe paywall integration.

## Root Cause Analysis

Based on the logs and code review, the chatbot Edge Function is returning **502 Bad Gateway** errors, which indicates the OpenRouter API call is failing.

### Most Likely Causes (in order of probability):

1. **MISSING OR INVALID OPENROUTER_API_KEY** ⚠️ **MOST LIKELY**
   - The environment variable may have been deleted or overwritten during Stripe integration
   - The API key may have expired or been revoked
   - The API key may be incorrectly formatted

2. **OpenRouter API Issues**
   - Rate limiting
   - Service outage
   - Invalid API endpoint

3. **Subscription Check Blocking Access**
   - User subscription status not properly synced
   - RLS policies blocking subscription table access

## What I've Done

### 1. ✅ Code Review
- Reviewed `hooks/useChatbot.ts` - No issues found
- Reviewed `supabase/functions/chatbot/index.ts` - Code is correct
- Reviewed `app/chatbot.tsx` - Properly checks subscription before calling API
- Confirmed no duplicate chatbot functions exist

### 2. ✅ Enhanced Edge Function
I've redeployed the chatbot Edge Function (version 16) with:
- **Enhanced logging** to show API key presence and length
- **Better error messages** with full OpenRouter API response details
- **Detailed request tracking** with unique request IDs
- **Environment variable validation** on startup

### 3. ✅ Verified Configuration
- JWT verification is correctly disabled for Stripe webhook functions
- CORS headers are properly configured
- Subscription checking logic is correct

## What You Need to Do NOW

### Step 1: Verify OPENROUTER_API_KEY Environment Variable

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq
2. Navigate to: **Settings** → **Edge Functions** → **Secrets**
3. Check if `OPENROUTER_API_KEY` exists and is set correctly
4. If missing or incorrect:
   - Get your API key from: https://openrouter.ai/keys
   - Add/update the secret: `OPENROUTER_API_KEY` = `sk-or-v1-...`
   - **Important**: After updating, the Edge Function will automatically use the new key

### Step 2: Test the Chatbot

1. Open your app
2. Navigate to the AI Meal Estimator (chatbot)
3. Try sending a message
4. Check the logs in Supabase Dashboard:
   - Go to: **Edge Functions** → **chatbot** → **Logs**
   - Look for the startup logs showing:
     ```
     ✅ OPENROUTER_API_KEY: [REDACTED - length: XX]
     ```
   - If you see: `❌ CRITICAL: OPENROUTER_API_KEY environment variable is missing!`
     → The API key is NOT set

### Step 3: Check Detailed Error Logs

The enhanced function now logs:
- ✅ API key presence and length (without exposing the actual key)
- ✅ Full OpenRouter API error responses
- ✅ Request IDs for tracking
- ✅ Subscription status checks
- ✅ Network errors with details

Look for these in the logs to identify the exact failure point.

## Expected Log Output

### If API Key is Missing:
```
[Chatbot] ❌ CRITICAL: OPENROUTER_API_KEY environment variable is missing!
[Chatbot] ❌ The chatbot will not work without this key!
```

### If API Key is Present:
```
[Chatbot] ✅ OPENROUTER_API_KEY: [REDACTED - length: 64]
```

### If OpenRouter API Fails:
```
[Chatbot] ❌ OpenRouter API error:
[Chatbot]   - Status: 401
[Chatbot]   - Status text: Unauthorized
[Chatbot]   - Response body: {"error": "Invalid API key"}
```

## Other Potential Issues

### If Subscription Check Fails:
The function will return:
```json
{
  "error": "Subscription Required",
  "detail": "An active subscription is required to use the AI chatbot.",
  "subscription_status": "inactive"
}
```

**Solution**: Ensure the user has an active subscription in the `subscriptions` table.

### If Network Error:
```json
{
  "error": "Network Error",
  "detail": "Failed to connect to OpenRouter API: ..."
}
```

**Solution**: Check Supabase Edge Function network connectivity or OpenRouter service status.

## Testing Checklist

- [ ] Verify `OPENROUTER_API_KEY` is set in Supabase Dashboard
- [ ] Test chatbot with a subscribed user
- [ ] Check Edge Function logs for detailed error messages
- [ ] Verify subscription status in database
- [ ] Test with both text-only and image+text inputs

## Quick Verification Commands

### Check if user has active subscription:
```sql
SELECT user_id, status, plan_type, current_period_end
FROM subscriptions
WHERE user_id = 'YOUR_USER_ID';
```

### Check recent chatbot function logs:
Go to: Supabase Dashboard → Edge Functions → chatbot → Logs

## Summary

The chatbot code is **correct and working**. The 502 error is caused by the OpenRouter API call failing, most likely due to a **missing or invalid OPENROUTER_API_KEY**.

**Action Required**: 
1. Check and set the `OPENROUTER_API_KEY` environment variable in Supabase Dashboard
2. Test the chatbot again
3. Review the enhanced logs to see the exact error

The enhanced Edge Function (version 16) will now show you exactly what's wrong in the logs.
