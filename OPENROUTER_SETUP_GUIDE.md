
# OpenRouter API Key Setup Guide

## What is OpenRouter?

OpenRouter is a unified API that provides access to multiple AI models including OpenAI's GPT-4, Claude, and others. Your chatbot uses OpenRouter to access OpenAI's GPT-4o-mini model for meal estimation.

## Why Do You Need This?

The chatbot Edge Function requires an OpenRouter API key to:
- Call AI models for meal estimation
- Process text and image inputs
- Generate ingredient breakdowns with macros

## Step-by-Step Setup

### 1. Create an OpenRouter Account

1. Go to https://openrouter.ai/
2. Click "Sign Up" (or "Log In" if you already have an account)
3. Complete the registration process

### 2. Get Your API Key

1. Once logged in, go to https://openrouter.ai/keys
2. Click "Create Key" or "New Key"
3. Give it a name (e.g., "Elite Macro Tracker")
4. Copy the API key (it will look like: `sk-or-v1-...`)
5. **IMPORTANT:** Save this key somewhere safe - you won't be able to see it again!

### 3. Add Credits (Optional but Recommended)

OpenRouter requires credits to use their API:

1. Go to https://openrouter.ai/credits
2. Add credits to your account (start with $5-$10)
3. Pricing for GPT-4o-mini is very affordable (~$0.15 per 1M input tokens)

### 4. Set the Environment Variable in Supabase

1. Go to your Supabase Dashboard:
   ```
   https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/settings/functions
   ```

2. Click on "Edge Functions" in the left sidebar

3. Click on the "Secrets" tab

4. Click "Add new secret"

5. Fill in:
   - **Name:** `OPENROUTER_API_KEY`
   - **Value:** Paste your OpenRouter API key (starts with `sk-or-v1-...`)

6. Click "Save"

### 5. Verify the Setup

1. Open your app
2. Make sure you have an active subscription
3. Navigate to the AI Meal Estimator
4. Send a test message: "Estimate calories for a grilled chicken breast with brown rice"
5. The chatbot should respond with a detailed meal estimate

## Troubleshooting

### Error: "Configuration Error"
- **Cause:** The `OPENROUTER_API_KEY` environment variable is not set
- **Solution:** Follow steps 1-4 above to set the API key

### Error: "OpenRouter API Error"
- **Cause:** The API key is invalid or you don't have enough credits
- **Solution:** 
  1. Verify the API key is correct
  2. Check your OpenRouter account for credits
  3. Add more credits if needed

### Error: "Subscription Required"
- **Cause:** The user doesn't have an active subscription
- **Solution:** Subscribe to Premium using the paywall

## Cost Estimation

OpenRouter pricing for GPT-4o-mini (the model used by the chatbot):
- **Input:** ~$0.15 per 1M tokens
- **Output:** ~$0.60 per 1M tokens

**Example usage:**
- Average meal estimation: ~500 input tokens + 200 output tokens
- Cost per estimation: ~$0.0002 (less than a cent!)
- 1000 estimations: ~$0.20

**Recommendation:** Start with $5-$10 in credits, which should last for thousands of meal estimations.

## Alternative: Use OpenAI Directly

If you prefer to use OpenAI directly instead of OpenRouter:

1. Get an OpenAI API key from https://platform.openai.com/api-keys
2. Modify the chatbot Edge Function to use OpenAI's API directly
3. Set `OPENAI_API_KEY` instead of `OPENROUTER_API_KEY`

However, OpenRouter is recommended because:
- ✅ Unified API for multiple models
- ✅ Better rate limiting
- ✅ Automatic fallback to other models if one is down
- ✅ More flexible pricing

## Security Notes

- ✅ **Never commit API keys to git**
- ✅ **Always use environment variables** (Supabase Secrets)
- ✅ **The API key is only accessible server-side** (in Edge Functions)
- ✅ **Users cannot see or access the API key**

## Support

If you need help:
1. Check the Edge Function logs in Supabase Dashboard
2. Verify the API key is set correctly
3. Check your OpenRouter account for credits
4. Contact OpenRouter support: https://openrouter.ai/docs

---

**Next Step:** Set your `OPENROUTER_API_KEY` in Supabase and test the chatbot!
