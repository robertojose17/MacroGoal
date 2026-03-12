
# RevenueCat Webhook Testing Guide

## ✅ The Error You're Seeing is CORRECT

The error `"User not found in auth.users: 31c9c240-799d-4bbe-806e-38786a99d913"` is **expected behavior**. Your webhook is working correctly by rejecting invalid user IDs!

## 🔍 What's Happening

RevenueCat's test events use **fake user IDs** that don't exist in your database. The webhook correctly rejects these to prevent invalid data from being stored.

## 🎯 How to Fix It

### Option 1: Use Your Real User ID (Recommended)

1. **Open the app** and log in
2. **Go to Profile tab** → Tap "Test RevenueCat" button
3. **Copy your real user ID** (it will be displayed on screen)
4. **Go to RevenueCat Dashboard**:
   - Navigate to: Integrations → Webhooks
   - Click "Send Test Event"
5. **Edit the test JSON**:
   - Find the `"app_user_id"` field
   - Replace the fake ID with your real user ID
   - Example:
     ```json
     {
       "event": {
         "app_user_id": "YOUR_REAL_USER_ID_HERE",
         ...
       }
     }
     ```
6. **Send the test** - it should now return `200 OK`! ✅

### Option 2: Test with Sandbox Purchases

The webhook now accepts test events from sandbox environments even if the user doesn't exist. This is useful for initial testing:

1. Make a test purchase in the iOS Simulator or Android Emulator
2. Use a sandbox test account
3. The webhook will accept the event and log it for debugging

## 📊 Verifying the Webhook Works

After sending a test with your real user ID, check:

1. **RevenueCat Dashboard** → Integrations → Webhooks → Event History
   - Should show `200 OK` response
   
2. **Supabase Dashboard** → Table Editor → `revenuecat_events`
   - Should see your test event logged

3. **Supabase Dashboard** → Table Editor → `subscriptions`
   - Should see your subscription record created/updated

## 🚨 Common Issues

### Issue: "User not found" error
**Solution**: You're using a fake test user ID. Use your real user ID from the app.

### Issue: Webhook returns 401 Unauthorized
**Solution**: Check that your Authorization header is set correctly:
```
Authorization: Bearer YOUR_SUPABASE_ANON_KEY
```

### Issue: Webhook returns 500 Internal Server Error
**Solution**: Check the Supabase Edge Function logs:
- Supabase Dashboard → Edge Functions → revenuecat-webhook → Logs

## 🎉 Success Indicators

You'll know the webhook is working when:
- ✅ RevenueCat shows `200 OK` response
- ✅ Event appears in `revenuecat_events` table
- ✅ Subscription status updates in `subscriptions` table
- ✅ User's `user_type` changes to `premium` in `users` table

## 📝 Production Testing

For production testing:
1. Make a real purchase on a physical device
2. Use a real App Store/Google Play account
3. The webhook will automatically sync the subscription
4. Check the app - premium features should unlock immediately

## 🔧 Troubleshooting

If you're still having issues:

1. **Check Edge Function Logs**:
   - Supabase Dashboard → Edge Functions → revenuecat-webhook → Logs
   - Look for detailed error messages

2. **Verify Database Schema**:
   - Make sure `revenuecat_events` and `subscriptions` tables exist
   - Run migrations if needed

3. **Test with curl**:
   ```bash
   curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/revenuecat-webhook \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"event":{"app_user_id":"YOUR_REAL_USER_ID","type":"TEST_EVENT"}}'
   ```

## 📚 Additional Resources

- [RevenueCat Webhook Documentation](https://www.revenuecat.com/docs/webhooks)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- See `REVENUECAT_SETUP_GUIDE.md` for full setup instructions
