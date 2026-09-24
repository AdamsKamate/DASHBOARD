# Layout, theme, and authentication pages

Documentation for **Phase 1 cards 1.7 and 1.8**.

- **Card 1.7**: Next.js page structure, color palette, typography, and basic
  components.
- **Card 1.8**: registration / verification / login pages connected to the
  mock, with validation error handling.

Validation criterion: **the complete flow works visually with mock data.**

---

## 1. Page structure

```
client_web/src/
├── app/
│   ├── layout.tsx              root layout: AuthProvider + global styles
│   ├── globals.css             base styles
│   ├── page.tsx                /            public home page
│   ├── (auth)/
│   │   ├── layout.tsx          centers authentication cards
│   │   ├── login/page.tsx      /login
│   │   ├── register/page.tsx   /register
│   │   └── verify/page.tsx     /verify
│   ├── dashboard/page.tsx      /dashboard   protected
│   └── dev/page.tsx            /dev         verification tool
├── components/
│   └── ui.tsx                  Button, Input, Card, FormError, FormSuccess
└── lib/auth/
    ├── messages.ts             error messages by HTTP status code
    └── verifyOnce.ts           confirmation called only once per token
```

### The `(auth)` route group

Parentheses create a **Next.js route group**: the folder does not appear in
 the URL. `app/(auth)/login/page.tsx` responds at `/login`, not at
`/auth/login`.

The benefit is a shared layout: `(auth)/layout.tsx` centers the authentication
pages' cards vertically and horizontally, without duplicating this code in
each page.

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-ink flex items-center justify-center px-4">
      {children}
    </main>
  );
}
```

### The file must be named `page.tsx`

Next.js only exposes a route for a file named **`page.tsx`**. A
`dashboard/dashboard.tsx` file does not create a route: `/dashboard` returns
404.

Consequently, **every folder containing a `page.tsx` becomes a public URL**.
Two backup folders, `dev.bak/` and `login.bak/`, therefore exposed `/dev.bak`
and `/login.bak`. Backups should be made with Git, never by copying a folder
inside `app/`.

---

## 2. The palette

Defined in `tailwind.config.js`, under `theme.extend.colors`.

| Token | Value | Usage |
|---|---|---|
| `ink` | `#0A0E1A` | Page background, the darkest tone |
| `surface` | `#141A2A` | Cards and fields, one step above the background |
| `line` | `#26304A` | Borders, visible without being noisy |
| `signal` | `#3B82F6` | Primary actions and links |
| `flare` | `#F87171` | Errors |
| `pulse` | `#34D399` | Success |

### Named by role, not hue

A component uses `bg-surface`, never `bg-slate-800`. This has two benefits:

- **changing the theme only touches one file**: switching to a light theme
  means changing six values, without opening a single component;
- the name says **what the color is for**, so a new component can choose it
  without comparing shades of gray.

### The missing-class trap

Tailwind only generates classes it knows. If `theme.extend` is empty,
`bg-signal` **produces no style** and emits **no error**: the button appears
transparent and the error text remains invisible.

That was the project's initial state: the components already used `bg-ink`,
`text-flare`, and the other tokens, but the palette was not defined.

To check this, inspect a button in the browser. If the `bg-signal` class is
present in the HTML but no CSS rule matches it, the token is missing.

---

## 3. Typography

```js
fontFamily: {
  sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", ...],
  mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
}
```

The choice is a **system font stack**, with no downloaded font.

A web font costs a network request and causes a visual change during loading:
the text first appears in a fallback font, then jumps when the real font
arrives. On a dashboard, which displays data rather than brand identity, this
cost is not justified.

The `mono` stack is used for anything that aligns in columns: timestamps,
commit hashes, and encrypted values.

---

## 4. Global styles

```css
body {
  @apply bg-ink text-white font-sans antialiased;
}

:focus-visible {
  @apply outline-none ring-2 ring-signal ring-offset-2 ring-offset-ink;
}
```

The first rule provides defaults: a page that forgets its background remains
readable.

The second makes **keyboard focus visible** on every interactive element.
`:focus-visible` is used instead of `:focus`: the ring appears during keyboard
navigation, not on a mouse click where it would look like a display defect.

This is an accessibility requirement for the assignment (C12): without a
focus indicator, a keyboard user cannot tell where they are.

---

## 5. Basic components

### `Button`

Three variants: `primary` (main action), `secondary` (bordered secondary
action), and `danger` (deletion).

```tsx
<Button>Se connecter</Button>
<Button variant="secondary">Retour</Button>
```

The disabled style includes `disabled:cursor-not-allowed`: without it, a
gray-ed out button keeps the pointer cursor and looks clickable.

### `Input`

```tsx
<Input label="Email" type="email" value={email} onChange={...} />
<Input label="Mot de passe" type="password" error="Au moins 8 caractères." />
```

Three accessibility details:

| Element | Role |
|---|---|
| `useId()` + `htmlFor` | Connects the label to the field: clicking “Email” focuses it |
| `aria-invalid` | Signals an invalid field to screen readers |
| `aria-describedby` | Makes the error message read when entering the field |

`useId()` generates a unique identifier for each instance. A hard-coded
identifier would be duplicated if two forms existed on the page, and the label
could point to the wrong field.

### `Card`

Bordered container with an optional title. Used by the three authentication
pages and by the dashboard.

### `FormError` and `FormSuccess`

```tsx
<FormError message="Le formulaire contient une erreur :" details={["email format is invalid"]} />
<FormSuccess>Ton compte est confirmé.</FormSuccess>
```

`role="alert"` makes a screen reader announce the message **as soon as it
appears**, without waiting for the user to reach it. This distinguishes an
error message from ordinary red text.

`details` receives the array returned by the API for validation errors.

---

## 6. Error messages

Centralized in `lib/auth/messages.ts`, with one function per form.

### Based on the HTTP status code, never on the text

```ts
switch (error.status) {
  case 401: return { message: "Email ou mot de passe incorrect." };
  case 403: return { message: "Confirme ton compte avec le lien reçu par email..." };
}
```

The API responds in English with technical vocabulary (“Invalid credentials”).
Displaying that text as-is would be doubly bad: it is difficult for the user
to understand and would break as soon as the server wording changed.

### Login

| Code | Displayed message |
|---|---|
| `400` | Renseigne ton email et ton mot de passe. |
| `401` | Email ou mot de passe incorrect. |
| `403` | Confirme ton compte avec le lien reçu par email avant de te connecter. |
| network | Impossible de joindre le serveur. Réessaie dans un instant. |

The `401` response is **intentionally identical** for an unknown email and an
incorrect password: distinguishing them would reveal which addresses are
registered.

### Registration

| Code | Displayed message |
|---|---|
| `400` | Le formulaire contient une erreur : + the `details` list |
| `409` | Un compte existe déjà avec cet email. |

The `400` response displays the `details` returned by the API (“email format is
invalid”, “password must be at least 8 characters”). A simple “invalid form”
message would force the user to guess which field to fix.

### Verification

| Code | Displayed message |
|---|---|
| `400` | Ce lien de confirmation est invalide ou a déjà été utilisé. |

---

## 7. Client-side validation

```ts
if (password.length < MIN_PASSWORD_LENGTH) {
  setPasswordError(`Au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  return;
}
```

The password length is checked **before** submission: the user gets an answer
immediately, without a network round trip.

This validation does not replace server-side validation; it duplicates it. The
front-end check is for convenience and can be bypassed with browser tools. The
server check is the only real guarantee.

The `required`, `type="email"`, and `minLength` attributes are set on the
fields, but the form has `noValidate`: native browser bubbles are disabled in
favor of our own messages, which are translated, styled, and consistent across
pages.

---

## 8. Connecting to the mock

The three pages call `api.*`, never `fetch` directly. In mock mode
(`NEXT_PUBLIC_USE_MOCK=true`), everything happens in the browser, without a
server.

### Login goes through `useAuth()`, not `api.auth.login()`

This is the most important point of card 1.8.

```tsx
const { login } = useAuth();   // not: api.auth.login(...)
```

`api.auth.login()` would complete the request but **would not update the shared
session state**. The guards would still consider the user anonymous, and
`/dashboard` would immediately send them back to `/login`; an infinite loop,
despite valid credentials.

`useAuth().login()` does both: the request and the state update.

### Registration and verification

They do not open a session, so they call `api` directly: there is no
authentication state to synchronize.

### `GuestOnly` on all three pages

A signed-in user has no reason to be on `/login` or `/register`: the guard
redirects them to the dashboard.

---

## 9. StrictMode and verification

`next.config.js` enables `reactStrictMode: true`. In development, React
**runs each effect twice** to expose non-idempotent effects.

The verification page is a textbook example: the link is single-use by
design. The first call confirms the account; the second reuses an already
consumed token and receives `400`. **The user sees an error for a successful
operation.**

Protecting only the state update is not enough: the request itself must not be
sent twice. Hence `lib/auth/verifyOnce.ts`:

```ts
const verificationByToken = new Map<string, Promise<void>>();

export function verifyAccountOnce(token: string): Promise<void> {
  const alreadyStarted = verificationByToken.get(token);
  if (alreadyStarted) {
    return alreadyStarted;
  }
  const verification = api.auth.verify(token).then(() => undefined);
  verificationByToken.set(token, verification);
  return verification;
}
```

The second caller receives **the same promise**, and therefore the same
response, without sending another request.

The cache lives at **module** level, not in a `useRef`: StrictMode unmounts and
remounts the component, and a component-bound cache would not reliably survive
that cycle.

A genuinely invalid token still fails: the cache remembers the response; it
does not transform it.

This bug occurs **only in development**, never in production where StrictMode
is inactive. That is what makes it confusing: the error appears to be on the
server, although it comes from development mode.

---

## 10. Tests

### Prerequisites

```bash
docker-compose up -d
docker-compose exec client_web npx tsc --noEmit -p tsconfig.json
```

`tsc` should print nothing. Then open `http://localhost:8081` with
**Ctrl+Shift+R**, with the browser console open (**F12**).

### Complete flow

| # | Page | Action | Expected |
|---|---|---|---|
| 1 | `/` | Open | Dark background, centered card, two styled buttons |
| 2 | `/dashboard` | Open while signed out | Redirected to `/login?next=%2Fdashboard` |
| 3 | `/register` | Enter `a@b` and `123` | Validation errors listed in red |
| 4 | `/register` | Enter `moi@test.dev` / `password123` | “Compte créé”, email displayed |
| 5 | Console | _ | `[mock] verification link for ... token=verify-XXXX` |
| 6 | `/login` | Log in with this account | “Confirme ton compte...” (C3) |
| 7 | `/verify?token=verify-XXXX` | Open | “Ton compte est confirmé.” in **green** |
| 8 | `/verify?token=nimportequoi` | Open | “Lien invalide ou déjà utilisé” in red |
| 9 | `/login` | Log in | Arrives at `/dashboard`, email displayed |
| 10 | `/dashboard` | Reload (F5) | Still signed in |
| 11 | `/login` | Open while signed in | Redirected to `/dashboard` |
| 12 | `/dashboard` | Sign out, then return | Redirected to `/login` |

Steps **7 and 8 must be considered together**: the first validates the
StrictMode fix, while the second checks that it has not made the page
permissive.

### Demo accounts

Password `password123` for all three:

| Email | Case |
|---|---|
| `demo@dashboard.dev` | Normal login |
| `pending@dashboard.dev` | Unconfirmed account (403) |
| `admin@dashboard.dev` | Administrator role |

### Start over

In the browser console:

```js
resetMock()
```

### The verification page

`http://localhost:8081/dev` exercises the contract's 23 routes.
Expected: **Mode: mock** and **23 / 23 passed**.

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Everything is blank and unstyled | Palette missing from `tailwind.config.js` | Define `theme.extend.colors` |
| `Cannot find module '@/...'` in the container | The container only mounts `src/`, not `tsconfig.json` | `docker-compose up -d --build client_web` |
| `You cannot have two parallel pages` | Two files respond to the same URL | Remove the duplicate |
| `/dashboard` returns 404 | The file is named `dashboard.tsx` | Rename it to `page.tsx` |
| Loop between `/login` and `/dashboard` | The page calls `api.auth.login` instead of `useAuth().login` | Go through `useAuth()` |
| Verification errors although the account is confirmed | StrictMode runs the effect twice | Use `verifyAccountOnce` |
| “Un compte existe déjà” for an unused email | Mock state persisted in `localStorage` | Run `resetMock()` in the console |

### Which command after which change

| Changed item | Command |
|---|---|
| A file under `client_web/src/` | Nothing, Next.js reloads automatically |
| `tsconfig.json`, `tailwind.config.js` | `docker-compose up -d --build client_web` |
| `package.json` | `docker-compose up -d --build client_web` |
| `.env` | `docker-compose up -d --force-recreate client_web` |

---

## 12. Remaining work

| Item | Card |
|---|---|
| Widget grid on the dashboard | 1.10 |
| Switch to the real server | 1.11: synchronization point |
| Service subscription page | Phase 2 |
| Configuration form generated from `params` | Phase 2 |
| Remove the `/dev` page | Before final delivery |

The dashboard currently displays a placeholder card; the grid arrives with
card 1.10.
