
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { io as ioClient } from "socket.io-client";

let dbPath;
let server;
let baseUrl;
let tempDir;
let output = "";

before(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "dashboard-test-"));
    dbPath = path.join(tempDir, "test.db");
    const port = 4100 + Math.floor(Math.random() * 1000);
    baseUrl = `http://127.0.0.1:${port}`;

    server = spawn(process.execPath, ["src/index.js"], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            NODE_ENV: "test",
            DB_PATH: dbPath,
            PORT: String(port),
            ENABLE_GENERATOR: "false",
            ENABLE_RATES: "false",
            CLIENT_ORIGIN: "http://localhost:5173",
        },
        stdio: ["ignore", "pipe", "pipe"],
    });

    server.stdout.on("data", (data) => {
        output += data.toString();
    });
    server.stderr.on("data", (data) => {
        output += data.toString();
    });

    for (let i = 0; i < 100; i++) {
        if (server.exitCode !== null) {
            throw new Error(`Server gagal dijalankan:\n${output}`);
        }

        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) return;
        } catch {
            // Server mungkin masih dalam proses startup.
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Server tidak siap tepat waktu:\n${output}`);
});

after(async () => {
    if (server && server.exitCode === null) {
        const exited = once(server, "exit");
        server.kill("SIGTERM");

        await Promise.race([
            exited,
            new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
    }

    if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("server berjalan dengan database test kosong", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.status, "ok");
    assert.equal(body.metricsRows, 0);
});

test("Helmet memasang header keamanan HTTP", async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.ok(response.headers.get("x-frame-options"));
    assert.ok(response.headers.get("content-security-policy"));
});

test("metrics menolak tipe yang tidak valid", async () => {
    const response = await fetch(`${baseUrl}/api/metrics?type=invalid`);
    assert.equal(response.status, 400);

    const body = await response.json();
    assert.match(body.error, /type harus salah satu/);
});

test("metrics menolak parameter from yang tidak valid", async () => {
    const response = await fetch(`${baseUrl}/api/metrics?from=bukan-tanggal`);
    assert.equal(response.status, 400);

    const body = await response.json();
    assert.equal(body.error, "parameter from tidak valid");
});

test("metrics menolak rentang waktu terbalik", async () => {
    const response = await fetch(`${baseUrl}/api/metrics?from=200&to=100`);
    assert.equal(response.status, 400);

    const body = await response.json();
    assert.equal(body.error, "from harus <= to");
});

test("metrics menolak cursor yang tidak valid", async () => {
    const response = await fetch(
        `${baseUrl}/api/metrics?cursor=ini-bukan-cursor`
    );
    assert.equal(response.status, 400);

    const body = await response.json();
    assert.equal(body.error, "cursor tidak valid");
});

test("logs menolak level yang tidak valid", async () => {
    const response = await fetch(`${baseUrl}/api/logs?level=debug`);
    assert.equal(response.status, 400);

    const body = await response.json();
    assert.match(body.error, /level harus salah satu/);
});


test("metrics pagination tidak melewatkan data dengan timestamp sama", async () => {
    const testDb = new DatabaseSync(dbPath);

    try {
        const ts = 1700000000000;

        const insert = testDb.prepare(
            "INSERT INTO metrics (type, value, unit, ts) VALUES (?, ?, ?, ?)"
        );

        for (let i = 1; i <= 5; i++) {
            insert.run("cpu_load", i, "%", ts);
        }
    } finally {
        testDb.close();
    }

    const firstResponse = await fetch(
        `${baseUrl}/api/metrics?type=cpu_load&from=1700000000000&to=1700000000000&limit=2`
    );

    assert.equal(firstResponse.status, 200);
    const firstPage = await firstResponse.json();

    assert.equal(firstPage.data.length, 2);
    assert.ok(firstPage.nextCursor);

    const secondResponse = await fetch(
        `${baseUrl}/api/metrics?type=cpu_load&from=1700000000000&to=1700000000000&limit=2&cursor=${encodeURIComponent(firstPage.nextCursor)}`
    );

    assert.equal(secondResponse.status, 200);
    const secondPage = await secondResponse.json();

    assert.equal(secondPage.data.length, 2);

    const thirdResponse = await fetch(
        `${baseUrl}/api/metrics?type=cpu_load&from=1700000000000&to=1700000000000&limit=2&cursor=${encodeURIComponent(secondPage.nextCursor)}`
    );

    assert.equal(thirdResponse.status, 200);
    const thirdPage = await thirdResponse.json();

    assert.equal(thirdPage.data.length, 1);
    assert.equal(thirdPage.nextCursor, null);

    const ids = [
        ...firstPage.data,
        ...secondPage.data,
        ...thirdPage.data,
    ].map((row) => row.id);

    assert.equal(new Set(ids).size, 5);
    assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
});


test("export metrics CSV memiliki header unduhan dan kolom yang benar", async () => {
    const response = await fetch(`${baseUrl}/api/export/metrics.csv?type=cpu_load`);

    assert.equal(response.status, 200);
    assert.match(
        response.headers.get("content-type") || "",
        /text\/csv/i
    );
    assert.match(
        response.headers.get("content-disposition") || "",
        /attachment; filename="metrics\.csv"/
    );

    const csv = await response.text();
    assert.match(csv, /^(?:\uFEFF)?sep=,\r?\n/);
    assert.match(csv, /id,type,value,unit,time_utc,ts/);
});

test("export logs CSV memiliki header unduhan dan kolom yang benar", async () => {
    const response = await fetch(`${baseUrl}/api/export/logs.csv`);

    assert.equal(response.status, 200);
    assert.match(
        response.headers.get("content-type") || "",
        /text\/csv/i
    );
    assert.match(
        response.headers.get("content-disposition") || "",
        /attachment; filename="logs\.csv"/
    );

    const csv = await response.text();
    assert.match(csv, /^(?:\uFEFF)?sep=,\r?\n/);
    assert.match(csv, /id,level,source,message,time_utc,ts/);
});


test("P1-1: generator mengirim log:new melalui Socket.IO", { timeout: 20000 }, async () => {
  const testDir = await mkdtemp(path.join(os.tmpdir(), "dashboard-socket-test-"));
  const testDbPath = path.join(testDir, "socket-test.db");
  const port = 5100 + Math.floor(Math.random() * 1000);
  const testUrl = `http://127.0.0.1:${port}`;

  let child;
  let socket;
  let childOutput = "";

  try {
    child = spawn(process.execPath, ["src/index.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DB_PATH: testDbPath,
        PORT: String(port),
        ENABLE_GENERATOR: "true",
        ENABLE_RATES: "false",
        GENERATOR_INTERVAL_SEC: "1",
        CLIENT_ORIGIN: "http://localhost:5173",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (data) => {
      childOutput += data.toString();
    });

    child.stderr.on("data", (data) => {
      childOutput += data.toString();
    });

    let serverReady = false;

    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) {
        throw new Error(`Server test gagal dijalankan:\n${childOutput}`);
      }

      try {
        const response = await fetch(`${testUrl}/api/health`);

        if (response.ok) {
          serverReady = true;
          break;
        }
      } catch {
        // Server masih dalam proses startup.
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assert.ok(serverReady, `Server Socket.IO tidak siap:\n${childOutput}`);

    socket = ioClient(testUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 3000,
    });

    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });

    const log = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "Event log:new tidak diterima dalam 12 detik. Periksa nama event di generator.js."
          )
        );
      }, 12000);

      function cleanup() {
        clearTimeout(timer);
        socket.off("log:new", onLog);
      }

      function onLog(data) {
        cleanup();
        resolve(data);
      }

      socket.on("log:new", onLog);
    });

    assert.ok(log);
    assert.ok(log.level);
    assert.ok(log.message);
  } finally {
    if (socket) socket.close();

    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");

      await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }

    await rm(testDir, { recursive: true, force: true });
  }
});

test("rate limit menolak request berlebihan dengan status 429", async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), "dashboard-rate-limit-test-"));
    const testDbPath = path.join(testDir, "rate-limit-test.db");
    const port = 6100 + Math.floor(Math.random() * 1000);
    const testUrl = `http://127.0.0.1:${port}`;

    let child;
    let childOutput = "";

    try {
        child = spawn(process.execPath, ["src/index.js"], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                NODE_ENV: "test",
                DB_PATH: testDbPath,
                PORT: String(port),
                ENABLE_GENERATOR: "false",
                ENABLE_RATES: "false",
                RATE_LIMIT_MAX: "2",
                CLIENT_ORIGIN: "http://localhost:5173",
            },
            stdio: ["ignore", "pipe", "pipe"],
        });

        child.stdout.on("data", (data) => {
            childOutput += data.toString();
        });

        child.stderr.on("data", (data) => {
            childOutput += data.toString();
        });

        let ready = false;

        for (let i = 0; i < 100; i++) {
            if (child.exitCode !== null) {
                throw new Error(`Server rate limit gagal dijalankan:\n${childOutput}`);
            }

            try {
                const response = await fetch(`${testUrl}/api/health`);
                if (response.status === 200) {
                    ready = true;
                    break;
                }
            } catch {
                // Server masih startup.
            }

            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        assert.ok(ready, `Server rate limit tidak siap:\n${childOutput}`);

        // Dua request pertama menghabiskan batas.
        await fetch(`${testUrl}/api/health`);
        const blockedResponse = await fetch(`${testUrl}/api/health`);

        assert.equal(blockedResponse.status, 429);

        const body = await blockedResponse.json();
        assert.equal(body.error, "Terlalu banyak request, silakan coba lagi nanti.");
    } finally {
        if (child && child.exitCode === null) {
            const exited = once(child, "exit");
            child.kill("SIGTERM");

            await Promise.race([
                exited,
                new Promise((resolve) => setTimeout(resolve, 3000)),
            ]);
        }

        await rm(testDir, { recursive: true, force: true });
    }
});
