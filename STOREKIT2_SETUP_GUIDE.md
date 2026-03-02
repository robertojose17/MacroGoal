
# StoreKit 2 Setup Guide - Macro Goal

## ✅ What Changed

Your app now supports **StoreKit 2** (App Store Server API), which is Apple's modern, recommended approach for in-app purchases. The old StoreKit 1 (`/verifyReceipt`) is still available as a fallback.

## 🔑 Required Configuration

To enable StoreKit 2, you need to configure **3 new environment variables** in Supabase:

### 1. Get Your App Store Connect API Credentials

#### Step 1: Create an API Key in App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Click **Users and Access** (in the top menu)
3. Click **Keys** tab (under "Integrations")
4. Click the **+** button to create a new key
5. Enter a name: `Macro Goal IAP Verification`
6. Select **Access**: `App Manager` (or `Developer` minimum)
7. Click **Generate**
8. **IMPORTANT**: Download the `.p8` file immediately (you can only download it once!)
9. Note down:
   - **Key ID** (e.g., `ABC123XYZ`)
   - **Issuer ID** (shown at the top of the Keys page, e.g., `12345678-1234-1234-1234-123456789012`)

#### Step 2: Prepare the Private Key

Open the downloaded `.p8` file in a text editor. It looks like this:

```
-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgaNnC6SAZI0OSlx9Y
qKoA39mjvRf+M1yAkw/E7xOH/wagCgYIKoZIzj0DAQehRANCAASmeGPdmwAc6PEU
PB4A9WNQRVIWIEdfDtPdsJiALsvuMu+zCF+wSHeL862yuAQm/OoY8KOFZwcphLFl
hGYsKTvN
-----END PRIVATE KEY-----
```

**Copy the entire contents** (including the `-----BEGIN` and `-----END` lines).

### 2. Add Environment Variables to Supabase

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: **Macro Goal** (`esgptfiofoaeguslgvcq`)
3. Go to **Settings** → **Edge Functions** → **Secrets**
4. Add these 4 new secrets:

| Secret Name | Value | Example |
|------------|-------|---------|
| `APPLE_USE_STOREKIT2` | `true` | `true` |
| `APPLE_KEY_ID` | Your Key ID from Step 1 | `ABC123XYZ` |
| `APPLE_ISSUER_ID` | Your Issuer ID from Step 1 | `12345678-1234-1234-1234-123456789012` |
| `APPLE_PRIVATE_KEY` | Full contents of `.p8` file | `-----BEGIN PRIVATE KEY-----\nMIGT...` |

**Note**: For `APPLE_PRIVATE_KEY`, paste the entire key including newlines. Supabase will handle it correctly.

### 3. Keep Existing Secrets (for fallback)

Keep these existing secrets for StoreKit 1 fallback:

- `APPLE_SHARED_SECRET` (your App-Specific Shared Secret from App Store Connect)
- `APPLE_IAP_ENVIRONMENT` (`sandbox` for testing, `production` for live)

## 🚀 How It Works

### StoreKit 2 Flow (Recommended)

1. User purchases a subscription in the app
2. App receives a `transactionId` from Apple
3. App sends `transactionId` to your Edge Function
4. Edge Function:
   - Generates a JWT using your API credentials
   - Calls Apple's App Store Server API directly
   - Verifies the transaction is valid
   - Updates your database

**Benefits**:
- ✅ More secure (no shared secrets in requests)
- ✅ Real-time transaction status
- ✅ Better error handling
- ✅ Future-proof (Apple's recommended approach)

### StoreKit 1 Fallback (Legacy)

If StoreKit 2 is not configured (`APPLE_USE_STOREKIT2` is not `true`), the system automatically falls back to the old `/verifyReceipt` method.

## 🧪 Testing

### Sandbox Testing (TestFlight / Development)

1. Set `APPLE_IAP_ENVIRONMENT=sandbox` in Supabase secrets
2. Use a Sandbox Apple ID (create one in App Store Connect → Users and Access → Sandbox Testers)
3. Test purchases in TestFlight or on a real device

### Production Testing

1. Set `APPLE_IAP_ENVIRONMENT=production` in Supabase secrets
2. Test with real Apple IDs
3. Use TestFlight for final testing before App Store release

## 🔍 Troubleshooting

### "Server configuration error: Unable to generate App Store JWT"

**Cause**: Missing or incorrect API credentials.

**Fix**:
1. Verify all 3 secrets are set: `APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_PRIVATE_KEY`
2. Check that `APPLE_PRIVATE_KEY` includes the full PEM format (with `-----BEGIN` and `-----END`)
3. Verify the Key ID and Issuer ID match exactly from App Store Connect

### "App Store Server API error: 401"

**Cause**: Invalid JWT or expired API key.

**Fix**:
1. Regenerate your API key in App Store Connect
2. Update `APPLE_PRIVATE_KEY` with the new `.p8` file contents
3. Ensure the Bundle ID in the JWT matches your app: `com.robertojose17.macrogoal`

### "App Store Server API error: 404"

**Cause**: Transaction not found or wrong environment.

**Fix**:
1. Check `APPLE_IAP_ENVIRONMENT` matches your testing environment
2. Sandbox transactions only work with `sandbox` environment
3. Production transactions only work with `production` environment

## 📊 Monitoring

Check Edge Function logs in Supabase:

1. Go to **Edge Functions** → **verify-apple-receipt** → **Logs**
2. Look for:
   - `[StoreKit2] Using StoreKit 2 (App Store Server API)` - Confirms StoreKit 2 is active
   - `[StoreKit2] Transaction data received` - Successful verification
   - `[StoreKit2] Subscription updated successfully` - Database updated

## 🔄 Migration Path

### Current State (StoreKit 1)
- Uses `/verifyReceipt` endpoint
- Requires `APPLE_SHARED_SECRET`
- Works but is being deprecated by Apple

### After Setup (StoreKit 2)
- Uses App Store Server API
- Requires API credentials (Key ID, Issuer ID, Private Key)
- Modern, secure, future-proof

### Rollback Plan
If you encounter issues, simply remove or set `APPLE_USE_STOREKIT2=false` to revert to StoreKit 1.

## 📚 Additional Resources

- [App Store Server API Documentation](https://developer.apple.com/documentation/appstoreserverapi)
- [Creating API Keys for App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi/creating_api_keys_for_app_store_connect_api)
- [StoreKit 2 Overview](https://developer.apple.com/documentation/storekit/in-app_purchase)

## ✅ Checklist

- [ ] Created API key in App Store Connect
- [ ] Downloaded `.p8` private key file
- [ ] Added `APPLE_USE_STOREKIT2=true` to Supabase secrets
- [ ] Added `APPLE_KEY_ID` to Supabase secrets
- [ ] Added `APPLE_ISSUER_ID` to Supabase secrets
- [ ] Added `APPLE_PRIVATE_KEY` (full PEM contents) to Supabase secrets
- [ ] Kept existing `APPLE_SHARED_SECRET` for fallback
- [ ] Set `APPLE_IAP_ENVIRONMENT` to `sandbox` or `production`
- [ ] Tested purchase in TestFlight
- [ ] Verified logs show `[StoreKit2]` messages
- [ ] Confirmed subscription status updates in database

---

**Need Help?** Check the Edge Function logs in Supabase for detailed diagnostic information.
