import * as React from "react";
import { createContext, useCallback, useContext } from "react";
import { Platform } from "react-native";

const APP_GROUP = "group.com.robertojose17.macrogoal";
const WIDGET_DATA_KEY = "macro_widget_data";

// Safely require @bacons/apple-targets (iOS native module only)
let ExtensionStorageClass: typeof import("@bacons/apple-targets").ExtensionStorage | null = null;
try {
  if (Platform.OS === "ios") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ExtensionStorageClass = require("@bacons/apple-targets").ExtensionStorage;
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
    if (Platform.OS !== "ios" || !ExtensionStorageClass) return;
    try {
      console.log("[WidgetContext] Writing widget data:", data);
      const json = JSON.stringify(data);
      const storage = new ExtensionStorageClass(APP_GROUP);
      storage.set(WIDGET_DATA_KEY, json);
    } catch (error) {
      console.log("[WidgetContext] Error writing widget data:", error);
    }
  }, []);

  const refreshWidget = useCallback(() => {
    if (Platform.OS !== "ios" || !ExtensionStorageClass) return;
    try {
      console.log("[WidgetContext] Reloading widget timeline");
      ExtensionStorageClass.reloadWidget();
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
