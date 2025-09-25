// site/src/api/http.ts
import { API_BASE } from "../config";

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("id_token");

  // Ensure a valid HeadersInit (string-to-string map)
  const headers: HeadersInit = {
    ...(init.headers as HeadersInit),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  // If caller expects non-JSON they can pass their own fetch; default to JSON.
  return res.json() as Promise<T>;
}
