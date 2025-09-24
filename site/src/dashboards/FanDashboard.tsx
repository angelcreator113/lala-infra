import { useEffect, useMemo, useState } from "react";
import SectionCard from "../components/SectionCard";
import { getIdToken } from "../auth";

type FanRow = {
  id: string;          // unique id (userId or email)
  name: string;        // display name
  points: number;      // engagement points
  avatarUrl?: string;  // optional
};

const API_BASE = import.meta.env.VITE_FAN_API;

// --- Helper: medal for the top-3 ranks ---
const medalForRank = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null);

// --- API calls ---
async function fetchLeaderboard(): Promise<FanRow[]> {
  // PUBLIC endpoint (no token)
  const res = await fetch(`${API_BASE}/leaderboard`, { credentials: "omit" });
  if (!res.ok) throw new Error(`Leaderboard failed: ${res.status}`);
  // Backend returns { top: [...] } — normalize to FanRow[]
  const data = await res.json();
  const rows: FanRow[] = (data.top ?? []).map((it: any) => ({
    id: it.sub ?? it.email ?? String(it.rank),
    name: it.displayName ?? it.name ?? "Anonymous",
    points: it.score ?? it.points ?? 0,
    avatarUrl: it.avatarUrl,
  }));
  return rows;
}

async function fetchMe(): Promise<{ id: string; name: string } | null> {
  // PROTECTED endpoint (token required)
  const token = getIdToken();
  if (!token) return null; // signed-out UX

  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "omit",
  });

  if (res.status === 401 || res.status === 403) return null; // not authorized/signed out
  if (!res.ok) throw new Error(`Me failed: ${res.status}`);
  return res.json();
}

export default function FanDashboard() {
  const [rows, setRows] = useState<FanRow[] | null>(null);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [lb, my] = await Promise.allSettled([fetchLeaderboard(), fetchMe()]);

        if (!alive) return;

        if (lb.status === "fulfilled") {
          const sorted = [...lb.value].sort((a, b) => b.points - a.points);
          setRows(sorted);
        } else {
          setError(lb.reason?.message ?? "Failed to load leaderboard");
        }

        if (my.status === "fulfilled") setMe(my.value);
        // if rejected → ignore; user might be signed out
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Something went wrong");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // compute my rank if I'm in the leaderboard
  const myRank = useMemo(() => {
    if (!rows || !me) return null;
    const idx = rows.findIndex((r) => r.id === me.id);
    if (idx === -1) return null;
    return { rank: idx + 1, ...rows[idx] };
  }, [rows, me]);

  return (
    <div className="space-y-6">
      <SectionCard title="Fan Leaderboard">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          <div className="overflow-x-auto">
            {!rows && !error ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : (
              <table className="w-full text-left border-separate border-spacing-y-2">
                <thead className="text-sm text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Fan</th>
                    <th className="px-3 py-2 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {rows!.map((row, i) => {
                    const rank = i + 1;
                    const medal = medalForRank(rank);
                    const isMe = me && row.id === me.id;
                    return (
                      <tr
                        key={`${row.id}-${rank}`}
                        className={`rounded-lg bg-white/70 dark:bg-white/5 shadow-sm ${isMe ? "ring-2 ring-violet-400/60" : ""}`}
                      >
                        <td className="px-3 py-3 align-middle whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold tabular-nums">#{rank}</span>
                            {medal && <span className="text-xl leading-none">{medal}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-200 to-pink-200 dark:from-violet-500/30 dark:to-pink-500/30" />
                            <div className="flex flex-col">
                              <span className="font-medium">{row.name}</span>
                              {isMe && <span className="text-xs text-muted-foreground">This is you</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 align-middle text-right tabular-nums font-semibold">
                          {row.points.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Sticky "My rank" card */}
          <aside className="lg:sticky lg:top-4 h-fit">
            <div className="rounded-2xl border bg-white/70 dark:bg-white/5 p-4 shadow-sm">
              <div className="text-sm text-muted-foreground mb-1">My rank</div>
              {myRank ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <div className="text-2xl font-extrabold tabular-nums">#{myRank.rank}</div>
                    {medalForRank(myRank.rank) && <div className="text-2xl">{medalForRank(myRank.rank)}</div>}
                  </div>
                  <div className="mt-2 text-sm">
                    <span className="font-medium">{myRank.name}</span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {myRank.points.toLocaleString()} pts
                  </div>
                </>
              ) : me ? (
                <div className="text-sm text-muted-foreground">You’re signed in, but not ranked yet.</div>
              ) : (
                <div className="text-sm text-muted-foreground">Sign in to see your position.</div>
              )}
            </div>
          </aside>
        </div>
      </SectionCard>

      <SectionCard title="Horoscope Outfits">
        <p className="muted">Daily/weekly fits generated by sign (placeholder).</p>
      </SectionCard>

      <SectionCard title="Watch Parties">
        <p className="muted">Upcoming live sessions + RSVP (placeholder).</p>
      </SectionCard>
    </div>
  );
}
