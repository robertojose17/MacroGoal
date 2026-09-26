/**
 * AdBannerFooter — Production-ready AdMob banner for iOS free users.
 *
 * SETUP:
 * 1. Install: npx expo install react-native-google-mobile-ads
 * 2. Add to app.json plugins: ["react-native-google-mobile-ads", { "androidAppId": "...", "iosAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX" }]
 * 3. Replace PRODUCTION_AD_UNIT_ID below with your real iOS banner unit ID.
 * 4. Run a new native build (EAS or npx expo run:ios) — this package requires native code.
 *
 * USAGE IN SCREENS:
 *
 * Option A — Context (recommended, no prop drilling):
 *   The AdBannerProvider in app/_layout.tsx handles isPremium globally.
 *   In any screen, call `const { adBannerHeight } = useAdBanner()` and apply
 *   it as contentContainerStyle paddingBottom on ScrollView/FlatList.
 *   Place <AdBannerFooter isPremium={isPremium} /> at the root layout level (already done in _layout.tsx).
 *
 * Option B — Direct prop:
 *   <AdBannerFooter isPremium={false} />
 *   Use `useAdBannerHeight(isPremium)` to get the offset for contentContainerStyle.
 *
 * SCROLLVIEW EXAMPLE:
 *   const { adBannerHeight } = useAdBanner();
 *   <ScrollView contentContainerStyle={{ paddingBottom: adBannerHeight }}>
 *     ...content...
 *   </ScrollView>
 *
 * FLATLIST EXAMPLE:
 *   const { adBannerHeight } = useAdBanner();
 *   <FlatList contentContainerStyle={{ paddingBottom: adBannerHeight }} ... />
 *
 * SCREEN WITH FIXED BOTTOM BUTTON:
 *   const { adBannerHeight } = useAdBanner();
 *   <View style={{ position: 'absolute', bottom: adBannerHeight, left: 0, right: 0 }}>
 *     <Button title="Save" />
 *   </View>
 *
 * The banner is absolutely positioned and never participates in the layout flow,
 * so screens MUST add paddingBottom equal to adBannerHeight to avoid content being hidden.
 */

import React, { useState } from 'react';
import { View, useColorScheme, Platform } from 'react-native';
import { BannerAd, BannerAdSize, TestIds, isBannerAdAvailable } from '@/utils/bannerAd';
import { usePremium } from '@/hooks/usePremium';

// Inline the constant to avoid module-evaluation-order issues in Hermes production builds.
export const AD_BANNER_HEIGHT: number = 60;

// Production Ad Unit IDs per platform:
const PRODUCTION_AD_UNIT_ID = 'ca-app-pub-5592015069000241/7688730087'; // iOS
const ANDROID_AD_UNIT_ID = 'ca-app-pub-5592015069000241/2517891620'; // Android

export function AdBannerFooter() {
  const colorScheme = useColorScheme();
  const [adLoaded, setAdLoaded] = useState(false);
  const { isPremium } = usePremium();

  if (Platform.OS === 'web' || !isBannerAdAvailable) return null;
  if (isPremium) return null;

  const adUnitId = __DEV__
    ? TestIds?.ADAPTIVE_BANNER
    : Platform.OS === 'android' ? ANDROID_AD_UNIT_ID : PRODUCTION_AD_UNIT_ID;
  const bgColor = colorScheme === 'dark' ? '#000000' : '#ffffff';

  const handleAdLoaded = () => {
    console.log('[AdBannerFooter] Ad loaded successfully');
    setAdLoaded(true);
  };

  const handleAdFailedToLoad = (error: unknown) => {
    console.log('[AdBannerFooter] Ad failed to load:', error);
    setAdLoaded(false);
  };

  return (
    <View
      style={{
        height: 80,
        backgroundColor: bgColor,
        paddingTop: 8,
        paddingBottom: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {adUnitId && (
        <BannerAd
          unitId={adUnitId}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: false }}
          onAdLoaded={handleAdLoaded}
          onAdFailedToLoad={handleAdFailedToLoad}
        />
      )}
    </View>
  );
}

export function useAdBannerHeight(): number {
  if (Platform.OS === 'web' || !isBannerAdAvailable) return 0;
  return 60;
}
