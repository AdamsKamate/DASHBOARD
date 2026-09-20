# Registration: Password Hashing and Confirmation Token

Documentation for **Phase 1 card 1.2**. This document explains how an account
is created, why passwords are never stored in plaintext, and which technical
decisions were made.

Covers constraints **C3** (confirmation before access) and **C13** (sensitive
data).

---

## 1. Overview

```
POST /auth/register
  │
  ├> email and password validation                    lib/validation.ts
  │      failure -> 400 Invalid input
  │
  ├> email normalization (lowercase)                  lib/validation.ts
  │
  ├> bcrypt password hashing                          lib/password.ts
  │
  ├> random token generation (32 bytes)               routes/auth.ts
  │
  ├> database insertion, is_verified = FALSE          repositories/users.ts
  │      email already used -> 409 Email already in use
  │
  └> 201 Account created, email confirmation required
```

The plaintext password never leaves the route: only its hash is passed to the
repository and then stored.

---

## 2. Relevant Files

| File | Purpose |
|---|---|
| `server/src/lib/password.ts` | Bcrypt hashing and verification |
| `server/src/lib/validation.ts` | Input validation and email normalization |
| `server/src/routes/auth.ts` | The `POST /auth/register` route |
| `server/src/db/repositories/users.ts` | `createUser()`, implemented in card 1.1 |
| `server/src/index.ts` | Mounts the authentication router |

Each responsibility is isolated: the route orchestrates, the `lib/` modules
handle technical work, and the repository communicates with the database.
Changing the hashing algorithm would affect only one file.

---

## 3. Password Hashing

### Why Hash Instead of Encrypt

Encryption is reversible: with the key, the original password can be recovered.
A database leak combined with a key leak would expose every account.

Hashing is one-way. We do not store the password, but a fingerprint. At login,
we hash what the user enters and compare the two fingerprints. **No one,
including us, can recover a password from the database.**

### Why Bcrypt Instead of SHA-256

SHA-256 is designed to be **fast**, which is exactly what we do not want here.
A graphics card can calculate billions of SHA-256 hashes per second, so a
dictionary of common passwords could be tested in minutes.

Bcrypt is deliberately **slow**, and its cost can be configured. With a cost
of 10, each hash takes about 60 ms. Testing one million passwords would then
take days instead of seconds.

### Why Bcrypt Instead of Argon2

Argon2 is technically superior: it also consumes significant memory, which
neutralizes GPU attacks (a GPU has many cores but little memory per core).

The choice of bcrypt is based on a practical constraint: Argon2 requires native
compilation, which frequently fails on Alpine Linux, the base image of the
`server` container. Bcrypt has been proven for more than twenty years, is more
than sufficient for this project, and installs without friction.

This is an intentional trade-off between theoretical security and deployment
reliability, exactly the type of choice the assignment asks us to justify.

### Cost 10

```ts
const SALT_ROUNDS = 10;
```

The number of rounds is 2^10, or 1024 iterations. On an ordinary machine,
this represents approximately 60 ms per hash.

| Cost | Approximate time |
|---|---|
| 8 | ~15 ms: too fast, weakened protection |
| **10** | **~60 ms: selected compromise** |
| 12 | ~250 ms: safer, but noticeably slows registration |

This parameter is stored **in the hash itself**, allowing it to be increased
later without invalidating existing accounts.

### Automatic Salt

Bcrypt generates a random salt for every hash and includes it in the result.
The direct consequence is that **two users with the same password receive two
different hashes.**

```
motdepasse123 -> $2b$10$N9qo8uLOickgx2ZMRZoMye...
motdepasse123 -> $2b$10$k7Lz9vQnXpR4mBc2FdHjOu...   (the same, hashed again)
```

Without a salt, two accounts sharing the same hash would reveal that they have
the same password, and a precomputed table (a "rainbow table") could crack all
accounts at once.

There is therefore **nothing else to store**: the hash contains the algorithm,
the cost, and the salt.

```
$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
│  │  │ └────────────────── salt + hash ─────────────────────┘
│  │  └── cost (10)
│  └── bcrypt version
└── algorithm identifier
```

---

## 4. Confirmation Token

### Generation

```ts
crypto.randomBytes(32).toString("hex")
```

`crypto.randomBytes` uses the operating system's cryptographic random number
generator. **`Math.random()` would be a vulnerability**: it is predictable,
and an attacker who could guess a token could confirm someone else's account.

32 bytes produce 64 hexadecimal characters, or 2^256 possibilities, making
enumeration infeasible.

### Single Use

The token is stored in `users.verification_token`. During confirmation (the
next card), the query clears it as part of the operation:

```sql
UPDATE users
   SET is_verified = TRUE, verification_token = NULL
 WHERE verification_token = $1
```

The confirmation link can therefore be used **only once**.

### Never Returned to the Client

The `201` response contains neither the token nor the account identifier:

```json
{ "message": "Account created, email confirmation required" }
```

The token is meaningful only in the email. Returning it in the HTTP response
would allow an account to be confirmed without access to the mailbox, defeating
the verification required by C3.

---

## 5. Input Validation

The assignment explicitly requires validating all inputs. The rules are
centralized in `lib/validation.ts` instead of being scattered across routes.

### Email

```ts
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

Validation is **intentionally permissive**. Validating an email with a regular
expression is a classic trap: the actual grammar (RFC 5322) allows unusual
forms, and every strict regex eventually rejects legitimate addresses.

We use a minimal format check. Proof that an address really exists comes from
**the confirmation email**, which is precisely its purpose.

### Password

| Rule | Value | Reason |
|---|---|---|
| Minimum length | 8 characters | OWASP / ANSSI recommendation |
| Maximum length | **72 bytes** | Bcrypt technical constraint |

The upper limit is not a design preference. **Bcrypt silently ignores anything
over 72 bytes.** Without this check, two different passwords sharing their
first 72 bytes would be considered identical at login, a subtle vulnerability
that few projects anticipate.

No complexity rule is imposed (uppercase letters, numbers, symbols). OWASP has
recommended for several years that **length** be prioritized: a long passphrase
resists attacks better than a short word filled with special characters and is
less likely to make users write down their password.

### Email Normalization

```ts
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
```

`User@Example.COM` and `user@example.com` identify the same mailbox, but
PostgreSQL's `UNIQUE` constraint is **case-sensitive**. Without normalization,
two separate accounts could be created for the same person.

Normalization is applied before insertion, so the database contains only
lowercase addresses and duplicates are correctly detected.

---

## 6. Error Handling

| Code | Case | Response |
|---|---|---|
| `201` | Account created | `{ "message": "Account created, email confirmation required" }` |
| `400` | Invalid input | `{ "error": "Invalid input", "details": [...] }` |
| `409` | Email already used | `{ "error": "Email already in use" }` |
| `500` | Unexpected error | `{ "error": "Internal server error" }` |

### Status 409 and Duplicate Races

We could check whether the email exists before inserting. This is a bad idea:
between the `SELECT` and the `INSERT`, another request could create the same
account (a race condition).

We therefore let PostgreSQL decide and intercept its error code:

```ts
const PG_UNIQUE_VIOLATION = "23505";

if (pgError.code === PG_UNIQUE_VIOLATION) {
  return res.status(409).json({ error: "Email already in use" });
}
```

The database `UNIQUE` constraint is the only reliable guarantee because it is
atomic.

### Internal Errors Do Not Leak

```ts
console.error("[auth] registration failed:", (err as Error).message);
return res.status(500).json({ error: "Internal server error" });
```

The details go to the logs, not the response. Returning a PostgreSQL message to
the client would reveal table and column names; the assignment requires
avoiding exposure of implementation details.

---

## 7. Temporary: Link in the Logs

Until email delivery is implemented (the next card), the confirmation link is
displayed in the server logs:

```
[auth] verification link for test@example.com:
http://localhost:8080/auth/verify?token=29247310e37d86d0...
```

This allows the complete flow to be tested immediately.

**This must be removed** once real email delivery is in place: logging a
security token is a vulnerability because logs are often readable by more
people than the database.

---

## 8. Tests

### Successful Registration

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"motdepasse123"}'
```

Expected: `201` and the confirmation message.

### Card Validation Criterion

```bash
docker-compose exec db psql -U dashboard -d dashboard \
  -c 'SELECT email, password_hash, is_verified FROM users'
```

Three things to check:

- `password_hash` starts with `$2b$10$`: never the plaintext password
- `is_verified` is `f`: the account is not yet confirmed (C3)
- `email` is lowercase

### Case-Insensitive Duplicate

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"TEST@EXAMPLE.COM","password":"motdepasse123"}'
```

Expected: `409`.

### Validation

```bash
# invalid email
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"pasunemail","password":"motdepasse123"}'

# password too short
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.co","password":"court"}'

# empty body
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" -d '{}'
```

Expected: `400` with the error details.

### Verify the Random Salt

Register two accounts with the **same** password, then:

```bash
docker-compose exec db psql -U dashboard -d dashboard \
  -c 'SELECT email, password_hash FROM users'
```

The two hashes must be **different**.

---

## 9. Remaining Work

| Item | Card |
|---|---|
| Actual confirmation email delivery | 1.3 |
| `GET /auth/verify` route | 1.3 |
| Remove the token `console.log` | 1.3 |
| Login and block unconfirmed accounts | 1.4 |

`verifyPassword()` already exists in `lib/password.ts`; it is not used yet.
# Inscription : hachage et jeton de confirmation

Documentation de la carte **1.2 de la Phase 1**. Ce document explique comment
un compte est créé, pourquoi le mot de passe n'est jamais stocké en clair, et
quelles décisions techniques ont été prises.

Couvre les contraintes **C3** (confirmation avant accès) et **C13** (données
sensibles).

---

## 1. Vue d'ensemble

```
POST /auth/register
   │
   ├> validation de l'email et du mot de passe        lib/validation.ts
   │      échec -> 400 Invalid input
   │
   ├> normalisation de l'email (minuscules)           lib/validation.ts
   │
   ├> hachage bcrypt du mot de passe                  lib/password.ts
   │
   ├> génération d'un jeton aléatoire (32 octets)     routes/auth.ts
   │
   ├> insertion en base, is_verified = FALSE          repositories/users.ts
   │      email déjà pris -> 409 Email already in use
   │
   └> 201 Account created, email confirmation required
```

Le mot de passe en clair ne sort jamais de la route : seul son hash est
transmis au repository, puis stocké.

---

## 2. Fichiers concernés

| Fichier | Rôle |
|---|---|
| `server/src/lib/password.ts` | Hachage et vérification bcrypt |
| `server/src/lib/validation.ts` | Validation des entrées, normalisation de l'email |
| `server/src/routes/auth.ts` | La route `POST /auth/register` |
| `server/src/db/repositories/users.ts` | `createUser()` : écrit déjà en carte 1.1 |
| `server/src/index.ts` | Monte le routeur d'authentification |

Chaque responsabilité est isolée : la route orchestre, les modules `lib/`
font le travail technique, le repository parle à la base. Changer
d'algorithme de hachage ne toucherait qu'un seul fichier.

---

## 3. Le hachage du mot de passe

### Pourquoi hacher et non chiffrer

Le chiffrement est réversible : avec la clé, on retrouve le mot de passe
d'origine. Une fuite de base plus une fuite de clé exposerait tous les
comptes.

Le hachage est à sens unique. On ne stocke pas le mot de passe, mais une
empreinte. À la connexion, on hache ce que l'utilisateur saisit et on compare
les deux empreintes. **Personne, pas même nous, ne peut retrouver un mot de
passe depuis la base.**

### Pourquoi bcrypt et pas SHA-256

SHA-256 est conçu pour être **rapide**, c'est exactement ce qu'on ne veut
pas ici. Une carte graphique calcule des milliards de SHA-256 par seconde :
un dictionnaire de mots de passe courants serait testé en quelques minutes.

bcrypt est délibérément **lent** et son coût est réglable. Avec un coût de 10,
chaque hachage prend environ 60 ms. Tester un million de mots de passe
demanderait alors des jours au lieu de secondes.

### Pourquoi bcrypt et pas argon2

Argon2 est techniquement supérieur : il consomme aussi beaucoup de mémoire,
ce qui neutralise les attaques par GPU (un GPU a beaucoup de cœurs mais peu
de mémoire par cœur).

Le choix de bcrypt tient à une contrainte pratique : argon2 nécessite une
compilation native qui échoue fréquemment sur Alpine Linux, l'image de base
du conteneur `server`. bcrypt est éprouvé depuis plus de vingt ans, largement
suffisant pour ce projet, et s'installe sans friction.

C'est un arbitrage assumé entre sécurité théorique et fiabilité de
déploiement; exactement le type de choix que le sujet demande de justifier.

### Le coût 10

```ts
const SALT_ROUNDS = 10;
```

Le nombre de tours est de 2^10, soit 1024 itérations. Sur une machine
ordinaire, cela représente environ 60 ms par hachage.

| Coût | Temps approximatif |
|---|---|
| 8 | ~15 ms : trop rapide, protection affaiblie |
| **10** | **~60 ms : compromis retenu** |
| 12 | ~250 ms : plus sûr, mais inscription perceptiblement lente |

Ce paramètre est stocké **dans le hash lui-même**, ce qui permettra de
l'augmenter plus tard sans invalider les comptes existants.

### Le sel automatique

bcrypt génère un sel aléatoire pour chaque hachage et l'intègre au résultat.
Conséquence directe : **deux utilisateurs avec le même mot de passe obtiennent
deux hashes différents.**

```
motdepasse123 -> $2b$10$N9qo8uLOickgx2ZMRZoMye...
motdepasse123 -> $2b$10$k7Lz9vQnXpR4mBc2FdHjOu...   (le même, haché à nouveau)
```

Sans sel, deux comptes partageant le même hash révéleraient qu'ils ont le
même mot de passe, et une table pré-calculée (« table arc-en-ciel »)
permettrait de casser tous les comptes d'un coup.

Il n'y a donc **rien d'autre à stocker** : le hash contient l'algorithme, le
coût et le sel.

```
$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
│  │  │ └────────────────── sel + empreinte ──────────────────┘
│  │  └── coût (10)
│  └── version de bcrypt
└── identifiant d'algorithme
```

---

## 4. Le jeton de confirmation

### Génération

```ts
crypto.randomBytes(32).toString("hex")
```

`crypto.randomBytes` utilise le générateur cryptographique du système
d'exploitation. **`Math.random()` serait une faille** : il est prédictible, et
un attaquant capable de deviner un jeton pourrait confirmer le compte de
quelqu'un d'autre.

32 octets donnent 64 caractères hexadécimaux, soit 2^256 possibilités
l'énumération est hors de portée.

### Usage unique

Le jeton est stocké dans `users.verification_token`. Lors de la confirmation
(carte suivante), la requête l'efface au passage :

```sql
UPDATE users
   SET is_verified = TRUE, verification_token = NULL
 WHERE verification_token = $1
```

Le lien de confirmation ne peut donc servir **qu'une seule fois**.

### Jamais renvoyé au client

La réponse `201` ne contient ni le jeton, ni l'identifiant du compte :

```json
{ "message": "Account created, email confirmation required" }
```

Le jeton n'a de sens que dans l'email. Le renvoyer dans la réponse HTTP
permettrait de confirmer un compte sans accéder à la boîte mail, ce qui
viderait de son sens toute la vérification exigée par C3.

---

## 5. La validation des entrées

Le sujet impose explicitement de valider toutes les entrées. Les règles sont
centralisées dans `lib/validation.ts` plutôt que dispersées dans les routes.

### Email

```ts
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

La validation est **volontairement permissive**. Valider un email par
expression régulière est un piège classique : la grammaire réelle (RFC 5322)
autorise des formes très inhabituelles, et toute regex stricte finit par
rejeter des adresses légitimes.

On se contente d'un contrôle de forme minimal. La preuve qu'une adresse
existe vraiment, c'est **l'email de confirmation** qui l'apporte : c'est
précisément son rôle.

### Mot de passe

| Règle | Valeur | Raison |
|---|---|---|
| Longueur minimale | 8 caractères | Recommandation OWASP / ANSSI |
| Longueur maximale | **72 octets** | Contrainte technique de bcrypt |

La limite haute n'est pas une préférence de design. **bcrypt ignore
silencieusement tout ce qui dépasse 72 octets.** Sans ce contrôle, deux mots
de passe différents partageant leurs 72 premiers octets seraient considérés
comme identiques à la connexion, une faille discrète que peu de projets
anticipent.

Aucune règle de complexité n'est imposée (majuscules, chiffres, symboles).
L'OWASP recommande depuis plusieurs années de privilégier la **longueur** :
une phrase de passe longue résiste mieux qu'un mot court truffé de caractères
spéciaux, et ne pousse pas l'utilisateur à noter son mot de passe.

### Normalisation de l'email

```ts
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
```

`User@Example.COM` et `user@example.com` désignent la même boîte mail, mais
la contrainte `UNIQUE` de PostgreSQL est **sensible à la casse**. Sans cette
normalisation, deux comptes distincts seraient créés pour la même personne.

La normalisation est appliquée avant l'insertion, donc la base ne contient
que des adresses en minuscules et les doublons sont correctement détectés.

---

## 6. Gestion des erreurs

| Code | Cas | Réponse |
|---|---|---|
| `201` | Compte créé | `{ "message": "Account created, email confirmation required" }` |
| `400` | Entrée invalide | `{ "error": "Invalid input", "details": [...] }` |
| `409` | Email déjà utilisé | `{ "error": "Email already in use" }` |
| `500` | Erreur inattendue | `{ "error": "Internal server error" }` |

### Le code 409 et la course aux doublons

On pourrait vérifier l'existence de l'email avant d'insérer. C'est une
mauvaise idée : entre le `SELECT` et l'`INSERT`, une autre requête peut créer
le même compte (condition de concurrence).

On laisse donc PostgreSQL trancher, et on intercepte son code d'erreur :

```ts
const PG_UNIQUE_VIOLATION = "23505";

if (pgError.code === PG_UNIQUE_VIOLATION) {
  return res.status(409).json({ error: "Email already in use" });
}
```

La contrainte `UNIQUE` de la base est la seule garantie fiable, parce qu'elle
est atomique.

### Les erreurs internes ne fuitent pas

```ts
console.error("[auth] registration failed:", (err as Error).message);
return res.status(500).json({ error: "Internal server error" });
```

Le détail part dans les logs, pas dans la réponse. Renvoyer un message
PostgreSQL au client révélerait des noms de tables et de colonnes : le sujet
demande d'éviter d'exposer les détails d'implémentation.

---

## 7. Provisoire : le lien dans les logs

Tant que l'envoi d'email n'est pas implémenté (carte suivante), le lien de
confirmation est affiché dans les logs du serveur :

```
[auth] verification link for test@example.com:
http://localhost:8080/auth/verify?token=29247310e37d86d0...
```

Cela permet de tester le parcours complet dès maintenant.

**À retirer impérativement** une fois le vrai envoi en place : journaliser un
jeton de sécurité est une faille, les logs étant souvent lisibles par plus de
personnes que la base.

---

## 8. Tests

### Inscription réussie

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"motdepasse123"}'
```

Attendu : `201` et le message de confirmation.

### Le critère de validation de la carte

```bash
docker-compose exec db psql -U dashboard -d dashboard \
  -c 'SELECT email, password_hash, is_verified FROM users'
```

Trois choses à vérifier :

- `password_hash` commence par `$2b$10$` : jamais le mot de passe en clair
- `is_verified` vaut `f` : le compte n'est pas encore confirmé (C3)
- `email` est en minuscules

### Doublon insensible à la casse

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"TEST@EXAMPLE.COM","password":"motdepasse123"}'
```

Attendu : `409`.

### Validation

```bash
# email invalide
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"pasunemail","password":"motdepasse123"}'

# mot de passe trop court
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.co","password":"court"}'

# corps vide
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" -d '{}'
```

Attendu : `400` avec le détail des erreurs.

### Vérifier le sel aléatoire

Inscrire deux comptes avec le **même** mot de passe, puis :

```bash
docker-compose exec db psql -U dashboard -d dashboard \
  -c 'SELECT email, password_hash FROM users'
```

Les deux hashes doivent être **différents**.

---

## 9. Ce qui reste à faire

| Élément | Carte |
|---|---|
| Envoi réel de l'email de confirmation | 1.3 |
| Route `GET /auth/verify` | 1.3 |
| Retrait du `console.log` du jeton | 1.3 |
| Connexion et blocage des comptes non confirmés | 1.4 |

`verifyPassword()` existe déjà dans `lib/password.ts` : elle n'est pas encore
utilisée,
