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

/* One choice of a param restricted to a fixed list of values */
export interface WidgetParamOption {
  value: string;
  label: string;
}

/*
 A param as GET /widget-types describes it: about.json's { name, type } plus
 what the configuration form needs. Everything but `required` is optional,
 so a param declared with name and type alone still renders as a text field.
 */
export interface WidgetTypeParam extends AboutParam {
  required?: boolean;
  label?: string;
  help?: string;
  default?: string | number;
  placeholder?: string;
  /* Rendered as a select instead of a text field */
  options?: WidgetParamOption[];
  /* What an empty value means: "Tous les états", "Branche par défaut"... */
  emptyLabel?: string;
  min?: number;
  max?: number;
}

export interface WidgetType {
  id: string;
  service: string;
  name: string;
  description: string;
  requiresAuth: boolean;
  params: WidgetTypeParam[];
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
