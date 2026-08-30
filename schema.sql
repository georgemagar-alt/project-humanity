-- Schema for Project Humanity. Apply with:  npm run db:schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campaigns (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT    NOT NULL UNIQUE,
  title_de       TEXT    NOT NULL,
  title_en       TEXT    NOT NULL,
  description_de TEXT    NOT NULL DEFAULT '',
  description_en TEXT    NOT NULL DEFAULT '',
  goal_cents     INTEGER NOT NULL CHECK (goal_cents > 0),
  currency       TEXT    NOT NULL DEFAULT 'EUR',
  starts_at      TEXT,
  ends_at        TEXT,
  status         TEXT    NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','paused','completed','archived')),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS donations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id       INTEGER NOT NULL REFERENCES campaigns(id),
  gross_cents       INTEGER NOT NULL CHECK (gross_cents > 0),
  net_cents         INTEGER,
  currency          TEXT    NOT NULL DEFAULT 'EUR',
  donor_name        TEXT,
  donor_email       TEXT,
  message           TEXT,
  paypal_order_id   TEXT,
  paypal_capture_id TEXT    UNIQUE,
  status            TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','completed','refunded')),
  locale            TEXT    NOT NULL DEFAULT 'de' CHECK (locale IN ('de','en')),
  email_sent_at     TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_donations_campaign_status
  ON donations (campaign_id, status);

CREATE TABLE IF NOT EXISTS membership_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  phone      TEXT,
  message    TEXT,
  locale     TEXT    NOT NULL DEFAULT 'de',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  handled_at TEXT
);
