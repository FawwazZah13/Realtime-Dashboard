import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "node:http";
import { Server } from "socket.io";
import { buildRouter } from "./routes.js";
import { startGenerator } from "./generator.js";
import { startRatesJob } from "./rates.js";

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const origins = CLIENT_ORIGIN === "*" ? "*" : CLIENT_ORIGIN.split(",").map((s) => s.trim());

const app = express();
app.use(cors({ origin: origins }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: origins },
  pingInterval: 10000,
  pingTimeout: 8000,
});

io.on("connection", (socket) => {
  console.log(`[ws] connect ${socket.id} (total ${io.engine.clientsCount})`);
  socket.emit("server:hello", { serverTime: Date.now() });
  io.emit("clients:count", io.engine.clientsCount);

  // Klien dapat mengukur latensi lewat ack.
  socket.on("ping:check", (cb) => typeof cb === "function" && cb(Date.now()));

  socket.on("disconnect", (reason) => {
    console.log(`[ws] disconnect ${socket.id} (${reason})`);
    io.emit("clients:count", io.engine.clientsCount);
  });
});

app.use("/api", buildRouter(io));

app.get("/", (_req, res) => res.json({ name: "Realtime Dashboard API", health: "/api/health" }));

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

if (process.env.ENABLE_GENERATOR !== "false") startGenerator(io);
if (process.env.ENABLE_RATES !== "false") startRatesJob(io);

server.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));

process.on("SIGTERM", () => server.close(() => process.exit(0)));