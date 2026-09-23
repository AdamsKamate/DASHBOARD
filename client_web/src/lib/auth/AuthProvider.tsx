"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setUnauthorizedListener } from "../api";
import type { Credentials, CurrentUser } from "../types";

// Authentication state, shared by the whole application.
export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: CurrentUser | null;
  status: AuthStatus;
  login: (credentials: Credentials) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const markAnonymous = useCallback(() => {
    setUser(null);
    setStatus("anonymous");
  }, []);

  const markAuthenticated = useCallback((currentUser: CurrentUser) => {
    setUser(currentUser);
    setStatus("authenticated");
  }, []);

  /*
   Asks the server who is logged in.
   */
  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await api.auth.me();
      markAuthenticated(currentUser);
    } catch {
      // 401 (no session) and network errors both mean "not logged in" for
      // the interface. The guards will redirect to the login page.
      markAnonymous();
    }
  }, [markAuthenticated, markAnonymous]);

  const login = useCallback(
    async (credentials: Credentials) => {
      // Errors (401, 403) are not caught here: the login page needs them to
      // display "wrong password" or "confirm your email".
      const response = await api.auth.login(credentials);
      markAuthenticated(response.user);
      return response.user;
    },
    [markAuthenticated]
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      // Even if the request fails, the interface must stop showing the user
      // as logged in.
      markAnonymous();
    }
  }, [markAnonymous]);

  // On first load: find out whether a session already exists.
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Session ending while the user works (token expired, account deleted):
  // api.ts calls this listener on any unexpected 401.
  useEffect(() => {
    setUnauthorizedListener(markAnonymous);
    return () => setUnauthorizedListener(null);
  }, [markAnonymous]);

  const contextValue = useMemo(
    () => ({ user, status, login, logout, refreshUser }),
    [user, status, login, logout, refreshUser]
  );
  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

/* Access to the authentication state from any component. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
