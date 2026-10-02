# Dynamically Generated Configuration Form

Documentation for the **"Form generated from `params`"** Phase 2 card: a
generic component that renders a field suited to the declared type, based on
the API response.

Covers constraint **C8**: every widget must be configurable through parameters.

Validation criterion: **adding a widget on the server makes its form appear
without any additional frontend code.**

---

## 1. Why This Is a Critical Part of the Project

The assignment specifies four services and eight widgets, each with its own
parameters: a city, a repository, a feed, a label, and a number of days.

The naive approach would be to write one form per widget:

```tsx
// what NOT to do
{selectedType.id === "city_temperature" && <Input label="City" ... />}
{selectedType.id === "github_commits" && <><Input label="Repository" ... /><Input label="Count" ... /></>}
```

Eight widgets mean eight blocks to write, and every service added in Phase 3 or
as a bonus would require another one. The frontend and server would have to be
changed together every time, exactly the duplication that already caused
`about.json` to diverge from the registry.

Here, **nothing in the frontend knows what a city or repository is**. Everything
is derived from the declaration:

```json
{ "name": "city", "type": "string" }
```

---

## 2. Files

| File | Role |
|---|---|
| `client_web/src/lib/widgets/params.ts` | **Created**: pure logic for conversion, validation, and labels |
| `client_web/src/components/widgets/WidgetParamsForm.tsx` | **Created**: generic component |
| `client_web/src/components/dashboard/AddWidgetPanel.tsx` | **Modified**: uses both |

The separation matters: `params.ts` contains no React code, so conversion and
validation rules can be tested without rendering anything. This made it
possible to verify behavior for widgets the frontend has never seen.

---

## 3. The Complete Chain

```
server: services/weather.ts
    params: [{ name: "city", type: "string" }]
              ¦
              ¦
    GET /widget-types
              ¦
              ¦
frontend: WidgetParamsForm
    ¦--> inputTypeFor("string")  -> <input type="text">
    ¦--> labelFor("city")        -> “City”
    ¦--> validateFieldValues()   -> “This field is required.”
              ¦
              ¦
    toWidgetParams()  -> { city: "Paris" }
              ¦
              ¦
    POST /widgets
```

No link in the chain knows what the parameters mean.

---

## 4. Choosing the Input

```ts
export function inputTypeFor(paramType: AboutParam["type"]): "number" | "text" {
  return paramType === "integer" ? "number" : "text";
}
```

| Declared type | Rendered input | Benefit |
|---|---|---|
| `string` | `type="text"` | Standard keyboard |
| `integer` | `type="number"` + `inputMode="numeric"` + `step="1"` | Numeric keypad on mobile, browser arrows, decimals rejected |

`inputMode="numeric"` is the detail that improves the mobile experience:
without it, the user has to switch their keyboard manually to enter a number.

---

## 5. Values Remain Strings Until Submission

```ts
export type FieldValues = Record<string, string>;
```

An HTML input always returns text, even with `type="number"`. Converting on
every keystroke creates a concrete problem: typing `-5` goes through the
intermediate state `-`, which becomes `NaN` as soon as it is converted. The
field would disappear under the user's fingers.

Conversion happens **once**, on submission:

```ts
widgetParams[param.name] =
  param.type === "integer" && rawValue !== "" ? Number(rawValue) : rawValue;
```

### An Empty Integer Field Remains an Empty String

This is intentional. `Number("")` returns `0`, and sending `0` would make the
server believe that the user entered zero. Leaving `""` lets the server return
“days is required,” which identifies the actual problem.

---

## 6. Field-by-Field Validation

```ts
export function validateFieldValues(params, fieldValues): FieldErrors
```

It returns **one message for each invalid field**, rather than one message for
the entire form:

```ts
{ city: "This field is required.", days: "Enter an integer." }
```

The user sees which field to correct, directly below the relevant input. A
global message would force them to search.

### What It Checks

| Rule | Why |
|---|---|
| Field is not empty | All declared parameters are required |
| Whitespace-only values are empty | `"   "` is not a city |
| `integer` is an integer | `2.5` or `12abc` would be rejected by the server |

### What It Does Not Check

A **negative** integer passes here. The frontend does not know that a number of
days must be positive while an offset could be negative: that knowledge belongs
to the service on the server, which returns `400` with a precise message.

The frontend validates what it can infer from the **type**; the server validates
its **meaning**. This separation keeps the form generic.

---

## 7. Labels

```ts
export function labelFor(paramName: string): string
```

| Technical name | Display label |
|---|---|
| `city` | City |
| `refresh_rate` | Refresh rate |
| `api-key` | Api key |
| `apiKeyName` | Api Key Name |

A translation table would look nicer, with labels such as “City” and
“Repository,” but it would need to be completed **every time a widget is added
on the server**. That would be precisely the additional frontend code this
card removes.

The technical name remains visible as a `placeholder`: anyone configuring a
widget sees the same vocabulary as the API documentation.

---

## 8. Two Forms on the Same Page

```tsx
<WidgetParamsForm idPrefix={`add-${selectedType.id}`} ... />
```

The prefix serves two purposes.

**IDs remain unique.** Adding a widget while another is being reconfigured
would otherwise create two inputs with the same `id`, causing labels to point
to the wrong field.

**Changing type replaces the fields.** The prefix is included in the React
`key`: switching from `city_temperature` to `github_commits` destroys the old
inputs instead of reusing them. Without this, the value entered for “city” could
reappear in the “repo” field.

---

## 9. What the Refactor Removed

`AddWidgetPanel` used to contain its own conversion and field loop. Both have
moved into shared modules.

The benefit will appear in the next card: **reconfiguring an existing widget**
will reuse exactly the same building blocks, with `toFieldValues()` to
prepopulate the form from the current configuration.

```ts
// already written, waiting for the reconfiguration card
export function toFieldValues(params, widgetParams): FieldValues
```

---

## 10. Tests

### Installation

```bash
docker-compose exec client_web npx tsc --noEmit -p tsconfig.json
docker-compose restart client_web
```

### In the Browser, in Mock Mode

Log in with `demo@dashboard.dev` / `password123`, then open `Add a widget` on
the dashboard.

| # | Action | Expected |
|---|---|---|
| 1 | Choose `city_temperature` | **One** field: City, as text |
| 2 | Choose `weather_forecast` | **Two** fields: City as text, Days as a number |
| 3 | Click the Days field | Browser up/down arrows |
| 4 | Submit without entering anything | “This field is required.” below each field |
| 5 | Enter `2.5` in Days | “Enter an integer.” |
| 6 | Change type while entering values | Fields are cleared, not mixed |
| 7 | Fill in `Lyon` / `3`, then submit | The widget is created |
| 8 | Choose `github_commits` | Repository and Count fields, with no dedicated code |

Points 1, 2, and 8 are the demonstration: three different widgets, three
different forms, **zero lines written for each one**.

### Demonstrating the Card's Criterion Live

This is the demonstration to perform in front of the reviewers.

Open `client_web/src/lib/mock/db.ts` and add an invented widget:

```ts
{
  id: "demo_widget",
  service: "weather",
  description: "Widget invented during the presentation",
  params: [
    { name: "title", type: "string" },
    { name: "height", type: "integer" },
  ],
},
```

Reload the page, open `Add a widget`, and choose `demo_widget`: **its form
exists**, with a text field and a number field, even though no frontend code was
written specifically for it.

In real conditions, the same thing happens when adding a widget to a
`ServiceProvider` on the server.

### Summary

| # | Test | Expected |
|---|---|---|
| 1 | `string` | Text input |
| 2 | `integer` | Number input, numeric keypad, decimals rejected |
| 3 | Empty field | Message below the relevant field |
| 4 | Decimal for an integer | Dedicated message |
| 5 | Type change | Fields replaced, values not mixed |
| 6 | Submission | `integer` is sent as a number, `string` as a string |
| 7 | Widget unknown to the frontend | Form generated anyway |

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| No field appears | The widget declares no parameters | Add one (C8) |
| Number field accepts decimals | `step` is missing | Check `step={1}` in the component |
| Server says “days must be an integer” | Conversion was not performed | Check `toWidgetParams` |
| A value persists after changing type | `key` has no prefix | Check `idPrefix` |
| Labels are lowercase | `labelFor` is not used | Check the component import |

---

## 12. Questions

**Why not translate labels into French?**
A translation table would have to be completed every time a widget is added on
the server. That would be the additional frontend code this card removes. The
technical name is derived automatically and remains consistent with the API.

**Why validate on the frontend if the server already validates?**
To respond instantly without a network round trip. Server-side validation
remains the only real guarantee: frontend validation can be bypassed with
browser tools.

**Why are values strings?**
Because an HTML input returns text. Converting on every keystroke would break
negative-number input: `-` alone becomes `NaN` and the field would be cleared.

**What if a `boolean` type appeared?**
`about.json` allows only `string` and `integer`, and the TypeScript type enforces
that. Adding `boolean` would require one line in `inputTypeFor` and one in
validation; the component itself would not change.

---

## 13. What Remains to Be Done

| Item | Card |
|---|---|
| Reconfiguring an existing widget (C10) | Phase 2 |
| `/widgets` server routes | Phase 2 |
| GitHub, Google, and RSS providers | Phase 2 |

`toFieldValues()` has already been written and tested. It is waiting for the
reconfiguration card, which will open the same form prepopulated with the
widget's current configuration.
