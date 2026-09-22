import type {
  About,
  AdminUser,
  CreateWidgetInput,
  Credentials,
  CurrentUser,
  LoginResponse,
  MessageResponse,
  Service,
  UpdateWidgetInput,
  WidgetData,
  WidgetInstance,
  WidgetType,
} from "./types";

// API client.
// The only module allowed to talk to the backend. Pages call `api.auth.login`
// or `api.widgets.list`, never `fetch` directly.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";
const MOCK_LATENCY_MS = Number(process.env.NEXT_PUBLIC_MOCK_LATENCY ?? 300);

/*
 Error carrying the HTTP status and the server message.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details: string[] = []
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function mockRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  // Loaded lazily so that the mock is never bundled into a real-server build.
  const { handle } = await import("./mock/handlers");

  // Simulated latency: without it, loading states are never visible during
  // development and only show up once the real server is plugged in.
  await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));

  // Round trip through JSON so the page receives a copy, exactly as it would
  // from the network, and cannot mutate the mock state by accident.
  const res = handle(method, path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)));

  if (res.status >= 400) {
    const err = res.body as { error: string; details?: string[] };
    throw new ApiError(res.status, err.error, err.details);
  }
  if (res.redirect) return { redirect: res.redirect } as T;
  return (res.body === undefined ? undefined : JSON.parse(JSON.stringify(res.body))) as T;
}

async function realRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include", // sends the httpOnly token cookie
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`, data.details);
  }
  return data as T;
}

function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  return USE_MOCK ? mockRequest<T>(method, path, body) : realRequest<T>(method, path, body);
}

// Typed endpoints, one per route of API.md

export const api = {
  about: () => request<About>("GET", "/about.json"),

  auth: {
    register: (input: Credentials) => request<MessageResponse>("POST", "/auth/register", input),
    verify: (token: string) =>
      request<MessageResponse>("GET", `/auth/verify?token=${encodeURIComponent(token)}`),
    login: (input: Credentials) => request<LoginResponse>("POST", "/auth/login", input),
    me: () => request<CurrentUser>("GET", "/auth/me"),
    logout: () => request<void>("POST", "/auth/logout"),
  },

  services: {
    list: () => request<Service[]>("GET", "/services"),
    unlink: (service: string) => request<void>("DELETE", `/services/${service}/subscription`),

    /*
     Starts the OAuth flow.
     */
    link: async (service: string): Promise<void> => {
      if (USE_MOCK) {
        const { redirect } = await request<{ redirect: string }>(
          "GET",
          `/oauth/${service}/authorize`
        );
        window.location.href = redirect;
      } else {
        window.location.href = `${API_URL}/oauth/${service}/authorize`;
      }
    },
  },

  widgetTypes: {
    list: () => request<WidgetType[]>("GET", "/widget-types"),
  },

  widgets: {
    list: () => request<WidgetInstance[]>("GET", "/widgets"),
    create: (input: CreateWidgetInput) => request<WidgetInstance>("POST", "/widgets", input),
    update: (id: string, input: UpdateWidgetInput) =>
      request<WidgetInstance>("PATCH", `/widgets/${id}`, input),
    remove: (id: string) => request<void>("DELETE", `/widgets/${id}`),
    data: (id: string) => request<WidgetData>("GET", `/widgets/${id}/data`),
  },

  admin: {
    listUsers: () => request<AdminUser[]>("GET", "/admin/users"),
    deleteUser: (id: string) => request<void>("DELETE", `/admin/users/${id}`),
  },
};

// Exposes a reset helper in the browser console while the mock is active:
// resetMock() -> restores the demo accounts and widgets
if (USE_MOCK && typeof window !== "undefined") {
  import("./mock/db").then(({ resetMock }) => {
    (window as unknown as { resetMock: () => void }).resetMock = resetMock;
  });
}
