// An icon for a WMO weather code

/* Where the files sit, served by Next.js from public/ */
const ICON_BASE = "/icons/weather";

/*
 Codes are grouped by family rather than listed one by one
 */
export function weatherIconFor(code: number | undefined): string {
  if (code === undefined || Number.isNaN(code)) {
    return `${ICON_BASE}/weather.svg`;
  }

  if (code === 0) return `${ICON_BASE}/clear-day.svg`;
  if (code === 1 || code === 2) return `${ICON_BASE}/cloud-sun.svg`;
  if (code === 3) return `${ICON_BASE}/cloud.svg`;
  if (code === 45 || code === 48) return `${ICON_BASE}/fog.svg`;
  if (code >= 51 && code <= 57) return `${ICON_BASE}/cloud-drizzle.svg`;
  if (code >= 61 && code <= 67) return `${ICON_BASE}/cloud-rain.svg`;
  if (code >= 71 && code <= 77) return `${ICON_BASE}/cloud-snow.svg`;
  if (code >= 80 && code <= 82) return `${ICON_BASE}/cloud-showers.svg`;
  if (code >= 85 && code <= 86) return `${ICON_BASE}/cloud-snow-rain.svg`;
  if (code >= 95 && code <= 99) return `${ICON_BASE}/cloud-lightning.svg`;
  return `${ICON_BASE}/weather.svg`;
}

/*
 The day of the week, in three letters
 */
export function shortWeekdayFor(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  const weekday = date.toLocaleDateString("fr-FR", { weekday: "short" });
  return weekday.charAt(0).toUpperCase() + weekday.slice(1).replace(".", "");
}

/* True when the date is today, so the first column can say so */
export function isToday(isoDate: string): boolean {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/* Rounded temperature, as weather apps show it: no one needs 17,9 °C */
export function roundTemperature(value: unknown): string {
  return typeof value === "number" ? `${Math.round(value)}°` : "-";
}
