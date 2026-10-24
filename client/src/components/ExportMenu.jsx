import { useState } from "react";
import { api, downloadUrl } from "../api";
import { METRICS } from "../config";

const fmtDate = (ts) => new Date(ts).toLocaleString("id-ID", { hour12: false });

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportMenu({ series, onToast }) {
  const [busy, setBusy] = useState(null);
  const [type, setType] = useState("");
  const [limit, setLimit] = useState(1000);

  // CSV diambil dari server (streaming, bisa ratusan ribu baris).
  // Jika server tidak bisa dijangkau, fallback ke data yang ada di layar.
  async function exportCsv() {
    setBusy("csv");
    try {
      const qs = new URLSearchParams({ limit: String(limit), ...(type && { type }) });
      const res = await fetch(downloadUrl(`/api/export/metrics.csv?${qs}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      downloadBlob(await res.blob(), "metrics.csv");
      onToast("CSV berhasil diunduh", "ok");
    } catch {
      const rows = Object.values(series).flat().sort((a, b) => b.ts - a.ts);
      if (!rows.length) return onToast("Tidak ada data untuk diekspor", "error");
      const csv = ["type,value,unit,time", ...rows.map((r) => `${r.type},${r.value},${r.unit},${new Date(r.ts).toISOString()}`)].join("\n");
      downloadBlob(new Blob([csv], { type: "text/csv" }), "metrics-offline.csv");
      onToast("Server tidak tersedia, CSV dibuat dari data di layar", "warn");
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf() {
    setBusy("pdf");
    try {
      // Import dinamis supaya jsPDF tidak membebani bundle awal.
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      let rows;
      try {
        const qs = new URLSearchParams({ limit: String(Math.min(limit, 500)), ...(type && { type }) });
        rows = (await api(`/api/metrics?${qs}`)).data;
      } catch {
        rows = Object.values(series).flat().sort((a, b) => b.ts - a.ts);
        onToast("Server tidak tersedia, PDF dibuat dari data di layar", "warn");
      }
      if (!rows.length) return onToast("Tidak ada data untuk diekspor", "error");

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("Laporan Metrik Dashboard", 14, 16);
      doc.setFontSize(10);
      doc.text(`Dibuat: ${fmtDate(Date.now())}  |  Jumlah baris: ${rows.length}`, 14, 23);
      autoTable(doc, {
        startY: 28,
        head: [["Waktu", "Metrik", "Nilai", "Satuan"]],
        body: rows.map((r) => [fmtDate(r.ts), METRICS[r.type]?.label ?? r.type, r.value, r.unit]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] },
      });
      doc.save("metrics-report.pdf");
      onToast("PDF berhasil dibuat", "ok");
    } catch (e) {
      onToast(`Gagal membuat PDF: ${e.message}`, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="export">
      <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter metrik">
        <option value="">Semua metrik</option>
        {Object.entries(METRICS).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
      </select>
      <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Jumlah baris">
        {[100, 500, 1000, 10000, 100000].map((n) => (
          <option key={n} value={n}>{n.toLocaleString("id-ID")} baris</option>
        ))}
      </select>
      <button onClick={exportCsv} disabled={!!busy}>{busy === "csv" ? "Mengunduh…" : "Ekspor CSV"}</button>
      <button onClick={exportPdf} disabled={!!busy}>{busy === "pdf" ? "Membuat…" : "Ekspor PDF"}</button>
    </div>
  );
}