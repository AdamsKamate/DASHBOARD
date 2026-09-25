# Dashboard grid

Documentation for **Phase 1 card 1.10**: the widget-grid skeleton with
 drag-and-drop, block addition, and block removal.

Covers subject constraint **C10**: adding, reconfiguring, moving, and removing
a widget instance.

---

## 1. Running the project

### Startup

```bash
cd ~/TECH3/G-WEB-500-PAR-5-1-dashboard-30
docker-compose up -d
docker-compose ps
```

Five containers should be running: `server`, `client_web`, `db`, `redis`, and
`mailhog`. The `worker` service remains stopped until Phase 3.

### Addresses

| Address | Content |
|---|---|
| **http://localhost:8081** | **The application**: everything visual |
| http://localhost:8081/dev | API contract verification page |
| http://localhost:8025 | MailHog: emails sent by the server |
| http://localhost:8080/about.json | The API: JSON, no interface |

Port 8080 has no visual interface: it is the API.

### Signing in

The front end runs in mock mode (`NEXT_PUBLIC_USE_MOCK=true`), so it does not
need the server. Three accounts exist, all with password `password123`:

| Email | Case |
|---|---|
| `demo@dashboard.dev` | Two widgets already placed, GitHub linked |
| `pending@dashboard.dev` | Unconfirmed account |
| `admin@dashboard.dev` | Administrator role |

To start over, run `resetMock()` in the browser console.

### Which command after which change

| Changed item | Command |
|---|---|
| A file under `client_web/src/` | Nothing, Next.js reloads automatically |
| `tsconfig.json`, `tailwind.config.js` | `docker-compose up -d --build client_web` |
| `package.json` | `docker-compose up -d --build client_web` |
| `.env` | `docker-compose up -d --force-recreate client_web` |

### Checking that everything compiles

```bash
docker-compose exec client_web npx tsc --noEmit -p tsconfig.json
```

No output means the check passed. Run this **inside the container**:
`node_modules` does not exist on the host, and a local `npx` would download an
arbitrary version from the registry.

---

## 2. Choosing the library

| Criterion | Native (HTML5 drag & drop) | dnd-kit | **react-grid-layout** |
|---|---|---|---|
| Position model | Must be written | Sortable list, not a grid | **`x, y, w, h`** |
| Resizing | Must be written | No | **Yes** |
| Collisions and compaction | Must be written | No | **Yes** |
| Touch screens | Unsupported | Yes | **Yes** |
| Narrow screens | Must be written | Must be written | **Breakpoints** |

The decisive argument is the **position format**. `API.md` defines
`{ x, y, w, h }`, exactly what react-grid-layout manipulates. The conversion
only renames `id` to `i`:

```ts
export function toGridItem(widget: WidgetInstance): GridItem {
  return { i: widget.id, x: widget.position.x, y: widget.position.y, ... };
}
```

With another library, we would have had to write and maintain a translation
between two position models.

Writing drag-and-drop by hand was ruled out: collision handling, compaction,
and touch support would require several hundred lines for an inferior result.
The subject explicitly asks us to integrate existing components instead of
reinventing the wheel.

---

## 3. Files

| File | Role |
|---|---|
| `client_web/src/lib/dashboard/layout.ts` | Pure logic: conversion, change detection, placement |
| `client_web/src/components/dashboard/WidgetBlock.tsx` | A grid block |
| `client_web/src/components/dashboard/WidgetGrid.tsx` | The grid itself |
| `client_web/src/components/dashboard/AddWidgetPanel.tsx` | Add-widget panel |
| `client_web/src/app/dashboard/page.tsx` | Connects the grid to the mock |
| `client_web/src/app/globals.css` | Grid styles |
| `client_web/package.json` | `react-grid-layout` dependency |

`layout.ts` contains no React: only pure, independently testable functions,
which avoids mounting a complete render to verify a position calculation.

---

## 4. Saving movement

### On release, not during dragging

```tsx
onDragStop={commitLayout}
onResizeStop={commitLayout}
```

`onLayoutChange` fires on **every mouse movement**, and also when the component
mounts. Using it would send dozens of requests per move, plus a burst when the
page loads.

### Only blocks that moved

Moving one block often shifts others: react-grid-layout compacts the grid
upwards, so one drag can modify several positions.

```ts
export function findChangedPositions(widgets, layout): PositionChange[]
```

This function compares the old and new layouts and returns only the
 differences. Saving every widget after each move would multiply requests for
no reason.

If nothing changed, such as a click without movement, it returns an empty list
and no request is sent.

---

## 5. Optimistic updates

```tsx
const previousWidgets = widgets;
setWidgets(applyPositionChanges(widgets, changes));   // the screen changes immediately

try {
  await Promise.all(changes.map((change) => api.widgets.update(...)));
} catch {
  setWidgets(previousWidgets);                        // rollback
  setActionError("Le déplacement n'a pas pu être enregistré.");
}
```

The screen updates **before** the server responds. Waiting would make dragging
feel heavy: the block would remain frozen for half a second after release. The
mock deliberately adds 300 ms of latency so this type of defect is visible
during development.

If the request fails, the previous state is restored and a message is shown.
That is what makes optimistic updates acceptable: the user is never left with a
misleading screen.

The same mechanism protects removal.

### Immutability makes rollback possible

```ts
export function applyPositionChanges(widgets, changes): WidgetInstance[] {
  return widgets.map((widget) => { ... });   // new list, never mutate
}
```

If the function modified existing objects, `previousWidgets` would point to the
same already-modified objects and rollback would restore nothing.

---

## 6. What starts a drag

### The header only

```tsx
draggableHandle=".widget-drag-handle"
```

Without this, the entire block would be a handle. It would then be impossible
to select text or click a link inside a widget once it displays real data in
Phase 2.

### The remove button is excluded

```tsx
draggableCancel=".widget-no-drag"
```

The ✕ button is in the header, and therefore inside the drag area. Without this
exclusion, clicking it would start a move instead of removing the block.

---

## 7. Editing on large screens only

```tsx
const BREAKPOINTS = { large: 1024, medium: 640, small: 0 };
const COLUMNS = { large: 12, medium: 6, small: 1 };

const isEditable = currentBreakpoint === "large";
```

Stored positions belong to the 12-column desktop grid. On a phone the grid has
one column: saving a position calculated there would overwrite the desktop
layout, making it inconsistent the next time it opened.

Small screens therefore display the dashboard **stacked and read-only**. This
is an intentional limitation, not an omission: the subject's responsive UI
constraint (C12) is respected, and the dashboard remains viewable everywhere.

---

## 8. The add form

### Generated from parameters

```tsx
{selectedType?.params.map((param) => (
  <Input
    label={param.name}
    type={param.type === "integer" ? "number" : "text"}
    ...
  />
))}
```

**No field is hard-coded for a specific widget.** The panel reads the `params`
array returned by `GET /widget-types` and creates one field per parameter, with
the correct type.

Direct consequence: adding a service on the server in Phase 2 will make its
form appear here **without any front-end change**. This is the concrete benefit
of the `ServiceProvider` pattern chosen in Phase 0.

### Only available services

```ts
const subscribedServiceNames = new Set(
  services.filter((service) => service.subscribed).map((service) => service.name)
);
```

Offering a GitHub widget to an account that has not linked GitHub would only
lead to a `403` after the form had been filled. Unsubscribed services are
therefore absent from the list.

Weather and RSS require no authentication: they are available by default, as
specified by the subject.

### Type conversion

```ts
params[param.name] =
  param.type === "integer" && rawValue !== "" ? Number(rawValue) : rawValue;
```

An HTML field always returns text. A parameter declared as `integer` must be
sent as a number, otherwise the server responds with `400`.

The `rawValue !== ""` case is intentional: an empty integer field remains an
empty string instead of becoming `0`. The server then responds with “is
required”, which is clearer for the user than an invented value.

---

## 9. Placing a new block

```ts
export function findFreePosition(widgets: WidgetInstance[]): Position {
  const lowestBottomEdge = widgets.reduce(
    (bottom, widget) => Math.max(bottom, widget.position.y + widget.position.h),
    0
  );
  return { x: 0, y: lowestBottomEdge, w: 4, h: 2 };
}
```

The new block is placed on a blank row below all the others: overlap is
impossible regardless of the grid's current state.

Searching for a gap in the layout would be more sophisticated but unnecessary:
react-grid-layout compacts the grid upwards, so the block moves into the first
free space by itself.

---

## 10. Block contents

For now, a block displays the service, widget name, parameters, and refresh
interval. **Not its data**: fetching data belongs to Phase 2, with the real
services.

That is exactly what this card asks for: a grid skeleton without real data.

### A missing widget type

```tsx
const title = widgetType?.name ?? widget.widgetTypeId;
const serviceName = widgetType?.service ?? "unknown";
```

A service may be removed from the server registry while a user still has its
widgets. Without these fallback values, the block would crash and **the user
could no longer remove it**. It therefore displays its raw identifier and
remains removable.

---

## 11. Tests

### Prerequisite

Use a **full-screen window**, at least 1024 px wide: below that width, the grid
becomes read-only (section 7).

Sign in with `demo@dashboard.dev` / `password123`.

### The flow

| # | Action | Expected |
|---|---|---|
| 1 | Open `/dashboard` | Two blocks, **Paris** and **Tokyo**, side by side |
| 2 | Drag a block by its **header** | It moves and the others make room |
| 3 | Reload (F5) | The new layout is preserved |
| 4 | Drag a block's bottom-right corner | It is resized |
| 5 | Reload | The new size is preserved |
| 6 | `Ajouter un widget` -> `weather_forecast` | Two fields: `city` and `days` |
| 7 | Submit without filling the fields | Error list in red |
| 8 | Fill `Lyon` / `3`, then submit | A third block appears below |
| 9 | Click ✕, then confirm | The block disappears |
| 10 | Resize the window below 1024 px | Blocks are stacked, with no handles |
| 11 | Open the type list | No Google widget (service not linked) |

Step 6 is the most revealing: the `city` and `days` fields are not written
anywhere in the front-end code; they come from `GET /widget-types`.

### Checking C11

The Paris and Tokyo blocks are **two instances of the same type**
(`city_temperature`) with different parameters, displayed side by side. This
is subject constraint C11, visible directly on screen.

### Summary

| # | Test | Expected |
|---|---|---|
| 1 | Loading | Two blocks displayed |
| 2 | Moving | Position preserved after reload |
| 3 | Resizing | Size preserved |
| 4 | Adding | Generated form, new block created |
| 5 | Validation | Errors listed |
| 6 | Removing | Confirmation, then removal |
| 7 | Small screen | Stacked, read-only |

---

## 12. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module 'react-grid-layout'` | Image not rebuilt | `docker-compose up -d --build client_web` |
| Blocks stacked on a large screen | Window width below 1024 px | Enlarge the window |
| Red rectangle while dragging | Grid styles missing from `globals.css` | Add the `.widget-grid` block |
| Clicking ✕ moves the block | Missing `widget-no-drag` class | Restore it on the button |
| `package-lock.json` without `react-grid-layout` | `npm install` runs in the image, but the lockfile is not exported | `docker-compose exec client_web cat package-lock.json > client_web/package-lock.json` |

The last point deserves attention: without an up-to-date lockfile, your
teammate and the evaluator would install different versions from yours. The
subject requires **reproducible** installation steps.

---

## 13. Known limitations

**Keyboard movement is not supported.** react-grid-layout handles neither
arrow keys nor focus-based block movement. Removal is keyboard-accessible
through the button and its `aria-label`.

This is a library limitation and should be mentioned in the README. Complete
accessibility work belongs to card 5.5.

**Existing widgets cannot be reconfigured.** They can be added, moved, resized,
and removed, but their parameters cannot yet be edited. The subject requires
this (C10): it will arrive with the Phase 2 configuration card, which will
reuse the add-panel's generated form.

---

## 14. Remaining work

| Item | Card |
|---|---|
| Switch to the real server | 1.11; synchronization point |
| Display real data in blocks | Phase 2 |
| Reconfigure an existing widget | Phase 2 |
| Visible `pending` / `error` states on a block | Phase 3 |
| Keyboard movement | 5.5 |

### Dépendances et vulnérabilités connues

`npm audit` signale deux vulnérabilités (une critique, une haute) sur
`next@14.2.35` et sa dépendance `postcss`. La seule correction proposée est
`next@16`, un changement majeur.

Nous restons en 14.2.35 pour deux raisons :
- les failles visent des fonctionnalités que le projet n'utilise pas
  (Image Optimization API, Server Actions, middleware, rewrites, i18n,
  serveurs Windows) ;
- l'application tourne en local via Docker Compose, sans exposition réseau.

Une montée en Next 16 en fin de projet présenterait un risque de régression
supérieur au risque couvert.