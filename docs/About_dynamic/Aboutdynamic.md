# `about.json` generated from the registry

Documentation for card **2.6 of Phase 2**: replacing hardcoded Phase 0 data with an automatic iteration over the `ServiceProvider` registry.

Covers subject constraint **C2**: `GET /about.json` in the imposed format.  
Validation criterion: **adding a service to the registry makes it appear in `about.json` without any other code changes.**

---

## 1. The problem this card fixes

Since Phase 0, the list of services existed in **two places**:

```
services/registry.ts     the ground truth for the server
routes/about.ts          a manually written duplicate for about.json
```

The two had already diverged. At startup, the logs stated:

```
[db] registry synchronized: 1 service(s), 2 widget(s)
```

whereas `about.json` declared four services and eight widgets. The file was announcing services unknown to the server an evaluator attempting to hit a GitHub widget endpoint would have encountered an error after reading that it existed.

The issue was duplication, not oversight: maintaining two manual lists always leads to divergence.

---

## 2. What changes

```ts
services: buildAboutServices()
```

The route iterates over the registry. Adding a service to `registry.ts` is now all it takes for it to show up in `about.json`.

### Before

```ts
services: [
  { name: "weather", widgets: [ /* 40 manually written lines */ ] },
  { name: "rss",     widgets: [ /* ... */ ] },
  { name: "github",  widgets: [ /* ... */ ] },
  { name: "google",  widgets: [ /* ... */ ] },
]
```

### After

```ts
export function buildAboutServices(): AboutService[] {
  return registry.map(toAboutService);
}
```

This is the concrete benefit of the `ServiceProvider` pattern selected in Phase 0: a widget's definition its name, description, and required parameters lives in a single place, and everything else derives from it.

---

## 3. Files

| File | Role |
|---|---|
| `server/src/routes/about.ts` | **Rewritten**: registry iteration, quota enforcement check |
| `server/src/index.ts` | Modified: invokes `checkRegistryQuota()` on startup |

---

## 4. What is exposed vs. what is kept hidden

```ts
function toAboutService(provider: ServiceProvider): AboutService {
  return {
    name: provider.name,
    widgets: provider.widgets.map((widget) => ({
      name: widget.name,
      description: widget.description,
      params: widget.params.map((param) => ({ name: param.name, type: param.type })),
    })),
  };
}
```

The mapping is explicit, property by property. Returning the provider object directly would have exposed:

| Field | Why it must not leak |
|---|---|
| `requiresAuth` | Not required by the spec for this endpoint |
| `getOAuthConfig` | Contains the `client_secret` |
| `fetch` | A function, which silently drops during JSON serialization |

`about.json` is **public**: it answers unauthenticated queries. Everything in it can be read by anyone.

### Parameters are deep-copied

```ts
params: widget.params.map((param) => ({ name: param.name, type: param.type }))
```

Rather than passing the array as-is. Without this copy, any code mutating the response would mutate the **live definition** of the widget for the whole server process. A test verifies this isolation.

---

## 5. Startup quota check

```ts
const TEAM_SIZE = 2;
const REQUIRED_SERVICE_COUNT = 1 + TEAM_SIZE;   // 3
const REQUIRED_WIDGET_COUNT = 3 * TEAM_SIZE;    // 6
```

The assignment requires `(1 + X)` services and `(3 × X)` widgets for a team of X members. For a team of two: three services, six widgets.

At startup, logs show current progress:

```
[about] registry below the assignment quota: 1/3 service(s), 2/6 widget(s)
```

then, once RSS and GitHub are integrated:

```
[about] registry: 3 service(s), 6 widget(s), quota satisfied
```

### Warning vs. Error

Refusing to start the server because a service is still being developed would block the entire team. A warning is sufficient: it remains visible in the daily startup logs and disappears once the quota is reached.

### The C8 Constraint Check

```ts
if (widget.params.length === 0) {
  console.warn(`[about] widget "${provider.name}/${widget.name}" declares no parameter (C8)`);
}
```

The subject specifies that a widget without configurable parameters is invalid. Catching this at startup is much cheaper than discovering it during evaluation when `about.json` is inspected.

The log message explicitly names the culprit widget: `weather/city_temperature`, rather than a generic warning.

---

## 6. Traps in the imposed format

Two details mandated by the spec that are easy to get wrong:

### `current_time` is in seconds

```ts
current_time: Math.floor(Date.now() / 1000)
```

`Date.now()` returns **milliseconds**. Omitting the division produces a number 1000 times too large, and neither TypeScript nor the browser will complain. The evaluator, however, will see a timestamp in the year 57000.

An automated test checks that the timestamp consists of exactly ten digits.

### `client.host` must be a plain IPv4 address

```ts
return rawAddress.replace(/^::ffff:/, "");
```

Inside Docker containers, Express often receives `::ffff:172.18.0.1` n IPv4 address mapped inside an IPv6 structure. The spec example requires a plain IPv4 string like `10.101.53.35`, so the prefix is stripped.

---

## 7. Testing

### Installation & Verification

```bash
cd ~/G-WEB-500-PAR-5-1-dashboard-30

docker-compose exec server npx tsc --noEmit -p tsconfig.json
docker-compose up -d --force-recreate server
docker-compose logs --tail=15 server
```

Expected startup logs:

```
[db] registry synchronized: 1 service(s), 2 widget(s)
[about] registry below the assignment quota: 1/3 service(s), 2/6 widget(s)
Server listening on port 8080
```

The two log entries now **match**. Prior to this card, `about.json` reported four services while the database only had one registered.

### Inspecting Endpoint Consistency

```bash
curl -s http://localhost:8080/about.json | python3 -m json.tool
```

Expected: a single service, `weather`, with its two widgets matching `registry.ts` exactly.

```bash
curl -s http://localhost:8080/about.json \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['server']['services']; \
    print(len(d), 'service(s),', sum(len(s['widgets']) for s in d), 'widget(s)')"
```

### Validating the Card Criterion

Uncomment a line in `registry.ts` when a new service is written:

```ts
export const registry: ServiceProvider[] = [
  weatherService,
  rssService,        // <- single line added
];
```

Then, **without editing `about.ts`**:

```bash
docker-compose restart server
curl -s http://localhost:8080/about.json | grep -c '"name"'
```

The service and its widgets appear automatically. This demonstrates compliance for the defense: a single line added to the registry automatically updates the mandated endpoint.

### Format Validation Script

```bash
curl -s http://localhost:8080/about.json | python3 -c "
import sys, json, time
payload = json.load(sys.stdin)
print('structure   :', list(payload.keys()))
print('host        :', payload['client']['host'])
current = payload['server']['current_time']
print('current_time:', current, '->', 'seconds' if len(str(current)) == 10 else 'ISSUE')
print('delta       :', abs(current - int(time.time())), 's')
types = {p['type'] for s in payload['server']['services'] for w in s['widgets'] for p in w['params']}
print('param types :', types)
"
```

Expected: `['client', 'server']`, a 10-digit `current_time`, zero time delta, and param types limited exclusively to `string` and `integer`.

### Summary

| # | Test | Expected |
|---|---|---|
| 1 | Startup logs | Registry and quota logs align |
| 2 | `about.json` output | Mirrors `registry.ts` exactly |
| 3 | Adding a service | Appears without modifying `about.ts` |
| 4 | `current_time` | 10 digits, zero delta |
| 5 | `client.host` | Clean IPv4, no `::ffff:` prefix |
| 6 | Parameter types | `string` or `integer` only |
| 7 | Leak checks | No `clientSecret`, no OAuth URLs |

---

## 8. Troubleshooting

| Symptom | Cause | Solution |
|---|---|---|
| `about.json` lists only 1 service | **Normal**: registry currently contains only one | Add RSS and GitHub services |
| `below the assignment quota` | Registry incomplete | Same as above |
| `declares no parameter (C8)` | A widget lacks parameters | Add a parameter or remove the widget |
| `current_time` has 13 digits | Milliseconds not converted | Apply `Math.floor(Date.now() / 1000)` |
| `client.host` contains `::ffff:` | Missing IP normalization | Ensure `.replace(/^::ffff:/, "")` is active |
| Written service doesn't appear | Service omitted from export | Register it in `registry.ts` |

The last case is now the **only** possible cause for a missing service: there is no longer a second hardcoded list to maintain.

---

## 9. FAQ

**Why was `about.json` incorrect before?**  
The service list was hardcoded inside the route independently of the registry. Two sources of truth always diverge. It is now dynamically derived from the registry, which acts as the sole source of truth.

**How do I add a new service now?**  
Create a new file in `services/`, export a `ServiceProvider`, and register it in `registry.ts`. The `about.json` endpoint, the widget types listing, and the update Timer will pick it up automatically.

**Why isn't `requiresAuth` included in `about.json`?**  
The project specification does not request it on this public endpoint. Authenticated frontends retrieve this metadata via `GET /widget-types`.

**Why issue a startup warning instead of throwing an error?**  
Blocking server startup during active development of individual services would hinder team productivity. The warning stays visible in logs and resolves naturally when the quota is met.

---

## 10. Next Steps

| Item | Card |
|---|---|
| RSS Service: brings total to 2 services, 4 widgets | 2.7 |
| GitHub Service: meets the 3 services, 6 widgets quota | 2.8 |
| Google Service: brings total to 4 services, 8 widgets | 2.9 |
| `/widget-types` and `/widgets` routes | Phase 2 |

The quota warning will clear automatically upon registering the third service, signaling full compliance with constraint C7.