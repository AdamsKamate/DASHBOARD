"use client";

import { useEffect, useState } from "react";
import { api, ApiError, USE_MOCK } from "../../lib/api";

// /dev : API contract smoke test.
// Runs every route of API.md from the browser and displays the result.


interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

async function expectStatus(promise: Promise<unknown>, status: number): Promise<string> {
  try {
    await promise;
    return `expected ${status}, got success`;
  } catch (err) {
    if (err instanceof ApiError && err.status === status) return "";
    return `expected ${status}, got ${err instanceof ApiError ? err.status : String(err)}`;
  }
}

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (label: string, ok: boolean, detail = "") => checks.push({ label, ok, detail });

  try {
    await api.auth.logout();

    const about = await api.about();
    const widgetCount = about.server.services.reduce((n, s) => n + s.widgets.length, 0);
    add("GET /about.json", about.server.services.length >= 3 && widgetCount >= 6,
      `${about.server.services.length} services, ${widgetCount} widgets`);

    add("GET /auth/me without session -> 401", (await expectStatus(api.auth.me(), 401)) === "");
    add("POST /auth/login unconfirmed -> 403",
      (await expectStatus(api.auth.login({ email: "pending@dashboard.dev", password: "password123" }), 403)) === "");
    add("POST /auth/login wrong password -> 401",
      (await expectStatus(api.auth.login({ email: "demo@dashboard.dev", password: "wrong-password" }), 401)) === "");

    const email = `check-${Date.now()}@dashboard.dev`;
    const reg = await api.auth.register({ email, password: "password123" });
    add("POST /auth/register -> 201", !!reg.message, reg.message);
    add("POST /auth/register duplicate -> 409",
      (await expectStatus(api.auth.register({ email, password: "password123" }), 409)) === "");
    add("POST /auth/register invalid -> 400",
      (await expectStatus(api.auth.register({ email: "nope", password: "short" }), 400)) === "");

    const login = await api.auth.login({ email: "demo@dashboard.dev", password: "password123" });
    add("POST /auth/login -> 200", login.user.email === "demo@dashboard.dev", `role: ${login.user.role}`);

    const me = await api.auth.me();
    add("GET /auth/me -> 200", me.email === "demo@dashboard.dev", me.id);

    const services = await api.services.list();
    add("GET /services", services.length === 4,
      services.map((s) => `${s.name}:${s.subscribed ? "on" : "off"}`).join(" "));

    const types = await api.widgetTypes.list();
    add("GET /widget-types", types.length === 8 && types.every((t) => t.params.length > 0),
      `${types.length} types, all configurable`);

    const created = await api.widgets.create({
      widgetTypeId: "city_temperature", params: { city: "Lyon" }, refreshRate: 60,
    });
    add("POST /widgets -> 201", created.params.city === "Lyon", created.id);

    add("POST /widgets bad params -> 400",
      (await expectStatus(api.widgets.create({ widgetTypeId: "weather_forecast", params: { city: "X" }, refreshRate: 60 }), 400)) === "");
    add("POST /widgets refreshRate < 30 -> 400",
      (await expectStatus(api.widgets.create({ widgetTypeId: "city_temperature", params: { city: "X" }, refreshRate: 5 }), 400)) === "");
    add("POST /widgets unsubscribed service -> 403",
      (await expectStatus(api.widgets.create({ widgetTypeId: "google_calendar_next", params: { count: 3 }, refreshRate: 60 }), 403)) === "");

    const first = await api.widgets.data(created.id);
    add("GET /widgets/:id/data first read -> pending", first.status === "pending");
    const second = await api.widgets.data(created.id);
    add("GET /widgets/:id/data -> ok", second.status === "ok", JSON.stringify(second.data));

    const moved = await api.widgets.update(created.id, { position: { x: 4, y: 0, w: 2, h: 2 } });
    add("PATCH /widgets/:id", moved.position.x === 4);

    await api.widgets.update(created.id, { params: { city: "error" } });
    await api.widgets.data(created.id);
    const failing = await api.widgets.data(created.id);
    add("GET /widgets/:id/data -> error state", failing.status === "error", failing.error ?? "");

    await api.widgets.remove(created.id);
    add("DELETE /widgets/:id", (await expectStatus(api.widgets.data(created.id), 404)) === "");

    add("GET /admin/users as user -> 403", (await expectStatus(api.admin.listUsers(), 403)) === "");
    await api.auth.login({ email: "admin@dashboard.dev", password: "password123" });
    const users = await api.admin.listUsers();
    add("GET /admin/users as admin -> 200", users.length >= 3, `${users.length} users`);

    await api.auth.logout();
    add("POST /auth/logout", (await expectStatus(api.auth.me(), 401)) === "");
  } catch (err) {
    add("Unexpected failure", false, err instanceof Error ? err.message : String(err));
  }
  return checks;
}

export default function DevPage() {
  const [checks, setChecks] = useState<Check[] | null>(null);

  useEffect(() => {
    runChecks().then(setChecks);
  }, []);

  const passed = checks?.filter((c) => c.ok).length ?? 0;

  return (
    <main className="mx-auto max-w-3xl p-8 font-mono text-sm">
      <h1 className="text-xl font-bold">API contract check</h1>
      <p className="mt-1 text-slate-500">
        Mode: <strong>{USE_MOCK ? "mock" : "real server"}</strong>
      </p>

      {!checks && <p className="mt-6">Running checks...</p>}

      {checks && (
        <>
          <p className={`mt-6 font-bold ${passed === checks.length ? "text-green-700" : "text-red-700"}`}>
            {passed} / {checks.length} passed
          </p>
          <ul className="mt-4 space-y-1">
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? "text-green-700" : "text-red-700"}>
                {c.ok ? "[OK]  " : "[FAIL]"} {c.label}
                {c.detail && <span className="text-slate-500"> — {c.detail}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
