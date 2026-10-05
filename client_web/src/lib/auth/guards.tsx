"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { loginPathFor, safeRedirectPath } from "./redirect";

// Route guards

/*  Shown while the session is being checked, to avoid a flash of content */
function SessionCheckPlaceholder() {
  return (
    <div role="status" aria-live="polite" className="p-8 text-muted">
      Checking your session...
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const currentPath = usePathname();

  useEffect(() => {
    if (status === "anonymous") {
      router.replace(loginPathFor(currentPath));
    }
  }, [status, currentPath, router]);
  if (status !== "authenticated") {
    return <SessionCheckPlaceholder />;
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (status === "authenticated" && !isAdmin) {
      router.replace("/");
    }
  }, [status, isAdmin, router]);
  return (
    <RequireAuth>
      {isAdmin ? children : <SessionCheckPlaceholder />}
    </RequireAuth>
  );
}

/*
 For the login and registration pages
 */
export function GuestOnly({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = safeRedirectPath(searchParams.get("next"));

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(destination);
    }
  }, [status, destination, router]);
  if (status !== "anonymous") {
    return <SessionCheckPlaceholder />;
  }
  return <>{children}</>;
}
