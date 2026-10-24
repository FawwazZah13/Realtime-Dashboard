import "dotenv/config";
import { db, stmts, transaction } from "./db.js";

const total = Number(process.argv[2] || 200000);
const types = [
    ["server_temp", "°C", () => 50 + Math.random() * 30],
    ["cpu_load", "%", () => 10 + Math.random() * 80],
    ["transactions", "tx", () => Math.round(20 + Math.random() * 140)],
];

const now = Date.now();
const step = 2000;
const perType = Math.ceil(total / types.length);

console.log("seed");
transaction(() => {
    for (let i = 0; i < perType; i++) {
        const ts = now - (perType - i) * step;
        for (const [type, unit, gen] of types) stmts.insertMetric.run(type, +gen().toFixed(2), unit, ts);
    }
});

console.timeEnd("seed");
console.log("Total baris metrics:", db.prepare("SELECT COUNT(*) AS c FROM metrics").get().c);