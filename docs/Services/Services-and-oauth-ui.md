# Services Page and OAuth Linking

Documentation for two **Phase 2** cards that form one complete feature:

- **Services page**: lists services and shows which ones are linked to the
  user's account.
- **OAuth linking button**: starts the redirect to the provider and handles
  the return state after the callback.

Covers constraint **C6** from the assignment: linking a third-party account to a
platform user.

---

## 1. What the User Sees

```
┌──────────────────────────────────────────────────────────────┐
│ Services                          [ Back to dashboard ]      │
├──────────────────────────────────────────────────────────────┤
│ 4 services available, 3 linked to your account               │
│                                                               │
│ ┌───────────────────────────────────────────────────────────┐│
│ │ Weather                    No authorization required       ││
│ │ weather                                                   ││
│ │ Temperatures and forecasts...          Ready to use       ││
│ └───────────────────────────────────────────────────────────┘│
│ ┌───────────────────────────────────────────────────────────┐│
│ │ GitHub                                     Account linked ││
│ │ github                                                    ││
│ │ Commits and issues from your repositories. [ Unlink ]     ││
│ └───────────────────────────────────────────────────────────┘│
│ ┌───────────────────────────────────────────────────────────┐│
│ │ Google                                      Not linked    ││
│ │ google                                                    ││
│ │ Calendar and unread messages.       [ Link my account ]   ││
│ └───────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Files

| File | Role |
|---|---|
| `server/src/routes/services.ts` | `GET /services`, `DELETE .../subscription` |
| `client_web/src/components/services/ServiceCard.tsx` | A service card |
| `client_web/src/app/services/page.tsx` | The page |
| `client_web/src/app/dashboard/page.tsx` | The `Services` button in the header |

---

## 3. Three States, Not Two

This is what makes this kind of page confusing when handled incorrectly.

| Case | Badge | Proposed action |
|---|---|---|
| `requiresAuth: false` | No authorization required | **None**: “Ready to use” |
| `requiresAuth: true`, not linked | Not linked (amber) | Link my account |
| `requiresAuth: true`, linked | Account linked (green) | Unlink |

Weather and RSS have **nothing to link**: displaying a disabled button would
suggest that something is missing.

### Color Never Carries Information Alone

```tsx
<span className="... text-pulse">Account linked</span>
```

Every badge includes text. A color-blind person, or anyone viewing the page on
a poor-quality screen, must be able to **read** the state rather than guess it.
Color only reinforces the meaning.

---

## 4. The Server-Side Bug That Was Fixed

```ts
subscribed: service.requires_auth ? subscribedIdSet.has(service.id) : true,
```

The first version looked for a subscription for **every** service. Since Weather
and RSS do not store tokens, the lookup always failed and they returned
`subscribed: false`.

This was not only a display issue. The widget-addition panel filters services
like this:

```ts
const subscribedServiceNames = new Set(
  services.filter((service) => service.subscribed).map((service) => service.name)
);
```

**No weather widget was therefore offered** in real server mode, even though the
service itself worked perfectly.

This also differed from `API.md`, which specifies that `subscribed` is always
`true` for a service without authentication, a rule already applied by the
mock. This is exactly the kind of discrepancy that the synchronization point is
supposed to eliminate.

---

## 5. Unlinking Is Idempotent

```ts
const wasLinked = await unlinkService(req.user!.userId, serviceName);
return res.status(204).send();
```

The response is `204` whether or not the link existed.

The caller is asking for the account **not** to be linked; it is not linked. A
`404` would turn a double click, or two tabs unlinking at the same time, into an
unnecessary visible error.

---

## 6. The Linking Button

```tsx
api.services.link(serviceName).catch(() => {
  setBusyService(null);
  setActionError("Unable to start account linking.");
});
```

### This Is Navigation, Not an API Call

```ts
link: async (service: string): Promise<void> => {
  window.location.href = `${API_URL}/oauth/${service}/authorize`;
}
```

The server responds with a `302` redirect to GitHub: **the browser leaves the
page**. Nothing returns here, so there is no response to process.

That is why `busyService` remains set after the click: the button must not be
clickable twice while the redirect starts. There is no one to reset it because
the page disappears.

The `catch` is only useful if the redirect itself fails in mock mode, for
example.

### Only One Button Is Disabled at a Time

```tsx
isBusy={busyService === service.name}
```

Not a global flag. Unlinking GitHub must not freeze Google's button.

---

## 7. The Callback Return

The server always finishes the flow with a redirect to the frontend:

| Outcome | Redirect |
|---|---|
| Success | `/services?linked=github` |
| Failure | `/services?error=access_denied` |

### Error Codes Are Translated

```ts
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You denied authorization. The account was not linked.",
  invalid_state: "The request expired or is no longer valid. Try again.",
  missing_code: "The service did not return an authorization code.",
  exchange_failed: "The exchange with the service failed. Try again shortly.",
  configuration: "This service is not configured on the server.",
  unknown_service: "Unknown service.",
  unexpected: "An unexpected error occurred.",
};
```

Displaying `invalid_state` as-is would not help anyone. Each code has a message
that explains what happened and what remains to be done.

The fallback, “Account linking failed,” covers a code that the server might add
later without requiring an immediate frontend update.

### Parameters Are Read Once

```tsx
const [linkedService] = useState(() => searchParams.get("linked"));
const [oauthError] = useState(() => searchParams.get("error"));
```

With an initializer function, `useState` captures the value **on the first
render** and does not change it. Reading `searchParams` directly would make the
message disappear as soon as the URL is cleaned up below.

### The URL Is Cleaned Up

```tsx
useEffect(() => {
  if (linkedService || oauthError) {
    router.replace("/services");
  }
}, [linkedService, oauthError, router]);
```

Without this, reloading the page would display “Account linked” again. If the
user bookmarked the URL, the message could return days later with no connection
to what they were doing.

`replace`, rather than `push`, ensures that the Back button does not return to a
URL containing an old result.

---

## 8. Optimistic Unlinking

```tsx
const previousServices = services;
setServices((current) =>
  current.map((service) =>
    service.name === serviceName ? { ...service, subscribed: false } : service
  )
);

try {
  await api.services.unlink(serviceName);
} catch {
  setServices(previousServices);
  setActionError("Unlinking failed. Try again shortly.");
}
```

The badge changes immediately and is restored if the server rejects the request.
It uses the same mechanism as moving widgets on the dashboard.

The `window.confirm` prompt comes first: unlinking deletes the tokens, and the
complete OAuth flow must be repeated to undo it.

---

## 9. Tests

### Mock Mode

```bash
sed -i 's|^NEXT_PUBLIC_USE_MOCK=.*|NEXT_PUBLIC_USE_MOCK=true|' .env
docker-compose up -d --force-recreate client_web
```

Log in with `demo@dashboard.dev` / `password123`.

| # | Action | Expected |
|---|---|---|
| 1 | Click `Services` in the dashboard header | The page opens |
| 2 | Read the badges | Weather and RSS are gray, GitHub is green, Google is amber |
| 3 | Read the counter | “4 services available, 3 linked to your account” |
| 4 | Click `Link my account` for Google | Return with “Your google account is now linked” |
| 5 | Check the URL | No `?linked=` remains; it has been cleaned up |
| 6 | Reload (F5) | The message does not return |
| 7 | Click `Unlink` for GitHub | Confirmation, then an amber badge |
| 8 | Reload | GitHub is still not linked |

### Simulate an Error Return

Enter this directly in the address bar:

```
http://localhost:8081/services?error=access_denied
```

Expected: “You denied authorization. The account was not linked.”, then the URL
returns to `/services`.

Also try `?error=invalid_state` and `?error=unknown_code`; the latter should
display the fallback message.

### Real Server Mode

```bash
sed -i 's|^NEXT_PUBLIC_USE_MOCK=.*|NEXT_PUBLIC_USE_MOCK=false|' .env
docker-compose up -d --force-recreate client_web
```

| # | Action | Expected |
|---|---|---|
| 1 | Open `/services` | Only `weather` appears, as “Ready to use” |
| 2 | Dashboard -> `Add a widget` | Weather widgets are offered |

### Summary

| # | Test | Expected |
|---|---|---|
| 1 | `GET /services` without a session | `401` |
| 2 | Service without authentication | `subscribed: true` |
| 3 | Linked / unlinked service | `true` / `false` |
| 4 | Another user | Cannot see your links |
| 5 | Unlinking | `204`, repeated `204` |
| 6 | `?linked=` return | Green banner, cleaned URL |
| 7 | `?error=` return | Translated message |
| 8 | Add a weather widget | Offered in real mode |

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| No weather widget when adding one | `subscribed: false` for a service without auth | Apply the `services.ts` fix |
| Page is inaccessible | No link in the dashboard | Add the `Services` button |
| “Account linked” returns on every reload | URL is not cleaned up | Check `router.replace` |
| Button remains frozen after a click | Normal in real mode | The page redirects to the provider |
| `error=configuration` | OAuth variables are missing from `.env` | Set `GITHUB_CLIENT_ID` and the remaining variables |
| `error=unknown_service` | Provider is not registered in `registry.ts` | Expected until GitHub is implemented |

---

## 11. Questions

**Why is linking not a simple API call?**
Because the user must give consent **on the provider's website**. The server
responds with a `302` to GitHub, the browser goes there, and GitHub sends the
browser back to our callback. A `fetch` request cannot display a consent screen.

**Why is a service without authentication considered “subscribed”?**
Because it is available to everyone. It has no row in `user_services`, so
looking for a subscription would always return false. The contract requires
`true`, and the widget-addition panel uses it to decide which widgets to offer.

**What happens if the user closes the tab during the OAuth flow?**
Nothing. The `state` stored in Redis expires after ten minutes, and no account
is linked. The user can try again.

**Can a service be unlinked by mistake?**
A confirmation is required. If the user confirms, the tokens are deleted and
the OAuth flow must be completed again. This is irreversible, hence the
confirmation.

---

## 12. What Remains to Be Done

| Item | Card |
|---|---|
| GitHub provider: make the button fully functional | Phase 2 |
| Google provider | Phase 2 |
| RSS service | Phase 2 |
| `/widgets` and `/widget-types` routes | Phase 2 |

Until an OAuth provider is registered, `GET /services` returns only `weather`,
and the linking button has nothing to offer. The entire mechanism is in place
and waiting for the providers.
