
/**
 * Apple In-App Purchase Configuration for StoreKit 2
 * 
 * CRITICAL: Product IDs must match EXACTLY with App Store Connect
 * Bundle ID: com.robertojose17.macrogoal
 * Apple ID: 6755788871
 * 
 * SETUP CHECKLIST:
 * 1. ✅ Products created in App Store Connect with these exact IDs
 * 2. ✅ Products approved and "Ready to Submit"
 * 3. ✅ Testing on real device or TestFlight (NOT Simulator)
 * 4. ✅ Signed in with Sandbox Apple ID in Settings > App Store
 * 5. ✅ Bundle ID matches in app.json and App Store Connect
 */

export const IAP_PRODUCT_IDS = {
  monthly: 'Monthly_MG',
  yearly: 'Yearly_MG',
} as const;

export const IAP_CONFIG = {
  bundleId: 'com.robertojose17.macrogoal',
  appleId: '6755788871',
  sku: 'EX1764179298648',
} as const;
