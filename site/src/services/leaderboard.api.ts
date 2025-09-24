import type { LeaderboardQuery } from "./leaderboard.mock";
import type { LeaderboardRow } from "@/types/leaderboard";

function authHeader() {
  // Wherever you store Cognito tokens after Hosted UI login:
  const token =
    localStorage.getItem("cognitoAccessToken") ||
    sessionStorage.getItem("cognitoAccessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getLeaderboard(q: LeaderboardQuery) {
  const params = new URLSearchParams(
    Object.entries(q).reduce((acc, [k, v]) => {
      if (v !== undefined && v !== null && v !== "") acc[k] = String(v);
      return acc;
    }, {} as Record<string, string>)
  ).toString();

  const res = await fetch(`${import.meta.env.VITE_API_BASE}/leaderboard?${params}`, {
    headers: { "Content-Type": "application/json", ...authHeader() },
  });
  if (!res.ok) throw new Error(`Leaderboard API error ${res.status}`);
  return (await res.json()) as {
    rows: LeaderboardRow[];
    total: number;
    page: number;
    pageSize: number;
  };
}
