import { query, transaction } from "../index";
import { registry } from "../../services/registry";

// The services and widget_types tables reflect what the registry declares.
// Adding a service to registry.ts is enough to make it appear in the database
// at the next startup.

export interface ServiceRow {
  id: string;
  name: string;
  requires_auth: boolean;
}

export interface WidgetTypeRow {
  id: string;
  service_id: string;
  name: string;
  description: string | null;
  params_schema: Array<{ name: string; type: "string" | "integer" }>;
}

/*
 Idempotent: running it again does not create duplicates; it updates
 descriptions and parameter schemas that may have changed.
 */
export async function syncRegistryToDatabase(): Promise<void> {
  await transaction(async (client) => {
    for (const service of registry) {
      await client.query(
        `INSERT INTO services (id, name, requires_auth)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name,
               requires_auth = EXCLUDED.requires_auth`,
        [service.name, service.name, service.requiresAuth]
      );

      for (const widget of service.widgets) {
        await client.query(
          `INSERT INTO widget_types (id, service_id, name, description, params_schema)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (id) DO UPDATE
             SET service_id    = EXCLUDED.service_id,
                 name          = EXCLUDED.name,
                 description   = EXCLUDED.description,
                 params_schema = EXCLUDED.params_schema`,
          [
            widget.name,
            service.name,
            widget.name,
            widget.description,
            JSON.stringify(widget.params),
          ]
        );
      }
    }
  });

  const serviceCount = registry.length;
  const widgetCount = registry.reduce((n, s) => n + s.widgets.length, 0);
  console.log(
    `[db] registry synchronized: ${serviceCount} service(s), ${widgetCount} widget(s)`
  );
}

export async function listServices(): Promise<ServiceRow[]> {
  return query<ServiceRow>("SELECT * FROM services ORDER BY id");
}

export async function listWidgetTypes(): Promise<WidgetTypeRow[]> {
  return query<WidgetTypeRow>("SELECT * FROM widget_types ORDER BY service_id, id");
}

/*
 A service without authentication is available by default; it does not need
 a row in user_services.
 */
export async function listUserSubscriptions(userId: string): Promise<string[]> {
  const rows = await query<{ service_id: string }>(
    "SELECT service_id FROM user_services WHERE user_id = $1",
    [userId]
  );
  return rows.map((r) => r.service_id);
}
