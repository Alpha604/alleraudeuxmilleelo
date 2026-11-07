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
      label: 'En Avance',
      badgeClass: 'bg-[#10b981]/15 border-[#10b981]/30 text-[#10b981]',
      icon: <ArrowUpRight className="h-4 w-4 text-[#10b981]" />,
      desc: 'Votre classement actuel devance le rythme idéal planifié.',
    },
    on_track: {
      label: 'Dans le Rythme',
      badgeClass: 'bg-[#facc15]/15 border-[#facc15]/30 text-[#facc15]',
      icon: <CheckCircle2 className="h-4 w-4 text-[#facc15]" />,
      desc: 'Votre progression est en parfait alignement avec la trajectoire.',
    },
    behind: {
      label: 'Retard à Combler',
      badgeClass: 'bg-[#ef4444]/15 border-[#ef4444]/30 text-[#ef4444]',
      icon: <ArrowDownRight className="h-4 w-4 text-[#ef4444]" />,
      desc: 'Léger décalage : quelques victoires permettront de recoller.',
    },
    goal_reached: {
      label: 'Objectif Atteint',
      badgeClass: 'bg-[#10b981]/20 border-[#10b981]/40 text-[#10b981]',
      icon: <CheckCircle2 className="h-4 w-4 text-[#10b981]" />,
      desc: 'Le palier suprême de 2000 Elo a été franchi !',
    },
    deadline_passed: {
      label: 'Échéance Révolue',
      badgeClass: 'bg-neutral-800 border-neutral-700 text-neutral-400',
      icon: <Clock className="h-4 w-4 text-neutral-400" />,
      desc: 'La date limite du 31/12/2027 est passée.',
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
    <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-neutral-800 bg-[#0c0f14] p-4 sm:p-6 lg:p-7 shadow-xl">
      <div>
        <div className="flex items-center justify-between gap-2.5 sm:gap-3 border-b border-neutral-800 pb-3.5 sm:pb-4">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-[#facc15]/10 border border-[#facc15]/30 text-[#facc15]">
              <Compass className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <div>
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-white">
                Objectif Quotidien
              </span>
              <p className="text-[10px] sm:text-[11px] capitalize text-neutral-400">{formattedToday}</p>
            </div>
          </div>

          <div className={`inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 rounded-full border text-[11px] sm:text-xs font-bold ${currentStatus.badgeClass}`}>
            {currentStatus.icon}
            <span>{currentStatus.label}</span>
          </div>
        </div>

        {/* Core Comparison Display */}
        <div className="mt-4 sm:mt-6 grid grid-cols-2 gap-3 sm:gap-4 border-b border-neutral-800 pb-4 sm:pb-6">
          <div className="space-y-0.5 sm:space-y-1">
            <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-neutral-400">
              Cible du jour
            </span>
            <div className="font-mono text-3xl sm:text-4xl font-black text-white tabular-nums">
              {objective.theoreticalElo}
            </div>
            <span className="text-[10px] text-neutral-500 hidden sm:block">Pour rester dans le tempo</span>
          </div>

          <div className="space-y-0.5 sm:space-y-1">
            <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-neutral-400">
              Votre Elo réel
            </span>
            <div className="font-mono text-3xl sm:text-4xl font-black text-[#facc15] tabular-nums">
              {objective.realElo}
            </div>
            <div className="text-[10px] font-mono">
              Écart :{' '}
              <span className={`font-bold ${objective.diff >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                {objective.diff > 0 ? `+${objective.diff}` : objective.diff} pts
              </span>
            </div>
          </div>
        </div>

        {/* Required Pace Indicators */}
        <div className="mt-3.5 sm:mt-5 space-y-2 sm:space-y-3 text-[11px] sm:text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-neutral-400">Progression requise :</span>
            <span className="font-mono font-bold text-white text-right">
              {objective.pointsToDailyTarget === 0
                ? `Validée (+${Math.abs(objective.diff)} pts)`
                : `${objective.pointsToDailyTarget} pts pour égaler`}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-neutral-400">Cadence journalière :</span>
            <span className="font-mono font-bold text-[#facc15]">
              +{objective.paceRequiredPerDay} pt / jour
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-neutral-400">Cadence hebdomadaire :</span>
            <span className="font-mono font-bold text-white">
              +{objective.paceRequiredPerWeek} pts / sem.
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 sm:mt-6 rounded-2xl bg-neutral-900/80 p-3 sm:p-3.5 text-[11px] sm:text-xs text-neutral-300 border border-neutral-800">
        {currentStatus.desc}
      </div>
    </div>
  );
};
