/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type GameMode = 'bullet' | 'blitz' | 'rapid';

export interface GameModeStats {
  last?: {
    rating: number;
    date: number;
    rd?: number;
  };
  best?: {
    rating: number;
    date: number;
    game?: string;
  };
  record?: {
    win: number;
    loss: number;
    draw: number;
    time_per_move?: number;
    timeout_percent?: number;
  };
}

export interface ChessComStatsResponse {
  chess_bullet?: GameModeStats;
  chess_blitz?: GameModeStats;
  chess_rapid?: GameModeStats;
  chess_daily?: GameModeStats;
  fide?: number;
  tactics?: {
    highest?: { rating: number; date: number };
    lowest?: { rating: number; date: number };
  };
  puzzle_rush?: {
    best?: { total_attempts: number; score: number };
  };
}

export interface ChessComProfileResponse {
  username: string;
  name?: string;
  avatar?: string;
  url?: string;
  country?: string;
  location?: string;
  joined?: number;
  status?: string;
  league?: string;
  followers?: number;
}

export interface SyncRecord {
  id: string;
  timestamp: string; // ISO string
  blitz: number | null;
  rapid: number | null;
  bullet: number | null;
  bestRating: number;
  bestMode: GameMode;
  source: 'API Chess.com directe' | 'Proxy API' | 'Import fichier' | 'Saisie manuelle';
  note?: string;
}

export type TrajectoryModel = 'linear' | 'milestones' | 'custom';

export interface MonthlyMilestone {
  monthKey: string; // YYYY-MM
  label: string; // e.g. "Novembre 2026"
  targetElo: number;
  reached?: boolean;
}

export interface AppSettings {
  username: string;
  startElo: number;
  targetElo: number;
  startDate: string; // YYYY-MM-DD
  targetDate: string; // YYYY-MM-DDTHH:mm:ss
  timezone: string;
  selectedMode: 'auto' | GameMode;
  trajectoryModel: TrajectoryModel;
  autoSyncMinutes: number; // 0 for manual only
  theme: 'dark' | 'light';
  notifications: {
    newPeak: boolean;
    milestoneReached: boolean;
    goalReached: boolean;
    syncErrors: boolean;
    significantDelay: boolean;
  };
  customMilestones: MonthlyMilestone[];
}

export interface DailyObjective {
  dateStr: string;
  theoreticalElo: number;
  realElo: number;
  diff: number;
  status: 'on_track' | 'ahead' | 'behind' | 'goal_reached' | 'deadline_passed';
  pointsRemainingToGoal: number;
  pointsToDailyTarget: number;
  paceRequiredPerDay: number;
  paceRequiredPerWeek: number;
  paceRequiredPerMonth: number;
}

export interface MonthlyObjective {
  monthKey: string;
  monthName: string;
  targetElo: number;
  currentElo: number;
  diff: number;
  pointsToTarget: number;
  status: 'on_track' | 'ahead' | 'behind' | 'goal_reached';
  daysRemainingInMonth: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'info';
  timestamp: string;
  read: boolean;
}
