
# ⚠️ ACTION REQUIRED: Configure API Keys

## 🎯 Two API Keys Needed

### 1. Google AI API Key (For AI Meal Estimator) - NEW ✨
### 2. FDC API Key (For Food Library)

---

## 🆕 1. Google AI API Key (AI Meal Estimator)

### What Was Implemented

The AI Meal Estimator now uses **Google Gemini 1.5 Flash** AI:

1. ✅ Official `@google/genai` SDK integration
2. ✅ Supabase Edge Function deployed
3. ✅ Text + image analysis support
4. ✅ Comprehensive error handling
5. ✅ Detailed logging and monitoring

### Quick Setup (5 minutes)

#### Step 1: Get Google AI API Key (2 min)

1. Visit: **https://aistudio.google.com/app/apikey**
2. Sign in with your Google account
3. Click **"Get API Key"** or **"Create API Key"**
4. Copy the generated key

#### Step 2: Add to Supabase (2 min)

1. Open: **https://supabase.com/dashboard**
2. Select project: `esgptfiofoaeguslgvcq`
3. Navigate to: **Edge Functions → Settings → Secrets**
4. Click **"Add Secret"**
5. Enter:
   - **Name**: `GOOGLE_AI_API_KEY`
   - **Value**: [Paste your API key]
6. Click **"Save"**

#### Step 3: Test (1 min)

1. Open the app
2. Go to: **Diary → Add Food → AI Meal Estimator**
3. Enter: `"chipotle bowl chicken no rice"`
4. Click: **"Estimate Macros"**
5. Verify: Results appear with calories and macros

### Success Indicators

✅ No "Missing GOOGLE_AI_API_KEY" error
✅ Results appear within 5 seconds
✅ Detailed ingredient breakdown
✅ Confidence score displayed
✅ Logs show "✅ Estimation successful!"

### Documentation

- `SETUP_GOOGLE_AI_API_KEY.md` - Detailed setup guide
- `AI_GEMINI_INTEGRATION.md` - Technical documentation
- `CHECKLIST.md` - Complete checklist

---

## 2. FDC API Key (Food Library)

### What Was Fixed

The FoodData Central (FDC) integration has been fixed with:

1. ✅ Proper API key loading for mobile devices
2. ✅ Enhanced error handling and user feedback
3. ✅ Comprehensive logging for debugging
4. ✅ Timeout protection to prevent infinite loading
5. ✅ Platform detection and status indicators

## What You Need to Do

### Step 1: Get Your FDC API Key (2 minutes)

1. Go to: **https://fdc.nal.usda.gov/api-key-signup.html**
2. Fill out the form with your email and name
3. You'll receive your API key immediately via email

### Step 2: Add API Key to app.json (1 minute)

Open `app.json` and find this section:

```json
"extra": {
  "router": {},
  "fdcApiKey": "DEMO_KEY"
}
```

Replace `"DEMO_KEY"` with your actual API key:

```json
"extra": {
  "router": {},
  "fdcApiKey": "abcd1234efgh5678ijkl9012mnop3456"
}
```

### Step 3: Restart Expo Dev Server (30 seconds)

**IMPORTANT:** You MUST restart the dev server after changing `app.json`

```bash
# In your terminal, press Ctrl+C to stop the server
# Then restart:
npm run dev
```

### Step 4: Test on Your iPhone (5 minutes)

#### Test A: Text Search

1. Open the app on your iPhone
2. Tap any meal (Breakfast, Lunch, Dinner, or Snacks)
3. Tap "Search Food Library"
4. Type "chicken"
5. **Expected:** You should see a list of chicken products from FoodData Central

#### Test B: Barcode Scan

1. Tap "Scan Barcode"
2. Scan any product barcode (e.g., Coca-Cola, Cheerios, Lay's chips)
3. **Expected:** You should see the product details screen with nutrition information

## How to Know It's Working

### ✅ Success Indicators

**In the app:**
- Green banner at top: "✓ Food Library (FDC) - ios"
- Search results appear within 2-3 seconds
- Product names, brands, and nutrition data are displayed
- Barcode scanning finds products and shows details

**In the console:**
```
[FDC] ✓ API key loaded successfully
[FDC] 🔍 Searching foods: "chicken"
[FDC] 📥 Response status: 200 OK
[FDC] ✅ Found 20 foods
```

### ❌ Failure Indicators

**In the app:**
- "Connection Error" message
- "No results found" for all searches
- Infinite loading or blank screens

**In the console:**
```
[FDC] ⚠️ No API key found. Using DEMO_KEY with limited requests.
[FDC] 📥 Response status: 401 Unauthorized
[FDC] ❌ Search failed
```

## Troubleshooting

### Issue: Still seeing "DEMO_KEY" in console

**Solution:**
1. Make sure you saved `app.json` after editing
2. Restart the Expo dev server (Ctrl+C, then `npm run dev`)
3. Reload the app on your iPhone (shake device → Reload)

### Issue: "Connection Error" or "No results found"

**Solution:**
1. Verify your API key is correct (check the email from FDC)
2. Make sure your iPhone has internet connection
3. Test the API key directly in a browser:
   ```
   https://api.nal.usda.gov/fdc/v1/foods/search?api_key=YOUR_KEY&query=chicken
   ```
4. If the browser test works, restart the Expo dev server

### Issue: Barcode scanner gets stuck on loading

**Solution:**
1. Wait up to 15 seconds (there's a timeout)
2. Check your internet connection
3. Try a different barcode (some products may not be in FDC)
4. Check console logs for error details

## Using DEMO_KEY (Not Recommended)

If you don't want to register for an API key right now, the app will use `DEMO_KEY` which has:

- ✅ 1000 requests per hour (shared across all users)
- ❌ May be rate-limited or slow
- ❌ Not suitable for production use

**For testing only.** Get a real API key for reliable performance.

## Documentation

For more details, see:

- `FDC_API_KEY_SETUP.md` - Detailed setup instructions
- `MOBILE_FDC_TESTING_GUIDE.md` - Comprehensive testing guide
- `FDC_INTEGRATION_FIX_SUMMARY.md` - Technical details of what was fixed

## Quick Reference

**FDC API Registration:** https://fdc.nal.usda.gov/api-key-signup.html

**API Key Location:** `app.json` → `expo.extra.fdcApiKey`

**Restart Command:** `npm run dev` (after stopping with Ctrl+C)

**Test Queries:** "chicken", "oats", "eggs", "milk"

**Test Barcodes:** Coca-Cola, Cheerios, Lay's chips, or any common product

## Need Help?

If you're still having issues after following these steps:

1. Check the console logs for `[FDC]` messages
2. Verify the API key is correct
3. Test your internet connection
4. Try the browser test (link above)
5. Check the detailed guides in the documentation files

---

**Remember:** The most common issue is forgetting to restart the Expo dev server after changing `app.json`. Always restart!
