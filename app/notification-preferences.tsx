/**
 * Notification Preferences Screen
 *
 * Shows notification permission status and allows users to manage
 * their notification preferences using OneSignal tags.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  Linking,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useNotifications } from "@/contexts/NotificationContext";

// Notification categories - customize these for your app
const NOTIFICATION_CATEGORIES = [
  {
    key: "updates",
    label: "App Updates",
    description: "New features and improvements",
    defaultEnabled: true,
  },
  {
    key: "promotions",
    label: "Promotions",
    description: "Special offers and discounts",
    defaultEnabled: true,
  },
  {
    key: "reminders",
    label: "Reminders",
    description: "Activity reminders and tips",
    defaultEnabled: true,
  },
];

export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const { hasPermission, permissionDenied, isWeb, requestPermission, sendTag, deleteTag } =
    useNotifications();

  // Track category toggles locally
  const [categories, setCategories] = useState<Record<string, boolean>>(
    Object.fromEntries(
      NOTIFICATION_CATEGORIES.map((cat) => [cat.key, cat.defaultEnabled])
    )
  );

  const handleEnableNotifications = async () => {
    if (permissionDenied) {
      Alert.alert(
        "Notifications Disabled",
        "To receive notifications, please enable them in your device settings.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => {
              if (Platform.OS === "ios") {
                Linking.openURL("app-settings:");
              } else {
                Linking.openSettings();
              }
            },
          },
        ]
      );
      return;
    }

    await requestPermission();
  };

  const handleCategoryToggle = (key: string, value: boolean) => {
    setCategories((prev) => ({ ...prev, [key]: value }));

    if (value) {
      sendTag(`notify_${key}`, "true");
    } else {
      deleteTag(`notify_${key}`);
    }
  };

  if (isWeb) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Notifications</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centeredContent}>
          <Text style={styles.webMessage}>
            Push notifications are available in the mobile app.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Permission Status */}
        <View style={styles.section}>
          <View style={styles.permissionCard}>
            <View style={styles.permissionHeader}>
              <Text style={styles.permissionIcon}>
                {hasPermission ? "🔔" : "🔕"}
              </Text>
              <View style={styles.permissionTextContainer}>
                <Text style={styles.permissionTitle}>
                  {hasPermission
                    ? "Notifications Enabled"
                    : "Notifications Disabled"}
                </Text>
                <Text style={styles.permissionDescription}>
                  {hasPermission
                    ? "You'll receive push notifications"
                    : "Enable notifications to stay updated"}
                </Text>
              </View>
            </View>
            {!hasPermission && (
              <TouchableOpacity
                style={styles.enableButton}
                onPress={handleEnableNotifications}
              >
                <Text style={styles.enableButtonText}>Enable Notifications</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Notification Categories */}
        {hasPermission && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notification Types</Text>
            {NOTIFICATION_CATEGORIES.map((category) => (
              <View key={category.key} style={styles.categoryRow}>
                <View style={styles.categoryText}>
                  <Text style={styles.categoryLabel}>{category.label}</Text>
                  <Text style={styles.categoryDescription}>
                    {category.description}
                  </Text>
                </View>
                <Switch
                  value={categories[category.key]}
                  onValueChange={(value) =>
                    handleCategoryToggle(category.key, value)
                  }
                  trackColor={{ false: "#E5E5EA", true: "#34C759" }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  backButton: {
    fontSize: 16,
    color: "#007AFF",
    width: 60,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  content: {
    flex: 1,
  },
  centeredContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  webMessage: {
    fontSize: 16,
    color: "#8E8E93",
    textAlign: "center",
  },
  section: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  permissionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  permissionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  permissionIcon: {
    fontSize: 32,
  },
  permissionTextContainer: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  permissionDescription: {
    fontSize: 14,
    color: "#8E8E93",
    marginTop: 2,
  },
  enableButton: {
    marginTop: 16,
    backgroundColor: "#007AFF",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  enableButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  categoryText: {
    flex: 1,
    marginRight: 12,
  },
  categoryLabel: {
    fontSize: 16,
    color: "#000",
  },
  categoryDescription: {
    fontSize: 13,
    color: "#8E8E93",
    marginTop: 2,
  },
});
