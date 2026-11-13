// Web / fallback stub — no native ads on web.
// No runtime imports from native packages.
import React from 'react';
import type { BannerAdProps } from 'react-native-google-mobile-ads';

export const BannerAd: React.FC<BannerAdProps> = () => null;

export const BannerAdSize: Record<string, string> = {
  ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER',
  BANNER: 'BANNER',
  LARGE_BANNER: 'LARGE_BANNER',
  MEDIUM_RECTANGLE: 'MEDIUM_RECTANGLE',
};

export const TestIds = {
  ADAPTIVE_BANNER: 'test-banner',
  BANNER: 'test-banner',
};

export const isBannerAdAvailable = false;
