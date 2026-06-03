/**
 * NotificationContext — default (web-safe) stub.
 *
 * The real OneSignal implementation lives in NotificationContext.native.tsx,
 * which Metro loads on iOS/Android. This file is the fallback for web where
 * react-native-onesignal would crash at import time.
 */

import React, { createContext, useContext, ReactNode } from "react";

interface NotificationContextType {
  hasPermission: boolean;
  permissionDenied: boolean;
  loading: boolean;
  isWeb: boolean;
  requestPermission: () => Promise<boolean>;
  sendTag: (key: string, value: string) => void;
  sendTags: (tags: Record<string, string>) => void;
  deleteTag: (key: string) => void;
  lastNotification: Record<string, unknown> | null;
}

const NotificationContext = createContext<NotificationContextType>({
  hasPermission: false,
  permissionDenied: false,
  loading: false,
  isWeb: true,
  requestPermission: async () => false,
  sendTag: () => {},
  sendTags: () => {},
  deleteTag: () => {},
  lastNotification: null,
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  return (
    <NotificationContext.Provider
      value={{
        hasPermission: false,
        permissionDenied: false,
        loading: false,
        isWeb: true,
        requestPermission: async () => false,
        sendTag: () => {},
        sendTags: () => {},
        deleteTag: () => {},
        lastNotification: null,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
