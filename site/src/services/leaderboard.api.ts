// src/services/leaderboard.api.ts
import type { LeaderboardQuery } from "./leaderboard.mock";
import type { LeaderboardRow } from "../types/leaderboard";
import { API_BASE } from "../config"; // export const API_BASE = "https://5x8drhfsq3.execute-api.us-east-1.amazonaws.com/prod";

/** Build an Authorization header if we have a Cognito token. 
 *  You validated the API with the ID token, so read `id_token` here.
 *  (If you later switch the authorizer to the *access* token, change the key.)
 */
function authHeader(): HeadersInit {
  const token =
    localStorage.getItem("id_token") || sessionStorage.getItem("id_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getLeaderboard(q: LeaderboardQuery) {
  const params = new URLSearchParams(
    Object.entries(q).reduce((acc, [k, v]) => {
      if (v !== undefined && v !== null && v !== "") acc[k] = String(v);
      return acc;
    }, {} as Record<string, string>),
  ).toString();

  const res = await fetch(`${API_BASE}/leaderboard?${params}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
    } as HeadersInit,
  });

  if (!res.ok) throw new Error(`Leaderboard API error ${res.status}`);

  return (await res.json()) as {
    rows: LeaderboardRow[];
    total: number;
    page: number;
    pageSize: number;
  };
}

