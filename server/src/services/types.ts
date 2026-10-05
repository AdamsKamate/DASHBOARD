/* One choice of a parameter restricted to a fixed list of values */
export interface WidgetParamOption {
  value: string;
  label: string;
}

export interface WidgetParam {
  name: string;
  type: "string" | "integer";

  /*
   Everything below is optional and only feeds the configuration form.
   about.json keeps exposing { name, type } alone, as the subject requires.
   */

  /* Human label shown above the field; the form falls back to `name` */
  label?: string;
  /* One line under the field: format, example, effect of the filter */
  help?: string;
  /*
   The widget cannot work without it (e.g. the repository). When absent, a
   param is required unless it declares `emptyLabel` or `default`, i.e.
   unless it says what an empty value means: params declared before this
   metadata existed (Google, weather) stay required.
   */
  required?: boolean;
  /* Value pre-filled when the widget is created */
  default?: string | number;
  placeholder?: string;
  /* Turns the field into a select restricted to these values */
  options?: WidgetParamOption[];
  /*
   What leaving the field empty means ("Tous les états", "Branche par
   défaut"). On a select it becomes the first choice, with an empty value.
   */
  emptyLabel?: string;
  /* Bounds of an integer param */
  min?: number;
  max?: number;
}

export function isParamRequired(param: WidgetParam): boolean {
  return param.required ?? (param.emptyLabel === undefined && param.default === undefined);
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
  /*
   Extra parameters some providers require on the authorization URL
   */
  extraAuthorizationParams?: Record<string, string>;
}

export interface ServiceProvider {
  name: string;
  requiresAuth: boolean;
  getOAuthConfig?(): OAuthConfig;
  widgets: WidgetDefinition[];
}
