import { Router } from "express";
import { db } from "./db.js";
import { refreshRates } from "./rates.js";

const METRIC_TYPES = ["server_temp", "cpu_load", "transactions"];
const LOG_LEVELS = ["info", "warn", "error"];

const toInt = (v, def, min, max) => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
};
const toTs = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  const d = Date.parse(v);
  return Number.isNaN(d) ? null : d;
};

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v).replace(/°C/g, "C");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function streamCsv(res, filename, headers, iterator) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.write("\uFEFFsep=,\n");
  res.write(headers.join(",") + "\n");
  for (const row of iterator) {
    res.write(headers.map((h) => csvEscape(row[h])).join(",") + "\n");
  }
  res.end();
}

export function buildRouter(io) {
  const r = Router();

  r.get("/health", (_req, res) => {
    const { c } = db.prepare("SELECT COUNT(*) AS c FROM metrics").get();
    res.json({ status: "ok", uptime: process.uptime(), metricsRows: c, clients: io.engine.clientsCount });
  });

  // --- Metrics ---
  r.get("/metrics", (req, res) => {
    const { type } = req.query;
    if (type && !METRIC_TYPES.includes(type)) {
      return res.status(400).json({ error: `type harus salah satu dari: ${METRIC_TYPES.join(", ")}` });
    }
    const limit = toInt(req.query.limit, 100, 1, 5000);
        const from = toTs(req.query.from);
    const to = toTs(req.query.to);

    if (req.query.from != null && from == null) {
      return res.status(400).json({ error: "parameter from tidak valid" });
    }
    if (req.query.to != null && to == null) {
      return res.status(400).json({ error: "parameter to tidak valid" });
    }
    if (from != null && to != null && from > to) {
      return res.status(400).json({ error: "from harus <= to" });
    }

    const cursor = toInt(req.query.cursor, null, 1, Number.MAX_SAFE_INTEGER);
    if (req.query.cursor && cursor == null) {
      return res.status(400).json({ error: "cursor tidak valid" });
    }

    const where = [];
    const params = [];
    if (type) { where.push("type = ?"); params.push(type); }
    if (from != null) { where.push("ts >= ?"); params.push(from); }
    if (to != null) { where.push("ts <= ?"); params.push(to); }
    if (cursor != null) { where.push("id < ?"); params.push(cursor); }

    const sql = `SELECT id, type, value, unit, ts FROM metrics
                 ${where.length ? "WHERE " + where.join(" AND ") : ""}
                 ORDER BY ts DESC, id DESC LIMIT ?`;
    const rows = db.prepare(sql).all(...params, limit);
    res.json({ data: rows, nextCursor: rows.length === limit ? rows[rows.length - 1].id : null });
  });

  // Agregasi per bucket waktu (avg/min/max)
  r.get("/metrics/series", (req, res) => {
    const type = req.query.type;
    if (!METRIC_TYPES.includes(type)) {
      return res.status(400).json({ error: `type wajib diisi: ${METRIC_TYPES.join(", ")}` });
    }
    const to = toTs(req.query.to) ?? Date.now();
    const from = toTs(req.query.from) ?? to - 15 * 60 * 1000;
    const buckets = toInt(req.query.buckets, 60, 1, 1000);
    const bucketMs = Math.max(1000, Math.ceil((to - from) / buckets));

    const rows = db
      .prepare(
        `SELECT CAST(ts / ? AS INTEGER) * ? AS bucket, AVG(value) AS avg, MIN(value) AS min,
                MAX(value) AS max, SUM(value) AS sum, COUNT(*) AS n
         FROM metrics WHERE type = ? AND ts BETWEEN ? AND ?
         GROUP BY bucket ORDER BY bucket ASC`
      )
      .all(bucketMs, bucketMs, type, from, to);
    res.json({ type, from, to, bucketMs, data: rows });
  });

  r.get("/metrics/summary", (_req, res) => {
    const since = Date.now() - 5 * 60 * 1000;
    const out = {};
    for (const type of METRIC_TYPES) {
      const latest = db
        .prepare("SELECT value, unit, ts FROM metrics WHERE type = ? ORDER BY ts DESC LIMIT 1")
        .get(type);
      const agg = db
        .prepare("SELECT AVG(value) AS avg, MIN(value) AS min, MAX(value) AS max, SUM(value) AS sum FROM metrics WHERE type = ? AND ts >= ?")
        .get(type, since);
      out[type] = { latest: latest ?? null, last5min: agg };
    }
    res.json(out);
  });

  // --- Logs ---
  r.get("/logs", (req, res) => {
    const { level } = req.query;
    if (level && !LOG_LEVELS.includes(level)) {
      return res.status(400).json({ error: `level harus salah satu dari: ${LOG_LEVELS.join(", ")}` });
    }
    const limit = toInt(req.query.limit, 50, 1, 1000);
    const cursor = toInt(req.query.cursor, null, 1, Number.MAX_SAFE_INTEGER);
    const where = [];
    const params = [];
    if (level) { where.push("level = ?"); params.push(level); }
    if (cursor != null) { where.push("id < ?"); params.push(cursor); }
    const rows = db
      .prepare(
        `SELECT id, level, source, message, ts FROM activity_logs
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY ts DESC, id DESC LIMIT ?`
      )
      .all(...params, limit);
    res.json({ data: rows, nextCursor: rows.length === limit ? rows[rows.length - 1].id : null });
  });

  // --- Exchange rates ----------------------------------------------------
  r.get("/rates/latest", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT base, target, rate, source, ts FROM exchange_rates
         WHERE id IN (SELECT MAX(id) FROM exchange_rates GROUP BY base, target)
         ORDER BY target`
      )
      .all();
    res.json({ data: rows });
  });

  r.get("/rates/history", (req, res) => {
    const target = String(req.query.target || "IDR").toUpperCase();
    const limit = toInt(req.query.limit, 100, 1, 2000);
    const rows = db
      .prepare("SELECT base, target, rate, source, ts FROM exchange_rates WHERE target = ? ORDER BY ts DESC LIMIT ?")
      .all(target, limit);
    res.json({ data: rows.reverse() });
  });

  r.post("/rates/refresh", async (_req, res) => {
    try {
      res.json({ data: await refreshRates(io) });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // --- Export CSV ---
  r.get("/export/metrics.csv", (req, res) => {
    const { type } = req.query;
    if (type && !METRIC_TYPES.includes(type)) return res.status(400).json({ error: "type tidak valid" });
    const limit = toInt(req.query.limit, 10000, 1, 500000);
    const from = toTs(req.query.from);
    const to = toTs(req.query.to);
    const where = [];
    const params = [];
    if (type) { where.push("type = ?"); params.push(type); }
    if (from != null) { where.push("ts >= ?"); params.push(from); }
    if (to != null) { where.push("ts <= ?"); params.push(to); }
    const stmt = db.prepare(
      `SELECT id, type, value, unit, datetime(ts / 1000, 'unixepoch') AS time_utc, ts
       FROM metrics ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY ts DESC LIMIT ?`
    );
    streamCsv(res, "metrics.csv", ["id", "type", "value", "unit", "time_utc", "ts"], stmt.iterate(...params, limit));
  });

  r.get("/export/logs.csv", (req, res) => {
    const limit = toInt(req.query.limit, 10000, 1, 500000);
    const stmt = db.prepare(
      `SELECT id, level, source, message, datetime(ts / 1000, 'unixepoch') AS time_utc, ts
       FROM activity_logs ORDER BY ts DESC LIMIT ?`
    );
    streamCsv(res, "logs.csv", ["id", "level", "source", "message", "time_utc", "ts"], stmt.iterate(limit));
  });

  // ---  indexing ---
  r.get("/debug/query-plan", (_req, res) => {
    const plan = db
      .prepare("EXPLAIN QUERY PLAN SELECT * FROM metrics WHERE type = ? AND ts BETWEEN ? AND ? ORDER BY ts DESC LIMIT 100")
      .all("cpu_load", 0, Date.now());
    res.json({ plan: plan.map((p) => p.detail) });
  });

  return r;
}