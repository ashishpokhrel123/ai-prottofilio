"use client";

import { Loader2 } from "lucide-react";
import { AdminDashboard } from "@/features/admin/components/AdminDashboard";
import { LoginForm } from "@/features/admin/components/LoginForm";
import { useAdminAuth } from "@/features/admin/useAdminAuth";

/**
 * Admin route.
 *
 * A thin auth gate over the dashboard — this file was previously a single
 * 487-line component holding auth, data fetching, and every piece of UI.
 *
 * The gate is client-side and therefore cosmetic: the real protection is the
 * API's `JwtAuthGuard` on every admin endpoint. Hiding the UI without a token
 * just avoids showing a console that could not do anything anyway.
 */
export default function AdminPage() {
  const auth = useAdminAuth();

  // Render nothing decisive while validating a stored token, so a returning
  // admin doesn't see the login form flash before being let in.
  if (auth.isRestoring) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2
          className="animate-spin text-signal"
          size={28}
          aria-label="Loading"
        />
      </main>
    );
  }

  if (!auth.token) {
    return (
      <LoginForm
        onSubmit={auth.login}
        isSubmitting={auth.isAuthenticating}
        error={auth.error}
      />
    );
  }

  return <AdminDashboard token={auth.token} onLogout={auth.logout} />;
}
