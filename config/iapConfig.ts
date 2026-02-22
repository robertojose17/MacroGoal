
/**
 * Apple In-App Purchase Configuration
 * 
 * Product IDs must match EXACTLY with App Store Connect
 * Bundle ID: com.robertojose17.macrogoal
 * Apple ID: 6755788871
 */

export const IAP_PRODUCT_IDS = {
  monthly: 'mg_monthly',
  yearly: 'mg_yearly',
} as const;

export const IAP_CONFIG = {
  bundleId: 'com.robertojose17.macrogoal',
  appleId: '6755788871',
  sku: 'EX1764179298648',
} as const;
