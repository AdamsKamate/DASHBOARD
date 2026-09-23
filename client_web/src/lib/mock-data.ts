import {
  AdminUserDTO,
  ServiceDTO,
  UserDTO,
  WidgetInstanceDTO,
  WidgetTypeDTO,
} from "./types";

export const mockUser: UserDTO = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "mohammadamin.hammami@gmail.com",
  role: "user",
};

export const mockServices: ServiceDTO[] = [
  { name: "weather", requiresAuth: false, subscribed: true },
  { name: "rss", requiresAuth: false, subscribed: true },
  { name: "github", requiresAuth: true, subscribed: false },
  { name: "google", requiresAuth: true, subscribed: false },
];

export const mockWidgetTypes: WidgetTypeDTO[] = [
  {
    id: "city_temperature",
    service: "weather",
    name: "city_temperature",
    description: "Affiche la météo actuelle d'une ville",
    requiresAuth: false,
    params: [{ name: "city", type: "string" }],
  },
  {
    id: "weather_forecast",
    service: "weather",
    name: "weather_forecast",
    description: "Affiche les prévisions sur N jours",
    requiresAuth: false,
    params: [
      { name: "city", type: "string" },
      { name: "days", type: "integer" },
    ],
  },
  {
    id: "article_list",
    service: "rss",
    name: "article_list",
    description: "Affiche les derniers articles d'un flux RSS",
    requiresAuth: false,
    params: [
      { name: "link", type: "string" },
      { name: "number", type: "integer" },
    ],
  },
  {
    id: "feed_summary",
    service: "rss",
    name: "feed_summary",
    description: "Affiche le résumé du dernier article d'un flux",
    requiresAuth: false,
    params: [{ name: "link", type: "string" }],
  },
  {
    id: "github_commits",
    service: "github",
    name: "github_commits",
    description: "Derniers commits d'un dépôt",
    requiresAuth: true,
    params: [
      { name: "repo", type: "string" },
      { name: "count", type: "integer" },
    ],
  },
  {
    id: "github_issues",
    service: "github",
    name: "github_issues",
    description: "Issues d'un dépôt selon leur état",
    requiresAuth: true,
    params: [
      { name: "repo", type: "string" },
      { name: "state", type: "string" },
    ],
  },
  {
    id: "google_calendar_next",
    service: "google",
    name: "google_calendar_next",
    description: "Prochains événements du calendrier",
    requiresAuth: true,
    params: [{ name: "count", type: "integer" }],
  },
  {
    id: "google_gmail_unread",
    service: "google",
    name: "google_gmail_unread",
    description: "Derniers messages non lus d'un label",
    requiresAuth: true,
    params: [
      { name: "label", type: "string" },
      { name: "count", type: "integer" },
    ],
  },
];

export const initialMockWidgets: WidgetInstanceDTO[] = [
  {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    widgetTypeId: "city_temperature",
    params: { city: "Paris" },
    refreshRate: 300,
    position: { x: 0, y: 0, w: 2, h: 2 },
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000002",
    widgetTypeId: "article_list",
    params: { link: "https://hnrss.org/frontpage", number: 5 },
    refreshRate: 600,
    position: { x: 2, y: 0, w: 2, h: 2 },
  },
];

export const mockAdminUsers: AdminUserDTO[] = [
  {
    id: mockUser.id,
    email: mockUser.email,
    role: "user",
    isVerified: true,
    createdAt: "2026-09-01T10:00:00.000Z",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    email: "adams@example.com",
    role: "user",
    isVerified: true,
    createdAt: "2026-09-02T09:00:00.000Z",
  },
];