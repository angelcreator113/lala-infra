import { getIdToken } from "../src/auth";

// Top-N leaderboard (protected or public)
// If your route is public, the Authorization header is ignored by API Gateway.
export async function fetchTop(limit = 25) {
  const base = import.meta.env.VITE_FAN_API;
  const token = getIdToken();

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${base}/leaderboard?limit=${limit}`, { headers });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);

  // { top: Array<{rank:number;displayName:string;score:number;email?:string;sub:string}> }
  return res.json();
}

// My rank (protected)
export async function fetchMyRank() {
  const base = import.meta.env.VITE_FAN_API;
  const token = getIdToken();
  if (!token) return { rank: null, score: 0 }; // signed out

  const res = await fetch(`${base}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`me ${res.status}`);
  return res.json() as Promise<{ rank: number | null; score: number }>;
}
