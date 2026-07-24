
import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AdBannerFooter } from '@/components/AdBannerFooter';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

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
          name="coach"
          options={{
            title: 'Coach',
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
              console.log('[Tab Layout iOS] Rendering Profile tab icon, focused:', focused);
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
