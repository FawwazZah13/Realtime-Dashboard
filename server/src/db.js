// SQLite bawaan Node.js (node:sqlite, Node 22.13+): tanpa dependensi native
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const dbPath = process.env.DB_PATH || "./data/dashboard.db";
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

export const db = new DatabaseSync(dbPath);

// Pengaturan performa: WAL memungkinkan read & write berjalan bersamaan.
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("PRAGMA cache_size = -64000"); // ~64MB cache

export function transaction(fn) {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS metrics (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    type  TEXT    NOT NULL,          -- server_temp | transactions | cpu_load
    value REAL    NOT NULL,
    unit  TEXT,
    ts    INTEGER NOT NULL           -- epoch milliseconds
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    level   TEXT    NOT NULL,        -- info | warn | error
    source  TEXT    NOT NULL,
    message TEXT    NOT NULL,
    ts      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exchange_rates (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    base   TEXT    NOT NULL,
    target TEXT    NOT NULL,
    rate   REAL    NOT NULL,
    source TEXT    NOT NULL,        -- api | simulated
    ts     INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_metrics_type_ts ON metrics (type, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_metrics_ts      ON metrics (ts DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_ts         ON activity_logs (ts DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_level_ts   ON activity_logs (level, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_rates_pair_ts   ON exchange_rates (base, target, ts DESC);
`);

export const stmts = {
  insertMetric: db.prepare("INSERT INTO metrics (type, value, unit, ts) VALUES (?, ?, ?, ?)"),
  insertLog: db.prepare("INSERT INTO activity_logs (level, source, message, ts) VALUES (?, ?, ?, ?)"),
  insertRate: db.prepare("INSERT INTO exchange_rates (base, target, rate, source, ts) VALUES (?, ?, ?, ?, ?)"),
};

export function insertMetric(type, value, unit, ts = Date.now()) {
  const info = stmts.insertMetric.run(type, value, unit, ts);
  return { id: Number(info.lastInsertRowid), type, value, unit, ts };
}

export function insertLog(level, source, message, ts = Date.now()) {
  const info = stmts.insertLog.run(level, source, message, ts);
  return { id: Number(info.lastInsertRowid), level, source, message, ts };
}

export function insertRate(base, target, rate, source, ts = Date.now()) {
  const info = stmts.insertRate.run(base, target, rate, source, ts);
  return { id: Number(info.lastInsertRowid), base, target, rate, source, ts };
}