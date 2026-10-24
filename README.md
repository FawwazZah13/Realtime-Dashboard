# Realtime Analytics Dashboard

Dashboard monitoring real-time (suhu server, CPU, transaksi masuk, log aktivitas, kurs mata uang) untuk Fullstack Engineer Technical Assessment.

## Fitur

**Backend** (`server/`)
- Socket.io mendorong data (`metric:update`, `log:new`, `rate:update`, `clients:count`) ke frontend otomatis.
- Background cron job (`node-cron`) menghasilkan metrik dan log tiap 2 detik.
- Integrasi API publik kurs mata uang ([open.er-api.com](https://open.er-api.com), tanpa API key). Jika API tidak terjangkau, fallback ke data simulasi (ditandai `simulated` di UI).
- Database SQLite (modul bawaan Node `node:sqlite`, mode WAL, tanpa dependensi native) dengan composite index `(type, ts DESC)`. Bukti pemakaian index: `GET /api/debug/query-plan`.
- Pagination cursor, agregasi per bucket waktu, dan ekspor CSV streaming agar tetap cepat pada data besar.

**Frontend** (`client/`)
- Grafik interaktif Chart.js yang update otomatis tanpa refresh.
- Ekspor CSV dan PDF.
- Penanganan koneksi terputus: indikator status, banner, auto-reconnect dengan backoff, tombol "Coba sekarang", pemuatan ulang data setelah tersambung kembali, dan fallback ekspor dari data di layar.

## Struktur

```
realtime-dashboard/
├── server/   # Express + Socket.io + SQLite
├── client/   # React + Vite + Chart.js
└── docs/     # Postman collection
```

## Menjalankan secara lokal

Prasyarat: **Node.js 22.13 atau lebih baru**.

### Backend

```bash
cd server
cp .env.example .env     # Windows CMD: copy .env.example .env
npm install
npm start                # http://localhost:4000
```

Opsional, isi data historis untuk uji performa index:

```bash
npm run seed -- 500000
```

### Frontend

```bash
cd client
cp .env.example .env     # Windows CMD: copy .env.example .env
npm install
npm run dev              # http://localhost:5173
```

Build produksi: `npm run build`.

## Variabel environment

### `server/.env`

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `4000` | Port server |
| `CLIENT_ORIGIN` | `*` | Origin frontend untuk CORS (pisahkan dengan koma) |
| `DB_PATH` | `./data/dashboard.db` | Lokasi file SQLite |
| `ENABLE_GENERATOR` | `true` | Aktifkan cron generator data |
| `GENERATOR_INTERVAL_SEC` | `2` | Interval generator (detik) |
| `ENABLE_RATES` | `true` | Aktifkan pengambilan kurs dari API publik |
| `RATES_API_URL` | `https://open.er-api.com/v6/latest` | Endpoint API kurs |
| `RATES_BASE` | `USD` | Mata uang dasar |
| `RATES_TARGETS` | `IDR,EUR,JPY` | Mata uang tujuan |
| `RATES_REFRESH_MIN` | `5` | Interval refresh kurs (menit) |

### `client/.env`

| Variabel | Default | Keterangan |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000` | URL backend (REST + WebSocket) |

## Dokumentasi API (Postman)

Import `docs/postman_collection.json` ke Postman. Variabel `baseUrl` default `http://localhost:4000`. Setiap request memiliki deskripsi parameter.

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/metrics` | Daftar metrik (`type`, `from`, `to`, `limit`, `cursor`) |
| GET | `/api/metrics/series` | Agregat per bucket waktu |
| GET | `/api/metrics/summary` | Nilai terbaru + agregat 5 menit |
| GET | `/api/logs` | Log aktivitas (`level`) |
| GET | `/api/rates/latest`, `/api/rates/history` | Kurs terbaru dan riwayat |
| POST | `/api/rates/refresh` | Paksa ambil kurs sekarang |
| GET | `/api/export/metrics.csv`, `/api/export/logs.csv` | Ekspor CSV |
| GET | `/api/debug/query-plan` | Bukti index (`EXPLAIN QUERY PLAN`) |

### Event WebSocket (server ke klien)

| Event | Payload |
|---|---|
| `metric:update` | `{ id, type, value, unit, ts }` |
| `log:new` | `{ id, level, source, message, ts }` |
| `rate:update` | `{ base, target, rate, source, ts }` |
| `clients:count` | jumlah klien terhubung |
| `server:hello` | `{ serverTime }` |

## Catatan desain

- SQLite dipilih agar setup nol-konfigurasi. Dengan WAL, prepared statement, dan transaksi, throughput tulis tinggi. Untuk skala lebih besar, skema dan query dapat dipindah ke PostgreSQL/MySQL tanpa mengubah kontrak API.
- Grafik memakai jendela 60 titik terakhir di memori klien. Rentang historis panjang tersedia lewat `/api/metrics/series`.