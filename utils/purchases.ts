// Web / fallback stub — no native purchases on web.
// ZERO imports from native packages.

const Purchases = {
  configure: (_options: unknown): void => {},
  setLogLevel: (_level: unknown): void => {},
  getCustomerInfo: async (): Promise<{
    entitlements: { active: Record<string, unknown>; all: Record<string, unknown> };
    originalAppUserId: string;
  }> => ({
    entitlements: { active: {}, all: {} },
    originalAppUserId: '$RCAnonymousID:stub',
  }),
  logIn: async (_userId: string): Promise<{
    customerInfo: {
      entitlements: { active: Record<string, unknown>; all: Record<string, unknown> };
      originalAppUserId: string;
    };
  }> => ({
    customerInfo: {
      entitlements: { active: {}, all: {} },
      originalAppUserId: '$RCAnonymousID:stub',
    },
  }),
  logOut: async (): Promise<{
    customerInfo: {
      entitlements: { active: Record<string, unknown>; all: Record<string, unknown> };
      originalAppUserId: string;
    };
  }> => ({
    customerInfo: {
      entitlements: { active: {}, all: {} },
      originalAppUserId: '$RCAnonymousID:stub',
    },
  }),
  purchasePackage: async (_pkg: unknown): Promise<Record<string, never>> => ({}),
  restorePurchases: async (): Promise<{ entitlements: { active: Record<string, unknown> } }> => ({
    entitlements: { active: {} },
  }),
  addCustomerInfoUpdateListener: (_listener: unknown): void => {},
  removeCustomerInfoUpdateListener: (_listener: unknown): void => {},
  setEmail: async (_email: string): Promise<void> => {},
  setDisplayName: async (_name: string): Promise<void> => {},
  getOfferings: async (): Promise<{ current: null; all: Record<string, unknown> }> => ({
    current: null,
    all: {},
  }),
};

export default Purchases;

export const LOG_LEVEL = {
  DEBUG: 'DEBUG',
  VERBOSE: 'VERBOSE',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as const;

export const isPurchasesAvailable = false;

export async function loginRevenueCat(_userId: string, _apiKey: string, _opts?: { email?: string }): Promise<void> {}

export async function logoutRevenueCat(): Promise<void> {}
