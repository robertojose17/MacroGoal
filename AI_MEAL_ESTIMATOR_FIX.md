
# AI Meal Estimator - Gemini Integration Fix

## Problem
The AI Meal Estimator was returning a "400 Bad Request - API key not valid" error when calling the Gemini API.

## Root Cause
The Edge Function was using the `@google/generative-ai` npm package which was not properly authenticating with the Gemini API. The API key needed to be passed directly in the URL as a query parameter.

## Solution Implemented

### 1. Edge Function Rewrite (`supabase/functions/ai-meal-estimate/index.ts`)

**Key Changes:**
- ✅ Removed dependency on `@google/generative-ai` npm package
- ✅ Now calls Gemini REST API directly using native `fetch()`
- ✅ API key is read from `GOOGLE_AI_API_KEY` environment variable
- ✅ Added startup log: `key_present: true/false` (never logs actual key)
- ✅ Correct API endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`
- ✅ Proper request format:
  ```json
  {
    "contents": [
      {
        "role": "user",
        "parts": [
          { "text": "user prompt" },
          { "inline_data": { "mime_type": "image/jpeg", "data": "base64..." } }
        ]
      }
    ]
  }
  ```

**Error Handling:**
- ✅ If `response.ok` is false, awaits `response.text()` and returns clean error
- ✅ Returns safe default values with warning if Gemini returns unparseable response
- ✅ Returns safe default values with warning if Gemini returns no match
- ✅ No infinite loaders - always returns a response

**Defensive Features:**
- Validates API key presence at startup
- Handles missing or malformed Gemini responses gracefully
- Provides fallback nutrition estimates when AI fails
- Comprehensive logging for debugging

### 2. Client-Side Updates (`app/ai-meal-estimator.tsx`)

**Key Changes:**
- ✅ Updated error messages to show: "AI estimate failed — check connection and try again."
- ✅ Added alert when AI returns warning notes (⚠️ prefix)
- ✅ Improved error handling consistency

**Client Behavior:**
- Client only calls the Edge Function (never calls Gemini directly)
- Edge Function URL: `https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/ai-meal-estimate`
- Sends FormData with `description` and optional `image`
- Displays user-friendly error messages

## Testing Checklist

Test on PHONE (Expo Go/TestFlight):

### Text Only Input
- [ ] Enter meal description (e.g., "chicken breast with rice and broccoli")
- [ ] Press "Estimate Macros"
- [ ] Should return: calories, protein, carbs, fats, fiber
- [ ] Values should be reasonable for the described meal

### Text + Photo Input
- [ ] Enter meal description
- [ ] Add photo (Take Photo or Choose Photo)
- [ ] Press "Estimate Macros"
- [ ] Should return: calories, protein, carbs, fats, fiber
- [ ] Values should be more accurate with photo context

### Error Scenarios
- [ ] If Gemini API fails, should show: "AI estimate failed — check connection and try again."
- [ ] If Gemini returns no match, should return safe defaults with warning
- [ ] No infinite loaders - always resolves to a result or error

### Integration
- [ ] Can edit nutrition values before logging
- [ ] "Log to Diary" adds food to correct meal slot
- [ ] Returns to Food Diary after logging
- [ ] Works from both Diary mode and My Meal Builder mode

## Environment Setup

**Required:**
1. Set `GOOGLE_AI_API_KEY` in Supabase Edge Functions → Settings → Secrets
2. Get API key from: https://aistudio.google.com/app/apikey

**Verification:**
- Check Edge Function logs for: `[AI Meal Estimate] key_present: true`
- If `key_present: false`, the API key is not configured

## What Was NOT Changed

✅ Barcode Scanner - untouched
✅ Food Library - untouched
✅ Add Food menu - untouched
✅ My Meals - untouched
✅ Favorites - untouched
✅ Food Diary - untouched
✅ All existing working behavior - untouched

Only the AI Meal Estimator Edge Function and its client integration were modified.

## Deployment Status

✅ Edge Function deployed: Version 11
✅ Client code updated
✅ Ready for testing

## Next Steps

1. Verify `GOOGLE_AI_API_KEY` is set in Supabase Edge Functions secrets
2. Test on physical device (Expo Go or TestFlight)
3. Monitor Edge Function logs for any issues
4. Verify all test scenarios pass
