
import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AdBannerFooter } from '@/components/AdBannerFooter';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  const tabBarInactiveTintColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const tabBarBackgroundColor = isDark ? colors.cardDark : colors.card;
  const tabBarBorderColor = isDark ? colors.borderDark : colors.border;

  return (
    <View style={{ flex: 1 }}>
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
            title: t('tabs.dashboard'),
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
            title: t('tabs.food'),
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
          name="coach"
          options={{
            title: t('tabs.coach'),
            tabBarIcon: ({ color, focused }) => (
              <IconSymbol
                ios_icon_name={focused ? 'brain.head.profile.fill' : 'brain.head.profile'}
                android_material_icon_name="psychology"
                size={28}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="check-ins"
          options={{
            title: t('tabs.checkIns'),
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
            title: t('tabs.profile'),
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
        <Tabs.Screen
          name="premium"
          options={{ href: null }}
        />
      </Tabs>
      <AdBannerFooter />
    </View>
  );
}
