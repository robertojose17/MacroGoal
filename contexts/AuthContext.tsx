
/**
 * Authentication Context Template
 *
 * Provides authentication state and methods throughout the app.
 * Supports:
 * - Email/password authentication
 * - Social auth (Google, Apple, GitHub) with popup flow for web
 * - Session management
 * - User state
 *
 * Usage:
 * 1. Update imports to match your auth-client.ts path
 * 2. Wrap your app with <AuthProvider>
 * 3. Use useAuth() hook in components to access auth methods
 * 4. Customize user type and auth methods as needed
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
// eslint-disable-next-line import/no-unresolved
import { authClient, storeWebBearerToken } from "@/lib/auth";

// User type - customize based on your backend
interface User {
  id: string;
  email: string;
  name?: string;
  image?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Opens OAuth popup for web-based social authentication
 * Returns a promise that resolves with the token
 */
function openOAuthPopup(provider: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const popupUrl = `${window.location.origin}/auth-popup?provider=${provider}`;
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      popupUrl,
      "oauth-popup",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );

    if (!popup) {
      reject(new Error("Failed to open popup. Please allow popups."));
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth-success" && event.data?.token) {
        window.removeEventListener("message", handleMessage);
        clearInterval(checkClosed);
        resolve(event.data.token);
      } else if (event.data?.type === "oauth-error") {
        window.removeEventListener("message", handleMessage);
        clearInterval(checkClosed);
        reject(new Error(event.data.error || "OAuth failed"));
      }
    };

    window.addEventListener("message", handleMessage);

    // Check if popup was closed manually
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", handleMessage);
        reject(new Error("Authentication cancelled"));
      }
    }, 500);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = React.useCallback(async () => {
    try {
      setLoading(true);
      const session = await authClient.getSession();
      if (session?.user) {
        setUser(session.user as User);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch current user on mount
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const signInWithEmail = async (email: string, password: string) => {
    try {
      await authClient.signIn.email({ email, password });
      await fetchUser();
    } catch (error) {
      console.error("Email sign in failed:", error);
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, password: string, name?: string) => {
    try {
      await authClient.signUp.email({
        email,
        password,
        name,
        callbackURL: "/profile", // TODO: Update redirect URL
      });
      await fetchUser();
    } catch (error) {
      console.error("Email sign up failed:", error);
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      if (Platform.OS === "web") {
        // Web: Use popup flow to avoid cross-origin issues
        const token = await openOAuthPopup("google");
        storeWebBearerToken(token);
        await fetchUser();
      } else {
        // Native: Use deep linking (handled by Better Auth)
        await authClient.signIn.social({
          provider: "google",
          callbackURL: "/profile", // TODO: Update redirect URL
        });
        await fetchUser();
      }
    } catch (error) {
      console.error("Google sign in failed:", error);
      throw error;
    }
  };

  const signInWithApple = async () => {
    try {
      if (Platform.OS === "web") {
        // Web: Use popup flow
        const token = await openOAuthPopup("apple");
        storeWebBearerToken(token);
        await fetchUser();
      } else {
        // Native: Use deep linking
        await authClient.signIn.social({
          provider: "apple",
          callbackURL: "/profile", // TODO: Update redirect URL
        });
        await fetchUser();
      }
    } catch (error) {
      console.error("Apple sign in failed:", error);
      throw error;
    }
  };

  const signInWithGitHub = async () => {
    try {
      if (Platform.OS === "web") {
        // Web: Use popup flow
        const token = await openOAuthPopup("github");
        storeWebBearerToken(token);
        await fetchUser();
      } else {
        // Native: Use deep linking
        await authClient.signIn.social({
          provider: "github",
          callbackURL: "/profile", // TODO: Update redirect URL
        });
        await fetchUser();
      }
    } catch (error) {
      console.error("GitHub sign in failed:", error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await authClient.signOut();
      setUser(null);
    } catch (error) {
      console.error("Sign out failed:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithApple,
        signInWithGitHub,
        signOut,
        fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 * Must be used within AuthProvider
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
