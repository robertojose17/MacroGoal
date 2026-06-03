/**
 * useOneSignalTags
 *
 * Syncs XP/streak/premium status to OneSignal user tags for segmentation.
 * Call this from the dashboard after XP status is loaded.
 *
 * Tags set:
 *   - current_streak: string (e.g. "7")
 *   - current_level: string (e.g. "3")
 *   - is_premium: "true" | "false"
 */

import { useEffect } from "react";
import { Platform } from "react-native";
import type { XpStatus } from "@/types/xp";

interface TagSyncParams {
  status: XpStatus | null;
  isPremium?: boolean;
}

export function useOneSignalTags({ status, isPremium = false }: TagSyncParams) {
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!status) return;

    let OneSignal: any = null;
    try {
      OneSignal = require("react-native-onesignal").OneSignal;
    } catch {
      return;
    }

    const tags: Record<string, string> = {
      current_streak: String(status.current_streak ?? 0),
      current_level: String(status.current_level ?? 1),
      is_premium: String(isPremium),
    };

    console.log("[OneSignalTags] Syncing tags:", tags);
    try {
      OneSignal.User.addTags(tags);
    } catch (e) {
      console.warn("[OneSignalTags] Failed to sync tags (non-fatal):", e);
    }
  }, [status?.current_streak, status?.current_level, isPremium]);
}
