/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Award, Flame, Milestone, TrendingDown, TrendingUp, Zap } from 'lucide-react';

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
      {/* 1. Peak Elo (Jaune #facc15) */}
      <div className="group rounded-3xl border border-neutral-800 bg-[#0c0f14] p-5 shadow-lg transition-all hover:border-[#facc15]/50">
        <div className="flex items-center justify-between text-neutral-400 text-xs">
          <span className="font-bold uppercase tracking-wider">Record Personnel</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#facc15]/10 text-[#facc15] border border-[#facc15]/30">
            <Award className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-black text-white tabular-nums">
            {peakElo}
          </span>
          <span className="text-xs font-bold uppercase text-[#facc15] font-mono">
            {peakMode}
          </span>
        </div>
        <div className="mt-1 text-xs text-neutral-400">Sommet historique atteint</div>
      </div>

      {/* 2. Cumulative project gain (Vert #10b981) */}
      <div className="group rounded-3xl border border-neutral-800 bg-[#0c0f14] p-5 shadow-lg transition-all hover:border-[#10b981]/50">
        <div className="flex items-center justify-between text-neutral-400 text-xs">
          <span className="font-bold uppercase tracking-wider">Gain Cumulé Projet</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/30">
            <Flame className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span
            className={`font-mono text-3xl font-black tabular-nums ${
              progressionSinceStart >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'
            }`}
          >
            {progressionSinceStart > 0 ? `+${progressionSinceStart}` : progressionSinceStart}
          </span>
          <span className="text-xs font-mono text-neutral-400">pts</span>
        </div>
        <div className="mt-1 text-xs text-neutral-400">Depuis la base 1500 Elo</div>
      </div>

      {/* 3. Recent delta (Vert si > 0, Rouge si < 0) */}
      <div className="group rounded-3xl border border-neutral-800 bg-[#0c0f14] p-5 shadow-lg transition-all hover:border-neutral-700">
        <div className="flex items-center justify-between text-neutral-400 text-xs">
          <span className="font-bold uppercase tracking-wider">Variation Récente</span>
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-xl border ${
              recentDelta !== null && recentDelta >= 0
                ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30'
                : 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/30'
            }`}
          >
            {recentDelta !== null && recentDelta >= 0 ? (
              <TrendingUp className="h-4 w-4 text-[#10b981]" />
            ) : (
              <TrendingDown className="h-4 w-4 text-[#ef4444]" />
            )}
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          {recentDelta === null ? (
            <span className="font-mono text-2xl font-bold text-neutral-500">—</span>
          ) : (
            <>
              <span
                className={`font-mono text-3xl font-black tabular-nums ${
                  recentDelta > 0
                    ? 'text-[#10b981]'
                    : recentDelta < 0
                    ? 'text-[#ef4444]'
                    : 'text-neutral-300'
                }`}
              >
                {recentDelta > 0 ? `+${recentDelta}` : recentDelta}
              </span>
              <span className="text-xs font-mono text-neutral-400">pts</span>
            </>
          )}
        </div>
        <div className="mt-1 text-xs text-neutral-400">Dernier relevé Chess.com</div>
      </div>

      {/* 4. Next Intermediate Milestone (Jaune / Blanc) */}
      <div className="group rounded-3xl border border-neutral-800 bg-[#0c0f14] p-5 shadow-lg transition-all hover:border-[#facc15]/50">
        <div className="flex items-center justify-between text-neutral-400 text-xs">
          <span className="font-bold uppercase tracking-wider">Prochain Jalon</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#facc15]/10 text-[#facc15] border border-[#facc15]/30">
            <Milestone className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-black text-[#facc15] tabular-nums">
            {nextMilestone}
          </span>
          <span className="text-xs font-mono text-neutral-400">
            ({pointsToNextMilestone} pts)
          </span>
        </div>
        <div className="mt-1 text-xs text-neutral-400">Tranche de 50 Elo</div>
      </div>
    </div>
  );
};
