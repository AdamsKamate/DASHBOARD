import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { registry } from "../services/registry";
import { listLinkedServices } from "../db/repositories/userServices";
import {
  WidgetParams,
  WidgetPosition,
  clearWidgetCache,
  createWidget,
  deleteWidget,
  findUserWidget,
  findWidgetCache,
  listUserWidgets,
  saveWidgetData,
  saveWidgetError,
  updateWidget,
} from "../db/repositories/widgets";
import { getValidAccessToken, TokenUnavailableError } from "../lib/tokenProvider";
import { ExternalApiError } from "../lib/httpClient";
import type { WidgetDefinition } from "../services/types";

const router = Router();

// Widget types and widget instances.

const DEFAULT_POSITION: WidgetPosition = { x: 0, y: 0, w: 4, h: 2 };
const MIN_REFRESH_RATE = 30;
const MAX_REFRESH_RATE = 86_400;

/* Finds a widget definition and the service that owns it. */
function findWidgetDefinition(
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

/*
 GET /widget-types

 Feeds the configuration form generated on the front end: every type with its
 declared parameters.
 */
router.get("/widget-types", requireAuth, (_req: Request, res: Response) => {
  const widgetTypes = registry.flatMap((provider) =>
    provider.widgets.map((widget) => ({
      id: widget.name,
      service: provider.name,
      name: widget.name,
      description: widget.description,
      requiresAuth: provider.requiresAuth,
      params: widget.params.map((param) => ({ name: param.name, type: param.type })),
    }))
  );
  return res.json(widgetTypes);
});


// Validation

/*
 Checks the parameters against what the widget declares.
 */
function validateParams(widget: WidgetDefinition, rawParams: unknown): string[] {
  const details: string[] = [];

  if (typeof rawParams !== "object" || rawParams === null || Array.isArray(rawParams)) {
    return ["params must be an object"];
  }

  const params = rawParams as Record<string, unknown>;

  for (const declaredParam of widget.params) {
    const value = params[declaredParam.name];

    if (value === undefined || value === null || value === "") {
      details.push(`${declaredParam.name} is required`);
      continue;
    }

    if (declaredParam.type === "integer") {
      // Accepts 3 and "3": a form sends strings, an API client sends numbers.
      const parsedValue = typeof value === "string" ? Number(value) : value;
      if (typeof parsedValue !== "number" || !Number.isInteger(parsedValue)) {
        details.push(`${declaredParam.name} must be an integer`);
      }
    } else if (typeof value !== "string") {
      details.push(`${declaredParam.name} must be a string`);
    }
  }

  // An undeclared parameter is rejected rather than ignored: silently
  // dropping it would let a user believe their setting was taken into account.
  const declaredNames = new Set(widget.params.map((param) => param.name));
  for (const givenName of Object.keys(params)) {
    if (!declaredNames.has(givenName)) {
      details.push(`${givenName} is not a parameter of this widget`);
    }
  }
  return details;
}

/** Normalises the parameters to their declared types before storing them. */
function normaliseParams(widget: WidgetDefinition, rawParams: Record<string, unknown>): WidgetParams {
  const params: WidgetParams = {};

  for (const declaredParam of widget.params) {
    const value = rawParams[declaredParam.name];
    params[declaredParam.name] =
      declaredParam.type === "integer" ? Number(value) : String(value).trim();
  }
  return params;
}

function validateRefreshRate(value: unknown): string[] {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return ["refreshRate must be an integer number of seconds"];
  }
  if (value < MIN_REFRESH_RATE) {
    return [`refreshRate must be at least ${MIN_REFRESH_RATE} seconds`];
  }
  if (value > MAX_REFRESH_RATE) {
    return [`refreshRate must be at most ${MAX_REFRESH_RATE} seconds`];
  }
  return [];
}

function validatePosition(value: unknown): string[] {
  if (typeof value !== "object" || value === null) {
    return ["position must be an object"];
  }
  const position = value as Record<string, unknown>;
  const details: string[] = [];

  for (const key of ["x", "y", "w", "h"] as const) {
    const coordinate = position[key];
    if (typeof coordinate !== "number" || !Number.isInteger(coordinate) || coordinate < 0) {
      details.push(`position.${key} must be a positive integer`);
    }
  }
  return details;
}

/* True when the user may use this widget: no auth needed, or account linked. */
async function canUseService(
  userId: string,
  serviceName: string,
  requiresAuth: boolean
): Promise<boolean> {
  if (!requiresAuth) {
    return true;
  }
  const linkedServices = await listLinkedServices(userId);
  return linkedServices.includes(serviceName);
}

// Instances
router.get("/widgets", requireAuth, async (req: Request, res: Response) => {
  try {
    return res.json(await listUserWidgets(req.user!.userId));
  } catch (error) {
    console.error("[widgets] list failed:", (error as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/widgets", requireAuth, async (req: Request, res: Response) => {
  const { widgetTypeId, params, refreshRate, position } = req.body ?? {};

  const definition = typeof widgetTypeId === "string" ? findWidgetDefinition(widgetTypeId) : null;
  if (!definition) {
    return res.status(400).json({
      error: "Invalid input",
      details: [`Unknown widget type: ${widgetTypeId}`],
    });
  }

  const details = [
    ...validateParams(definition.widget, params),
    ...validateRefreshRate(refreshRate ?? 300),
    ...(position === undefined ? [] : validatePosition(position)),
  ];

  if (details.length > 0) {
    return res.status(400).json({ error: "Invalid input", details });
  }

  try {
    if (!(await canUseService(req.user!.userId, definition.serviceName, definition.requiresAuth))) {
      return res.status(403).json({ error: "Service not subscribed" });
    }
    const createdWidget = await createWidget(req.user!.userId, {
      widgetTypeId,
      params: normaliseParams(definition.widget, params as Record<string, unknown>),
      refreshRate: refreshRate ?? 300,
      position: (position as WidgetPosition) ?? DEFAULT_POSITION,
    });
    return res.status(201).json(createdWidget);
  } catch (error) {
    console.error("[widgets] create failed:", (error as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/widgets/:id", requireAuth, async (req: Request, res: Response) => {
  const { params, refreshRate, position } = req.body ?? {};

  try {
    const existingWidget = await findUserWidget(req.user!.userId, req.params.id);
    if (!existingWidget) {
      // 404 and not 403: an instance owned by someone else must behave as if
      // it did not exist, so its id is never confirmed.
      return res.status(404).json({ error: "Widget not found" });
    }

    const definition = findWidgetDefinition(existingWidget.widgetTypeId);
    if (!definition) {
      return res.status(400).json({
        error: "Invalid input",
        details: ["This widget type no longer exists"],
      });
    }

    const details = [
      ...(params === undefined ? [] : validateParams(definition.widget, params)),
      ...(refreshRate === undefined ? [] : validateRefreshRate(refreshRate)),
      ...(position === undefined ? [] : validatePosition(position)),
    ];

    if (details.length > 0) {
      return res.status(400).json({ error: "Invalid input", details });
    }

    const updatedWidget = await updateWidget(req.user!.userId, req.params.id, {
      params:
        params === undefined
          ? undefined
          : normaliseParams(definition.widget, params as Record<string, unknown>),
      refreshRate,
      position,
    });

    // Changing the parameters invalidates the cached data: it was fetched for
    // Paris and the widget now asks for Tokyo.
    if (params !== undefined) {
      await clearWidgetCache(req.params.id);
    }

    return res.json(updatedWidget);
  } catch (error) {
    console.error("[widgets] update failed:", (error as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/widgets/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const wasDeleted = await deleteWidget(req.user!.userId, req.params.id);
    if (!wasDeleted) {
      return res.status(404).json({ error: "Widget not found" });
    }
    return res.status(204).send();
  } catch (error) {
    console.error("[widgets] delete failed:", (error as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
 GET /widgets/:id/data

 Answers the cached data. API.md states this route never calls an external
 API: the Timer feeds the cache in the background.

 Until the Timer exists (Phase 3), an empty cache would leave every widget on
 "pending" forever, with nothing to show. So a miss falls back to fetching
 once, synchronously, and storing the result. The contract seen by the front
 end is unchanged, and the fallback disappears when the worker arrives.
 */
router.get("/widgets/:id/data", requireAuth, async (req: Request, res: Response) => {
  try {
    const widget = await findUserWidget(req.user!.userId, req.params.id);
    if (!widget) {
      return res.status(404).json({ error: "Widget not found" });
    }

    const cached = await findWidgetCache(widget.id);
    if (cached.status !== "pending") {
      return res.json({
        data: cached.data,
        fetchedAt: cached.fetchedAt?.toISOString() ?? null,
        status: cached.status,
        ...(cached.error ? { error: cached.error } : {}),
      });
    }

    const refreshed = await refreshWidgetNow(req.user!.userId, widget.id, widget.widgetTypeId, widget.params);
    return res.json(refreshed);
  } catch (error) {
    console.error("[widgets] data failed:", (error as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
 Fetches a widget's data once and stores it.
 */
async function refreshWidgetNow(
  userId: string,
  widgetId: string,
  widgetTypeId: string,
  params: WidgetParams
) {
  const definition = findWidgetDefinition(widgetTypeId);

  if (!definition) {
    const message = "This widget type no longer exists";
    await saveWidgetError(widgetId, message);
    return { data: null, fetchedAt: new Date().toISOString(), status: "error", error: message };
  }

  try {
    let accessToken: string | undefined;
    if (definition.requiresAuth) {
      // Refreshes the token when needed: a widget must keep working after the
      // initial token expires.
      accessToken = await getValidAccessToken(userId, definition.serviceName);
    }

    const data = await definition.widget.fetch(params, accessToken);
    await saveWidgetData(widgetId, data);

    return { data, fetchedAt: new Date().toISOString(), status: "ok" };
  } catch (error) {
    // The user sees why: a wrong city and a provider outage call for
    // different actions on their side.
    const message =
      error instanceof ExternalApiError || error instanceof TokenUnavailableError
        ? error.message
        : "Les données n'ont pas pu être récupérées.";

    await saveWidgetError(widgetId, message);
    return { data: null, fetchedAt: new Date().toISOString(), status: "error", error: message };
  }
}

export default router;
