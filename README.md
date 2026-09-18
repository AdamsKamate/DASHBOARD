# Dashboard

Widget aggregation web application
"Built by you. For you."

A user creates an account, subscribes to services, and builds their dashboard
by adding configured widgets that refresh automatically.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (React) + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL |
| Cache and job queue | Redis + BullMQ |
| Authentication | JWT + manually implemented OAuth 2.0 |
| Deployment | Docker Compose |

The detailed justification for each choice can be found in
`docs/dashboard-benchmark.pdf`.

## Run the Project

```bash
cp .env.example .env
# Set at least JWT_SECRET and ENCRYPTION_KEY:
#   openssl rand -hex 32      -> JWT_SECRET
#   openssl rand -base64 32   -> ENCRYPTION_KEY

docker-compose up --build
```

- Server: http://localhost:8080
- `about.json` : http://localhost:8080/about.json
- Client: http://localhost:8081

## Documentation

| File | Contents |
|---|---|
| `API.md` | API contract : all routes and their formats |
| `docs/Services.md` | Selected services and widgets, with team assignments |
| `docs/dashboard-benchmark.pdf` | Benchmark and justification of the technical choices |

## Project Structure

```
server/       REST API, OAuth, BullMQ worker (Timer)
client_web/   Next.js interface
docs/         project documentation
bonus/        bonus files (outside the required scope)
```

## Add a Service

1. Create `server/src/services/<name>.ts` implementing `ServiceProvider`
2. Register it in `server/src/services/registry.ts`

No other changes are required: `about.json` and the Timer automatically
iterate over the registry.
