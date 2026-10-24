// URL backend. Atur lewat VITE_API_URL (lihat client/.env.example).
export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");

export const METRICS = {
  server_temp: { label: "Suhu Server", unit: "°C", color: "#f97316", warnAt: 85 },
  cpu_load: { label: "CPU Load", unit: "%", color: "#38bdf8", warnAt: 90 },
  transactions: { label: "Transaksi Masuk", unit: "tx", color: "#34d399", warnAt: null },
};

export const MAX_POINTS = 60;