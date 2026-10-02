import { db, persist, newId, SERVICES, WIDGET_TYPES, MockUser, MockWidget } from "./db";
import type { WidgetParams, Position } from "../types";

// Mock route handlers.

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  params: Record<string, string>;
}

export interface MockResponse {
  status: number;
  body?: unknown;
  // Set on routes that answer with a 302 in the real API (OAuth)
  redirect?: string;
}

type RouteHandler = (request: MockRequest) => MockResponse;
type AuthenticatedHandler = (request: MockRequest, user: MockUser) => MockResponse;

// Response builders

function successResponse(body: unknown, status = 200): MockResponse {
  return { status, body };
}

function errorResponse(status: number, error: string, details?: string[]): MockResponse {
  const body = details ? { error, details } : { error };
  return { status, body };
}

function noContentResponse(): MockResponse {
  return { status: 204 };
}

function redirectResponse(location: string): MockResponse {
  return { status: 302, redirect: location };
}

// Session helpers (the mock equivalent of requireAuth / requireAdmin)

function findCurrentUser(): MockUser | null {
  const user = db.users.find((candidate) => candidate.id === db.sessionUserId);
  return user ?? null;
}

/* Rejects the request with 401 when nobody is logged in. */
function withAuth(handler: AuthenticatedHandler): RouteHandler {
  return (request) => {
    const user = findCurrentUser();
    if (!user) {
      return errorResponse(401, "Authentication required");
    }
    return handler(request, user);
  };
}

/* Rejects the request with 403 when the logged-in user is not an admin. */
function withAdmin(handler: AuthenticatedHandler): RouteHandler {
  return withAuth((request, user) => {
    if (user.role !== "admin") {
      return errorResponse(403, "Insufficient permissions");
    }
    return handler(request, user);
  });
}

function findService(serviceName: string) {
  return SERVICES.find((service) => service.name === serviceName);
}

function findWidgetType(widgetTypeId: string | undefined) {
  return WIDGET_TYPES.find((widgetType) => widgetType.id === widgetTypeId);
}

function findUserWidget(widgetId: string, userId: string): MockWidget | undefined {
  return db.widgets.find((widget) => widget.id === widgetId && widget.userId === userId);
}

function isSubscribed(userId: string, serviceName: string): boolean {
  const service = findService(serviceName);
  if (!service) {
    return false;
  }
  // A service without authentication is available by default, as per the
  // assignment: it needs no subscription row.
  if (!service.requiresAuth) {
    return true;
  }
  return db.subscriptions.some(
    (subscription) => subscription.userId === userId && subscription.service === serviceName
  );
}

/* Strips internal fields so the response matches GET /widgets in API.md. */
function toWidgetInstance(widget: MockWidget) {
  return {
    id: widget.id,
    widgetTypeId: widget.widgetTypeId,
    params: widget.params,
    refreshRate: widget.refreshRate,
    position: widget.position,
  };
}

// Validation, mirroring the server rules

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MIN_REFRESH_RATE_SECONDS = 30;

function validateCredentials(body: unknown): string[] {
  const { email, password } = (body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email)) {
    errors.push("email format is invalid");
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return errors;
}

function validateWidgetParams(widgetTypeId: string, params: unknown): string[] {
  const widgetType = findWidgetType(widgetTypeId);
  if (!widgetType) {
    return [`unknown widget type: ${widgetTypeId}`];
  }
  if (typeof params !== "object" || params === null) {
    return ["params must be an object"];
  }

  const providedValues = params as Record<string, unknown>;
  const errors: string[] = [];

  for (const expectedParam of widgetType.params) {
    const value = providedValues[expectedParam.name];

    if (value === undefined || value === "") {
      errors.push(`${expectedParam.name} is required`);
    } else if (expectedParam.type === "integer" && !Number.isInteger(value)) {
      errors.push(`${expectedParam.name} must be an integer`);
    } else if (expectedParam.type === "string" && typeof value !== "string") {
      errors.push(`${expectedParam.name} must be a string`);
    }
  }
  return errors;
}

function validateRefreshRate(refreshRate: unknown): string[] {
  const isValid =
    Number.isInteger(refreshRate) && (refreshRate as number) >= MIN_REFRESH_RATE_SECONDS;

  if (isValid) {
    return [];
  }
  return [`refreshRate must be an integer of at least ${MIN_REFRESH_RATE_SECONDS} seconds`];
}

// Fake widget data

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/* Builds a list of `count` items, falling back to `defaultCount`. */
function buildList<T>(count: unknown, defaultCount: number, buildItem: (index: number) => T): T[] {
  const length = Number(count) || defaultCount;
  return Array.from({ length }, (_unused, index) => buildItem(index));
}

function generateFakeData(widgetTypeId: string, params: WidgetParams): Record<string, unknown> {
  // Derived from the params so that the same configuration always shows the
  // same temperature, while Paris and Tokyo still differ.
  const variation = JSON.stringify(params).length % 15;

  switch (widgetTypeId) {
    case "city_temperature":
      {
        const city = String(params.city ?? "");
        const isTokyo = city.toLowerCase() === "tokyo";

      return {
          city,
          country: isTokyo ? "Japon" : "France",
          temperature: isTokyo ? 13.4 : 12 + variation + 0.4,
          temperatureUnit: "°C",
          windSpeed: 11.2,
          windSpeedUnit: "km/h",
          condition: "Partiellement nuageux",
          weatherCode: 2,
          observedAt: "2026-10-02T14:00",
        };
      };

    case "weather_forecast":
      return {
        city: params.city,
        days: buildList(params.days, 3, (dayIndex) => ({
          date: new Date(Date.now() + dayIndex * ONE_DAY_MS).toISOString().slice(0, 10),
          min: 8 + dayIndex,
          max: 17 + dayIndex,
          condition: dayIndex % 2 === 0 ? "Sunny" : "Rain",
        })),
      };

    case "article_list":
      return {
        feed: params.link,
        articles: buildList(params.number, 5, (articleIndex) => ({
          title: `Mock article #${articleIndex + 1}`,
          url: `https://example.com/article-${articleIndex + 1}`,
          publishedAt: new Date(Date.now() - articleIndex * ONE_HOUR_MS).toISOString(),
        })),
      };

    case "feed_summary":
      return {
        feed: params.link,
        title: "Mock feed",
        summary: "Latest article summary, served by the mock.",
      };

    case "github_commits":
      return {
        repo: params.repo,
        commits: buildList(params.count, 5, (commitIndex) => ({
          sha: Math.random().toString(16).slice(2, 9),
          message: `Mock commit #${commitIndex + 1}`,
          author: commitIndex % 2 === 0 ? "bob" : "alice",
        })),
      };

    case "github_issues":
      return {
        repo: params.repo,
        state: params.state,
        issues: [
          { number: 42, title: "Mock issue about the dashboard", state: params.state },
          { number: 43, title: "Another mock issue", state: params.state },
        ],
      };

    case "google_calendar_next":
      return {
        events: buildList(params.count, 3, (eventIndex) => ({
          title: `Mock meeting #${eventIndex + 1}`,
          start: new Date(Date.now() + (eventIndex + 1) * 2 * ONE_HOUR_MS).toISOString(),
        })),
      };

    case "google_gmail_unread":
      return {
        label: params.label,
        messages: buildList(params.count, 3, (messageIndex) => ({
          from: `sender${messageIndex + 1}@example.com`,
          subject: `Mock unread message #${messageIndex + 1}`,
        })),
      };

    default:
      return {};
  }
}

// Endpoint required by the assignment

function handleAbout(): MockResponse {
  const services = SERVICES.map((service) => {
    const widgetsOfService = WIDGET_TYPES.filter(
      (widgetType) => widgetType.service === service.name
    );
    return {
      name: service.name,
      widgets: widgetsOfService.map((widgetType) => ({
        name: widgetType.id,
        description: widgetType.description,
        params: widgetType.params,
      })),
    };
  });

  return successResponse({
    client: { host: "127.0.0.1" },
    server: {
      current_time: Math.floor(Date.now() / 1000),
      services,
    },
  });
}

// Authentication

function handleRegister(request: MockRequest): MockResponse {
  const errors = validateCredentials(request.body);
  if (errors.length > 0) {
    return errorResponse(400, "Invalid input", errors);
  }

  const { email, password } = request.body as { email: string; password: string };
  const normalizedEmail = email.trim().toLowerCase();

  const emailAlreadyUsed = db.users.some((user) => user.email === normalizedEmail);
  if (emailAlreadyUsed) {
    return errorResponse(409, "Email already in use");
  }

  const verificationToken = newId("verify");
  db.users.push({
    id: newId("u"),
    email: normalizedEmail,
    password,
    role: "user",
    isVerified: false,
    verificationToken,
    createdAt: new Date().toISOString(),
  });
  persist();

  // The real server emails this link; the mock prints it in the browser
  // console so the confirmation flow can be tested.
  console.info(
    `[mock] verification link for ${normalizedEmail}: /auth/verify?token=${verificationToken}`
  );
  return successResponse({ message: "Account created, email confirmation required" }, 201);
}

function handleVerify(request: MockRequest): MockResponse {
  const token = request.query.get("token");
  const user = token
    ? db.users.find((candidate) => candidate.verificationToken === token)
    : undefined;

  if (!user) {
    return errorResponse(400, "Invalid or expired token");
  }

  user.isVerified = true;
  user.verificationToken = null; // single-use link
  persist();
  return successResponse({ message: "Account confirmed" });
}

function handleLogin(request: MockRequest): MockResponse {
  const { email, password } = (request.body ?? {}) as Record<string, unknown>;

  if (typeof email !== "string" || typeof password !== "string") {
    return errorResponse(400, "Email and password are required");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = db.users.find((candidate) => candidate.email === normalizedEmail);

  // Same message for an unknown email and a wrong password, as on the server.
  if (!user || user.password !== password) {
    return errorResponse(401, "Invalid credentials");
  }
  if (!user.isVerified) {
    return errorResponse(403, "Account not confirmed");
  }

  db.sessionUserId = user.id;
  persist();

  return successResponse({
    token: `mock.${user.id}`,
    user: { id: user.id, email: user.email, role: user.role },
  });
}

function handleMe(_request: MockRequest, user: MockUser): MockResponse {
  return successResponse({ id: user.id, email: user.email, role: user.role });
}

function handleLogout(): MockResponse {
  db.sessionUserId = null;
  persist();
  return noContentResponse();
}

// Services and OAuth

function handleListServices(_request: MockRequest, user: MockUser): MockResponse {
  const services = SERVICES.map((service) => ({
    name: service.name,
    requiresAuth: service.requiresAuth,
    subscribed: isSubscribed(user.id, service.name),
  }));
  return successResponse(services);
}

/*
 The real route redirects to the provider, which redirects back to the
 callback.
 */
function handleOAuthAuthorize(request: MockRequest, user: MockUser): MockResponse {
  const service = findService(request.params.service);

  if (!service || !service.requiresAuth) {
    return redirectResponse("/services?error=unknown_service");
  }

  if (!isSubscribed(user.id, service.name)) {
    db.subscriptions.push({ userId: user.id, service: service.name });
    persist();
  }
  return redirectResponse(`/services?linked=${service.name}`);
}

function handleUnlinkService(request: MockRequest, user: MockUser): MockResponse {
  const serviceToUnlink = request.params.service;

  db.subscriptions = db.subscriptions.filter((subscription) => {
    const isTarget = subscription.userId === user.id && subscription.service === serviceToUnlink;
    return !isTarget;
  });
  persist();
  return noContentResponse();
}

// Widget types

function handleListWidgetTypes(): MockResponse {
  const widgetTypes = WIDGET_TYPES.map((widgetType) => ({
    id: widgetType.id,
    service: widgetType.service,
    name: widgetType.id,
    description: widgetType.description,
    requiresAuth: findService(widgetType.service)?.requiresAuth ?? false,
    params: widgetType.params,
  }));
  return successResponse(widgetTypes);
}

// Widget instances

interface WidgetBody {
  widgetTypeId?: string;
  params?: WidgetParams;
  refreshRate?: number;
  position?: Position;
}

const DEFAULT_POSITION: Position = { x: 0, y: 0, w: 2, h: 2 };

function handleListWidgets(_request: MockRequest, user: MockUser): MockResponse {
  const userWidgets = db.widgets.filter((widget) => widget.userId === user.id);
  return successResponse(userWidgets.map(toWidgetInstance));
}

function handleCreateWidget(request: MockRequest, user: MockUser): MockResponse {
  const body = (request.body ?? {}) as WidgetBody;

  const widgetType = findWidgetType(body.widgetTypeId);
  if (!widgetType) {
    return errorResponse(400, "Invalid input", [`unknown widget type: ${body.widgetTypeId}`]);
  }

  const errors = [
    ...validateWidgetParams(widgetType.id, body.params),
    ...validateRefreshRate(body.refreshRate),
  ];
  if (errors.length > 0) {
    return errorResponse(400, "Invalid input", errors);
  }

  if (!isSubscribed(user.id, widgetType.service)) {
    return errorResponse(403, "Service not subscribed");
  }

  const widget: MockWidget = {
    id: newId("w"),
    userId: user.id,
    widgetTypeId: widgetType.id,
    params: body.params as WidgetParams,
    refreshRate: body.refreshRate as number,
    position: body.position ?? DEFAULT_POSITION,
    dataCalls: 0,
  };
  db.widgets.push(widget);
  persist();

  return successResponse(toWidgetInstance(widget), 201);
}

function handleUpdateWidget(request: MockRequest, user: MockUser): MockResponse {
  const widget = findUserWidget(request.params.id, user.id);
  if (!widget) {
    return errorResponse(404, "Widget not found");
  }

  // Every field is optional: only the ones provided are validated and applied.
  const body = (request.body ?? {}) as WidgetBody;
  const errors: string[] = [];

  if (body.params !== undefined) {
    errors.push(...validateWidgetParams(widget.widgetTypeId, body.params));
  }
  if (body.refreshRate !== undefined) {
    errors.push(...validateRefreshRate(body.refreshRate));
  }
  if (errors.length > 0) {
    return errorResponse(400, "Invalid input", errors);
  }

  if (body.params) {
    widget.params = body.params;
    widget.dataCalls = 0; // new configuration: the next read is "pending" again
  }
  if (body.refreshRate !== undefined) {
    widget.refreshRate = body.refreshRate;
  }
  if (body.position) {
    widget.position = body.position;
  }
  persist();

  return successResponse(toWidgetInstance(widget));
}

function handleDeleteWidget(request: MockRequest, user: MockUser): MockResponse {
  const widget = findUserWidget(request.params.id, user.id);
  if (!widget) {
    return errorResponse(404, "Widget not found");
  }

  db.widgets = db.widgets.filter((candidate) => candidate.id !== widget.id);
  persist();
  return noContentResponse();
}

function handleWidgetData(request: MockRequest, user: MockUser): MockResponse {
  const widget = findUserWidget(request.params.id, user.id);
  if (!widget) {
    return errorResponse(404, "Widget not found");
  }

  widget.dataCalls += 1;
  persist();

  const isFirstRead = widget.dataCalls === 1;
  if (isFirstRead) {
    return successResponse({ data: null, fetchedAt: null, status: "pending" });
  }

  const fetchedAt = new Date().toISOString();
  const simulatesFailure = Object.values(widget.params).some((value) => value === "error");

  if (simulatesFailure) {
    return successResponse({ data: null, fetchedAt, status: "error", error: "rate_limit" });
  }
  return successResponse({
    data: generateFakeData(widget.widgetTypeId, widget.params),
    fetchedAt,
    status: "ok",
  });
}

// Administration

function handleListUsers(): MockResponse {
  // Explicit field list: the password never leaves the mock.
  const users = db.users.map((user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
  }));
  return successResponse(users);
}

function handleDeleteUser(request: MockRequest): MockResponse {
  const userId = request.params.id;
  const userExists = db.users.some((user) => user.id === userId);

  if (!userExists) {
    return errorResponse(404, "User not found");
  }

  // Cascade, as ON DELETE CASCADE does on the real database.
  db.users = db.users.filter((user) => user.id !== userId);
  db.widgets = db.widgets.filter((widget) => widget.userId !== userId);
  db.subscriptions = db.subscriptions.filter((subscription) => subscription.userId !== userId);
  if (db.sessionUserId === userId) {
    db.sessionUserId = null;
  }
  persist();
  return noContentResponse();
}

// Route table

interface Route {
  method: string;
  pattern: string;
  handler: RouteHandler;
}

const routes: Route[] = [
  { method: "GET", pattern: "/about.json", handler: handleAbout },

  { method: "POST", pattern: "/auth/register", handler: handleRegister },
  { method: "GET", pattern: "/auth/verify", handler: handleVerify },
  { method: "POST", pattern: "/auth/login", handler: handleLogin },
  { method: "GET", pattern: "/auth/me", handler: withAuth(handleMe) },
  { method: "POST", pattern: "/auth/logout", handler: handleLogout },

  { method: "GET", pattern: "/services", handler: withAuth(handleListServices) },
  { method: "GET", pattern: "/oauth/:service/authorize", handler: withAuth(handleOAuthAuthorize) },
  { method: "DELETE", pattern: "/services/:service/subscription", handler: withAuth(handleUnlinkService) },

  { method: "GET", pattern: "/widget-types", handler: withAuth(handleListWidgetTypes) },

  { method: "GET", pattern: "/widgets", handler: withAuth(handleListWidgets) },
  { method: "POST", pattern: "/widgets", handler: withAuth(handleCreateWidget) },
  { method: "PATCH", pattern: "/widgets/:id", handler: withAuth(handleUpdateWidget) },
  { method: "DELETE", pattern: "/widgets/:id", handler: withAuth(handleDeleteWidget) },
  { method: "GET", pattern: "/widgets/:id/data", handler: withAuth(handleWidgetData) },

  { method: "GET", pattern: "/admin/users", handler: withAdmin(handleListUsers) },
  { method: "DELETE", pattern: "/admin/users/:id", handler: withAdmin(handleDeleteUser) },
];

/*
 Matches a route pattern against a path and extracts its parameters.
 */
function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const patternSegments = pattern.split("/").filter(Boolean);
  const pathSegments = path.split("/").filter(Boolean);

  if (patternSegments.length !== pathSegments.length) {
    return null;
  }

  const extractedParams: Record<string, string> = {};

  for (let index = 0; index < patternSegments.length; index++) {
    const patternSegment = patternSegments[index];
    const pathSegment = pathSegments[index];

    if (patternSegment.startsWith(":")) {
      const paramName = patternSegment.slice(1);
      extractedParams[paramName] = decodeURIComponent(pathSegment);
    } else if (patternSegment !== pathSegment) {
      return null;
    }
  }
  return extractedParams;
}

/* Entry point used by api.ts: finds the matching route and runs it. */
export function handle(method: string, url: string, body: unknown): MockResponse {
  const [path, queryString = ""] = url.split("?");
  const upperMethod = method.toUpperCase();

  for (const route of routes) {
    if (route.method !== upperMethod) {
      continue;
    }

    const params = matchPattern(route.pattern, path);
    if (params) {
      return route.handler({
        method: upperMethod,
        path,
        query: new URLSearchParams(queryString),
        body,
        params,
      });
    }
  }

  return errorResponse(404, `No mock route for ${upperMethod} ${path}`);
}
