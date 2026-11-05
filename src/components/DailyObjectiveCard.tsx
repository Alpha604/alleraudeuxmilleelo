/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, Compass, Target } from 'lucide-react';
import { DailyObjective } from '../types/chess';

interface DailyObjectiveCardProps {
  objective: DailyObjective;
}

export const DailyObjectiveCard: React.FC<DailyObjectiveCardProps> = ({ objective }) => {
  const statusConfig = {
    ahead: {
      label: 'En Avance',
      badgeClass: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
      icon: <ArrowUpRight className="h-4 w-4 text-emerald-400" />,
      desc: 'Votre classement actuel devance le rythme idéal planifié.',
    },
    on_track: {
      label: 'Dans le Rythme',
      badgeClass: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
      icon: <CheckCircle2 className="h-4 w-4 text-amber-400" />,
      desc: 'Votre progression est en parfaite harmonie avec la trajectoire.',
    },
    behind: {
      label: 'Retard à Combler',
      badgeClass: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
      icon: <ArrowDownRight className="h-4 w-4 text-rose-400" />,
      desc: 'Léger décalage : quelques victoires pour recoller à la courbe.',
    },
    goal_reached: {
      label: 'Objectif Atteint',
      badgeClass: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
      desc: 'Le palier suprême de 2000 Elo a été franchi !',
    },
    deadline_passed: {
      label: 'Échéance Révolue',
      badgeClass: 'bg-neutral-800 border-neutral-700 text-neutral-400',
      icon: <Clock className="h-4 w-4 text-neutral-400" />,
      desc: 'La date limite du projet est passée.',
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
    <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c1019]/80 p-6 sm:p-7 shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Compass className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                Objectif Quotidien
              </span>
              <p className="text-[11px] capitalize text-neutral-400">{formattedToday}</p>
            </div>
          </div>

          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${currentStatus.badgeClass}`}>
            {currentStatus.icon}
            <span>{currentStatus.label}</span>
          </div>
        </div>

        {/* Core Comparison Display */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-b border-white/[0.06] pb-6">
          <div className="space-y-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400">
              Cible du jour
            </span>
            <div className="font-mono text-4xl font-black text-white tabular-nums">
              {objective.theoreticalElo}
            </div>
            <span className="text-[10px] text-neutral-500">Pour rester dans le tempo</span>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400">
              Votre Elo réel
            </span>
            <div className="font-mono text-4xl font-black text-amber-400 tabular-nums">
              {objective.realElo}
            </div>
            <div className="text-[10px] text-neutral-400 font-mono">
              Écart :{' '}
              <span className={`font-bold ${objective.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {objective.diff > 0 ? `+${objective.diff}` : objective.diff} pts
              </span>
            </div>
          </div>
        </div>

        {/* Required Pace Indicators */}
        <div className="mt-5 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-neutral-400">Progression immédiate attendue :</span>
            <span className="font-mono font-bold text-white">
              {objective.pointsToDailyTarget === 0
                ? `Cible validée (+${Math.abs(objective.diff)} pts d'avance)`
                : `${objective.pointsToDailyTarget} pts pour égaler la cible`}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-400">Cadence journalière requise :</span>
            <span className="font-mono font-bold text-amber-400">
              +{objective.paceRequiredPerDay} pt / jour
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-400">Cadence hebdomadaire requise :</span>
            <span className="font-mono font-bold text-sky-400">
              +{objective.paceRequiredPerWeek} pts / semaine
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-neutral-950/60 p-3.5 text-xs text-neutral-400 border border-white/[0.04]">
        {currentStatus.desc}
      </div>
    </div>
  );
};
