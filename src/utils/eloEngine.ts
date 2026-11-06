/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AdvanceMetric,
  ChessComStatsResponse,
  DailyObjective,
  GameMode,
  MonthlyMilestone,
  MonthlyObjective,
  TrajectoryModel,
} from '../types/chess';

export const DEFAULT_START_DATE = '2026-10-31T00:00:00';
export const DEFAULT_TARGET_DATE = '2027-12-31T23:59:59';
export const DEFAULT_START_ELO = 1500;
export const DEFAULT_TARGET_ELO = 2000;

export const MODE_START_ELOS: Record<string, number> = {
  blitz: 1458,
  rapid: 1289,
  bullet: 1500,
};

export function getModeStartElo(mode: string, bestModeFallback?: string): number {
  if (mode === 'auto') {
    const activeMode = bestModeFallback || 'bullet';
    return MODE_START_ELOS[activeMode] ?? DEFAULT_START_ELO;
  }
  return MODE_START_ELOS[mode] ?? DEFAULT_START_ELO;
}

/**
 * Calculates progress percentage between startElo and targetElo.
 * - If currentElo < startElo: returns 0% (never negative).
 * - If currentElo >= targetElo: returns 100%.
 * - Otherwise: proportional percentage rounded to 1 decimal place.
 */
export function calculateProgressPercentage(
  currentElo: number,
  startElo: number = DEFAULT_START_ELO,
  targetElo: number = DEFAULT_TARGET_ELO
): number {
  if (targetElo <= startElo) return 100;
  if (currentElo <= startElo) return 0;
  if (currentElo >= targetElo) return 100;
  const ratio = (currentElo - startElo) / (targetElo - startElo);
  return Math.round(ratio * 1000) / 10;
}

/**
 * Calculates theoretical Elo for any given timestamp based on linear progression.
 */
export function calculateLinearElo(
  date: Date | string | number,
  startDate: Date | string | number = DEFAULT_START_DATE,
  targetDate: Date | string | number = DEFAULT_TARGET_DATE,
  startElo: number = DEFAULT_START_ELO,
  targetElo: number = DEFAULT_TARGET_ELO
): number {
  const d = new Date(date).getTime();
  const start = new Date(startDate).getTime();
  const end = new Date(targetDate).getTime();

  if (isNaN(d) || isNaN(start) || isNaN(end) || end <= start) {
    return startElo;
  }

  if (d <= start) return startElo;
  if (d >= end) return targetElo;

  const progress = (d - start) / (end - start);
  const target = startElo + (targetElo - startElo) * progress;
  return Math.round(target * 10) / 10;
}

/**
 * Determines the best game mode and rating among Bullet, Blitz, and Rapid.
 * Uses deterministic tiebreaking (Rapid > Blitz > Bullet) when ratings are equal.
 */
export function getBestGameMode(
  stats?: ChessComStatsResponse | null
): { mode: GameMode; rating: number; allRatings: Record<GameMode, number | null> } {
  const bulletRating = stats?.chess_bullet?.last?.rating ?? null;
  const blitzRating = stats?.chess_blitz?.last?.rating ?? null;
  const rapidRating = stats?.chess_rapid?.last?.rating ?? null;

  const allRatings: Record<GameMode, number | null> = {
    bullet: bulletRating,
    blitz: blitzRating,
    rapid: rapidRating,
  };

  const validEntries: { mode: GameMode; rating: number; priority: number }[] = [];

  // Priorities for deterministic tiebreak: Rapid = 3, Blitz = 2, Bullet = 1
  if (rapidRating !== null && !isNaN(rapidRating)) {
    validEntries.push({ mode: 'rapid', rating: rapidRating, priority: 3 });
  }
  if (blitzRating !== null && !isNaN(blitzRating)) {
    validEntries.push({ mode: 'blitz', rating: blitzRating, priority: 2 });
  }
  if (bulletRating !== null && !isNaN(bulletRating)) {
    validEntries.push({ mode: 'bullet', rating: bulletRating, priority: 1 });
  }

  if (validEntries.length === 0) {
    return {
      mode: 'blitz',
      rating: DEFAULT_START_ELO,
      allRatings,
    };
  }

  // Sort descending by rating first, then by priority (tiebreaker)
  validEntries.sort((a, b) => {
    if (b.rating !== a.rating) {
      return b.rating - a.rating;
    }
    return b.priority - a.priority;
  });

  return {
    mode: validEntries[0].mode,
    rating: validEntries[0].rating,
    allRatings,
  };
}

/**
 * Generates monthly milestones from start date to target date.
 */
export function generateDefaultMilestones(
  startDateStr: string = DEFAULT_START_DATE,
  targetDateStr: string = DEFAULT_TARGET_DATE,
  startElo: number = DEFAULT_START_ELO,
  targetElo: number = DEFAULT_TARGET_ELO
): MonthlyMilestone[] {
  const start = new Date(startDateStr);
  const end = new Date(targetDateStr);
  const milestones: MonthlyMilestone[] = [];

  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  const monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  while (current <= endMonth) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    
    // Last day of this month
    const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
    const targetAtMonthEnd = calculateLinearElo(
      lastDayOfMonth,
      startDateStr,
      targetDateStr,
      startElo,
      targetElo
    );

    milestones.push({
      monthKey,
      label: `${monthNames[month]} ${year}`,
      targetElo: Math.round(targetAtMonthEnd),
    });

    current.setMonth(current.getMonth() + 1);
  }

  return milestones;
}

/**
 * Calculates daily objective metrics for a specific reference date.
 */
export function calculateDailyObjective(
  currentRealElo: number,
  refDate: Date | string | number = new Date(),
  startDateStr: string = DEFAULT_START_DATE,
  targetDateStr: string = DEFAULT_TARGET_DATE,
  startElo: number = DEFAULT_START_ELO,
  targetElo: number = DEFAULT_TARGET_ELO,
  model: TrajectoryModel = 'linear',
  customMilestones?: MonthlyMilestone[]
): DailyObjective {
  const d = new Date(refDate);
  const start = new Date(startDateStr);
  const deadline = new Date(targetDateStr);

  const dateStr = d.toISOString().split('T')[0];
  let theoreticalElo = calculateLinearElo(d, start, deadline, startElo, targetElo);

  // If milestone-based model and milestones provided
  if (model === 'milestones' && customMilestones && customMilestones.length > 0) {
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const currentKey = `${year}-${String(month).padStart(2, '0')}`;
    const m = customMilestones.find((item) => item.monthKey === currentKey);
    if (m) {
      theoreticalElo = m.targetElo;
    }
  }

  const diff = Math.round((currentRealElo - theoreticalElo) * 10) / 10;
  const isPastDeadline = d.getTime() > deadline.getTime();
  const isGoalReached = currentRealElo >= targetElo;

  let status: DailyObjective['status'];
  if (isGoalReached) {
    status = 'goal_reached';
  } else if (isPastDeadline) {
    status = 'deadline_passed';
  } else if (diff > 5) {
    status = 'ahead';
  } else if (diff < -5) {
    status = 'behind';
  } else {
    status = 'on_track';
  }

  const pointsRemainingToGoal = Math.max(0, targetElo - currentRealElo);
  const pointsToDailyTarget = Math.max(0, Math.round((theoreticalElo - currentRealElo) * 10) / 10);

  // Remaining days calculation
  const msRemaining = Math.max(0, deadline.getTime() - d.getTime());
  const daysRemaining = Math.max(1, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

  const paceRequiredPerDay = isPastDeadline || isGoalReached ? 0 : Math.round((pointsRemainingToGoal / daysRemaining) * 100) / 100;
  const paceRequiredPerWeek = Math.round(paceRequiredPerDay * 7 * 10) / 10;
  const paceRequiredPerMonth = Math.round(paceRequiredPerDay * 30.4375 * 10) / 10;

  const advance = calculateAdvanceMetrics(
    currentRealElo,
    d,
    startDateStr,
    targetDateStr,
    startElo,
    targetElo
  );

  return {
    dateStr,
    theoreticalElo,
    realElo: currentRealElo,
    diff,
    status,
    pointsRemainingToGoal,
    pointsToDailyTarget,
    paceRequiredPerDay,
    paceRequiredPerWeek,
    paceRequiredPerMonth,
    advanceDays: advance.advanceDays,
    advanceDateLabel: advance.equivalentDateLabel,
    advanceDateKey: advance.equivalentDateKey,
  };
}

/**
 * Calculates advance calendar metrics:
 * Finds the date on which the linear target curve equals the player's current Elo.
 * If currentElo > theoreticalElo(today), the equivalent date is in the future,
 * meaning the player is "in advance" until that date (e.g. "En avance jusqu'au 5 décembre").
 */
export function calculateAdvanceMetrics(
  currentRealElo: number,
  refDate: Date | string | number = new Date(),
  startDateStr: string = DEFAULT_START_DATE,
  targetDateStr: string = DEFAULT_TARGET_DATE,
  startElo: number = DEFAULT_START_ELO,
  targetElo: number = DEFAULT_TARGET_ELO
): AdvanceMetric {
  const today = new Date(refDate);
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDateStr);
  start.setHours(0, 0, 0, 0);

  const end = new Date(targetDateStr);
  end.setHours(0, 0, 0, 0);

  const todayTargetElo = calculateLinearElo(today, start, end, startElo, targetElo);
  const diffElo = Math.round((currentRealElo - todayTargetElo) * 10) / 10;
  const isGoalReached = currentRealElo >= targetElo;

  const totalRange = Math.max(1, targetElo - startElo);
  const totalDuration = Math.max(1, end.getTime() - start.getTime());

  // Clamped ratio for equivalent date
  const clampedElo = Math.max(startElo, Math.min(targetElo, currentRealElo));
  const ratio = (clampedElo - startElo) / totalRange;
  const equivalentTimestamp = start.getTime() + totalDuration * ratio;
  const equivalentDate = new Date(equivalentTimestamp);
  equivalentDate.setHours(0, 0, 0, 0);

  const y = equivalentDate.getFullYear();
  const m = String(equivalentDate.getMonth() + 1).padStart(2, '0');
  const d = String(equivalentDate.getDate()).padStart(2, '0');
  const equivalentDateKey = `${y}-${m}-${d}`;

  const equivalentDateLabel = equivalentDate.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const diffMs = equivalentDate.getTime() - today.getTime();
  const advanceDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return {
    isAhead: advanceDays > 0,
    isBehind: advanceDays < 0,
    isGoalReached,
    advanceDays,
    equivalentDate,
    equivalentDateKey,
    equivalentDateLabel,
    currentElo: currentRealElo,
    todayTargetElo,
    diffElo,
  };
}

/**
 * Calculates current month's target and progression metrics.
 */
export function calculateMonthlyObjective(
  currentRealElo: number,
  refDate: Date | string | number = new Date(),
  startDateStr: string = DEFAULT_START_DATE,
  targetDateStr: string = DEFAULT_TARGET_DATE,
  startElo: number = DEFAULT_START_ELO,
  targetElo: number = DEFAULT_TARGET_ELO
): MonthlyObjective {
  const d = new Date(refDate);
  const year = d.getFullYear();
  const month = d.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  const monthName = `${monthNames[month]} ${year}`;

  // End of this month (or deadline if deadline is earlier)
  const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
  const deadline = new Date(targetDateStr);
  const effectiveTargetDate = lastDayOfMonth > deadline ? deadline : lastDayOfMonth;

  const targetEloForMonth = Math.round(
    calculateLinearElo(effectiveTargetDate, startDateStr, targetDateStr, startElo, targetElo)
  );

  const diff = currentRealElo - targetEloForMonth;
  const pointsToTarget = Math.max(0, targetEloForMonth - currentRealElo);

  let status: MonthlyObjective['status'];
  if (currentRealElo >= targetElo) {
    status = 'goal_reached';
  } else if (diff >= 0) {
    status = 'ahead';
  } else if (diff >= -10) {
    status = 'on_track';
  } else {
    status = 'behind';
  }

  const msRemainingInMonth = Math.max(0, lastDayOfMonth.getTime() - d.getTime());
  const daysRemainingInMonth = Math.max(0, Math.ceil(msRemainingInMonth / (1000 * 60 * 60 * 24)));

  return {
    monthKey,
    monthName,
    targetElo: targetEloForMonth,
    currentElo: currentRealElo,
    diff,
    pointsToTarget,
    status,
    daysRemainingInMonth,
  };
}

/**
 * Returns total days and remaining days for the countdown.
 */
export function getProjectTimeMetrics(
  now: Date | string | number = new Date(),
  startDateStr: string = DEFAULT_START_DATE,
  targetDateStr: string = DEFAULT_TARGET_DATE
) {
  const current = new Date(now).getTime();
  const start = new Date(startDateStr).getTime();
  const end = new Date(targetDateStr).getTime();

  const totalMs = Math.max(1, end - start);
  const elapsedMs = Math.max(0, current - start);
  const remainingMs = Math.max(0, end - current);

  const totalDays = Math.ceil(totalMs / (1000 * 60 * 60 * 24));
  const elapsedDays = Math.min(totalDays, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
  const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
  const isExpired = current > end;

  return {
    totalDays,
    elapsedDays,
    remainingDays,
    isExpired,
  };
}
