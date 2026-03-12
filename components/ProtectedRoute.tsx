
/**
 * Protected Route Component Template
 *
 * A wrapper component that ensures a user is authenticated before
 * allowing access to a screen. Redirects to login if not authenticated.
 *
 * Note: This app uses Supabase auth directly in _layout.tsx for routing.
 * This component is kept as a template for future use if needed.
 *
 * Usage:
 * ```tsx
 * <ProtectedRoute>
 *   <ProfileScreen />
 * </ProtectedRoute>
 * ```
 */

import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase/client";

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
  loadingComponent?: React.ReactNode;
}

export function ProtectedRoute({
  children,
  redirectTo = "/auth/welcome",
  loadingComponent,
}: ProtectedRouteProps) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const checkUser = React.useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      
      if (!session?.user) {
        router.replace(redirectTo as any);
      }
    } catch (error) {
      console.error('[ProtectedRoute] Error checking user:', error);
    } finally {
      setLoading(false);
    }
  }, [redirectTo, router]);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  if (loading) {
    return loadingComponent || (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
});
