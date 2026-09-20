-- =============
-- PostgreSQL schema : Dashboard
-- 6 tables covering all functional requirements of the assignment.
--
-- This file is mounted into /docker-entrypoint-initdb.d/ by docker-compose,
-- so it is executed automatically when the volume is first created.
-- ============

-- gen_random_uuid() is provided by pgcrypto (included by default in postgres:16).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --------------------------------------
-- users : platform accounts (C3, C4)
-- --------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT UNIQUE NOT NULL,
  password_hash       TEXT NOT NULL, -- bcrypt, never stored in plaintext
  is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token  TEXT, -- NULL once confirmed
  role                TEXT NOT NULL DEFAULT 'user'
                      CHECK (role IN ('user', 'admin')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- services : service catalog (weather, github, google...)
-- Populated at startup from the ServiceProvider registry.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id             TEXT PRIMARY KEY, -- 'weather', 'github', 'google'
  name           TEXT NOT NULL,
  requires_auth  BOOLEAN NOT NULL DEFAULT FALSE   -- FALSE = available without OAuth
);

-- ----------------------------------------------------------------------------
-- user_services : subscriptions and OAuth tokens (C5, C6, C13)
-- Tokens are encrypted with AES-GCM before insertion and never stored in plaintext.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_services (
  user_id        UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  service_id     TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  access_token   TEXT, -- encrypted
  refresh_token  TEXT, -- encrypted
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, service_id)
);

-- ---------------------------------------------------------
-- widget_types : what a widget can do (C2, C8)
-- This table feeds /about.json and /widget-types.
-- params_schema : [{ "name": "city", "type": "string" }]
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS widget_types (
  id             TEXT PRIMARY KEY, -- 'city_temperature'
  service_id     TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  params_schema  JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- ----------------------------------------------------------------------------
-- widget_instances : a configured occurrence on a user's dashboard
-- (C8, C9, C10, C11)
--
-- Key architectural point: configuration belongs to the INSTANCE, not the
-- type. This allows two city_temperature instances to display Paris and Tokyo
-- simultaneously (C11).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS widget_instances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  widget_type_id  TEXT NOT NULL REFERENCES widget_types(id) ON DELETE CASCADE,
  params          JSONB NOT NULL DEFAULT '{}'::jsonb, -- { "city": "Paris" }
  refresh_rate    INTEGER NOT NULL DEFAULT 300 -- seconds
                  CHECK (refresh_rate >= 30), -- rate-limit safeguard
  position_x      INTEGER NOT NULL DEFAULT 0,
  position_y      INTEGER NOT NULL DEFAULT 0,
  width           INTEGER NOT NULL DEFAULT 2,
  height          INTEGER NOT NULL DEFAULT 2,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_widget_instances_user
  ON widget_instances(user_id);

-- ----------------------------------------------------------------------------
-- widget_cache : latest known result for each instance (C9)
-- Populated by the BullMQ worker and read by GET /widgets/:id/data.
-- The frontend never triggers an external call; it always reads from here.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS widget_cache (
  instance_id  UUID PRIMARY KEY REFERENCES widget_instances(id) ON DELETE CASCADE,
  data         JSONB,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('ok', 'pending', 'error')),
  error        TEXT, -- reason when status = 'error'
  fetched_at   TIMESTAMPTZ
);