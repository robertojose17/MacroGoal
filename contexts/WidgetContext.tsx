import * as React from "react";
import { createContext, useCallback, useContext } from "react";
import { Platform } from "react-native";
import * as AppleTargets from "@bacons/apple-targets";

// Conditionally use ExtensionStorage only on iOS
const ExtensionStorage = Platform.OS === 'ios' ? AppleTargets.ExtensionStorage : null;

type WidgetContextType = {
  refreshWidget: () => void;
};

const WidgetContext = createContext<WidgetContextType | null>(null);

export function WidgetProvider({ children }: { children: React.ReactNode }) {
  // Update widget state whenever what we want to show changes
  React.useEffect(() => {
    if (Platform.OS === 'ios' && ExtensionStorage) {
      try {
        // Refresh widget
        ExtensionStorage.reloadWidget();
      } catch (error) {
        console.log('[WidgetContext] Error reloading widget:', error);
      }
    }
  }, []);

  const refreshWidget = useCallback(() => {
    if (Platform.OS === 'ios' && ExtensionStorage) {
      try {
        ExtensionStorage.reloadWidget();
      } catch (error) {
        console.log('[WidgetContext] Error refreshing widget:', error);
      }
    }
  }, []);

  return (
    <WidgetContext.Provider value={{ refreshWidget }}>
      {children}
    </WidgetContext.Provider>
  );
}

export const useWidget = () => {
  const context = useContext(WidgetContext);
  if (!context) {
    throw new Error("useWidget must be used within a WidgetProvider");
  }
  return context;
};
