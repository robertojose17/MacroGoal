import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isAdsAvailable } from '@/utils/mobileAds';

// Inline the constant to avoid any module-evaluation-order issues in Hermes production builds.
const AD_BANNER_HEIGHT = 60;

interface AdBannerContextValue {
  isPremium: boolean;
  adBannerHeight: number; // total bottom offset screens should use
}

const AdBannerContext = React.createContext<AdBannerContextValue>({
  isPremium: false,
  adBannerHeight: AD_BANNER_HEIGHT,
});

export function AdBannerProvider({
  isPremium,
  children,
}: {
  isPremium: boolean;
  children: React.ReactNode;
}) {
  // useSafeAreaInsets is safe here — SafeAreaProvider is always an ancestor
  // (mounted in app/_layout.tsx via expo-router's built-in SafeAreaProvider).
  const insets = useSafeAreaInsets();
  const shouldShowAd = !isPremium && Platform.OS !== 'web' && isAdsAvailable;
  const adBannerHeight = shouldShowAd ? AD_BANNER_HEIGHT + insets.bottom : 0;

  return (
    <AdBannerContext.Provider value={{ isPremium, adBannerHeight }}>
      {children}
    </AdBannerContext.Provider>
  );
}

export function useAdBanner(): AdBannerContextValue {
  return React.useContext(AdBannerContext);
}
