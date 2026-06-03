/**
 * NotificationBell Component
 *
 * A reusable notification bell icon that shows permission status.
 * Prompts user to enable notifications if not yet granted.
 *
 * Usage:
 *   import { NotificationBell } from "@/components/NotificationBell";
 *
 *   // In header
 *   <NotificationBell />
 *
 *   // Compact for tight spaces
 *   <NotificationBell variant="compact" />
 */

import React from "react";
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { useNotifications } from "@/contexts/NotificationContext";

interface NotificationBellProps {
  /** Button style variant */
  variant?: "default" | "compact";
  /** Custom size for the bell icon */
  size?: number;
}

export function NotificationBell({
  variant = "default",
  size = 24,
}: NotificationBellProps) {
  const { hasPermission, permissionDenied, loading, isWeb, requestPermission } =
    useNotifications();

  if (loading || isWeb) return null;

  const handlePress = async () => {
    if (hasPermission) {
      // Already has permission - could navigate to notification center
      return;
    }

    if (permissionDenied) {
      // Permission was denied - direct to settings
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

    // Request permission
    await requestPermission();
  };

  if (variant === "compact") {
    return (
      <TouchableOpacity onPress={handlePress} style={styles.compactButton}>
        <Text style={[styles.bellIcon, { fontSize: size * 0.75 }]}>
          {hasPermission ? "🔔" : "🔕"}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={handlePress} style={styles.button}>
      <View style={styles.bellContainer}>
        <Text style={[styles.bellIcon, { fontSize: size }]}>
          {hasPermission ? "🔔" : "🔕"}
        </Text>
        {!hasPermission && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>!</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 8,
  },
  compactButton: {
    padding: 4,
  },
  bellContainer: {
    position: "relative",
  },
  bellIcon: {
    fontSize: 24,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#FF3B30",
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
});

export default NotificationBell;
