"use client";

import {
  createContext, useContext, useEffect, useState, ReactNode, useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken } from "@/lib/api";
import { readStoredValue } from "@/lib/storage";
import type { User } from "@/lib/types";

type Theme = "dark" | "light";

interface AppContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isFounder: boolean;
  theme: Theme;
  toggleTheme: () => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>("light");
  const [themeRestored, setThemeRestored] = useState(false);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    try {
      const u = await api.me();
      setUser(u);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const saved = readStoredValue("espada_theme", "nevodevs_theme") as Theme | null;
    if (saved) setTheme(saved);
    setThemeRestored(true);

    if (!getToken()) {
      setLoading(false);
      return;
    }
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (themeRestored) localStorage.setItem("espada_theme", theme);
  }, [theme, themeRestored]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const logout = async () => {
    try { await api.logout(); } catch {}  // mark offline on server
    clearToken();
    setUser(null);
    router.push("/login");
  };

  return (
    <AppContext.Provider
      value={{
        user,
        loading,
        isAdmin: user?.role === "admin",
        isFounder: !!user?.is_founder,
        theme,
        toggleTheme,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
