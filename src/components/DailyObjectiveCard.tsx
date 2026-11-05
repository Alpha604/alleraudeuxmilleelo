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
      color: 'text-emerald-400',
      icon: <ArrowUpRight className="h-4 w-4 text-emerald-400" />,
      desc: 'Votre classement actuel devance la trajectoire théorique idéale.',
    },
    on_track: {
      label: 'Dans le rythme',
      color: 'text-amber-400',
      icon: <CheckCircle2 className="h-4 w-4 text-amber-400" />,
      desc: 'Parfaitement aligné avec le rythme théorique requis.',
    },
    behind: {
      label: 'En retard',
      color: 'text-rose-400',
      icon: <ArrowDownRight className="h-4 w-4 text-rose-400" />,
      desc: 'Léger écart par rapport à la trajectoire planifiée.',
    },
    goal_reached: {
      label: 'Objectif Atteint',
      color: 'text-emerald-400',
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
      desc: 'Le palier final de 2000 Elo a été franchi !',
    },
    deadline_passed: {
      label: 'Échéance dépassée',
      color: 'text-neutral-400',
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
    <div className="flex flex-col justify-between rounded-3xl border border-neutral-800 bg-[#0e1117] p-6 sm:p-7 shadow-xl backdrop-blur-sm transition-all dark:border-neutral-800 dark:bg-[#0e1117] light:border-neutral-200 light:bg-white">
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800/80 pb-4 dark:border-neutral-800/80 light:border-neutral-200">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
              Objectif Du Jour
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            {currentStatus.icon}
            <span className={currentStatus.color}>{currentStatus.label}</span>
          </div>
        </div>

        <p className="mt-3 text-xs capitalize text-neutral-400">
          {formattedToday}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 border-b border-neutral-800/80 pb-5 dark:border-neutral-800/80 light:border-neutral-200">
          <div>
            <span className="text-[11px] text-neutral-400">Elo théorique cible</span>
            <div className="mt-1 font-mono text-3xl font-black text-neutral-200 dark:text-neutral-200 light:text-neutral-900 tabular-nums">
              {objective.theoreticalElo}
            </div>
            <span className="text-[10px] text-neutral-500">Pour être dans les temps</span>
          </div>

          <div>
            <span className="text-[11px] text-neutral-400">Votre Elo réel</span>
            <div className="mt-1 font-mono text-3xl font-black text-amber-400 tabular-nums">
              {objective.realElo}
            </div>
            <div className="text-[10px] text-neutral-500">
              Écart :{' '}
              <span className={`font-mono font-bold ${objective.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {objective.diff > 0 ? `+${objective.diff}` : objective.diff} pts
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2.5 text-xs">
          <div className="flex items-center justify-between text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
            <span className="text-neutral-400">Écart à la cible quotidienne :</span>
            <span className="font-mono font-semibold">
              {objective.pointsToDailyTarget === 0
                ? `Cible atteinte (+${Math.abs(objective.diff)} pts)`
                : `${objective.pointsToDailyTarget} pts à combler`}
            </span>
          </div>

          <div className="flex items-center justify-between text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
            <span className="text-neutral-400">Rythme quotidien nécessaire :</span>
            <span className="font-mono font-bold text-amber-400">
              +{objective.paceRequiredPerDay} pt / jour
            </span>
          </div>

          <div className="flex items-center justify-between text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
            <span className="text-neutral-400">Rythme hebdomadaire attendu :</span>
            <span className="font-mono font-semibold text-neutral-200 dark:text-neutral-200 light:text-neutral-800">
              +{objective.paceRequiredPerWeek} pts / semaine
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-neutral-950/70 p-3.5 text-xs text-neutral-400 border border-neutral-800/80 dark:bg-neutral-950/70 dark:border-neutral-800/80 light:bg-neutral-50 light:border-neutral-200">
        {currentStatus.desc}
      </div>
    </div>
  );
};
