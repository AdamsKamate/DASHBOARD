// The refresh rate of a widget instance (C9).

export const MIN_REFRESH_RATE_SECONDS = 30;

/* A day: beyond that, the widget is no longer a live view. */
export const MAX_REFRESH_RATE_SECONDS = 86_400;

export const DEFAULT_REFRESH_RATE_SECONDS = 300;

/* Ready-made intervals, so most users never type a number. */
export const REFRESH_PRESETS = [
  { seconds: 60, label: "1 min" },
  { seconds: 300, label: "5 min" },
  { seconds: 900, label: "15 min" },
  { seconds: 3600, label: "1 h" },
] as const;

/* Returns the error message for a raw input, or null when it is valid. */
export function validateRefreshRate(rawValue: string): string | null {
  const trimmedValue = rawValue.trim();
  if (trimmedValue === "") {
    return "Indique un intervalle de rafraîchissement.";
  }

  const seconds = Number(trimmedValue);
  if (!Number.isInteger(seconds)) {
    return "Entre un nombre entier de secondes.";
  }
  if (seconds < MIN_REFRESH_RATE_SECONDS) {
    return `Minimum ${MIN_REFRESH_RATE_SECONDS} secondes, pour ménager les quotas des services.`;
  }
  if (seconds > MAX_REFRESH_RATE_SECONDS) {
    return "Maximum 24 heures.";
  }
  return null;
}

/*
 Says the interval in words.
 */
export function describeRefreshRate(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }
  if (seconds < 60) {
    return `toutes les ${seconds} secondes`;
  }
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return minutes === 1 ? "toutes les minutes" : `toutes les ${minutes} minutes`;
  }
  if (seconds < 86_400) {
    const hours = seconds / 3600;
    // 1.5 h reads better as "1,5 heure" than as "1 heure" rounded down.
    const rounded = Number.isInteger(hours) ? hours : Math.round(hours * 10) / 10;
    return rounded === 1 ? "toutes les heures" : `toutes les ${String(rounded).replace(".", ",")} heures`;
  }
  return "une fois par jour";
}
