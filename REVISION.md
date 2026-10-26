# REVISION — Realtime Dashboard

**Repository:** https://github.com/FawwazZah13/Realtime-Dashboard  
**Branch:** `revision`

## Riwayat Revisi dan Verifikasi

| ID | Hash Commit | Cara Verifikasi | Bukti |
|---|---|---|---|
| P1-1 | `be777f9` | Jalankan `npm test` dari direktori `server`. | Tes `P1-1: generator mengirim log:new melalui Socket.IO` lulus. |
| P2-9 | `7c516ad`, `e94a3c8` | Jalankan `npm test` dari direktori `server`. | Riwayat pengujian sebelumnya mencatat 10 tes lulus dan 0 gagal. |
| P2-10 | `55d1b7c`, `e94a3c8` | Periksa workflow GitHub Actions pada branch `revision`. | Workflow pengujian backend dan build frontend ditambahkan. |
| P2-10 | `1b1d1f8` | Jalankan `npm test` dari direktori `server`. | Validasi parameter `from`, `to`, dan `cursor` diuji. |
| P2-10 | `a6cc922` | Jalankan `npm ci` dan `npm run build` dari direktori `client`, serta periksa GitHub Actions. | Build frontend berhasil secara lokal dan workflow CI berhasil. |
| P3 | `6802a49` | Periksa perubahan format angka pada kode terkait. | Perbaikan konsistensi format angka. |
| P3 | `1ec06b2` | Jalankan `npm test` dari direktori `server`. | Penambahan Helmet, rate limit global, batas ukuran JSON 1 MB, dan pengujian header keamanan serta respons HTTP 429. |
| P3 | `b1cf008` | Periksa `.nvmrc`, `server/package.json`, dan validasi versi pada `server/src/index.js`. | `.nvmrc` menetapkan Node.js `24.11.1`; logika perbandingan versi diuji menggunakan Node.js `24.11.1` dan menghasilkan `Versi memenuhi syarat: true`. |

## Hasil Pengujian Terbaru

### Backend

Perintah, dijalankan dari direktori `server`:

```bash
npm test
```

Hasil pengujian terakhir:

- Total tes: 12
- Lulus: 12
- Gagal: 0

Pengujian mencakup validasi parameter API, pagination, ekspor CSV, event Socket.IO, header keamanan Helmet, dan rate limit.

### Frontend

Perintah, dijalankan dari direktori `client`:

```bash
npm ci
npm run build
```

Hasil yang tercatat sebelumnya: build production Vite berhasil tanpa error.

### GitHub Actions

Workflow terbaru yang telah diperiksa pada branch `revision` berstatus berhasil.

Bukti CI: https://github.com/FawwazZah13/Realtime-Dashboard/actions/runs/40342474673

## Poin yang Tidak Dikerjakan

- **Docker / Docker Compose:** tidak dikerjakan karena implementasi Docker tidak dilanjutkan sesuai keputusan pengerjaan. Tidak ada klaim bahwa aplikasi telah diverifikasi melalui Docker.
- **Pengujian startup menggunakan versi Node.js yang tidak memenuhi syarat:** belum dilakukan. Verifikasi yang tersedia hanya menguji logika perbandingan versi menggunakan Node.js `24.11.1`, bukan membuktikan proses startup ditolak pada versi Node.js yang lebih lama.


