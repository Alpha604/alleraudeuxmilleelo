/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Calendar, CheckCircle2, TrendingUp } from 'lucide-react';
import { MonthlyObjective } from '../types/chess';

interface MonthlyObjectiveCardProps {
  objective: MonthlyObjective;
}

export const MonthlyObjectiveCard: React.FC<MonthlyObjectiveCardProps> = ({ objective }) => {
  const statusLabels = {
    ahead: { label: 'En Avance', color: 'text-emerald-400', badgeClass: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
    on_track: { label: 'Dans le Tempo', color: 'text-amber-400', badgeClass: 'bg-amber-500/15 border-amber-500/30 text-amber-300' },
    behind: { label: 'En Retard', color: 'text-rose-400', badgeClass: 'bg-rose-500/15 border-rose-500/30 text-rose-300' },
    goal_reached: { label: 'Objectif Atteint', color: 'text-emerald-400', badgeClass: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' },
  };

  const status = statusLabels[objective.status];

  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c1019]/80 p-6 sm:p-7 shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                Objectif Mensuel
              </span>
              <p className="text-[11px] capitalize text-neutral-400">Palier de {objective.monthName}</p>
            </div>
          </div>

          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${status.badgeClass}`}>
            <TrendingUp className="h-4 w-4" />
            <span>{status.label}</span>
          </div>
        </div>

        {/* Core Comparison Display */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-b border-white/[0.06] pb-6">
          <div className="space-y-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400">
              Cible fin de mois
            </span>
            <div className="font-mono text-4xl font-black text-white tabular-nums">
              {objective.targetElo}
            </div>
            <span className="text-[10px] text-neutral-500">Au dernier jour du mois</span>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400">
              Progression requise
            </span>
            <div className="font-mono text-4xl font-black text-amber-400 tabular-nums">
              {objective.pointsToTarget}
              <span className="text-xs font-normal text-neutral-400 ml-1">pts</span>
            </div>
            <div className="text-[10px] text-neutral-400 font-mono">
              Sur {objective.daysRemainingInMonth} jours restants ce mois
            </div>
          </div>
        </div>

        {/* Detailed Metrics */}
        <div className="mt-5 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-neutral-400">Écart au palier mensuel :</span>
            <span className="font-mono font-bold">
              {objective.diff >= 0 ? (
                <span className="text-emerald-400">+{objective.diff} pts (Déjà sécurisé ✓)</span>
              ) : (
                <span className="text-rose-400">{objective.diff} pts</span>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-400">Rythme d'avancement mensuel :</span>
            <span className={`font-bold ${status.color}`}>
              {status.label}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-400">Actualisation des calculs :</span>
            <span className="text-neutral-400 font-mono">Chaque 1er du mois à minuit</span>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-neutral-950/60 p-3.5 text-xs text-neutral-400 border border-white/[0.04]">
        {objective.diff >= 0 ? (
          <span className="text-emerald-400 flex items-center gap-1.5 font-bold">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Le palier pour la fin du mois est d'ores et déjà validé !
          </span>
        ) : (
          <span>
            {objective.pointsToTarget} points à remporter sur les {objective.daysRemainingInMonth} prochains jours pour honorer l'objectif.
          </span>
        )}
      </div>
    </div>
  );
};
