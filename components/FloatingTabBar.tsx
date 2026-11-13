
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
  Animated,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { BlurView } from 'expo-blur';
import { useTheme } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Href } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { AD_BANNER_HEIGHT } from '@/components/AdBannerFooter';

const { width: screenWidth } = Dimensions.get('window');

export interface TabBarItem {
  name: string;
  route: Href;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
}

interface FloatingTabBarProps {
  tabs: TabBarItem[];
  isPremium: boolean;
  containerWidth?: number;
  borderRadius?: number;
  bottomMargin?: number;
}

export default function FloatingTabBar({
  tabs,
  isPremium,
  containerWidth = screenWidth / 2.5,
  borderRadius = 35,
  bottomMargin,
}: FloatingTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const animatedValue = React.useRef(new Animated.Value(0)).current;

  // Improved active tab detection with better path matching
  const activeTabIndex = React.useMemo(() => {
    let bestMatch = -1;
    let bestMatchScore = 0;

    tabs.forEach((tab, index) => {
      let score = 0;
      const routePath = typeof tab.route === 'string' ? tab.route : tab.route.pathname;

      if (pathname === routePath) {
        score = 100;
      } else if (pathname.startsWith(routePath)) {
        score = 80;
      } else if (pathname.includes(tab.name)) {
        score = 60;
      } else if (
        routePath.includes('/(tabs)/') &&
        pathname.includes(routePath.split('/(tabs)/')[1])
      ) {
        score = 40;
      }

      if (score > bestMatchScore) {
        bestMatchScore = score;
        bestMatch = index;
      }
    });

    return bestMatch >= 0 ? bestMatch : 0;
  }, [pathname, tabs]);

  React.useEffect(() => {
    if (activeTabIndex >= 0) {
      Animated.spring(animatedValue, {
        toValue: activeTabIndex,
        damping: 20,
        stiffness: 120,
        mass: 1,
        useNativeDriver: true,
      }).start();
    }
  }, [activeTabIndex, animatedValue]);

  const handleTabPress = (route: Href) => {
    console.log('[FloatingTabBar] Tab pressed:', route);
    router.push(route);
  };

  const tabWidth = (containerWidth - 8) / tabs.length;
  const tabWidthPercent = ((100 / tabs.length) - 1).toFixed(2);

  const indicatorTranslateX = animatedValue.interpolate({
    inputRange: [0, tabs.length - 1],
    outputRange: [0, tabWidth * (tabs.length - 1)],
    extrapolate: 'clamp',
  });

  const dynamicStyles = {
    blurContainer: {
      ...styles.blurContainer,
      borderWidth: 1.2,
      borderColor: theme.dark ? colors.borderDark : colors.border,
      backgroundColor: theme.dark
        ? `${colors.cardDark}F2`
        : `${colors.card}F2`,
      ...(Platform.OS === 'web' && {
        backdropFilter: 'blur(10px)',
      }),
    },
    background: {
      ...styles.background,
    },
    indicator: {
      ...styles.indicator,
      backgroundColor: theme.dark
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(43, 45, 66, 0.06)',
      width: `${tabWidthPercent}%` as `${number}%`,
    },
  };

  const resolvedBottomMargin = bottomMargin ?? 20;
  const containerBottom = isPremium
    ? insets.bottom + resolvedBottomMargin
    : AD_BANNER_HEIGHT + insets.bottom + resolvedBottomMargin;

  return (
    <View style={[styles.safeArea, { bottom: containerBottom }]}>
      <View style={[styles.container, { width: containerWidth }]}>
        <BlurView
          intensity={80}
          style={[dynamicStyles.blurContainer, { borderRadius }]}
        >
          <View style={dynamicStyles.background} />
          <Animated.View
            style={[
              dynamicStyles.indicator,
              { transform: [{ translateX: indicatorTranslateX }] },
            ]}
          />
          <View style={styles.tabsContainer}>
            {tabs.map((tab, index) => {
              const isActive = activeTabIndex === index;
              const activeColor = theme.dark ? colors.textDark : colors.primaryText;
              const inactiveColor = theme.dark ? colors.textSecondaryDark : colors.textSecondary;
              const iconColor = isActive ? activeColor : inactiveColor;
              const labelColor = isActive ? activeColor : inactiveColor;
              const labelWeight = isActive ? '600' : '500';

              return (
                <TouchableOpacity
                  key={`tab-${index}-${tab.name}`}
                  style={styles.tab}
                  onPress={() => handleTabPress(tab.route)}
                  activeOpacity={0.7}
                >
                  <View style={styles.tabContent}>
                    <IconSymbol
                      android_material_icon_name={tab.icon}
                      ios_icon_name={tab.icon}
                      size={24}
                      color={iconColor}
                    />
                    <Text
                      style={[
                        styles.tabLabel,
                        { color: labelColor, fontWeight: labelWeight },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    alignItems: 'center',
  },
  container: {
    marginHorizontal: 20,
    alignSelf: 'center',
  },
  blurContainer: {
    overflow: 'hidden',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  indicator: {
    position: 'absolute',
    top: 4,
    left: 2,
    bottom: 4,
    borderRadius: 27,
    width: `${(100 / 2) - 1}%`,
  },
  tabsContainer: {
    flexDirection: 'row',
    height: 60,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: 2,
  },
});
