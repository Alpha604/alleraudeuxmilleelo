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
      {/* 1. Peak Elo */}
      <div className="group rounded-3xl border border-white/[0.08] bg-[#0c1019]/80 p-5 backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all hover:border-amber-500/40 hover:-translate-y-0.5">
        <div className="flex items-center justify-between text-neutral-400 text-xs">
          <span className="font-bold uppercase tracking-wider">Record Personnel</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Award className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-black text-white tabular-nums">
            {peakElo}
          </span>
          <span className="text-xs font-bold uppercase text-amber-400 font-mono">
            {peakMode}
          </span>
        </div>
        <div className="mt-1 text-xs text-neutral-400">Sommet historique atteint</div>
      </div>

      {/* 2. Cumulative project gain */}
      <div className="group rounded-3xl border border-white/[0.08] bg-[#0c1019]/80 p-5 backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all hover:border-emerald-500/40 hover:-translate-y-0.5">
        <div className="flex items-center justify-between text-neutral-400 text-xs">
          <span className="font-bold uppercase tracking-wider">Gain Cumulé Projet</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Flame className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span
            className={`font-mono text-3xl font-black tabular-nums ${
              progressionSinceStart >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {progressionSinceStart > 0 ? `+${progressionSinceStart}` : progressionSinceStart}
          </span>
          <span className="text-xs font-mono text-neutral-400">pts</span>
        </div>
        <div className="mt-1 text-xs text-neutral-400">Depuis la base 1500 Elo</div>
      </div>

      {/* 3. Recent delta */}
      <div className="group rounded-3xl border border-white/[0.08] bg-[#0c1019]/80 p-5 backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all hover:border-sky-500/40 hover:-translate-y-0.5">
        <div className="flex items-center justify-between text-neutral-400 text-xs">
          <span className="font-bold uppercase tracking-wider">Variation Récente</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            {recentDelta !== null && recentDelta >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-400" />
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
                    ? 'text-emerald-400'
                    : recentDelta < 0
                    ? 'text-rose-400'
                    : 'text-neutral-300'
                }`}
              >
                {recentDelta > 0 ? `+${recentDelta}` : recentDelta}
              </span>
              <span className="text-xs font-mono text-neutral-400">pts</span>
            </>
          )}
        </div>
        <div className="mt-1 text-xs text-neutral-400">Au dernier relevé Chess.com</div>
      </div>

      {/* 4. Next Intermediate Milestone */}
      <div className="group rounded-3xl border border-white/[0.08] bg-[#0c1019]/80 p-5 backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all hover:border-amber-500/40 hover:-translate-y-0.5">
        <div className="flex items-center justify-between text-neutral-400 text-xs">
          <span className="font-bold uppercase tracking-wider">Prochain Jalon</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Milestone className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-black text-amber-400 tabular-nums">
            {nextMilestone}
          </span>
          <span className="text-xs font-mono text-neutral-400">
            ({pointsToNextMilestone} pts)
          </span>
        </div>
        <div className="mt-1 text-xs text-neutral-400">Étape intermédiaire (+50)</div>
      </div>
    </div>
  );
};
