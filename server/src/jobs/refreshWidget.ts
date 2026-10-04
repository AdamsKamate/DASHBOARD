import { registry } from "../services/registry";
import { WidgetParams } from "../db/repositories/widgets";
import { writeWidgetData, writeWidgetError } from "../lib/widgetCache";
import { getValidAccessToken, TokenUnavailableError } from "../lib/tokenProvider";
import { ExternalApiError } from "../lib/httpClient";
import type { WidgetDefinition } from "../services/types";

// Refreshing one widget instance

export interface RefreshResult {
  data: Record<string, unknown> | null;
  fetchedAt: string;
  status: "ok" | "error";
  error?: string;
}

/* Finds a widget definition and the service that owns it */
export function findWidgetDefinition(
  widgetTypeId: string
): { serviceName: string; requiresAuth: boolean; widget: WidgetDefinition } | null {
  for (const provider of registry) {
    const widget = provider.widgets.find((candidate) => candidate.name === widgetTypeId);
    if (widget) {
      return { serviceName: provider.name, requiresAuth: provider.requiresAuth, widget };
    }
  }
  return null;
}

export async function refreshWidget(
  userId: string,
  widgetId: string,
  widgetTypeId: string,
  params: WidgetParams
): Promise<RefreshResult> {
  const definition = findWidgetDefinition(widgetTypeId);

  if (!definition) {
    // The service was removed from the registry while an instance still
    // referenced it. Storing the reason beats failing silently
    const message = "Ce type de widget n'existe plus.";
    await writeWidgetError(widgetId, message);
    return { data: null, fetchedAt: new Date().toISOString(), status: "error", error: message };
  }

  try {
    let accessToken: string | undefined;

    if (definition.requiresAuth) {
      // Refreshes the token when it has expired, so a widget keeps working
      // long after the account was linked
      accessToken = await getValidAccessToken(userId, definition.serviceName);
    }

    const data = await definition.widget.fetch(params, accessToken);
    await writeWidgetData(widgetId, data);

    return { data, fetchedAt: new Date().toISOString(), status: "ok" };
  } catch (error) {
    // The message tells the user what to do: a wrong city is their problem,
    // a provider outage is not
    const message =
      error instanceof ExternalApiError || error instanceof TokenUnavailableError
        ? error.message
        : "Les données n'ont pas pu être récupérées.";
    await writeWidgetError(widgetId, message);
    return { data: null, fetchedAt: new Date().toISOString(), status: "error", error: message };
  }
}
