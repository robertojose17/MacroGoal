import { readActiveGoal } from '@/utils/activeGoal';
import { subscribeGoalChanged } from '@/utils/goalChangeEvents';
import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { Platform, AppState, AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase/client";

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
  // not available
}

export interface WidgetMacroData {
  available: boolean;
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
  syncWidget: () => Promise<void>;
};

const WidgetContext = createContext<WidgetContextType | null>(null);

export function WidgetProvider({ children }: { children: React.ReactNode }) {
  const currentUserIdRef = useRef<string | null>(null);
  const revision = useRef(0);

  const writeToWidget = useCallback((data: WidgetMacroData) => {
    if (Platform.OS !== "ios" || !ExtensionStorageClass) return;
    try {
      console.log("[WidgetContext] Writing widget data:", JSON.stringify(data));
      const storage = new ExtensionStorageClass(APP_GROUP);
      storage.set(WIDGET_DATA_KEY, JSON.stringify(data));
      ExtensionStorageClass.reloadWidget();
    } catch (error) {
      console.warn("[WidgetContext] Error writing widget data:", error);
    }
  }, []);

  const unavailable = useCallback(() => {
    // Numeric slots are ignored by Swift when available is false; never displayed as targets.
    writeToWidget({ available: false, calories: 0, calorieGoal: 0, protein: 0, proteinGoal: 0, carbs: 0, carbsGoal: 0, fat: 0, fatGoal: 0, streak: 0, date: '' });
  }, [writeToWidget]);

  const fetchAndSync = useCallback(async (userId: string) => {
    const ticket = ++revision.current;
    try {
      const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

      // Fetch goals and today's meals in parallel
      const [goalResult, mealsResult, xpResult] = await Promise.all([
        readActiveGoal(userId),
        supabase
          .from("meals")
          .select("meal_items(calories, protein, carbs, fats)")
          .eq("user_id", userId)
          .eq("date", today),
        supabase
          .from("user_xp")
          .select("current_streak")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      console.log("[WidgetContext] fetchAndSync — goals:", "verified", "meals:", mealsResult.error ?? "ok", "xp:", xpResult.error ?? "ok");

      if (mealsResult.error) throw Error("meal_source_unavailable");
      let totalCals = 0, totalP = 0, totalC = 0, totalF = 0;
      if (mealsResult.data) {
        for (const meal of mealsResult.data as any[]) {
          for (const item of (meal.meal_items || []) as any[]) {
            totalCals += item.calories || 0;
            totalP += item.protein || 0;
            totalC += item.carbs || 0;
            totalF += item.fats || 0;
          }
        }
      }

      const goalData = goalResult;
      const xpData = xpResult.data as any;

      const widgetData: WidgetMacroData = {
        available: true,
        calories: Math.round(totalCals),
        calorieGoal: goalData.daily_calories,
        protein: Math.round(totalP),
        proteinGoal: goalData.protein_g,
        carbs: Math.round(totalC),
        carbsGoal: goalData.carbs_g,
        fat: Math.round(totalF),
        fatGoal: goalData.fats_g,
        streak: xpData?.current_streak ?? 0,
        date: today,
      };

      console.log("[WidgetContext] Fetched widget data for user", userId, ":", JSON.stringify(widgetData));
      const owner = await supabase.auth.getSession();
      if (ticket !== revision.current || currentUserIdRef.current !== userId) return;
      if (owner.error || owner.data.session?.user.id !== userId) { unavailable(); return; }
      writeToWidget(widgetData);
    } catch (err) {
      if (ticket === revision.current && currentUserIdRef.current === userId) unavailable();
      console.warn("[WidgetContext] fetchAndSync error:", err);
    }
  }, [writeToWidget, unavailable]);

  const syncWidget = useCallback(async () => {
    const userId = currentUserIdRef.current;
    console.log("[WidgetContext] syncWidget called, userId:", userId ?? "none");
    if (!userId) { unavailable(); return; }
    await fetchAndSync(userId);
  }, [fetchAndSync, unavailable]);

  // On mount: try to restore session directly from AsyncStorage (no timeout)
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    unavailable();
    const ticket = revision.current;
    supabase.auth.getSession().then(({ data }) => {
      if (ticket !== revision.current) return;
      const userId = data.session?.user?.id ?? null;
      console.log("[WidgetContext] getSession on mount, userId:", userId ?? "none");
      if (userId) {
        currentUserIdRef.current = userId;
        fetchAndSync(userId);
      }
    }).catch((e) => {
      console.warn("[WidgetContext] getSession error:", e);
    });
  }, [fetchAndSync, unavailable]);

  // Listen for auth state — sync widget whenever a user session is available
  useEffect(() => {
    if (Platform.OS !== "ios") return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const userId = session?.user?.id ?? null;
      console.log("[WidgetContext] Auth state change:", event, "userId:", userId ?? "none");
      if (currentUserIdRef.current === userId) return;
      revision.current++;
      currentUserIdRef.current = userId;
      unavailable();
      if (userId && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
        fetchAndSync(userId);
      }
    });

    const unsubscribe = subscribeGoalChanged(owner => {
      if (owner && owner !== currentUserIdRef.current) return;
      revision.current++; unavailable();
      if (currentUserIdRef.current) void fetchAndSync(currentUserIdRef.current);
    });
    const invalidate = () => { revision.current++; };
    return () => { invalidate(); subscription.unsubscribe(); unsubscribe(); };
  }, [fetchAndSync, unavailable]);

  // Re-sync when app comes to foreground
  useEffect(() => {
    if (Platform.OS !== "ios") return;

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "active" && currentUserIdRef.current) {
        console.log("[WidgetContext] App foregrounded — re-syncing widget");
        fetchAndSync(currentUserIdRef.current);
      }
    };

    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [fetchAndSync]);

  return (
    <WidgetContext.Provider value={{ syncWidget }}>
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
