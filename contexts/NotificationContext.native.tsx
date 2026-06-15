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
