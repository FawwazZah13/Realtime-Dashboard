import cron from "node-cron";
import { insertMetric, insertLog } from "./db.js";

const state = { temp: 55, cpu: 35 }

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => Math.random() * (max - min) + min;

const SOURCE = ["auth-service", "payment-gateway", "api-gateway", "db-prmary", "worker-queue"];
const MESSAGES = {
    info: ["Request processed", "User login success", "Cache refreshed", "Health check OK", "Job completed"],
    warn: ["Response time above threshold", "Retrying upstream request", "Memory usage high", "Slow query detected"],
    error: ["Upstream timeout", "Payment declined by issuer", "Connection pool exhausted", "Unhandled exception in worker"],
};

function pickLevel() {
    const r = Math.random();
    if (r < 0.04) return "error";
    if (r < 0.2) return "warn";
    return "info";
}

export function startGenerator(io) {
    const intervalSec = Number(process.env.GENERATOR_INTERVAL_SEC || 2);
    const expr = `*/${Math.max(1, intervalSec)} * * * * *`;

    const task = cron.schedule(expr, () => {
        const ts = Date.now();

        state.temp = clamp(state.temp + rand(-1.5, 1.6), 40, 95);
        state.cpu = clamp(state.cpu + rand(-6, 6.5), 5, 100);
        const transaction = Math.round(rand(20, 160));

        const batch = [
            insertMetric("server_temp", +state.temp.toFixed(2), "°C", ts),
            insertMetric("cpu_load", +state.cpu.toFixed(2), "%", ts),
            insertMetric("transactions", transaction, "tx", ts),
        ]

        for (const m of batch) io.emit("metric:update", m);

        if (Math.random() < 0.7) {
            const level = state.temp > 85 ? "warn" : pickLevel();
            const message = MESSAGES[level][Math.floor(Math.random() * MESSAGES[level].length)];
            const source = SOURCE[Math.floor(Math.random() * SOURCE.length)];

            io.emit("logLnew", insertLog(level, source, message, ts));
        }
    });

    console.log(`[generator] cron aktif (${expr})`);

    return task;
}