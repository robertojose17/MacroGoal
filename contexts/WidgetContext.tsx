import * as React from "react";
import { createContext, useCallback, useContext } from "react";
import { Platform } from "react-native";

const APP_GROUP = "group.com.robertojose17.macrogoal";
const WIDGET_DATA_KEY = "macro_widget_data";

// Safely require @bacons/apple-targets
let ExtensionStorage: {
  reloadWidget: () => void;
  setItem: (key: string, value: string, appGroup: string) => void;
} | null = null;
try {
  if (Platform.OS === "ios") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AppleTargets = require("@bacons/apple-targets");
    ExtensionStorage = AppleTargets?.ExtensionStorage ?? null;
  }
} catch {
  // Package not built or not available
}

export interface WidgetMacroData {
  calories: number;
  calorieGoal: number;
  protein: number;
  proteinGoal: number;
  carbs: number;
  carbsGoal: number;
  fat: number;
  fatGoal: number;
  streak: number;
  date: string;
}

type WidgetContextType = {
  refreshWidget: () => void;
  updateWidgetData: (data: WidgetMacroData) => void;
};

const WidgetContext = createContext<WidgetContextType | null>(null);

export function WidgetProvider({ children }: { children: React.ReactNode }) {
  const updateWidgetData = useCallback((data: WidgetMacroData) => {
    if (Platform.OS !== "ios" || !ExtensionStorage) return;
    try {
      console.log("[WidgetContext] Writing widget data:", data);
      const json = JSON.stringify(data);
      ExtensionStorage.setItem(WIDGET_DATA_KEY, json, APP_GROUP);
    } catch (error) {
      console.log("[WidgetContext] Error writing widget data:", error);
    }
  }, []);

  const refreshWidget = useCallback(() => {
    if (Platform.OS !== "ios" || !ExtensionStorage) return;
    try {
      console.log("[WidgetContext] Reloading widget timeline");
      ExtensionStorage.reloadWidget();
    } catch (error) {
      console.log("[WidgetContext] Error refreshing widget:", error);
    }
  }, []);

  return (
    <WidgetContext.Provider value={{ refreshWidget, updateWidgetData }}>
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
