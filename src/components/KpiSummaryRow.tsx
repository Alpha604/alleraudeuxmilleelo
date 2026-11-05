/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Award, Milestone, TrendingDown, TrendingUp, Zap } from 'lucide-react';

interface KpiSummaryRowProps {
  peakElo: number;
  peakMode: string;
  progressionSinceStart: number;
  recentDelta: number | null;
  nextMilestone: number;
  pointsToNextMilestone: number;
}

export const KpiSummaryRow: React.FC<KpiSummaryRowProps> = ({
  peakElo,
  peakMode,
  progressionSinceStart,
  recentDelta,
  nextMilestone,
  pointsToNextMilestone,
}) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Peak Elo */}
      <div className="rounded-2xl border border-neutral-800 bg-[#0e1117] p-5 transition-all hover:border-neutral-700 dark:border-neutral-800 dark:bg-[#0e1117] light:border-neutral-200 light:bg-white shadow-lg">
        <div className="flex items-center justify-between text-neutral-400 dark:text-neutral-400 light:text-neutral-500 text-xs">
          <span className="font-semibold uppercase tracking-wider">Record Historique</span>
          <Award className="h-4 w-4 text-amber-400" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-black text-neutral-100 dark:text-neutral-100 light:text-neutral-900 tabular-nums">
            {peakElo}
          </span>
          <span className="text-xs font-bold uppercase text-amber-400 font-mono">
            {peakMode}
          </span>
        </div>
        <div className="mt-1 text-xs text-neutral-500">Meilleur niveau enregistré</div>
      </div>

      {/* 2. Progression since start */}
      <div className="rounded-2xl border border-neutral-800 bg-[#0e1117] p-5 transition-all hover:border-neutral-700 dark:border-neutral-800 dark:bg-[#0e1117] light:border-neutral-200 light:bg-white shadow-lg">
        <div className="flex items-center justify-between text-neutral-400 dark:text-neutral-400 light:text-neutral-500 text-xs">
          <span className="font-semibold uppercase tracking-wider">Gain Total Projet</span>
          <Zap className="h-4 w-4 text-amber-400" />
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span
            className={`font-mono text-3xl font-black tabular-nums ${
              progressionSinceStart >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {progressionSinceStart > 0 ? `+${progressionSinceStart}` : progressionSinceStart}
          </span>
          <span className="text-xs font-mono text-neutral-500">pts</span>
        </div>
        <div className="mt-1 text-xs text-neutral-500">Depuis la base de 1500</div>
      </div>

      {/* 3. Recent delta */}
      <div className="rounded-2xl border border-neutral-800 bg-[#0e1117] p-5 transition-all hover:border-neutral-700 dark:border-neutral-800 dark:bg-[#0e1117] light:border-neutral-200 light:bg-white shadow-lg">
        <div className="flex items-center justify-between text-neutral-400 dark:text-neutral-400 light:text-neutral-500 text-xs">
          <span className="font-semibold uppercase tracking-wider">Dernière Variation</span>
          {recentDelta !== null && recentDelta >= 0 ? (
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          ) : (
            <TrendingDown className="h-4 w-4 text-rose-400" />
          )}
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          {recentDelta === null ? (
            <span className="font-mono text-2xl font-bold text-neutral-500">—</span>
          ) : (
            <>
              <span
                className={`font-mono text-3xl font-black tabular-nums ${
                  recentDelta > 0
                    ? 'text-emerald-400'
                    : recentDelta < 0
                    ? 'text-rose-400'
                    : 'text-neutral-300'
                }`}
              >
                {recentDelta > 0 ? `+${recentDelta}` : recentDelta}
              </span>
              <span className="text-xs font-mono text-neutral-500">pts</span>
            </>
          )}
        </div>
        <div className="mt-1 text-xs text-neutral-500">Dernière synchronisation</div>
      </div>

      {/* 4. Next Milestone */}
      <div className="rounded-2xl border border-neutral-800 bg-[#0e1117] p-5 transition-all hover:border-neutral-700 dark:border-neutral-800 dark:bg-[#0e1117] light:border-neutral-200 light:bg-white shadow-lg">
        <div className="flex items-center justify-between text-neutral-400 dark:text-neutral-400 light:text-neutral-500 text-xs">
          <span className="font-semibold uppercase tracking-wider">Prochain Palier</span>
          <Milestone className="h-4 w-4 text-amber-400" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-black text-amber-400 tabular-nums">
            {nextMilestone}
          </span>
          <span className="text-xs font-mono text-neutral-400">
            ({pointsToNextMilestone} pts)
          </span>
        </div>
        <div className="mt-1 text-xs text-neutral-500">Étape intermédiaire (+50)</div>
      </div>
    </div>
  );
};
