import { Router, Request, Response } from "express";
import { registry } from "../services/registry";
import type { ServiceProvider } from "../services/types";

// GET /about.json - the endpoint the assignment imposes.

/* The team size X, from the assignment: (1 + X) services, (3 * X) widgets. */
const TEAM_SIZE = 2;
const REQUIRED_SERVICE_COUNT = 1 + TEAM_SIZE;
const REQUIRED_WIDGET_COUNT = 3 * TEAM_SIZE;

interface AboutWidget {
  name: string;
  description: string;
  params: Array<{ name: string; type: "string" | "integer" }>;
}

interface AboutService {
  name: string;
  widgets: AboutWidget[];
}

/**
 * Extracts the client's IP address.
 *
 * Behind Docker, Express often returns an IPv6-mapped IPv4 address
 * (::ffff:172.18.0.1). The assignment's example shows a plain IPv4, so the
 * prefix is stripped.
 */
function getClientHost(req: Request): string {
  const rawAddress =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
    req.socket.remoteAddress ||
    req.ip ||
    "";
  return rawAddress.replace(/^::ffff:/, "");
}

/*
 Turns a provider into the shape about.json expects.
 */
function toAboutService(provider: ServiceProvider): AboutService {
  return {
    name: provider.name,
    widgets: provider.widgets.map((widget) => ({
      name: widget.name,
      description: widget.description,
      // Copied rather than passed by reference: a JSON serialiser must never
      // be able to reach the live definition of a widget.
      params: widget.params.map((param) => ({ name: param.name, type: param.type })),
    })),
  };
}

/* The services section of about.json, straight from the registry. */
export function buildAboutServices(): AboutService[] {
  return registry.map(toAboutService);
}

/*
 Warns at startup when the registry does not satisfy the assignment.
 */
export function checkRegistryQuota(): void {
  const serviceCount = registry.length;
  const widgetCount = registry.reduce((total, provider) => total + provider.widgets.length, 0);

  if (serviceCount < REQUIRED_SERVICE_COUNT || widgetCount < REQUIRED_WIDGET_COUNT) {
    console.warn(
      `[about] registry below the assignment quota: ` +
        `${serviceCount}/${REQUIRED_SERVICE_COUNT} service(s), ` +
        `${widgetCount}/${REQUIRED_WIDGET_COUNT} widget(s)`
    );
  } else {
    console.log(
      `[about] registry: ${serviceCount} service(s), ${widgetCount} widget(s), quota satisfied`
    );
  }
  // C8: a widget with no parameter is invalid. Catching it at startup is far
  // cheaper than discovering it when a grader reads about.json.
  for (const provider of registry) {
    for (const widget of provider.widgets) {
      if (widget.params.length === 0) {
        console.warn(
          `[about] widget "${provider.name}/${widget.name}" declares no parameter (C8)`
        );
      }
    }
  }
}

const router = Router();

router.get("/about.json", (req: Request, res: Response) => {
  res.json({
    client: {
      host: getClientHost(req),
    },
    server: {
      // Unix timestamp in SECONDS, as the assignment's example shows.
      // Date.now() returns milliseconds: forgetting the division gives a
      // number a thousand times too large, and nothing complains.
      current_time: Math.floor(Date.now() / 1000),
      services: buildAboutServices(),
    },
  });
});

export default router;
