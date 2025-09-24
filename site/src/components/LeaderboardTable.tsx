import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, Trophy } from "lucide-react";

// If you haven't set up a TS path alias, use these relative imports:
import { getLeaderboard, type LeaderboardQuery } from "../services/leaderboard.mock";
// Later you can swap to:  import { getLeaderboard, type LeaderboardQuery } from "../services/leaderboard.api";
import type { LeaderboardRow, Timeframe } from "../types/leaderboard";

type SortKey = NonNullable<LeaderboardQuery["sort"]>;

const timeframes: { label: string; value: Timeframe }[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "All-Time", value: "all" },
];

export default function LeaderboardTable() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState<LeaderboardQuery>({
    timeframe: "week",
    sort: "rank",
    dir: "asc",
    page: 1,
    pageSize: 10,
    search: "",
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLeaderboard(q)
      .then(({ rows, total }) => {
        if (!cancelled) {
          setRows(rows);
          setTotal(total);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q.timeframe, q.sort, q.dir, q.page, q.pageSize, q.search]);

  const pages = useMemo(
    () => Math.max(1, Math.ceil(total / (q.pageSize || 10))),
    [total, q.pageSize],
  );

  const setSort = (key: SortKey) => {
    setQ((prev: LeaderboardQuery) => ({
      ...prev,
      sort: key,
      dir: prev.sort === key ? (prev.dir === "asc" ? "desc" : "asc") : "desc",
      page: 1,
    }));
  };

  return (
    <div className="w-full rounded-2xl bg-white/70 shadow-sm ring-1 ring-black/5">
      {/* Header / controls */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Trophy className="h-5 w-5" />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold">Fan Leaderboard</h2>
          <p className="text-xs text-gray-500">Top fans by engagement</p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <div className="relative w-full sm:w-60">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-violet-200"
              placeholder="Search fans…"
              value={q.search || ""}
              onChange={(e) =>
                setQ((p: LeaderboardQuery) => ({
                  ...p,
                  search: e.target.value,
                  page: 1,
                }))
              }
            />
          </div>

          <select
            title="Timeframe"
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"
            value={q.timeframe}
            onChange={(e) =>
              setQ((p: LeaderboardQuery) => ({
                ...p,
                timeframe: e.target.value as Timeframe,
                page: 1,
              }))
            }
          >
            {timeframes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-t border-gray-100 text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <Th
                label="#"
                onClick={() => setSort("rank")}
                active={q.sort === "rank"}
                dir={q.dir}
              />
              <th className="px-4 py-3 text-left">Fan</th>
              <Th
                label="Points"
                onClick={() => setSort("points")}
                active={q.sort === "points"}
                dir={q.dir}
              />
              <Th
                label="Streak"
                onClick={() => setSort("streak")}
                active={q.sort === "streak"}
                dir={q.dir}
              />
              <th className="px-4 py-3 text-left">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-500">
                  No results
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((row) => (
                <tr key={row.userId} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-700">
                    {row.rank}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={row.avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full ring-1 ring-black/5"
                      />
                      <div className="leading-tight">
                        <div className="font-medium text-gray-800">
                          {row.displayName}
                        </div>
                        <div className="text-xs text-gray-500">{row.userId}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.points.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{row.streakDays ?? 0}d</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(row.lastActiveIso).toLocaleString()}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="text-xs text-gray-500">
          Page {q.page} of {pages} • {total} total
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={q.page <= 1}
            onClick={() =>
              setQ((p: LeaderboardQuery) => ({ ...p, page: p.page! - 1 }))
            }
          >
            Prev
          </button>
          <button
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={q.page >= pages}
            onClick={() =>
              setQ((p: LeaderboardQuery) => ({ ...p, page: p.page! + 1 }))
            }
          >
            Next
          </button>
          <select
            title="Page size"
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={q.pageSize}
            onChange={(e) =>
              setQ((p: LeaderboardQuery) => ({
                ...p,
                pageSize: Number(e.target.value),
                page: 1,
              }))
            }
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}/page
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function Th({
  label,
  onClick,
  active,
  dir,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc" | undefined;
}) {
  return (
    <th className="px-4 py-3">
      <button
        onClick={onClick}
        className={`group inline-flex items-center gap-1 font-medium ${
          active ? "text-gray-900" : "text-gray-600"
        }`}
        title={`Sort by ${label}`}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <span className="text-gray-400 group-hover:text-gray-600">
          {active ? (
            dir === "asc" ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )
          ) : null}
        </span>
      </button>
    </th>
  );
}
