
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AdBannerFooter } from '@/components/AdBannerFooter';
import QuickAddSheet from '@/components/QuickAddSheet';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [sheetVisible, setSheetVisible] = useState(false);

  const tabBarInactiveTintColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const tabBarBackgroundColor = isDark ? colors.cardDark : colors.card;
  const tabBarBorderColor = isDark ? colors.borderDark : colors.border;

  const quickAddBtnBg = '#5B9AA8';
  const quickAddPlusColor = '#FFFFFF';

  const handleQuickAddPress = () => {
    console.log('[TabLayout iOS] Quick Add "+" button pressed');
    setSheetVisible(true);
  };

  const handleSheetClose = () => {
    console.log('[TabLayout iOS] QuickAddSheet closed');
    setSheetVisible(false);
  };

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
          title: '',
          tabBarButton: () => (
            <TouchableOpacity
              style={styles.quickAddWrapper}
              onPress={handleQuickAddPress}
              activeOpacity={0.85}
            >
              <View style={[styles.quickAddBtn, { backgroundColor: quickAddBtnBg }]}>
                <Text style={[styles.quickAddPlus, { color: quickAddPlusColor }]}>+</Text>
              </View>
            </TouchableOpacity>
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
    </Tabs>
  );

  return (
    <View style={{ flex: 1 }}>
      {tabs}
      <AdBannerFooter />
      <QuickAddSheet visible={sheetVisible} onClose={handleSheetClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  quickAddWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  quickAddPlus: {
    fontSize: 28,
    fontWeight: '200',
    lineHeight: 32,
    marginTop: -1,
  },
});
