"use client";

import { useEffect, useRef, useState } from "react";
import { useSettings, ThemePreference } from "@/lib/settings/SettingsProvider";
import type { Language } from "@/lib/settings/translations";

// The settings menu, in the header
const THEMES: { value: ThemePreference; labelKey: "themeDark" | "themeLight" | "themeSystem" }[] = [
  { value: "dark", labelKey: "themeDark" },
  { value: "light", labelKey: "themeLight" },
  { value: "system", labelKey: "themeSystem" },
];

const LANGUAGES: { value: Language; labelKey: "languageFrench" | "languageEnglish" }[] = [
  { value: "fr", labelKey: "languageFrench" },
  { value: "en", labelKey: "languageEnglish" },
];

export function SettingsMenu() {
  const { theme, setTheme, language, setLanguage, t } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /*
   Closes on a click outside and on Escape
  */
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        // Focus returns to the button, so the keyboard user is not dropped
        // back at the top of the page
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        // aria-expanded tells a screen reader whether the panel is open;
        // aria-haspopup announces that this button opens one
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={t.settings}
        title={t.settings}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-line
                   text-slate-400 transition hover:bg-raised hover:text-white"
      >
        {/* The cog, drawn rather than imported: one shape, no request */}
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true">
          <circle cx="12" cy="12" r="3" strokeWidth="1.8" />
          <path
            strokeWidth="1.8"
            strokeLinecap="round"
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t.settings}
          className="absolute right-0 z-40 mt-2 w-56 rounded-md border border-line
                     bg-surface p-3 shadow-lg"
        >
          <Group label={t.theme}>
            {THEMES.map((option) => (
              <Choice
                key={option.value}
                label={t[option.labelKey]}
                isSelected={theme === option.value}
                onSelect={() => setTheme(option.value)}
              />
            ))}
          </Group>

          <div className="my-3 border-t border-line" />

          <Group label={t.language}>
            {LANGUAGES.map((option) => (
              <Choice
                key={option.value}
                label={t[option.labelKey]}
                isSelected={language === option.value}
                onSelect={() => setLanguage(option.value)}
              />
            ))}
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-muted">{label}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

/*
 One option of a group
 */
function Choice({
  label,
  isSelected,
  onSelect,
}: {
  label: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={isSelected}
      onClick={onSelect}
      className={`flex items-center justify-between rounded px-2 py-1.5 text-sm transition
                  ${isSelected ? "bg-raised text-white" : "text-slate-400 hover:bg-raised hover:text-white"}`}
    >
      {label}
      {isSelected && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />}
    </button>
  );
}
