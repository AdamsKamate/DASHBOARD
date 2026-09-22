import type { AboutParam, Position, Role, WidgetParams } from "../types";

// Mock database.

export interface MockUser {
  id: string;
  email: string;
  password: string; // plaintext on purpose: this is fake data, never shipped
  role: Role;
  isVerified: boolean;
  verificationToken: string | null;
  createdAt: string;
}

export interface MockWidget {
  id: string;
  userId: string;
  widgetTypeId: string;
  params: WidgetParams;
  refreshRate: number;
  position: Position;
  dataCalls: number; // used to simulate the "pending" then "ok" lifecycle
}

export interface MockWidgetType {
  id: string;
  service: string;
  description: string;
  params: AboutParam[];
}

export interface MockState {
  users: MockUser[];
  widgets: MockWidget[];
  subscriptions: { userId: string; service: string }[];
  sessionUserId: string | null; // stands in for the httpOnly cookie
}

/* Services from docs/Services.md. */
export const SERVICES: { name: string; requiresAuth: boolean }[] = [
  { name: "weather", requiresAuth: false },
  { name: "rss", requiresAuth: false },
  { name: "github", requiresAuth: true },
  { name: "google", requiresAuth: true },
];

/** The 8 widgets from docs/Services.md, every one with at least one param. */
export const WIDGET_TYPES: MockWidgetType[] = [
  {
    id: "city_temperature",
    service: "weather",
    description: "Display the current temperature for a city",
    params: [{ name: "city", type: "string" }],
  },
  {
    id: "weather_forecast",
    service: "weather",
    description: "Display the forecast for a city over N days",
    params: [
      { name: "city", type: "string" },
      { name: "days", type: "integer" },
    ],
  },
  {
    id: "article_list",
    service: "rss",
    description: "Display the latest articles of an RSS feed",
    params: [
      { name: "link", type: "string" },
      { name: "number", type: "integer" },
    ],
  },
  {
    id: "feed_summary",
    service: "rss",
    description: "Display the summary of the latest article of a feed",
    params: [{ name: "link", type: "string" }],
  },
  {
    id: "github_commits",
    service: "github",
    description: "List the latest commits of a repository",
    params: [
      { name: "repo", type: "string" },
      { name: "count", type: "integer" },
    ],
  },
  {
    id: "github_issues",
    service: "github",
    description: "List the issues of a repository by state",
    params: [
      { name: "repo", type: "string" },
      { name: "state", type: "string" },
    ],
  },
  {
    id: "google_calendar_next",
    service: "google",
    description: "Display the next N calendar events",
    params: [{ name: "count", type: "integer" }],
  },
  {
    id: "google_gmail_unread",
    service: "google",
    description: "Display the latest N unread messages of a label",
    params: [
      { name: "label", type: "string" },
      { name: "count", type: "integer" },
    ],
  },
];

/*
 Demo accounts, all with the password "password123".
 Each one exercises a different branch of the login flow.
 */
function seed(): MockState {
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: "u-demo",
        email: "demo@dashboard.dev",
        password: "password123",
        role: "user",
        isVerified: true,
        verificationToken: null,
        createdAt: now,
      },
      {
        id: "u-admin",
        email: "admin@dashboard.dev",
        password: "password123",
        role: "admin",
        isVerified: true,
        verificationToken: null,
        createdAt: now,
      },
      {
        id: "u-pending",
        email: "pending@dashboard.dev",
        password: "password123",
        role: "user",
        isVerified: false,
        verificationToken: "pending-demo-token",
        createdAt: now,
      },
    ],
    widgets: [
      {
        id: "w-paris",
        userId: "u-demo",
        widgetTypeId: "city_temperature",
        params: { city: "Paris" },
        refreshRate: 300,
        position: { x: 0, y: 0, w: 2, h: 2 },
        dataCalls: 1,
      },
      {
        id: "w-tokyo",
        userId: "u-demo",
        widgetTypeId: "city_temperature",
        params: { city: "Tokyo" },
        refreshRate: 300,
        position: { x: 2, y: 0, w: 2, h: 2 },
        dataCalls: 1,
      },
    ],
    subscriptions: [{ userId: "u-demo", service: "github" }],
    sessionUserId: null,
  };
}

const STORAGE_KEY = "dashboard-mock-state-v1";

function canPersist(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function load(): MockState {
  if (canPersist()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as MockState;
    } catch {
      // Corrupted or blocked storage: fall back to a fresh seed.
    }
  }
  return seed();
}

export const db: MockState = load();

/* Writes the state after every mutating request. No-op on the server side. */
export function persist(): void {
  if (!canPersist()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage full or disabled: the mock keeps working in memory.
  }
}

/* Restores the seed data. Exposed as window.resetMock() in the browser. */
export function resetMock(): void {
  Object.assign(db, seed());
  persist();
}

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
