import { useEffect, useState } from "react";
import { useDashboard } from "./useDashboard";
import { METRICS } from "./config";
import LiveChart from "./components/LiveChart";
import ConnectionBanner from "./components/ConnectionBanner";
import ExportMenu from "./components/ExportMenu";
import ErrorBoundary from "./components/ErrorBoundary";

const fmtTime = (ts) => new Date(ts).toLocaleTimeString("id-ID", { hour12: false });
const STATUS_LABEL = { connected: "Live", connecting: "Menghubungkan", reconnecting: "Menyambung ulang", disconnected: "Terputus" };

function StatCard({ id, points }) {
  const meta = METRICS[id];
  const last = points[points.length - 1];
  const warn = last && meta.warnAt && last.value >= meta.warnAt;
  return (
    <div className={`card stat ${warn ? "stat-warn" : ""}`}>
      <div className="stat-label">{meta.label}</div>
      <div className="stat-value" style={{ color: warn ? "#ef4444" : meta.color }}>
        {last ? last.value : "–"} <small>{meta.unit}</small>
      </div>
      <div className="stat-sub">{warn ? "Melebihi ambang batas" : last ? `Update ${fmtTime(last.ts)}` : "Menunggu data…"}</div>
    </div>
  );
}

export default function App() {
  const d = useDashboard();
  const [toast, setToast] = useState(null);

  const showToast = (msg, kind = "ok") => setToast({ msg, kind });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="app">
      <header>
        <div>
          <h1>Realtime Analytics Dashboard</h1>
          <p className="muted">Metrik server, transaksi, log aktivitas & kurs mata uang</p>
        </div>
        <div className="header-right">
          <span className={`pill pill-${d.status}`}>
            <i /> {STATUS_LABEL[d.status]}
          </span>
          <span className="muted small">
            {d.latency != null ? `${d.latency} ms` : "– ms"} · {d.clients} klien
          </span>
        </div>
      </header>

      <ConnectionBanner status={d.status} retry={d.retry} onRetry={d.reconnectNow} />

      {d.loadError && (
        <div className="banner banner-disconnected" role="alert">
          <span>Gagal memuat data awal: {d.loadError}</span>
          <button onClick={d.reload}>Muat ulang</button>
        </div>
      )}

      <section className="grid stats">
        {Object.keys(METRICS).map((id) => (
          <StatCard key={id} id={id} points={d.series[id]} />
        ))}
      </section>

      <section className="grid charts">
        {Object.entries(METRICS).map(([id, m]) => (
          <div className="card" key={id}>
            <h3>{m.label}</h3>
            <ErrorBoundary>
              {d.loading ? <div className="skeleton" /> : <LiveChart title={m.label} unit={m.unit} color={m.color} points={d.series[id]} />}
            </ErrorBoundary>
          </div>
        ))}

        <div className="card">
          <h3>Kurs Mata Uang</h3>
          {d.rates.length === 0 ? (
            <p className="muted">Belum ada data kurs.</p>
          ) : (
            <table>
              <thead><tr><th>Pasangan</th><th>Kurs</th><th>Sumber</th><th>Update</th></tr></thead>
              <tbody>
                {d.rates.map((r) => (
                  <tr key={`${r.base}${r.target}`}>
                    <td>{r.base}/{r.target}</td>
                    <td>{r.rate.toLocaleString("id-ID", { maximumFractionDigits: 4 })}</td>
                    <td><span className={`tag tag-${r.source}`}>{r.source === "api" ? "API publik" : "simulasi"}</span></td>
                    <td>{fmtTime(r.ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="card">
        <div className="row-between">
          <h3>Log Aktivitas</h3>
          <ExportMenu series={d.series} onToast={showToast} />
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Waktu</th><th>Level</th><th>Sumber</th><th>Pesan</th></tr></thead>
            <tbody>
              {d.logs.map((l) => (
                <tr key={l.id}>
                  <td>{fmtTime(l.ts)}</td>
                  <td><span className={`tag tag-${l.level}`}>{l.level}</span></td>
                  <td>{l.source}</td>
                  <td>{l.message}</td>
                </tr>
              ))}
              {d.logs.length === 0 && (
                <tr><td colSpan="4" className="muted">Belum ada log.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.msg}</div>}
    </div>
  );
}