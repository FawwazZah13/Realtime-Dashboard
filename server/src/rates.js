import cron from "node-cron";
import { insertRate } from "./db.js";

// Integrasi API publik kurs mata uang (open.er-api.com, tanpa API key).
// Jika API gagal/timeout, fallback ke nilai simulasi agar dashboard tetap hidup.
const API_URL = process.env.RATES_API_URL || "https://open.er-api.com/v6/latest";
const BASE = process.env.RATES_BASE || "USD";
const TARGETS = (process.env.RATES_TARGETS || "IDR,EUR,JPY").split(",").map((s) => s.trim());

const lastKnown = { IDR: 16000, EUR: 0.92, JPY: 150 };

async function fetchFromApi() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${API_URL}/${BASE}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.rates) throw new Error("Respons API tidak valid");
    return json.rates;
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshRates(io) {
  let rates;
  let source = "api";
  try {
    rates = await fetchFromApi();
  } catch (err) {
    source = "simulated";
    console.warn(`[rates] API gagal (${err.message}), memakai data simulasi`);
    rates = {};
    for (const t of TARGETS) {
      lastKnown[t] = (lastKnown[t] ?? 1) * (1 + (Math.random() - 0.5) * 0.004);
      rates[t] = lastKnown[t];
    }
  }

  const out = [];
  for (const t of TARGETS) {
    if (rates[t] == null) continue;
    lastKnown[t] = rates[t];
    const row = insertRate(BASE, t, +Number(rates[t]).toFixed(6), source);
    out.push(row);
    io.emit("rate:update", row);
  }
  return out;
}

export function startRatesJob(io) {
  const minutes = Number(process.env.RATES_REFRESH_MIN || 5);
  refreshRates(io).catch((e) => console.error("[rates]", e.message));
  // Cron berjalan tiap N menit; API gratis memang diperbarui jarang.
  return cron.schedule(`*/${Math.max(1, minutes)} * * * *`, () => {
    refreshRates(io).catch((e) => console.error("[rates]", e.message));
  });
}