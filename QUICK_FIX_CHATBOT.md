
# 🚀 Quick Fix: AI Chatbot Not Working

## Problem
Chatbot returns: "Error: Edge Function returned a non-2xx status code"

## Solution (5 minutes)

### Step 1: Get OpenRouter API Key
1. Go to https://openrouter.ai/
2. Sign up / Log in
3. Click "Keys" → "Create Key"
4. Copy the key (starts with `sk-or-v1-...`)

### Step 2: Add Credits
1. Go to https://openrouter.ai/credits
2. Add $5-$10 (enough for thousands of requests)

### Step 3: Set in Supabase
1. Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/settings/functions
2. Click "Edge Functions" → "Secrets" tab
3. Click "Add new secret"
4. Name: `OPENROUTER_API_KEY`
5. Value: Paste your API key
6. Click "Save"

### Step 4: Test
1. Open app
2. Make sure you have active subscription (use test card: 4242 4242 4242 4242)
3. Go to AI Meal Estimator
4. Send message: "Estimate calories for chicken and rice"
5. Should work immediately! ✅

## That's It!

The code is already fixed and deployed. You just need to set the API key.

## Still Not Working?

Check logs:
```
Supabase Dashboard → Edge Functions → chatbot → Logs
```

Look for:
- ✅ `[Chatbot] ✅ OPENROUTER_API_KEY: [REDACTED - length: XX]` = Good!
- ❌ `[Chatbot] ❌ OPENROUTER_API_KEY not configured!` = Set the API key
- ❌ `[Chatbot] ❌ User does not have active subscription` = Subscribe first
- ❌ `[Chatbot] ❌ OpenRouter API error` = Check API key and credits

## Cost
- ~$0.0002 per meal estimation
- $5 = ~25,000 estimations
- Very affordable! 💰

---

**Need more details?** See `OPENROUTER_SETUP_GUIDE.md`
