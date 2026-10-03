# "Add a widget" modal

Documentation for the Phase 2 **"Add a widget" modal** feature:
the complete flow for creating an instance, from choosing its type to
confirmation.

Covers constraints **C9** (per-instance refresh interval) and
**C10** (instance creation).

---

## 1. The flow

```
   [ Add a widget ]
            |
   +----------------+
   | 1. Type         |  grouped by service, with description
   +----------------+  and parameter count
            |
   +--------|--------+
   | 2. Configuration|  fields generated from params
   +--------|--------+  validated before continuing
            |
   +----------------+
   | 3. Refresh      |  presets + custom value
   +----------------+  summary
            |
      POST /widgets
```

---

## 2. Why steps

The previous screen was a single panel inserted into the page flow.
This caused two concrete problems.

**It pushed the grid down.** When the panel opened, the widgets disappeared
below the fold: users could no longer see the dashboard they were editing.

**Everything appeared at once.** A widget with three parameters displayed six
fields without hierarchy: type, parameters, and interval, with no indication
of what should come first.

Three steps solve both problems: the modal overlays the page without moving the
grid, and each step asks for only one decision.

---

## 3. Files

| File | Role |
|---|---|
| `client_web/src/components/Modal.tsx` | **Created**: accessible, reusable dialog |
| `client_web/src/lib/widgets/refresh.ts` | **Created**: interval validation and label |
| `client_web/src/components/dashboard/AddWidgetModal.tsx` | **Created**: the flow |
| `client_web/src/components/dashboard/AddWidgetPanel.tsx` | **Deleted**: replaced |
| `client_web/src/app/dashboard/page.tsx` | **Modified**: import and element |

---

## 4. The hand-written modal

Four behaviors make a dialog usable without a mouse. Writing them ourselves in
forty lines is easier to justify than adding another dependency.

### Focus enters, then returns

```ts
previouslyFocused.current = document.activeElement as HTMLElement;
const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
firstFocusable?.focus();

return () => {
  previouslyFocused.current?.focus();
};
```

Focus moves to the first field, not the dialog itself, so users can type
immediately. When the modal closes, focus returns to the "Add a widget" button
instead of sending users back to the top of the page.

### Tab cycles inside

Without a focus trap, `Tab` leaves the dialog and moves through the page behind
it, which users cannot see. The key is therefore intercepted at both ends of
the focusable element list.

### Escape closes

Expected behavior for any dialog. Clicking the backdrop does the same.

### The page behind no longer scrolls

```ts
document.body.style.overflow = "hidden";
```

Without this, the mouse wheel scrolls the content beneath a dialog that does
not move, which is a very unpleasant experience.

### ARIA attributes

```tsx
role="dialog" aria-modal="true" aria-labelledby="modal-title"
```

`aria-modal` tells a screen reader to ignore the rest of the page.
`aria-labelledby` makes it announce "Add a widget" when the modal opens.

---

## 5. Step 1: type

Widgets are **grouped by service**:

```
WEATHER
  city_temperature    Displays the current weather for a city
                      1 parameter to configure
  weather_forecast    Displays the forecast for N days
                      2 parameters to configure
```

With four services and eight widgets, a flat dropdown would require users to
read every entry. Grouping follows the structure the server already exposes in
`about.json`.

Each entry displays its description and parameter count, so users know what to
expect before clicking.

Only **available** widgets are offered:

```ts
const subscribedServiceNames = new Set(
  services.filter((service) => service.subscribed).map((service) => service.name)
);
```

Offering a GitHub widget to someone who has not linked their account would make
them fill out a form only to receive a `403`.

---

## 6. Step 2: configuration

This step reuses `WidgetParamsForm`, the generic component from the previous
feature. Nothing here is specific to any individual widget.

### Validation happens when leaving the step

```ts
function goToRefreshStep() {
  const validationErrors = validateFieldValues(selectedType.params, fieldValues);
  setFieldErrors(validationErrors);
  if (hasNoError(validationErrors)) {
    setStep("refresh");
  }
}
```

Not on every keystroke: displaying "This field is required." while the user is
typing their first letter is distracting and unnecessary.

---

## 7. Step 3: refresh interval (C9)

### Presets first

```ts
export const REFRESH_PRESETS = [
  { seconds: 60, label: "1 min" },
  { seconds: 300, label: "5 min" },
  { seconds: 900, label: "15 min" },
  { seconds: 3600, label: "1 h" },
];
```

Four buttons cover most needs. The custom field remains available for
everything else.

### The interval is written out

```
This widget will update every 5 minutes.
```

`300` is not immediately meaningful. The sentence updates on every keystroke.

Two special cases matter: `60` produces "every minute" rather than "every 1
minutes", and `5400` produces "every 1.5 hours".

### The minimum is explained

```ts
if (seconds < MIN_REFRESH_RATE_SECONDS) {
  return `Minimum ${MIN_REFRESH_RATE_SECONDS} seconds, to protect service quotas.`;
}
```

The message explains **why**. A user who reads "minimum 30 seconds" without a
reason may see an arbitrary limit; with the reason, they understand that an
overactive dashboard could exhaust Open-Meteo or GitHub quotas.

### A summary before confirmation

The selected widget and every entered parameter are shown again. Users can
review the important details without going back after configuring them two
steps earlier.

---

## 8. Server errors return to the right step

```ts
if (error instanceof ApiError && error.status === 400) {
  setSubmitError({ message: "The configuration contains an error:", details: error.details });
  setStep("config");
}
```

The server validates the data too, and knows things the frontend does not: for
example, whether a city exists or a repository is accessible. When it rejects
the request, the modal **returns to the configuration step** instead of showing
the error on the refresh screen, where there is nothing to fix.

A `403` stays on the current screen: it means the service is not linked, and
the fix must be made on the Services page.

---

## 9. Tests

### Setup

```bash
docker-compose exec client_web npx tsc --noEmit -p tsconfig.json
docker-compose restart client_web
```

### The flow in mock mode

Log in with `demo@dashboard.dev`, then select "Add a widget".

| # | Action | Expected |
|---|---|---|
| 1 | Open the modal | It overlays the page; the grid remains visible |
| 2 | Read the indicator | "1. Widget type" is blue |
| 3 | Choose `weather_forecast` | Moves to step 2 with two fields |
| 4 | Continue without filling fields | "This field is required." appears under each field |
| 5 | Fill in fields and continue | Step 3 appears with the summary |
| 6 | Click "5 min" | The field displays 300 |
| 7 | Enter `10` | "Minimum 30 seconds, to protect service quotas" |
| 8 | Enter `90` | "will update every 2 minutes" |
| 9 | Select "Back" | Entered values are preserved |
| 10 | Select "Add the widget" | The block appears in the grid |

### Keyboard-only, without a mouse

| # | Action | Expected |
|---|---|---|
| 1 | Open the modal | Focus is on the first element |
| 2 | Press `Tab` through the last element, then `Tab` again | Returns to the first; focus does not leave |
| 3 | Press `Shift + Tab` from the first | Moves to the last |
| 4 | Press `Escape` | The modal closes |
| 5 | After closing | Focus returns to "Add a widget" |

This demonstrates the accessibility requirement: the complete flow can be
performed without a mouse.

### Summary

| # | Test | Expected |
|---|---|---|
| 1 | Interval validation | Empty, text, decimal, < 30, and > 24 h are rejected |
| 2 | Inclusive bounds | 30 and 86400 are accepted |
| 3 | Label | "every minute", "every 1.5 hours" |
| 4 | Unreadable value | Nothing is displayed; never "NaN" |
| 5 | Presets | All are valid, including the default |
| 6 | Incomplete step 2 | Submission is blocked with field-level errors |
| 7 | Server 400 error | Returns to the configuration step |

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module AddWidgetPanel` | Import was not updated | Replace the import in `dashboard/page.tsx` |
| The modal does not open | The old component is still present | Delete `AddWidgetPanel.tsx` |
| The page scrolls behind the modal | The modal is not mounted | Check `document.body.style.overflow` |
| `Tab` leaves the dialog | Focus trap is missing | Check `handleKeyDown` |
| "No service available" | No service is subscribed | Check `GET /services` |

The last case was the Services feature bug: a service without authentication
returned `subscribed: false`, so no weather widget was offered.

---

## 11. Questions

**Why three steps instead of a single form?**
A widget with three parameters would display six fields at once, without
hierarchy. Each step asks for only one decision, and validation happens where
the error was made.

**Why write the modal instead of using a library?**
Forty lines we control, instead of another dependency to install, update, and
justify. Accessibility is also easier to explain when we wrote the behavior.

**Why a minimum of 30 seconds?**
A dashboard with eight widgets refreshed every five seconds would make
5,760 calls per hour to third-party APIs. Quotas would be exhausted within
minutes. The server enforces the same limit.

**What happens if the server rejects the creation request?**
The modal returns to the relevant step with the error details. Entered values
are preserved, so users can correct them instead of starting over.

---

## 12. Remaining work

| Item |
|---|
| `POST /widgets` route on the server |
| Reconfiguration of an existing widget (C10) |
| Make the Timer use the interval (Phase 3) |

Reconfiguration will reuse steps 2 and 3 of this modal, using
`toFieldValues()` to pre-fill the form from the current configuration.
