import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api } from "./api";
import { API_URL, MAX_POINTS, METRICS } from "./config";

const emptySeries = () => Object.fromEntries(Object.keys(METRICS).map((k) => [k, []]));

/**
 * Hook utama: memuat data awal via REST, lalu menerima push via Socket.io.
 * status: connecting | connected | reconnecting | disconnected
 */
export function useDashboard() {
  const [series, setSeries] = useState(emptySeries);
  const [logs, setLogs] = useState([]);
  const [rates, setRates] = useState([]);
  const [status, setStatus] = useState("connecting");
  const [retry, setRetry] = useState({ attempt: 0 });
  const [clients, setClients] = useState(0);
  const [latency, setLatency] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const socketRef = useRef(null);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [metricResults, logRes, rateRes] = await Promise.all([
        Promise.all(
          Object.keys(METRICS).map((t) => api(`/api/metrics?type=${t}&limit=${MAX_POINTS}`).then((r) => [t, r.data.reverse()]))
        ),
        api("/api/logs?limit=30"),
        api("/api/rates/latest"),
      ]);
      setSeries(Object.fromEntries(metricResults));
      setLogs(logRes.data);
      setRates(rateRes.data);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 8000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("connected");
      setRetry({ attempt: 0 });
    });
    socket.on("disconnect", (reason) => {
      // "io server disconnect" tidak auto-reconnect, jadi kita panggil manual.
      setStatus(reason === "io server disconnect" ? "disconnected" : "reconnecting");
      if (reason === "io server disconnect") socket.connect();
    });
    socket.on("connect_error", () => setStatus((s) => (s === "connected" ? s : "reconnecting")));
    socket.io.on("reconnect_attempt", (attempt) => {
      setStatus("reconnecting");
      setRetry({ attempt });
    });
    // Setelah tersambung lagi, isi celah data yang terlewat selama offline.
    socket.io.on("reconnect", () => loadInitial());
    socket.io.on("reconnect_failed", () => setStatus("disconnected"));

    socket.on("metric:update", (m) => {
      setLastUpdate(m.ts);
      setSeries((prev) => {
        const arr = prev[m.type];
        if (!arr) return prev;
        const next = [...arr, m];
        if (next.length > MAX_POINTS) next.shift();
        return { ...prev, [m.type]: next };
      });
    });
    socket.on("log:new", (l) => setLogs((prev) => [l, ...prev].slice(0, 30)));
    socket.on("rate:update", (r) =>
      setRates((prev) => [...prev.filter((x) => !(x.base === r.base && x.target === r.target)), r].sort((a, b) => a.target.localeCompare(b.target)))
    );
    socket.on("clients:count", setClients);

    const pinger = setInterval(() => {
      if (!socket.connected) return setLatency(null);
      const t0 = performance.now();
      socket.timeout(3000).emit("ping:check", (err) => setLatency(err ? null : Math.round(performance.now() - t0)));
    }, 5000);

    return () => {
      clearInterval(pinger);
      socket.close();
    };
  }, [loadInitial]);

  const reconnectNow = useCallback(() => {
    setStatus("reconnecting");
    socketRef.current?.connect();
  }, []);

  return { series, logs, rates, status, retry, clients, latency, loadError, loading, lastUpdate, reload: loadInitial, reconnectNow };
}