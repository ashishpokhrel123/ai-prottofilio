"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { adminApi } from "@/lib/api/admin";
import { AUTH_DEV_BYPASS, DEV_BYPASS_TOKEN } from "@/lib/api/config";

const TOKEN_KEY = "ap_admin_token";

export interface AdminAuth {
  token: string | null;
  isAuthenticating: boolean;
  isRestoring: boolean;
  error: string | null;
  /** True when the login screen was skipped, so the UI can say so loudly. */
  isBypassed: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

/**
 * Admin session state.
 *
 * The token lives in `sessionStorage`, not `localStorage`: an admin JWT that
 * survives closing the browser is a longer-lived credential than this console
 * needs. (Neither is XSS-proof — an httpOnly cookie would be, at the cost of
 * CSRF handling and a same-site deployment, which this split-host setup isn't.)
 */
export function useAdminAuth(): AdminAuth {
  // Seeded synchronously so the login form never flashes before the bypass
  // takes effect, and `isRestoring` starts false — there is nothing to restore.
  const [token, setToken] = useState<string | null>(
    AUTH_DEV_BYPASS ? DEV_BYPASS_TOKEN : null,
  );
  const [isRestoring, setIsRestoring] = useState(!AUTH_DEV_BYPASS);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate any stored token against the API before trusting it, so an
  // expired session shows the login form instead of a wall of 401s.
  useEffect(() => {
    // `/auth/me` reads `request.user`, which passport never populates when the
    // API's guard is bypassed — validating here would fail on a response that
    // is actually fine. Nothing to check, so skip it.
    if (AUTH_DEV_BYPASS) {
      console.warn(
        "[admin] AUTH_DEV_BYPASS is on — the console is unauthenticated. " +
          "Development only; production builds ignore this flag.",
      );
      return;
    }

    const stored = sessionStorage.getItem(TOKEN_KEY);

    if (!stored) {
      setIsRestoring(false);
      return;
    }

    let cancelled = false;

    adminApi
      .me(stored)
      .then(() => {
        if (!cancelled) setToken(stored);
      })
      .catch(() => {
        sessionStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setIsAuthenticating(true);
      setError(null);

      try {
        const { accessToken } = await adminApi.login(email, password);
        sessionStorage.setItem(TOKEN_KEY, accessToken);
        setToken(accessToken);
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong signing in.",
        );
        return false;
      } finally {
        setIsAuthenticating(false);
      }
    },
    [],
  );

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    // Signing out under the bypass would drop straight back to a login form
    // that the API is configured to ignore — a dead end. Keep the session.
    if (!AUTH_DEV_BYPASS) setToken(null);
    setError(null);
  }, []);

  return {
    token,
    isAuthenticating,
    isRestoring,
    error,
    isBypassed: AUTH_DEV_BYPASS,
    login,
    logout,
  };
}
