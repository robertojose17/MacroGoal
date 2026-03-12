
# ✅ RevenueCat Migration Checklist

Use this checklist to track your migration progress.

---

## 📋 Pre-Migration

- [ ] Read `REVENUECAT_MIGRATION_GUIDE.md`
- [ ] Read `REVENUECAT_QUICK_START.md`
- [ ] Backup current code: `git commit -am "Pre-RevenueCat migration backup"`
- [ ] Note current product IDs from App Store Connect/Google Play Console
- [ ] Verify Supabase project is accessible

---

## 🎯 RevenueCat Dashboard Setup

- [ ] Create RevenueCat account at https://app.revenuecat.com
- [ ] Create new project
- [ ] Add iOS app (Bundle ID: `com.robertojose17.macrogoal`)
- [ ] Add Android app (Package Name: `com.robertojose17.macrogoal`)
- [ ] Create products:
  - [ ] `macro_goal_premium_monthly` (or your monthly product ID)
  - [ ] `macro_goal_premium_yearly` (or your yearly product ID)
- [ ] Create entitlement: `premium_access`
- [ ] Create offering: `default`
- [ ] Link products to offering
- [ ] Link products to entitlement
- [ ] Copy iOS API key (starts with `appl_`)
- [ ] Copy Android API key (starts with `goog_`)
- [ ] Configure webhook:
  - [ ] URL: `https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/revenuecat-webhook`
  - [ ] Generate and save webhook secret
  - [ ] Select "All events"

---

## 🔧 App Configuration

- [ ] Update `app.json` with RevenueCat API keys
- [ ] Verify API keys don't contain "YOUR" placeholder
- [ ] Rebuild native code:
  - [ ] iOS: `npx expo prebuild -p ios && cd ios && pod install && cd ..`
  - [ ] Android: `npx expo prebuild -p android`

---

## 🗄️ Database Migration

- [ ] Verify migration applied: `subscriptions` table has RevenueCat fields
- [ ] Verify `revenuecat_events` table exists
- [ ] Check indexes created

---

## 🔗 Supabase Configuration

- [ ] Add `REVENUECAT_WEBHOOK_SECRET` to Supabase Edge Function secrets
- [ ] Deploy webhook function: `supabase functions deploy revenuecat-webhook`
- [ ] Verify function deployed successfully
- [ ] Test webhook in RevenueCat dashboard (send test event)
- [ ] Check Supabase logs: `supabase functions logs revenuecat-webhook`

---

## 🧪 Sandbox Testing (iOS)

- [ ] Create Sandbox Tester in App Store Connect
- [ ] Sign out of App Store on test device
- [ ] Run app: `npm run ios`
- [ ] Navigate to subscription screen
- [ ] Verify offerings load
- [ ] Attempt monthly purchase
- [ ] Sign in with Sandbox Tester
- [ ] Verify purchase completes
- [ ] Verify success modal appears
- [ ] Verify premium features unlock
- [ ] Check RevenueCat dashboard → Customers
- [ ] Check Supabase → subscriptions table
- [ ] Check users.user_type = 'premium'
- [ ] Test restore purchases
- [ ] Test yearly purchase
- [ ] Test purchase cancellation

---

## 🧪 Sandbox Testing (Android)

- [ ] Add test account in Google Play Console
- [ ] Run app: `npm run android`
- [ ] Navigate to subscription screen
- [ ] Verify offerings load
- [ ] Attempt monthly purchase
- [ ] Verify purchase completes
- [ ] Verify success modal appears
- [ ] Verify premium features unlock
- [ ] Check RevenueCat dashboard → Customers
- [ ] Check Supabase → subscriptions table
- [ ] Check users.user_type = 'premium'
- [ ] Test restore purchases
- [ ] Test yearly purchase

---

## 🔍 Integration Testing

- [ ] Test `usePremium` hook returns correct status
- [ ] Test premium feature gates work
- [ ] Test non-premium users see upgrade prompts
- [ ] Test offline purchase (queued)
- [ ] Test network error during purchase
- [ ] Test "already subscribed" scenario
- [ ] Test plan change (upgrade/downgrade)
- [ ] Test subscription expiration
- [ ] Test subscription renewal
- [ ] Test subscription cancellation
- [ ] Test billing issue handling
- [ ] Test grace period

---

## 📊 Monitoring Setup

- [ ] Set up RevenueCat dashboard alerts
- [ ] Set up Supabase log monitoring
- [ ] Create Slack/email alerts for webhook failures
- [ ] Document monitoring procedures

---

## 🚀 Production Deployment

- [ ] Verify all sandbox tests pass
- [ ] Update app version in `app.json`
- [ ] Build production iOS app
- [ ] Build production Android app
- [ ] Submit to App Store Review
- [ ] Submit to Google Play Review
- [ ] Wait for approval
- [ ] Release to production

---

## ✅ Post-Launch Verification

- [ ] Monitor first real purchase (iOS)
- [ ] Monitor first real purchase (Android)
- [ ] Verify webhook receives production events
- [ ] Verify database updates correctly
- [ ] Verify revenue tracking accurate
- [ ] Check for errors in production logs
- [ ] Verify restore purchases works in production
- [ ] Monitor RevenueCat dashboard for 24 hours
- [ ] Check customer support tickets for issues

---

## 🧹 Cleanup (After 1 Week in Production)

- [ ] Remove `expo-in-app-purchases` dependency
- [ ] Delete `supabase/functions/verify-apple-receipt/index.ts`
- [ ] Delete `app/iap-diagnostics.tsx` (if exists)
- [ ] Remove old Stripe fields from users table (optional)
- [ ] Update documentation
- [ ] Archive old code: `git tag pre-revenuecat-migration`

---

## 📝 Documentation

- [ ] Update README with RevenueCat setup instructions
- [ ] Document product IDs
- [ ] Document entitlement IDs
- [ ] Document webhook URL
- [ ] Document testing procedures
- [ ] Document rollback procedures

---

## 🎓 Team Training

- [ ] Share migration guide with team
- [ ] Train team on RevenueCat dashboard
- [ ] Train team on debugging subscription issues
- [ ] Train team on handling customer support tickets
- [ ] Document common issues and solutions

---

## 🔙 Rollback Plan (If Needed)

- [ ] Restore old code: `git checkout HEAD~1 app/subscription.tsx hooks/usePremium.ts app/_layout.tsx`
- [ ] Reinstall old dependencies: `npm uninstall react-native-purchases && npm install expo-in-app-purchases@^14.5.0`
- [ ] Rebuild native code: `npx expo prebuild`
- [ ] Test old flow works
- [ ] Deploy to production

---

## 📊 Success Metrics

Track these metrics to measure migration success:

- [ ] Purchase success rate (target: >95%)
- [ ] Restore success rate (target: >98%)
- [ ] Webhook delivery rate (target: >99%)
- [ ] Average purchase time (target: <30 seconds)
- [ ] Customer support tickets (target: <5% increase)
- [ ] Revenue accuracy (target: 100%)

---

## 🎉 Migration Complete!

- [ ] All checklist items completed
- [ ] Production stable for 1 week
- [ ] No critical issues reported
- [ ] Team trained
- [ ] Documentation updated
- [ ] Celebrate! 🎊

---

**Migration Status:** ⏳ In Progress  
**Started:** ___________  
**Completed:** ___________  
**Migrated By:** ___________

---

## 📞 Support Contacts

- **RevenueCat Support:** support@revenuecat.com
- **RevenueCat Docs:** https://docs.revenuecat.com
- **Supabase Support:** https://supabase.com/support
- **Team Lead:** ___________
- **DevOps:** ___________

---

**Last Updated:** 2024-01-XX  
**Version:** 1.0
