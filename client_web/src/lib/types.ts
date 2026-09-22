// Types of the API contract.

export type Role = "user" | "admin";
export type ParamType = "string" | "integer";

/* Uniform error body returned by every failing route. */
export interface ApiErrorBody {
  error: string;
  details?: string[];
}

// /about.json

export interface AboutParam {
  name: string;
  type: ParamType;
}

export interface AboutWidget {
  name: string;
  description: string;
  params: AboutParam[];
}

export interface About {
  client: { host: string };
  server: {
    current_time: number;
    services: { name: string; widgets: AboutWidget[] }[];
  };
}

// Authentication

export interface Credentials {
  email: string;
  password: string;
}

export interface MessageResponse {
  message: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: CurrentUser;
}

// Services

export interface Service {
  name: string;
  requiresAuth: boolean;
  subscribed: boolean;
}

// Widget types

export interface WidgetType {
  id: string;
  service: string;
  name: string;
  description: string;
  requiresAuth: boolean;
  params: AboutParam[];
}

// Widget instances

export type WidgetParams = Record<string, string | number>;

export interface Position {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetInstance {
  id: string;
  widgetTypeId: string;
  params: WidgetParams;
  refreshRate: number;
  position: Position;
}

export interface CreateWidgetInput {
  widgetTypeId: string;
  params: WidgetParams;
  refreshRate: number;
  position?: Position;
}

export interface UpdateWidgetInput {
  params?: WidgetParams;
  refreshRate?: number;
  position?: Position;
}

export type WidgetDataStatus = "ok" | "pending" | "error";

export interface WidgetData {
  data: Record<string, unknown> | null;
  fetchedAt: string | null;
  status: WidgetDataStatus;
  error?: string;
}

//  Administration

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  isVerified: boolean;
  createdAt: string;
}
