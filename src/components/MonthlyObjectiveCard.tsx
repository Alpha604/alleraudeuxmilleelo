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
    ahead: { label: 'En avance', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    on_track: { label: 'Dans le rythme', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    behind: { label: 'En retard', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    goal_reached: { label: 'Objectif Atteint', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  };

  const status = statusLabels[objective.status];

  return (
    <div className="flex flex-col justify-between rounded-xl border border-neutral-800 bg-neutral-900/80 p-6 shadow-lg backdrop-blur-sm transition-all dark:border-neutral-800 dark:bg-neutral-900/80 light:border-neutral-200 light:bg-white">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
              Objectif Du Mois
            </span>
          </div>
          <div className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold border ${status.bg} ${status.color}`}>
            <TrendingUp className="h-3.5 w-3.5" />
            <span>{status.label}</span>
          </div>
        </div>

        <p className="mt-1 text-[11px] capitalize text-neutral-500">
          Palier pour {objective.monthName}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 border-b border-neutral-800 pb-5 dark:border-neutral-800 light:border-neutral-200">
          <div>
            <div className="text-[11px] text-neutral-400">Cible fin de mois</div>
            <div className="mt-1 font-mono text-2xl font-bold text-neutral-200 dark:text-neutral-200 light:text-neutral-900 tabular-nums">
              {objective.targetElo}
            </div>
            <div className="text-[10px] text-neutral-500">Au dernier jour du mois</div>
          </div>

          <div>
            <div className="text-[11px] text-neutral-400">Progression restante</div>
            <div className="mt-1 font-mono text-2xl font-bold text-amber-400 tabular-nums">
              {objective.pointsToTarget}
              <span className="text-xs font-normal text-neutral-500 ml-1">pts</span>
            </div>
            <div className="text-[10px] text-neutral-500">
              {objective.daysRemainingInMonth} jours restants ce mois
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-xs">
          <div className="flex items-center justify-between text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
            <span className="text-neutral-400">Écart au palier mensuel :</span>
            <span className="font-mono font-semibold">
              {objective.diff >= 0 ? (
                <span className="text-emerald-400">+{objective.diff} pts (Déjà validé)</span>
              ) : (
                <span className="text-rose-400">{objective.diff} pts</span>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
            <span className="text-neutral-400">Statut par rapport au calendrier :</span>
            <span className={`font-medium ${status.color}`}>
              {status.label}
            </span>
          </div>

          <div className="flex items-center justify-between text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
            <span className="text-neutral-400">Recalcul automatique :</span>
            <span className="text-neutral-400 font-mono text-[11px]">Au 1er de chaque mois</span>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg bg-neutral-950/60 p-3 text-[11px] text-neutral-400 border border-neutral-800/60 dark:bg-neutral-950/60 dark:border-neutral-800/60 light:bg-neutral-50 light:border-neutral-200">
        {objective.diff >= 0 ? (
          <span className="text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            Le palier prévu pour la fin du mois en cours est déjà sécurisé !
          </span>
        ) : (
          <span>
            {objective.pointsToTarget} points à accumuler sur les {objective.daysRemainingInMonth} prochains jours pour valider l'étape.
          </span>
        )}
      </div>
    </div>
  );
};
