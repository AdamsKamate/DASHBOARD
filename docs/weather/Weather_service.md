# Weather Service and First Widget

Documentation for **Phase 2 card 2.5**: the first concrete `ServiceProvider`,
without authentication, and the `city_temperature` widget.

Validation criterion: **the widget returns real weather data.**

---

## 1. Why Start with Weather

Of the four planned services, two require OAuth (GitHub and Google) and two do
not (weather and RSS).

Starting with a service **without authentication** validates the entire
registry, `about.json`, widget, parameters, and external-call chain without
mixing these concerns with token handling. When GitHub arrives, only the
authentication part will still need to be tested.

This also guarantees the required quota: even if an OAuth flow gets stuck
during the presentation, weather and RSS provide the minimum services required
by the assignment.

---

## 2. Why Open-Meteo

| Criterion | OpenWeatherMap | **Open-Meteo** |
|---|---|---|
| API key | Required | **None** |
| Account required | Yes | **No** |
| Free quota | 1,000 calls/day | 10,000 calls/day |
| Geocoding included | Yes | **Yes** |

The decisive argument is the same as for MailHog: **reproducibility**. A
reviewer runs `docker-compose up` and the weather widgets work without creating
an account or entering a key.

With OpenWeatherMap, the key would either be committed, which is a security
flaw, or be missing, and the project would not work for the reviewer.

---

## 3. Files

| File | Role |
|---|---|
| `server/src/lib/httpClient.ts` | **Created**: shared third-party API client |
| `server/src/services/weather.ts` | **Rewritten**: complete service |
| `server/scripts/check-weather.ts` | **Created**: verification against the real API |

`weather.ts` has existed since Phase 0, but it was only a skeleton: no timeout,
validation, or HTTP error handling.

---

## 4. The Shared HTTP Client

All four services will call third-party APIs. Three things must be handled each
time, and forgetting one makes a widget difficult to diagnose.

### `fetch` Does Not Throw on a 404

```ts
if (!response.ok) {
  const failure = response.status < 500 ? "rejected" : "provider_error";
  throw new ExternalApiError(failure, `The provider answered ${response.status}`, response.status);
}
```

### A Timeout

```ts
signal: AbortSignal.timeout(timeoutMs)
```

Without one, a provider that never responds would freeze the widget
indefinitely and, in Phase 3, block a worker job.

Eight seconds: nobody waits longer than that for a widget.

### Typed Errors

```ts
export type ExternalApiFailure =
  | "timeout" | "unreachable" | "rejected"
  | "provider_error" | "unreadable" | "rate_limited";
```

The important distinction: **`rejected`** means that our request was wrong,
for example a nonexistent city or invalid parameter, so the user must correct
it. The others are temporary provider failures where there is nothing to ask
of the user.

`rate_limited` has its own case: a 429 means that we are calling too often,
which is our fault, not the user's.

---

## 5. The Service

### Declaration

```ts
export const weatherService: ServiceProvider = {
  name: "weather",
  requiresAuth: false,
  widgets: [cityTemperature, weatherForecast],
};
```

`requiresAuth: false` and the absence of `getOAuthConfig` are enough: the OAuth
routes exclude this service, and any authenticated user can add its widgets
without linking anything.

### The `city_temperature` Widget

```ts
const cityTemperature: WidgetDefinition = {
  name: "city_temperature",
  description: "Displays the current weather for a city",
  params: [{ name: "city", type: "string" }],
  async fetch(params) { ... },
};
```

It has one configurable parameter, complying with the assignment's C8
constraint: a widget without a parameter would be invalid.

What `fetch` returns:

```json
{
  "city": "Paris",
  "country": "France",
  "temperature": 16.4,
  "temperatureUnit": "°C",
  "windSpeed": 11.2,
  "windSpeedUnit": "km/h",
  "condition": "Overcast",
  "weatherCode": 3,
  "observedAt": "2026-10-01T14:00"
}
```

**The unit travels with the value.** The frontend displays `16.4 °C` without
having to know what Open-Meteo returns. If we switched to Fahrenheit one day,
no page would need to change.

**The raw code is preserved** next to the label: the frontend can choose an
icon from `weatherCode`, which a text label alone would not allow.

---

## 6. Weather Codes

Open-Meteo returns a **numeric WMO code**, not a label: `3` means “overcast,”
while `61` means “light rain.”

```ts
const WEATHER_CODE_LABELS: Record<number, string> = {
  0: "Clear sky",
  3: "Overcast",
  61: "Light rain",
  95: "Thunderstorm",
  // ...27 codes in total
};

function describeWeatherCode(code: number): string {
  return WEATHER_CODE_LABELS[code] ?? "Unknown conditions";
}
```

Translation is done **here, not in the frontend**. There are two reasons: the
widget data is readable as-is when inspecting the API, and a future mobile
client would not have to rewrite the table.

The fallback `"Unknown conditions"` prevents `undefined` from being displayed if
Open-Meteo adds a code.

---

## 7. Geocoding Cache

Displaying the weather for Paris requires **two** calls: first converting
“Paris” into coordinates, then requesting the weather for those coordinates.

```ts
const cacheKey = `weather:geocode:${city.toLowerCase()}`;

const cachedCity = await cacheGet<GeocodedCity>(cacheKey);
if (cachedCity) {
  return cachedCity;
}
```

**Paris will not move.** Caching its coordinates for 24 hours removes one of
the two calls on every refresh.

The effect is significant: a dashboard with four weather widgets refreshed
every five minutes goes from 96 calls per hour to 48.

### The Key Is Lowercase

```ts
city.toLowerCase()
```

Without this, “Paris,” “paris,” and “PARIS” would create three entries for the
same city. This is the same logic as normalizing email addresses during
registration.

This is also the first practical use of the Redis cache connected in card 1.5.

---

## 8. Parameter Validation

The server already checks that a parameter is present and has the correct type.
These checks cover its **meaning**:

| Check | Why |
|---|---|
| City is not empty | A single space would be sent to Open-Meteo for no reason |
| City <= 80 characters | An absurd input would return an opaque error |
| `days` is an integer >= 1 | `0` or `2.5` makes no sense |
| `days` <= 16 | This is Open-Meteo's limit, so report it clearly |

The error message says what to correct:

```
The "city" parameter is empty
City not found: "Zzzzqqq"
Open-Meteo provides forecasts for only 16 days
```

### Unknown City: `rejected`, Not `provider_error`

```ts
if (!location) {
  throw new ExternalApiError("rejected", `City not found: "${city}"`);
}
```

Open-Meteo responded correctly with an empty list. This is not an outage: the
user's parameter is wrong, and the user must correct it.

---

## 9. Tests

### Installation

```bash
cd ~/G-WEB-500-PAR-5-1-dashboard-30

docker-compose exec server npx tsc --noEmit -p tsconfig.json
docker-compose up -d --force-recreate server
```

### The Card's Criterion: Real Data

```bash
docker-compose exec server npx ts-node scripts/check-weather.ts
```

Nothing is mocked: the script calls the real Open-Meteo API and displays what it
receives.

### Verify the Cache

Run the script again: the second call for the same city is noticeably faster.
Then inspect Redis:

```bash
docker-compose exec redis redis-cli KEYS 'weather:geocode:*'
docker-compose exec redis redis-cli TTL 'weather:geocode:paris'
```

Expected: the key exists with a TTL close to 86,400 seconds.

### Verify `about.json`

```bash
curl -s http://localhost:8080/about.json | python3 -m json.tool | head -30
```

The `weather` service and its two widgets should appear, each with typed
parameters.

### Summary

| # | Test | Expected |
|---|---|---|
| 1 | Compilation | No errors |
| 2 | `check-weather.ts` | Real, plausible temperatures |
| 3 | Forecasts | Min <= max, readable conditions |
| 4 | Redis cache | `weather:geocode:paris` key, 24-hour TTL |
| 5 | Empty or unknown city | Explicit `rejected` errors |
| 6 | `days = 30` | Rejected with the announced limit |
| 7 | `about.json` | Service and widgets declared |

---

## 10. Questions

**Why no API key?**
Open-Meteo is free and open for non-commercial use. This makes the project
reproducible: no account is needed to run it.

**Why two HTTP calls for one widget?**
Open-Meteo works with coordinates, not city names. The first call geocodes, and
the second requests the weather. The first call is cached for 24 hours, so in
practice there is only one.

**What happens if Open-Meteo goes down?**
The widget enters an `error` state with a message distinguishing a temporary
outage from an invalid parameter. Other widgets continue to work.

**Why translate weather codes on the server?**
So that widget data is readable as-is and a future client does not have to
rewrite the 27-code table.

**How do we add a service now?**
Create a file in `services/`, export a `ServiceProvider`, and register it in
`registry.ts`. `about.json`, the list of widget types, and the Timer will
discover it automatically.

---

## 11. What Remains to Be Done

| Item | Card |
|---|---|
| RSS service, also without authentication | 2.6 |
| GitHub service, the first with OAuth | 2.7 |
| Google service | 2.8 |
| `/widgets` and `/widget-types` server routes | Phase 2 |
| `about.json` generated from the registry | Phase 2 |
| Caching widget data, not just geocoding | Phase 3 |
