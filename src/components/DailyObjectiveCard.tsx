/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, Compass } from 'lucide-react';
import { DailyObjective } from '../types/chess';

interface DailyObjectiveCardProps {
  objective: DailyObjective;
}

export const DailyObjectiveCard: React.FC<DailyObjectiveCardProps> = ({ objective }) => {
  const statusConfig = {
    ahead: {
      label: 'En avance',
      bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
      icon: <ArrowUpRight className="h-4 w-4 text-emerald-400" />,
      desc: 'Votre classement actuel dépasse la trajectoire théorique.',
    },
    on_track: {
      label: 'Dans le rythme',
      bg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
      icon: <CheckCircle2 className="h-4 w-4 text-amber-400" />,
      desc: 'Parfaitement aligné avec le rythme théorique requis.',
    },
    behind: {
      label: 'En retard',
      bg: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
      icon: <ArrowDownRight className="h-4 w-4 text-rose-400" />,
      desc: 'Légère divergence par rapport à la trajectoire planifiée.',
    },
    goal_reached: {
      label: 'Objectif Atteint',
      bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
      desc: 'Le palier final de 2000 Elo a été franchi !',
    },
    deadline_passed: {
      label: 'Échéance dépassée',
      bg: 'bg-neutral-800 border-neutral-700 text-neutral-300',
      icon: <Clock className="h-4 w-4 text-neutral-400" />,
      desc: 'La date limite du 31/12/2027 est révolue.',
    },
  };

  const currentStatus = statusConfig[objective.status];
  const formattedToday = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });

  return (
    <div className="flex flex-col justify-between rounded-xl border border-neutral-800 bg-neutral-900/80 p-6 shadow-lg backdrop-blur-sm transition-all dark:border-neutral-800 dark:bg-neutral-900/80 light:border-neutral-200 light:bg-white">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
              Objectif Du Jour
            </span>
          </div>
          <div className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold border ${currentStatus.bg}`}>
            {currentStatus.icon}
            <span>{currentStatus.label}</span>
          </div>
        </div>

        <p className="mt-1 text-[11px] capitalize text-neutral-500">
          {formattedToday}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 border-b border-neutral-800 pb-5 dark:border-neutral-800 light:border-neutral-200">
          <div>
            <div className="text-[11px] text-neutral-400">Elo théorique cible</div>
            <div className="mt-1 font-mono text-2xl font-bold text-neutral-200 dark:text-neutral-200 light:text-neutral-900 tabular-nums">
              {objective.theoreticalElo}
            </div>
            <div className="text-[10px] text-neutral-500">Pour rester dans le rythme</div>
          </div>

          <div>
            <div className="text-[11px] text-neutral-400">Votre Elo réel</div>
            <div className="mt-1 font-mono text-2xl font-bold text-amber-400 tabular-nums">
              {objective.realElo}
            </div>
            <div className="text-[10px] text-neutral-500">
              Écart :{' '}
              <span className={`font-mono font-medium ${objective.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {objective.diff > 0 ? `+${objective.diff}` : objective.diff} pts
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-xs">
          <div className="flex items-center justify-between text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
            <span className="text-neutral-400">Écart à la cible quotidienne :</span>
            <span className="font-mono font-semibold">
              {objective.pointsToDailyTarget === 0
                ? 'Cible atteinte (+ ' + Math.abs(objective.diff) + ' pts)'
                : `${objective.pointsToDailyTarget} pts à combler`}
            </span>
          </div>

          <div className="flex items-center justify-between text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
            <span className="text-neutral-400">Rythme journalier requis :</span>
            <span className="font-mono font-semibold text-amber-400">
              +{objective.paceRequiredPerDay} pt / jour
            </span>
          </div>

          <div className="flex items-center justify-between text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
            <span className="text-neutral-400">Rythme hebdomadaire requis :</span>
            <span className="font-mono text-neutral-200 dark:text-neutral-200 light:text-neutral-800">
              +{objective.paceRequiredPerWeek} pts / semaine
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg bg-neutral-950/60 p-3 text-[11px] text-neutral-400 border border-neutral-800/60 dark:bg-neutral-950/60 dark:border-neutral-800/60 light:bg-neutral-50 light:border-neutral-200">
        {currentStatus.desc} Rythme recalculé automatiquement chaque jour.
      </div>
    </div>
  );
};
