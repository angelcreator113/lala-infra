export type Timeframe = "today" | "week" | "month" | "all";

export type SortDir = "asc" | "desc";
export type SortField = "rank" | "points" | "streak";

export interface LeaderboardQuery {
  timeframe: Timeframe;
  sort: SortField;
  dir: SortDir;
  page: number;
  pageSize: number;
  search?: string;
}

export interface LeaderboardRow {
  userId: string;
  displayName: string;
  avatarUrl: string;
  rank: number;
  points: number;
  streakDays?: number;
  lastActiveIso: string;
}

export interface LeaderboardResult {
  rows: LeaderboardRow[];
  total: number;
}
