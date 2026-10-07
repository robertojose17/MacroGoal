/**
 * useOneSignalTags
 *
 * Syncs streak/premium status to OneSignal user tags for segmentation.
 * Call this from the dashboard after streak status is loaded.
 *
 * Tags set:
 *   - current_streak: string (e.g. "7")
 *   - is_premium: "true" | "false"
 */

import { useEffect } from "react";
import { Platform } from "react-native";
import type { StreakStatus } from "@/hooks/useStreakStatus";

interface TagSyncParams {
  streak: StreakStatus | null;
  isPremium?: boolean;
}

export function useOneSignalTags({ streak, isPremium = false }: TagSyncParams) {
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!streak) return;

    let OneSignal: any = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      OneSignal = require("react-native-onesignal").OneSignal;
    } catch {
      return;
    }

    const tags: Record<string, string> = {
      current_streak: String(streak.current_streak ?? 0),
      is_premium: String(isPremium),
    };

    console.log("[OneSignalTags] Syncing tags:", tags);
    try {
      OneSignal.User.addTags(tags);
    } catch (e) {
      console.warn("[OneSignalTags] Failed to sync tags (non-fatal):", e);
    }
  }, [streak, isPremium]);
}
