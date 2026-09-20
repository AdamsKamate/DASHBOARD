# Services and Widgets

Reference document for **Phase 0 card 5**. It records the selected services,
the exact list of widgets with their parameters, and the work distribution
between the two team members.

---

## Required Quota

For a group of **X = 2 students**:

| Requirement | Minimum | Planned here |
|---|---|---|
| Services (1 + X) | 3 | **4** |
| Widgets (3 × X) | 6 | **8** |

Two important reminders:

- **Google counts as a single service**, even though it exposes Gmail *and*
  Calendar widgets. Never count it twice.
- **A widget without a configurable parameter does not count.** Each widget
  below therefore has at least one parameter.

---

## The 4 Selected Services

| # | Service | Authentication | Why this choice |
|---|---|---|---|
| 1 | **Weather** | None | Validates the entire chain (registry -> about.json -> configuration -> fetch -> cache) without OAuth complexity. To be implemented first. |
| 2 | **RSS** | None | A second service without an external account. Secures the minimum quota even if an OAuth flow causes problems, and costs very little to implement once the pattern is established. |
| 3 | **GitHub** | OAuth 2.0 | The simplest and best-documented OAuth2 flow, providing good hands-on experience with the manual implementation required by the assignment. |
| 4 | **Google** | OAuth 2.0 | Gmail and Calendar in a single service. Reuses the OAuth helper written for GitHub. |

With Weather and RSS requiring no authentication, the required minimum (3
services, 6 widgets) remains achievable even if only one of the two OAuth flows
succeeds. This is an intentional scheduling safeguard.

---

## The 8 Widgets

| # | Service | Widget | Parameters | Assigned to |
|---|---|---|---|---|
| 1 | weather | `city_temperature` | `city` (string) | **Adams** |
| 2 | weather | `weather_forecast` | `city` (string), `days` (integer) | **Adams** |
| 3 | rss | `article_list` | `link` (string), `number` (integer) | **Mohammad** |
| 4 | rss | `feed_summary` | `link` (string) | **B** |
| 5 | github | `github_commits` | `repo` (string), `count` (integer) | **Mohammad** |
| 6 | github | `github_issues` | `repo` (string), `state` (string) | **Mohammad** |
| 7 | google | `google_calendar_next` | `count` (integer) | **A** |
| 8 | google | `google_gmail_unread` | `label` (string), `count` (integer) | **Adams** |

Distribution: **4 widgets each**, and **one OAuth service each**
(Adams: Google; Mohammad: GitHub). Each member therefore implements a complete
authorization flow and will be able to explain it in the keynote;

---

## Implementation Order

1. **weather** : service without authentication, validates the complete architecture (Phase 2)
2. **rss** : second service without authentication, quick once the pattern is established
3. **github** : first manual OAuth2 flow, the simplest one
4. **google** : second OAuth2 flow, reuses the helper written for GitHub

If the schedule becomes tight, services 1 to 3 are enough to reach the
required minimum. Google is an optional addition, not a requirement.

---

## APIs and Prerequisites

| Service | Endpoint | Required key |
|---|---|---|
| Weather | Open-Meteo (`api.open-meteo.com`) | None |
| RSS | XML feed provided by the user | None |
| GitHub | `api.github.com` | OAuth application to create at github.com/settings/developers |
| Google | Google Calendar API + Gmail API | Project to create at console.cloud.google.com |

All keys and secrets go in `.env` (never committed). Their existence is
documented in `.env.example`.

---

## Modification Rule

Any modification to this table (adding, removing, or changing a widget's
parameters) must be **reflected in `API.md`** and announced to the other team
member before being implemented.
