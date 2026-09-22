// API mock compliant with API.md: one function per route in the contract,
// with exactly the same response shapes (success and errors) as the real
// backend. The frontend is developed entirely against this file.
//
// To wire up the real server later: replace the body of each function
// with a real fetch() to http://localhost:8080, without changing its
// signature or the shape of the returned data. No component that calls
// these functions will need to change.

import {
  AdminUserDTO,
  ServiceDTO,
  UserDTO,
  WidgetDataResponse,
  WidgetInstanceDTO,
  WidgetTypeDTO,
} from "./types";
import {
  initialMockWidgets,
  mockAdminUsers,
  mockServices,
  mockUser,
  mockWidgetTypes,
} from "./mock-data";

// Error thrown by the mock, with the same HTTP status and the same body
// `{ error: "..." }` the real server would return (see API.md, "Uniform
// error format" section). A component can therefore already write:
//   catch (e) { if (e instanceof ApiRequestError) setError(e.message) }
// and this code will still be valid once the real fetch() is wired up.
export class ApiRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Simulates network latency so the frontend's loading states (spinners,
// skeletons) aren't hidden during development.
function delay<T>(value: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// --- Mutable in-memory state (resets on every page reload) ---
// Good enough for a mock: no need to persist across sessions.
let currentUser: UserDTO | null = mockUser;
let widgets: WidgetInstanceDTO[] = [...initialMockWidgets];
const registeredEmails = new Set<string>(["mohammadamin.hammami@gmail.com"]);
const verifiedEmails = new Set<string>(["mohammadamin.hammami@gmail.com"]);

//Authentication
export async function register(
  email: string,
  password: string
): Promise<{ message: string }> {
  if (!email || !password) {
    throw new ApiRequestError(400, "email et password sont requis");
  }
  if (registeredEmails.has(email)) {
    throw new ApiRequestError(409, "un compte existe déjà avec cet email");
  }
  registeredEmails.add(email);
  return delay({ message: "Account created, email confirmation required" });
}

export async function verify(token: string): Promise<{ message: string }> {
  if (!token) {
    throw new ApiRequestError(400, "token invalide ou expiré");
  }
  verifiedEmails.add(mockUser.email);
  return delay({ message: "Account confirmed" });
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: UserDTO }> {
  if (!registeredEmails.has(email)) {
    throw new ApiRequestError(401, "identifiants invalides");
  }
  if (!verifiedEmails.has(email)) {
    throw new ApiRequestError(403, "compte non confirmé");
  }
  currentUser = { ...mockUser, email };
  return delay({ token: "mock.jwt.token", user: currentUser });
}

export async function getMe(): Promise<UserDTO> {
  if (!currentUser) {
    throw new ApiRequestError(401, "non authentifié");
  }
  return delay(currentUser);
}

export async function logout(): Promise<void> {
  currentUser = null;
  return delay(undefined, 100);
}

//Services and OAuth
export async function getServices(): Promise<ServiceDTO[]> {
  return delay([...mockServices]);
}

// GET /oauth/:service/authorize is a redirect (302), not JSON: the
// frontend must navigate directly, not call this function via fetch.
export function oauthAuthorizeUrl(service: string): string {
  return `http://localhost:8080/oauth/${service}/authorize`;
}

export async function deleteServiceSubscription(service: string): Promise<void> {
  const entry = mockServices.find((s) => s.name === service);
  if (entry) entry.subscribed = false;
  return delay(undefined, 150);
}
//Widget types

export async function getWidgetTypes(): Promise<WidgetTypeDTO[]> {
  return delay([...mockWidgetTypes]);
}

//Widget instances
export async function getWidgets(): Promise<WidgetInstanceDTO[]> {
  return delay([...widgets]);
}

export async function createWidget(payload: {
  widgetTypeId: string;
  params: Record<string, string | number>;
  refreshRate: number;
  position?: { x: number; y: number; w: number; h: number };
}): Promise<WidgetInstanceDTO> {
  const type = mockWidgetTypes.find((t) => t.id === payload.widgetTypeId);
  if (!type) {
    throw new ApiRequestError(400, "widgetTypeId inconnu");
  }
  if (type.requiresAuth) {
    const service = mockServices.find((s) => s.name === type.service);
    if (!service?.subscribed) {
      throw new ApiRequestError(403, "service non souscrit");
    }
  }
  if (payload.refreshRate < 30) {
    throw new ApiRequestError(400, "refreshRate minimum 30 secondes");
  }

  const instance: WidgetInstanceDTO = {
    id: crypto.randomUUID(),
    widgetTypeId: payload.widgetTypeId,
    params: payload.params,
    refreshRate: payload.refreshRate,
    position: payload.position ?? { x: 0, y: 0, w: 2, h: 2 },
  };
  widgets = [...widgets, instance];
  return delay(instance, 200);
}

export async function patchWidget(
  id: string,
  payload: Partial<Pick<WidgetInstanceDTO, "params" | "refreshRate" | "position">>
): Promise<WidgetInstanceDTO> {
  const index = widgets.findIndex((w) => w.id === id);
  if (index === -1) {
    throw new ApiRequestError(404, "widget introuvable");
  }
  widgets[index] = { ...widgets[index], ...payload };
  return delay(widgets[index]);
}

export async function deleteWidget(id: string): Promise<void> {
  widgets = widgets.filter((w) => w.id !== id);
  return delay(undefined, 150);
}

export async function getWidgetData(id: string): Promise<WidgetDataResponse> {
  const instance = widgets.find((w) => w.id === id);
  if (!instance) {
    throw new ApiRequestError(404, "widget introuvable");
  }

  const type = mockWidgetTypes.find((t) => t.id === instance.widgetTypeId);

  // Fake data per service, just realistic enough to build each widget's
  // display without a real backend.
  const fakeDataByService: Record<string, Record<string, unknown>> = {
    weather: { city: instance.params.city ?? "Paris", temperature: 16.4, condition: "Partly cloudy" },
    rss: { title: "Exemple d'article", link: instance.params.link ?? "" },
    github: { repo: instance.params.repo ?? "octocat/hello-world", count: 3 },
    google: { count: instance.params.count ?? 5 },
  };

  return delay({
    data: fakeDataByService[type?.service ?? ""] ?? null,
    fetchedAt: new Date().toISOString(),
    status: "ok",
  });
}

//Administration
export async function getAdminUsers(): Promise<AdminUserDTO[]> {
  if (currentUser?.role !== "admin") {
    throw new ApiRequestError(403, "réservé aux administrateurs");
  }
  return delay([...mockAdminUsers]);
}

export async function deleteAdminUser(id: string): Promise<void> {
  if (currentUser?.role !== "admin") {
    throw new ApiRequestError(403, "réservé aux administrateurs");
  }
  return delay(undefined, 150);
}
