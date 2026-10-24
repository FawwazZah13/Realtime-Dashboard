const TEXT = {
  connecting: "Menghubungkan ke server…",
  reconnecting: "Koneksi real-time terputus. Mencoba menyambung kembali…",
  disconnected: "Terputus dari server.",
};

export default function ConnectionBanner({ status, retry, onRetry }) {
  if (status === "connected") return null;
  return (
    <div className={`banner banner-${status}`} role="alert">
      <span>
        {TEXT[status]}
        {status === "reconnecting" && retry.attempt > 0 && ` (percobaan ke-${retry.attempt})`}
        {" "}Data yang tampil mungkin tidak terbaru.
      </span>
      <button onClick={onRetry}>Coba sekarang</button>
    </div>
  );
}