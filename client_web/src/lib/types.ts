export interface UserDTO {
  id: string;
  email: string;
  role: "user" | "admin";
}

export interface ServiceDTO {
  name: string;
  requiresAuth: boolean;
  subscribed: boolean;
}

export interface WidgetParamDTO {
  name: string;
  type: "string" | "integer";
}

export interface WidgetTypeDTO {
  id: string;
  service: string;
  name: string;
  description: string;
  requiresAuth: boolean;
  params: WidgetParamDTO[];
}

export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetInstanceDTO {
  id: string;
  widgetTypeId: string;
  params: Record<string, string | number>;
  refreshRate: number;
  position: WidgetPosition;
}

export interface WidgetDataResponse {
  data: Record<string, unknown> | null;
  fetchedAt: string;
  status: "ok" | "pending" | "error";
  error?: string;
}

export interface AdminUserDTO {
  id: string;
  email: string;
  role: "user" | "admin";
  isVerified: boolean;
  createdAt: string;
}

export interface ApiError {
  error: string;
}
