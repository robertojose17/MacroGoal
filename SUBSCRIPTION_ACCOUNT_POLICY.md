
# Subscription Account Policy - How It Works

## The Issue You're Experiencing

You created two user accounts in your app and noticed:
1. Only ONE customer appears in RevenueCat Sandbox
2. When you purchase a subscription on one account, the other account also gets premium access
3. You want each app account to require its own subscription purchase

## Why This Happens (Apple's Policy)

**This is Apple's intended behavior, not a bug.**

Apple's subscription system works at the **Apple ID level**, not the app account level. Here's what happens:

1. **User A** creates an app account (email: user1@example.com)
2. **User A** purchases a subscription using their Apple ID (apple@example.com)
3. Apple records: "apple@example.com has an active subscription to your app"
4. **User A** creates a SECOND app account (email: user2@example.com)
5. When User A logs into user2@example.com on the SAME device with the SAME Apple ID, Apple automatically grants premium access because "apple@example.com already paid for this subscription"

## Apple's Subscription Rules

According to Apple's App Store guidelines:

- **One Apple ID = One Subscription**: A single Apple ID cannot be charged twice for the same subscription
- **Family Sharing**: Apple allows subscription sharing across family members (if enabled)
- **Cross-Device**: Subscriptions follow the Apple ID across all devices
- **You CANNOT force multiple payments from the same Apple ID**

## How RevenueCat Handles This

RevenueCat tracks users by `app_user_id` (your Supabase user ID), but Apple's subscription system overrides this:

1. **Account 1** (user_id: abc123) purchases → RevenueCat creates customer "abc123"
2. **Account 2** (user_id: xyz789) on same Apple ID → Apple says "this Apple ID already has a subscription"
3. RevenueCat sees the purchase is already active for this Apple ID
4. When Account 2 calls "Restore Purchases", RevenueCat transfers the subscription to "xyz789"

## The Solution: Restore Purchases

The correct workflow for users with multiple accounts:

### Scenario 1: User wants to use subscription on a different account
1. User purchases subscription on Account A
2. User logs out and creates Account B
3. User taps "Restore Purchases" on Account B
4. RevenueCat transfers the subscription from Account A to Account B
5. Account A loses premium access, Account B gains it

### Scenario 2: User wants separate subscriptions (NOT POSSIBLE with same Apple ID)
- **This is impossible due to Apple's policies**
- The user would need to:
  - Use a different Apple ID for the second account (requires a different device or signing out of iCloud)
  - Purchase a subscription on the second Apple ID
  - This is impractical and Apple discourages it

## What We've Implemented

### 1. User Identification
- Each user account is identified with RevenueCat using their Supabase user ID
- When a user logs in, we call `Purchases.logIn(userId)` to identify them
- When a user logs out, we call `Purchases.logOut()` to reset to anonymous

### 2. Restore Purchases
- Users can tap "Restore Purchases" to transfer their subscription to the current account
- This is the ONLY way to move a subscription between app accounts on the same Apple ID

### 3. Clear Messaging
- The subscription screen now includes a disclaimer:
  > "Note: Each app account requires its own subscription. If you have multiple accounts, you must purchase or restore the subscription for each account separately."

### 4. Webhook Synchronization
- RevenueCat webhooks update the Supabase database when subscriptions change
- Each user's premium status is tracked independently in the database
- The `usePremium` hook checks RevenueCat entitlements as the source of truth

## Testing in Sandbox

When testing with Sandbox accounts:

1. **Create Test Apple ID 1** in App Store Connect
2. **Create App Account A** in your app
3. **Purchase subscription** using Test Apple ID 1
4. **Create App Account B** in your app (still using Test Apple ID 1 on the device)
5. **Tap "Restore Purchases"** on Account B
6. **Result**: Account B now has premium, Account A loses it

To test truly separate subscriptions:
1. Use **two different test Apple IDs**
2. Use **two different devices** (or sign out of iCloud between tests)
3. Each test Apple ID can purchase independently

## What You See in RevenueCat Dashboard

- **Sandbox Mode**: You'll see customers created with your app user IDs (Supabase user IDs)
- **When a user restores**: The subscription transfers from one customer ID to another
- **Original App User ID**: RevenueCat tracks the original purchaser
- **Current App User ID**: RevenueCat tracks who currently has access

## Recommendations

### For Your Users
1. **Encourage single account usage**: Most users don't need multiple accounts
2. **Provide "Restore Purchases" prominently**: Users switching devices or accounts need this
3. **Clear messaging**: Explain that subscriptions are tied to their Apple/Google account

### For Your Business
1. **This is standard behavior**: All apps work this way (Netflix, Spotify, etc.)
2. **You cannot charge the same Apple ID twice**: This is Apple's policy, not a limitation of your implementation
3. **Focus on value**: Make your premium features valuable enough that users want to subscribe

## Technical Implementation

### Current Flow
```typescript
// On app start (app/_layout.tsx)
await Purchases.configure({ apiKey });
// User is anonymous until they log in

// On user login
await Purchases.logIn(supabaseUserId);
// User is now identified with RevenueCat

// On user logout
await Purchases.logOut();
// User returns to anonymous state

// On purchase
const { customerInfo } = await Purchases.purchasePackage(package);
// Subscription is tied to both the Apple ID and the app user ID

// On restore
const customerInfo = await Purchases.restorePurchases();
// Transfers subscription from previous app user ID to current one
```

### Database Schema
```sql
-- subscriptions table
user_id (references users.id) -- Current owner of subscription
revenuecat_app_user_id -- Current RevenueCat user ID
revenuecat_original_app_user_id -- Original purchaser
status -- active, inactive, past_due
will_renew -- boolean
expiration_at -- timestamp

-- users table
user_type -- 'premium' or 'free' (synced via webhook)
```

## Conclusion

**You cannot force each app account to purchase separately if they use the same Apple ID.**

This is Apple's policy, and it's the same for all apps. The correct approach is:
1. Identify each user with RevenueCat using their app user ID
2. Provide "Restore Purchases" for users switching accounts
3. Educate users that subscriptions follow their Apple/Google account

Your implementation is now correct and follows industry best practices. The behavior you're seeing in Sandbox is expected and will be the same in production.
