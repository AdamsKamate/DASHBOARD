import { registry } from "../services/registry";
import { WidgetParams } from "../db/repositories/widgets";
import { writeWidgetData, writeWidgetError } from "../lib/widgetCache";
import { getValidAccessToken, TokenUnavailableError, describeTokenFailure } from "../lib/tokenProvider";
import { ExternalApiError } from "../lib/httpClient";
import {
  pauseServiceIfNeeded,
  getServicePause,
  clearServicePause,
  describeServicePause,
} from "./serviceHealth";
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

async function fail(widgetId: string, message: string): Promise<RefreshResult> {
  await writeWidgetError(widgetId, message);
  return { data: null, fetchedAt: new Date().toISOString(), status: "error", error: message };
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
    // referenced it
    return fail(widgetId, "Ce type de widget n'existe plus.");
  }

  /*
   The service may be paused after an earlier failure
   */
  const pause = await getServicePause(definition.serviceName);
  if (pause) {
    return fail(widgetId, describeServicePause(pause));
  }

  // Token
  let accessToken: string | undefined;

  if (definition.requiresAuth) {
    try {
      accessToken = await getValidAccessToken(userId, definition.serviceName);
    } catch (error) {
      if (error instanceof TokenUnavailableError) {
        // The message tells the user whether to act: relinking the account,
        // or simply waiting out a provider outage
        return fail(widgetId, describeTokenFailure(error.reason));
      }
      throw error;
    }
  }

  // The call itself
  try {
    const data = await definition.widget.fetch(params, accessToken);

    // The provider answered, so any pause on it is over
    await clearServicePause(definition.serviceName);
    await writeWidgetData(widgetId, data);
    return { data, fetchedAt: new Date().toISOString(), status: "ok" };
  } catch (error) {
    if (error instanceof ExternalApiError) {
      // A provider side failure pauses the whole service; a bad parameter
      // only marks this one widget
      const cooldownSeconds = await pauseServiceIfNeeded(
        definition.serviceName,
        error.failure,
        error.message
      );
      if (cooldownSeconds) {
        console.warn(
          `[worker] ${definition.serviceName} paused for ${cooldownSeconds}s (${error.failure})`
        );
      }
      return fail(widgetId, error.message);
    }

    /*
     Anything else is a bug on our side
     */
    console.error(`[worker] unexpected failure on ${widgetTypeId}:`, error);
    return fail(widgetId, "Les données n'ont pas pu être récupérées.");
  }
}
