import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { timeoutMs = 10000, ...opts } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, { ...opts, signal: controller.signal });
    if (!res.ok) {
      let msg = `Server mengembalikan HTTP ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch { /* abaikan */ }
      throw new ApiError(msg, res.status);
    }
    return await res.json();
  } catch (e) {
    if (e.name === "AbortError") throw new ApiError("Permintaan timeout", 0);
    if (e instanceof ApiError) throw e;
    throw new ApiError("Tidak dapat terhubung ke server", 0);
  } finally {
    clearTimeout(timer);
  }
}

export const downloadUrl = (path) => `${API_URL}${path}`;