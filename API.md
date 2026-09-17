# API Contract — Dashboard

This document is the **source of truth** between the backend and frontend.
Every route used by the frontend must be defined here **before** it is coded.

Base URL : `http://localhost:8080`

Authentication: JWT transmitted in an `httpOnly` cookie named `token`, or in the
`Authorization: Bearer <token>`.

Common error codes:

| Code | Meaning |
|---|---|
| 400 | Invalid request (missing or incorrectly typed field) |
| 401 | Not authenticated (missing or invalid token) |
| 403 | Authenticated but not authorized (e.g. unconfirmed account) |
| 404 | Resource not found |
| 409 | Conflict (e.g. email already in use) |

Uniform error format:

```json
{ "error": "message lisible" }
```

---

## 1. Required Subject Endpoint

### `GET /about.json`

Public, without authentication. Format strictly required by the subject.

**`200` response**

```json
{
  "client": {
    "host": "10.101.53.35"
  },
  "server": {
    "current_time": 1531680780,
    "services": [
      {
        "name": "weather",
        "widgets": [
          {
            "name": "city_temperature",
            "description": "Display temperature for a city",
            "params": [
              { "name": "city", "type": "string" }
            ]
          }
        ]
      }
    ]
  }
}
```

`params[].type` can only be `"string"` or `"integer"`.

---

## 2. Authentication

### `POST /auth/register`

**Request**

```json
{ "email": "user@example.com", "password": "motdepasse" }
```

**`201` response**

```json
{ "message": "Account created, email confirmation required" }
```

**Errors**: `400` missing fields · `409` email already in use

---

### `GET /auth/verify?token=<verification_token>`

Confirms the account through the link received by email.

**`200` response**

```json
{ "message": "Account confirmed" }
```

**Errors**: `400` invalid or expired token

---

### `POST /auth/login`

**Requête**

```json
{ "email": "user@example.com", "password": "motdepasse" }
```

**`200` response**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "uuid", "email": "user@example.com", "role": "user" }
}
```

**Errors**: `401` invalid credentials · `403` unconfirmed account

---

### `GET /auth/me`

Authenticated. Returns the current user.

**Réponse `200`**

```json
{ "id": "uuid", "email": "user@example.com", "role": "user" }
```

---

### `POST /auth/logout`

Authenticated. Invalidates the cookie.

**`204` response**: no body.

---

## 3. Services et OAuth

### `GET /services`

Authentifié. Liste les services disponibles et l'état de souscription de l'utilisateur courant.

**Réponse `200`**

```json
[
  { "name": "weather", "requiresAuth": false, "subscribed": true },
  { "name": "github",  "requiresAuth": true,  "subscribed": false },
  { "name": "google",  "requiresAuth": true,  "subscribed": true }
]
```

`subscribed` vaut toujours `true` pour un service avec `requiresAuth: false`
(disponible par défaut à tout utilisateur authentifié, conformément au sujet).

---

### `GET /oauth/:service/authorize`

Authentifié. Redirige (`302`) vers la page d'autorisation du provider.
Le front ne consomme pas de JSON ici : il fait une navigation complète.

---

### `GET /oauth/:service/callback?code=...&state=...`

Appelé par le provider. Le serveur échange le code contre un token, le chiffre, le stocke, puis redirige (`302`) vers :

```
{CLIENT_URL}/services?linked={service}
```

En cas d'échec :

```
{CLIENT_URL}/services?error={raison}
```

---

### `DELETE /services/:service/subscription`

Authentifié. Délie le compte tiers et supprime les tokens stockés.

**Réponse `204`** : pas de corps.

---

## 4. Types de widgets

### `GET /widget-types`

Authentifié.
Liste tous les types de widgets disponibles, avec leurs paramètres.
C'est cette route qui alimente le formulaire de configuration généré dynamiquement côté front.

**Réponse `200`**

```json
[
  {
    "id": "city_temperature",
    "service": "weather",
    "name": "city_temperature",
    "description": "Affiche la température actuelle d'une ville",
    "requiresAuth": false,
    "params": [
      { "name": "city", "type": "string" }
    ]
  },
  {
    "id": "github_commits",
    "service": "github",
    "name": "github_commits",
    "description": "Derniers commits d'un dépôt",
    "requiresAuth": true,
    "params": [
      { "name": "repo",   "type": "string"  },
      { "name": "number", "type": "integer" }
    ]
  }
]
```

---

## 5. Instances de widgets

### `GET /widgets`

Authentifié. Toutes les instances du dashboard de l'utilisateur courant.

**Réponse `200`**

```json
[
  {
    "id": "uuid",
    "widgetTypeId": "city_temperature",
    "params": { "city": "Paris" },
    "refreshRate": 300,
    "position": { "x": 0, "y": 0, "w": 2, "h": 2 }
  }
]
```

---

### `POST /widgets`

Authentifié. Crée une instance configurée et enregistre son job de rafraîchissement.

**Requête**

```json
{
  "widgetTypeId": "city_temperature",
  "params": { "city": "Paris" },
  "refreshRate": 300,
  "position": { "x": 0, "y": 0, "w": 2, "h": 2 }
}
```

`refreshRate` est en secondes, minimum `30` (protection contre les rate-limits des APIs tierces). `position` est optionnel, valeurs par défaut `x:0, y:0, w:2, h:2`.

**Réponse `201`** : l'instance créée, même format que `GET /widgets`.

**Erreurs** : `400` params invalides au regard du schéma du widget ·
`403` service non souscrit

---

### `PATCH /widgets/:id`

Authentifié. Reconfigure, déplace ou redimensionne une instance.
Tous les champs sont optionnels, seuls ceux fournis sont modifiés.

**Requête**

```json
{
  "params": { "city": "Tokyo" },
  "refreshRate": 600,
  "position": { "x": 2, "y": 0, "w": 2, "h": 2 }
}
```

**Réponse `200`** : l'instance mise à jour.

---

### `DELETE /widgets/:id`

Authentifié. Supprime l'instance et son job de rafraîchissement.

**Réponse `204`** : pas de corps.

---

### `GET /widgets/:id/data`

Authentifié. Renvoie les **données en cache** de l'instance. Cette route ne
déclenche jamais d'appel vers une API externe : c'est le worker (Timer) qui
alimente le cache en arrière-plan.

**Réponse `200`**

```json
{
  "data": { "city": "Paris", "temperature": 16.4, "condition": "Partly cloudy" },
  "fetchedAt": "2026-09-16T14:32:00.000Z",
  "status": "ok"
}
```

`status` vaut :

| Valeur | Signification |
|---|---|
| `ok` | Données à jour |
| `pending` | Aucun rafraîchissement encore effectué (`data` vaut `null`) |
| `error` | Le dernier rafraîchissement a échoué (`error` contient le motif) |

Exemple en erreur :

```json
{
  "data": null,
  "fetchedAt": "2026-09-16T14:32:00.000Z",
  "status": "error",
  "error": "rate_limit"
}
```

Le front doit gérer les trois cas : un widget en erreur ne doit jamais casser
l'affichage des autres.

---

## 6. Administration

### `GET /admin/users`

Authentifié, réservé au rôle `admin`.

**Réponse `200`**

```json
[
  {
    "id": "uuid",
    "email": "user@example.com",
    "role": "user",
    "isVerified": true,
    "createdAt": "2026-09-01T10:00:00.000Z"
  }
]
```

**Erreurs** : `403` si le rôle n'est pas `admin`

---

### `DELETE /admin/users/:id`

Authentifié, réservé au rôle `admin`. Supprime un compte et toutes ses données.

**Réponse `204`** : pas de corps.

---

## Règle de modification de ce document

Toute modification d'une route déjà listée ici doit être **annoncée à l'autre avant d'être codée**. C'est la seule dépendance forte entre le travail backend et le travail frontend : tant que ce contrat est respecté, chacun avance sans jamais attendre l'autre.