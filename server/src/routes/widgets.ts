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
import { refreshWidget, findWidgetDefinition } from "../jobs/refreshWidget";
import {
  scheduleWidgetRefresh,
  removeWidgetRefresh,
  runWidgetRefreshNow,
  describeWidgetJob,
} from "../jobs/queue";
import type { WidgetDefinition } from "../services/types";

const router = Router();

// Widget types and widget instances

const DEFAULT_POSITION: WidgetPosition = { x: 0, y: 0, w: 4, h: 2 };
const MIN_REFRESH_RATE = 30;
const MAX_REFRESH_RATE = 86_400;

/*
 GET /widget-types
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
 Checks the parameters against what the widget declares
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
      // Accepts 3 and "3": a form sends strings, an API client sends numbers
      const parsedValue = typeof value === "string" ? Number(value) : value;
      if (typeof parsedValue !== "number" || !Number.isInteger(parsedValue)) {
        details.push(`${declaredParam.name} must be an integer`);
      }
    } else if (typeof value !== "string") {
      details.push(`${declaredParam.name} must be a string`);
    }
  }

  // An undeclared parameter is rejected rather than ignored: silently
  // dropping it would let a user believe their setting was taken into account
  const declaredNames = new Set(widget.params.map((param) => param.name));
  for (const givenName of Object.keys(params)) {
    if (!declaredNames.has(givenName)) {
      details.push(`${givenName} is not a parameter of this widget`);
    }
  }
  return details;
}

/* Normalises the parameters to their declared types before storing them */
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

/* True when the user may use this widget: no auth needed, or account linked */
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
    // The Timer picks it up from here: one repeatable job per instance, at
    // its own refresh rate (C9)
    await scheduleWidgetRefresh(
      createdWidget.id,
      req.user!.userId,
      createdWidget.widgetTypeId,
      createdWidget.params,
      createdWidget.refreshRate
    );

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
      // it did not exist, so its id is never confirmed
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

    if (!updatedWidget) {
      return res.status(404).json({ error: "Widget not found" });
    }

    /*
     Only two changes concern the job, and telling them apart matters
     */
    const intervalChanged = refreshRate !== undefined && refreshRate !== existingWidget.refreshRate;
    const paramsChanged =
      params !== undefined &&
      JSON.stringify(updatedWidget.params) !== JSON.stringify(existingWidget.params);

    if (intervalChanged || paramsChanged) {
      await scheduleWidgetRefresh(
        updatedWidget.id,
        req.user!.userId,
        updatedWidget.widgetTypeId,
        updatedWidget.params,
        updatedWidget.refreshRate
      );
    }

    if (paramsChanged) {
      // The cached data was fetched for Paris and the widget now asks for
      // Tokyo: it must not stay on screen
      await clearWidgetCache(req.params.id);

      // And a refresh is queued at once, otherwise the block would sit empty
      // until the next tick up to an hour for a slow widget
      await runWidgetRefreshNow(
        updatedWidget.id,
        req.user!.userId,
        updatedWidget.widgetTypeId,
        updatedWidget.params
      );
    }

    return res.json(updatedWidget);
  } catch (error) {
    console.error("[widgets] update failed:", (error as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
 GET /widgets/:id/job
 */
router.get("/widgets/:id/job", requireAuth, async (req: Request, res: Response) => {
  try {
    const widget = await findUserWidget(req.user!.userId, req.params.id);
    if (!widget) {
      return res.status(404).json({ error: "Widget not found" });
    }

    const jobState = await describeWidgetJob(widget.id);

    return res.json({
      // What the user configured
      refreshRate: widget.refreshRate,
      // What the queue is really doing null means no job is scheduled,
      // which happens when the worker has never run
      scheduled: jobState !== null,
      intervalSeconds: jobState?.intervalSeconds ?? null,
      nextRunAt: jobState?.nextRunAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("[widgets] job state failed:", (error as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/widgets/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const wasDeleted = await deleteWidget(req.user!.userId, req.params.id);
    if (!wasDeleted) {
      return res.status(404).json({ error: "Widget not found" });
    }
    // Left behind, the job would keep firing on a row that no longer exists
    await removeWidgetRefresh(req.params.id);
    return res.status(204).send();
  } catch (error) {
    console.error("[widgets] delete failed:", (error as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
 GET /widgets/:id/data
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
    const refreshed = await refreshWidget(req.user!.userId, widget.id, widget.widgetTypeId, widget.params);
    return res.json(refreshed);
  } catch (error) {
    console.error("[widgets] data failed:", (error as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

