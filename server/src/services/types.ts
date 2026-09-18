export interface WidgetParam {
  name: string;
  type: "string" | "integer";
}

export type WidgetData = Record<string, unknown>;

export interface WidgetDefinition {
  name: string;
  description: string;
  params: WidgetParam[];
  fetch(params: Record<string, string | number>, token?: string): Promise<WidgetData>;
}

export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
}

export interface ServiceProvider {
  name: string;
  requiresAuth: boolean;
  getOAuthConfig?(): OAuthConfig;
  widgets: WidgetDefinition[];
}
