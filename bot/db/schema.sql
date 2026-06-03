CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'seller',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seller_config (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id                 INTEGER NOT NULL UNIQUE REFERENCES users(id),
  shop_channel_id           TEXT,
  ticket_category_id        TEXT,
  vouch_channel_id          TEXT,
  log_channel_id            TEXT,
  stock_updates_channel_id  TEXT,
  customer_role_id          TEXT,
  shop_message_id           TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id   INTEGER NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '',
  quantity    INTEGER NOT NULL DEFAULT 0,
  visible     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tickets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id   INTEGER NOT NULL REFERENCES users(id),
  discord_id  TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id    INTEGER NOT NULL REFERENCES users(id),
  discord_id   TEXT NOT NULL,
  discord_tag  TEXT,
  items_json   TEXT NOT NULL,
  amount       TEXT,
  type         TEXT NOT NULL DEFAULT 'auto',
  ticket_id    TEXT,
  date         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_seller_config_shop   ON seller_config(shop_channel_id);
CREATE INDEX IF NOT EXISTS idx_seller_config_ticket ON seller_config(ticket_category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_channel      ON tickets(channel_id);
CREATE INDEX IF NOT EXISTS idx_tickets_discord      ON tickets(discord_id, seller_id, status);
CREATE INDEX IF NOT EXISTS idx_items_seller         ON items(seller_id);
CREATE INDEX IF NOT EXISTS idx_purchases_seller     ON purchases(seller_id);