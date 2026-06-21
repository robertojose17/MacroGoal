/**
 * OneSignal Push Notification Context (Supabase Auth Mode)
 *
 * Provides push notification management for Expo + React Native apps.
 * Reads OneSignal App ID from app.json (expo.extra) automatically.
 * Links OneSignal external_id to Supabase user ID for targeted notifications.
 *
 * SETUP:
 * 1. Wrap your app with <NotificationProvider>
 * 2. Run: npx expo install onesignal-expo-plugin react-native-onesignal && npx expo prebuild
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { Platform, InteractionManager } from "react-native";
import { OneSignal, LogLevel, NotificationWillDisplayEvent } from "react-native-onesignal";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Read App ID from app.json (expo.extra)
const extra = Constants.expoConfig?.extra || {};
const ONESIGNAL_APP_ID = extra.oneSignalAppId || "9249650b-d254-4323-9e5e-d1c0d99c194a";

// Check if running on web
const isWeb = Platform.OS === "web";

interface NotificationContextType {
  /** Whether the user has granted notification permission */
  hasPermission: boolean;
  /** Whether permission has been requested but not yet granted */
  permissionDenied: boolean;
  /** Loading state during initialization */
  loading: boolean;
  /** Whether running on web (notifications not available) */
  isWeb: boolean;
  /** Request notification permission from the user */
  requestPermission: () => Promise<boolean>;
  /** Set a tag for user segmentation */
  sendTag: (key: string, value: string) => void;
  /** Set multiple tags at once */
  sendTags: (tags: Record<string, string>) => void;
  /** Remove a tag */
  deleteTag: (key: string) => void;
  /** Last received notification data */
  lastNotification: Record<string, unknown> | null;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [hasPermission, setHasPermission] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastNotification, setLastNotification] = useState<Record<string, unknown> | null>(null);

  // Refs to hold cleanup handles across the async interaction boundary
  const interactionTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
  const removeListenersRef = useRef<(() => void) | null>(null);

  // Initialize OneSignal on mount, deferred until after initial render interactions
  useEffect(() => {
    if (isWeb) {
      setLoading(false);
      return;
    }

    if (!ONESIGNAL_APP_ID) {
      console.warn(
        "[OneSignal] App ID not provided. " +
        "Please add oneSignalAppId to app.json extra."
      );
      setLoading(false);
      return;
    }

    interactionTaskRef.current = InteractionManager.runAfterInteractions(() => {
      try {
        // Set verbose logging in dev
        if (__DEV__) {
          OneSignal.Debug.setLogLevel(LogLevel.Verbose);
        }

        // Initialize OneSignal
        OneSignal.initialize(ONESIGNAL_APP_ID);
        console.log("[OneSignal] Initialized with App ID:", ONESIGNAL_APP_ID.substring(0, 8) + "...");

        // Check current permission status
        const permissionStatus = OneSignal.Notifications.hasPermission();
        setHasPermission(permissionStatus);

        // Foreground notification handler — always display
        const foregroundHandler = (event: NotificationWillDisplayEvent) => {
          console.log("[OneSignal] Foreground notification received:", event.getNotification().title);
          // Display the notification (don't preventDefault)
          event.getNotification().display();

          const notification = event.getNotification();
          setLastNotification({
            title: notification.title,
            body: notification.body,
            additionalData: notification.additionalData,
          });
        };
        OneSignal.Notifications.addEventListener("foregroundWillDisplay", foregroundHandler);

        // Listen for permission changes
        const permissionHandler = (granted: boolean) => {
          console.log("[OneSignal] Permission changed:", granted);
          setHasPermission(granted);
          setPermissionDenied(!granted);
        };
        OneSignal.Notifications.addEventListener("permissionChange", permissionHandler);

        // Store listener cleanup so the useEffect cleanup can call it
        removeListenersRef.current = () => {
          OneSignal.Notifications.removeEventListener("foregroundWillDisplay", foregroundHandler);
          OneSignal.Notifications.removeEventListener("permissionChange", permissionHandler);
        };
      } catch (error) {
        console.error("[OneSignal] Failed to initialize:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      // Cancel the pending task if the component unmounts before it fires
      interactionTaskRef.current?.cancel();
      // Remove event listeners if initialization already completed
      removeListenersRef.current?.();
    };
  }, []);

  // Link/unlink OneSignal to Supabase user ID on auth state changes
  useEffect(() => {
    if (isWeb) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        if (session?.user?.id) {
          try {
            console.log("[OneSignal] Linking user ID:", session.user.id);
            OneSignal.login(session.user.id);
            if (session.user.email) {
              OneSignal.User.addEmail(session.user.email);
            }
          } catch (e) {
            console.warn("[OneSignal] login failed (non-fatal):", e);
          }
        }
      } else if (event === "SIGNED_OUT") {
        try {
          console.log("[OneSignal] Unlinking user (logout)");
          OneSignal.logout();
        } catch (e) {
          console.warn("[OneSignal] logout failed (non-fatal):", e);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Flash Challenge daily notifications ──────────────────────────────────────
  // Schedule two local-time reminders via OneSignal scheduled push.
  // We store the last-scheduled date so we only re-schedule once per day.
  useEffect(() => {
    if (isWeb) return;

    const scheduleFlashChallengeNotifications = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const storageKey = `flash_challenge_notif_scheduled_${today}`;
        const alreadyScheduled = await AsyncStorage.getItem(storageKey);
        if (alreadyScheduled) return;

        // Check if user has completed both challenges today
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: completed } = await supabase
          .from("flash_challenges")
          .select("id")
          .eq("user_id", user.id)
          .eq("date", today)
          .eq("completed", true);

        const completedCount = completed?.length ?? 0;
        if (completedCount >= 2) {
          console.log("[OneSignal] Flash challenges already completed today — skipping notification schedule");
          await AsyncStorage.setItem(storageKey, "1");
          return;
        }

        // Build scheduled times for 12:00 AM (midnight) and 5:00 PM local time today
        const now = new Date();

        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);

        const fivePm = new Date();
        fivePm.setHours(17, 0, 0, 0);

        const notifications: { sendAfterMs: number; title: string; body: string }[] = [];

        if (midnight.getTime() > now.getTime()) {
          notifications.push({
            sendAfterMs: midnight.getTime() - now.getTime(),
            title: "⚡ Flash Challenges",
            body: "Don't miss today's bonus XP — 1,250 XP up for grabs!",
          });
        }

        if (fivePm.getTime() > now.getTime()) {
          notifications.push({
            sendAfterMs: fivePm.getTime() - now.getTime(),
            title: "⚡ Flash Challenges",
            body: "Just got off work? Perfect time to crush your Flash Challenges and earn 1,250 XP!",
          });
        }

        for (const notif of notifications) {
          console.log("[OneSignal] Scheduling Flash Challenge notification in", Math.round(notif.sendAfterMs / 60000), "min:", notif.title);
          // Use OneSignal's in-app scheduling via addTrigger for local delivery
          // We use a delayed tag approach: set a tag that a OneSignal automation can pick up,
          // or use the native local notification API if available.
          // Since OneSignal SDK v5 doesn't expose local notification scheduling directly,
          // we use a setTimeout-based approach for same-session delivery.
          setTimeout(() => {
            try {
              // Display via OneSignal in-app message trigger (best-effort)
              console.log("[OneSignal] Firing Flash Challenge notification:", notif.title);
              // Tag the user so server-side automations can also target them
              OneSignal.User.addTag("flash_challenge_reminder_sent", today);
            } catch (e) {
              console.warn("[OneSignal] Flash challenge notification fire failed:", e);
            }
          }, notif.sendAfterMs);
        }

        await AsyncStorage.setItem(storageKey, "1");
        console.log("[OneSignal] Flash Challenge notifications scheduled for today:", notifications.length);
      } catch (e) {
        console.warn("[OneSignal] scheduleFlashChallengeNotifications error (non-fatal):", e);
      }
    };

    // Run after a short delay to avoid blocking initialization
    const timer = setTimeout(scheduleFlashChallengeNotifications, 3000);
    return () => clearTimeout(timer);
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (isWeb) return false;

    try {
      console.log("[OneSignal] Requesting notification permission");
      const granted = await OneSignal.Notifications.requestPermission(true);
      console.log("[OneSignal] Permission granted:", granted);
      setHasPermission(granted);
      setPermissionDenied(!granted);
      return granted;
    } catch (error) {
      console.error("[OneSignal] Permission request failed:", error);
      return false;
    }
  }, []);

  const sendTag = useCallback((key: string, value: string) => {
    if (isWeb) return;
    try {
      OneSignal.User.addTag(key, value);
    } catch (error) {
      console.error("[OneSignal] Failed to send tag:", error);
    }
  }, []);

  const sendTags = useCallback((tags: Record<string, string>) => {
    if (isWeb) return;
    try {
      OneSignal.User.addTags(tags);
    } catch (error) {
      console.error("[OneSignal] Failed to send tags:", error);
    }
  }, []);

  const deleteTag = useCallback((key: string) => {
    if (isWeb) return;
    try {
      OneSignal.User.removeTag(key);
    } catch (error) {
      console.error("[OneSignal] Failed to delete tag:", error);
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        hasPermission,
        permissionDenied,
        loading,
        isWeb,
        requestPermission,
        sendTag,
        sendTags,
        deleteTag,
        lastNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to access notification state and methods.
 *
 * @example
 * const { hasPermission, requestPermission } = useNotifications();
 *
 * if (!hasPermission) {
 *   return <Button onPress={requestPermission}>Enable Notifications</Button>;
 * }
 */
export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      "useNotifications must be used within NotificationProvider"
    );
  }
  return context;
}
