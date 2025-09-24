// site/src/services/leaderboard.mock.ts
import type {
  LeaderboardQuery,
  LeaderboardResult,
  LeaderboardRow,
} from "../types/leaderboard";

// Re-export the types so callers can do:
// import { getLeaderboard, type LeaderboardQuery } from "../services/leaderboard.mock";
export type { LeaderboardQuery, LeaderboardResult, LeaderboardRow };

const N = 47;
const seedRows: LeaderboardRow[] = Array.from({ length: N }, (_, i) => ({
  userId: `user_${i + 1}`,
  displayName:
    ["Ava Chen", "Diego Morales", "Priya Singh", "Zoe Martin", "Kai Johnson"][i % 5] +
    ` ${i + 1}`,
  avatarUrl: `https://i.pravatar.cc/64?img=${(i % 70) + 1}`,
  rank: i + 1,
  points: 14000 - i * 123,
  streakDays: (i * 3) % 17,
  lastActiveIso: new Date(Date.now() - i * 3600_000).toISOString(),
}));

export async function getLeaderboard(
  q: LeaderboardQuery,
): Promise<LeaderboardResult> {
  let rows = [...seedRows];

  // search
  if (q.search?.trim()) {
    const s = q.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.displayName.toLowerCase().includes(s) ||
        r.userId.toLowerCase().includes(s),
    );
  }

  // sort
  const dir = q.dir === "asc" ? 1 : -1;
  if (q.sort === "rank") rows.sort((a, b) => (a.rank - b.rank) * dir);
  if (q.sort === "points") rows.sort((a, b) => (a.points - b.points) * dir);
  if (q.sort === "streak")
    rows.sort(
      (a, b) => ((a.streakDays ?? 0) - (b.streakDays ?? 0)) * dir,
    );

  const total = rows.length;

  // paginate
  const pageSize = q.pageSize || 10;
  const page = Math.max(1, q.page || 1);
  const start = (page - 1) * pageSize;
  rows = rows.slice(start, start + pageSize);

  return { rows, total };
}
