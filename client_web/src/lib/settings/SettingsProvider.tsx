"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DICTIONARIES, Language, Translations } from "./translations";

// Theme and language preferences

export type ThemePreference = "dark" | "light" | "system";

interface SettingsValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  /* What is actually painted, once "system" has been resolved */
  resolvedTheme: "dark" | "light";
  language: Language;
  setLanguage: (language: Language) => void;
  /* Translated strings for the current language */
  t: Translations;
}

const THEME_KEY = "dashboard.theme";
const LANGUAGE_KEY = "dashboard.language";
const SettingsContext = createContext<SettingsValue | null>(null);

/*
 Reads a stored preference
 */
function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const stored = window.localStorage.getItem(key);
    return allowed.includes(stored as T) ? (stored as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the preference applies to this page view only
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  /*
   Both start at their default rather than at the stored value
  */
  const [theme, setThemeState] = useState<ThemePreference>("dark");
  const [language, setLanguageState] = useState<Language>("fr");
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setThemeState(readStored(THEME_KEY, ["dark", "light", "system"] as const, "dark"));
    setLanguageState(readStored(LANGUAGE_KEY, ["fr", "en"] as const, "fr"));
  }, []);

  /*
   Follows the operating system's setting while the preference is "system",
   including when the user changes it with the page open which is what
   happens on a machine switching to dark mode at sunset
  */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const query = window.matchMedia("(prefers-color-scheme: light)");
    const update = () => setSystemTheme(query.matches ? "light" : "dark");

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const resolvedTheme: "dark" | "light" = theme === "system" ? systemTheme : theme;

  /*
   The theme is carried by an attribute on <html>, which Tailwind's dark
   variant reads
  */
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    // Tells the browser to paint its own widgets scrollbars, form controls
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  /* The language attribute matters for screen readers and for hyphenation */
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    writeStored(THEME_KEY, next);
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    writeStored(LANGUAGE_KEY, next);
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        theme,
        setTheme,
        resolvedTheme,
        language,
        setLanguage,
        t: DICTIONARIES[language],
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error("useSettings must be used inside a SettingsProvider");
  }
  return value;
}

/* Shortcut for components that only need the translated strings */
export function useTranslations(): Translations {
  return useSettings().t;
}
