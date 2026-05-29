
import React from 'react';
import { View, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AdBannerFooter } from '@/components/AdBannerFooter';
import { usePremium } from '@/hooks/usePremium';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isPremium } = usePremium();

  const tabBarInactiveTintColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const tabBarBackgroundColor = isDark ? colors.cardDark : colors.card;
  const tabBarBorderColor = isDark ? colors.borderDark : colors.border;

  const premiumHref = isPremium ? null : '/subscription';

  const tabs = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: tabBarInactiveTintColor,
        tabBarStyle: {
          backgroundColor: tabBarBackgroundColor,
          borderTopColor: tabBarBorderColor,
          paddingBottom: 15,
          height: 65,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              ios_icon_name={focused ? 'chart.bar.fill' : 'chart.bar'}
              android_material_icon_name="analytics"
              size={28}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Food',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              ios_icon_name={focused ? 'fork.knife.circle.fill' : 'fork.knife.circle'}
              android_material_icon_name="restaurant"
              size={28}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="premium"
        options={{
          title: 'Go Premium',
          href: premiumHref,
          tabBarLabel: () => (
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: '#F5A623',
                marginTop: -2,
              }}
            >
              Go Premium
            </Text>
          ),
          tabBarIcon: () => (
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: '#F5A623',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: -18,
                shadowColor: '#F5A623',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <IconSymbol
                ios_icon_name="crown.fill"
                android_material_icon_name="star"
                size={26}
                color="#FFFFFF"
              />
              <View
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: '#FF3B30',
                  borderWidth: 2,
                  borderColor: '#FFFFFF',
                }}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="check-ins"
        options={{
          title: 'Check-Ins',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              ios_icon_name={focused ? 'checkmark.circle.fill' : 'checkmark.circle'}
              android_material_icon_name="check-circle"
              size={28}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => {
            console.log('[Tab Layout] Rendering Profile tab icon, focused:', focused);
            return (
              <IconSymbol
                ios_icon_name={focused ? 'person.fill' : 'person'}
                android_material_icon_name="person"
                size={28}
                color={color}
              />
            );
          },
        }}
      />
    </Tabs>
  );

  return (
    <View style={{ flex: 1 }}>
      {tabs}
      <AdBannerFooter />
    </View>
  );
}
