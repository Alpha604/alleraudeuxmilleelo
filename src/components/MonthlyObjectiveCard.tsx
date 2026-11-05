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
    ahead: { label: 'En avance', color: 'text-emerald-400' },
    on_track: { label: 'Dans le rythme', color: 'text-amber-400' },
    behind: { label: 'En retard', color: 'text-rose-400' },
    goal_reached: { label: 'Objectif Atteint', color: 'text-emerald-400' },
  };

  const status = statusLabels[objective.status];

  return (
    <div className="flex flex-col justify-between rounded-3xl border border-neutral-800 bg-[#0e1117] p-6 sm:p-7 shadow-xl backdrop-blur-sm transition-all dark:border-neutral-800 dark:bg-[#0e1117] light:border-neutral-200 light:bg-white">
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800/80 pb-4 dark:border-neutral-800/80 light:border-neutral-200">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
              Objectif Du Mois
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <TrendingUp className={`h-4 w-4 ${status.color}`} />
            <span className={status.color}>{status.label}</span>
          </div>
        </div>

        <p className="mt-3 text-xs capitalize text-neutral-400">
          Palier pour {objective.monthName}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 border-b border-neutral-800/80 pb-5 dark:border-neutral-800/80 light:border-neutral-200">
          <div>
            <span className="text-[11px] text-neutral-400">Cible fin de mois</span>
            <div className="mt-1 font-mono text-3xl font-black text-neutral-200 dark:text-neutral-200 light:text-neutral-900 tabular-nums">
              {objective.targetElo}
            </div>
            <span className="text-[10px] text-neutral-500">Au dernier jour du mois</span>
          </div>

          <div>
            <span className="text-[11px] text-neutral-400">Progression restante</span>
            <div className="mt-1 font-mono text-3xl font-black text-amber-400 tabular-nums">
              {objective.pointsToTarget}
              <span className="text-xs font-normal text-neutral-500 ml-1">pts</span>
            </div>
            <div className="text-[10px] text-neutral-500">
              {objective.daysRemainingInMonth} jours restants ce mois
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2.5 text-xs">
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
            <span className="text-neutral-400">Statut calendrier :</span>
            <span className={`font-semibold ${status.color}`}>
              {status.label}
            </span>
          </div>

          <div className="flex items-center justify-between text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
            <span className="text-neutral-400">Recalcul automatique :</span>
            <span className="text-neutral-400 font-mono text-[11px]">Le 1er de chaque mois</span>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-neutral-950/70 p-3.5 text-xs text-neutral-400 border border-neutral-800/80 dark:bg-neutral-950/70 dark:border-neutral-800/80 light:bg-neutral-50 light:border-neutral-200">
        {objective.diff >= 0 ? (
          <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
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
