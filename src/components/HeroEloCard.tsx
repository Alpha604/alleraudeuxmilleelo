/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Calendar, Clock, Flag, Shield, Target, Trophy, Zap } from 'lucide-react';
import { GameMode } from '../types/chess';
import { calculateProgressPercentage } from '../utils/eloEngine';

interface HeroEloCardProps {
  currentElo: number;
  bestMode: GameMode;
  startElo: number;
  targetElo: number;
  daysRemaining: number;
  lastSyncTime: string | null;
  targetDateStr: string;
  isGoalReached: boolean;
}

export const HeroEloCard: React.FC<HeroEloCardProps> = ({
  currentElo,
  bestMode,
  startElo,
  targetElo,
  daysRemaining,
  lastSyncTime,
  targetDateStr,
  isGoalReached,
}) => {
  const percentage = calculateProgressPercentage(currentElo, startElo, targetElo);
  const pointsRemaining = Math.max(0, targetElo - currentElo);
  const isBelowStart = currentElo < startElo;

  const modeLabels: Record<GameMode, { label: string; icon: React.ReactNode; desc: string }> = {
    bullet: { label: 'Bullet (1-2 min)', icon: <Zap className="h-3.5 w-3.5 text-amber-400" />, desc: 'Cadence ultra-rapide' },
    blitz: { label: 'Blitz (3-5 min)', icon: <Clock className="h-3.5 w-3.5 text-amber-400" />, desc: 'Cadence dynamique' },
    rapid: { label: 'Rapid (10-15 min)', icon: <Shield className="h-3.5 w-3.5 text-amber-400" />, desc: 'Cadence stratégique' },
  };

  const formattedSync = lastSyncTime
    ? new Date(lastSyncTime).toLocaleString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris',
      })
    : 'En attente de synchronisation';

  const formattedDeadline = new Date(targetDateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });

  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/90 shadow-2xl transition-all dark:border-neutral-800 dark:bg-neutral-900/90 light:border-neutral-200 light:bg-white">
      {/* Background ambient image with deep dark gradient scrim */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20 dark:opacity-20 light:opacity-5">
        <img
          src="/src/assets/images/chess_luxury_hero_1793448977426.jpg"
          alt="Luxury Chess Knight Backdrop"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover object-right"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/90 to-transparent dark:from-neutral-950 dark:via-neutral-950/90 light:from-white light:via-white/90 light:to-transparent" />
      </div>

      <div className="relative z-10 p-6 sm:p-8 lg:p-10">
        {/* Top Header metadata */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800/80 pb-5 dark:border-neutral-800/80 light:border-neutral-200">
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
            <span className="text-amber-400 font-semibold uppercase tracking-wider">Programme Officiel</span>
            <span aria-hidden="true">·</span>
            <span>Échéance {formattedDeadline}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{daysRemaining} jours restants</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
            <span className="font-mono">Dernière synchro :</span>
            <span className="font-mono text-neutral-200 dark:text-neutral-200 light:text-neutral-700">{formattedSync}</span>
          </div>
        </div>

        {/* Central Display: Current Rating & Primary Stats */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest font-semibold text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
                Meilleur Classement Actuel
              </span>
              <div className="inline-flex items-center gap-1.5 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 border border-amber-500/20">
                {modeLabels[bestMode]?.icon}
                <span className="capitalize">{bestMode}</span>
              </div>
            </div>

            <div className="flex items-baseline gap-4">
              <span className="font-mono text-6xl sm:text-7xl lg:text-8xl font-black tracking-tight text-white dark:text-white light:text-neutral-900 tabular-nums">
                {currentElo}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-bold uppercase tracking-wider text-amber-400">
                  POINTS ELO
                </span>
                <span className="text-xs text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
                  {modeLabels[bestMode]?.desc}
                </span>
              </div>
            </div>

            {isGoalReached ? (
              <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-1.5 text-xs font-semibold text-emerald-300">
                <Trophy className="h-4 w-4 text-emerald-400" />
                <span>Objectif de 2000 Elo atteint avec succès ! Félicitations !</span>
              </div>
            ) : isBelowStart ? (
              <p className="text-xs text-amber-300/80">
                Classement temporairement inférieur à la base de départ (1500 Elo). La barre de progression reste calée à 0%.
              </p>
            ) : (
              <p className="text-xs text-neutral-400 dark:text-neutral-400 light:text-neutral-600">
                Progression calculée strictement depuis la base de départ fixée à <strong className="text-neutral-200 dark:text-neutral-200 light:text-neutral-800">{startElo} Elo</strong> vers la cible <strong className="text-amber-400">{targetElo} Elo</strong>.
              </p>
            )}
          </div>

          {/* Quick Metrics Strip */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-4 backdrop-blur-sm dark:border-neutral-800/80 dark:bg-neutral-950/60 light:border-neutral-200 light:bg-neutral-50">
              <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-400 light:text-neutral-500 text-xs">
                <Flag className="h-3.5 w-3.5 text-neutral-400" />
                <span>Départ fixé</span>
              </div>
              <div className="mt-2 text-2xl font-bold font-mono text-neutral-200 dark:text-neutral-200 light:text-neutral-800 tabular-nums">
                {startElo}
                <span className="text-xs font-normal text-neutral-500 ml-1">Elo</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">Point de repère immuable</div>
            </div>

            <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-4 backdrop-blur-sm dark:border-neutral-800/80 dark:bg-neutral-950/60 light:border-neutral-200 light:bg-neutral-50">
              <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-400 light:text-neutral-500 text-xs">
                <Target className="h-3.5 w-3.5 text-amber-400" />
                <span>Objectif Final</span>
              </div>
              <div className="mt-2 text-2xl font-bold font-mono text-amber-400 tabular-nums">
                {targetElo}
                <span className="text-xs font-normal text-amber-500/80 ml-1">Elo</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">Avant le 01/01/2028</div>
            </div>

            <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-4 backdrop-blur-sm dark:border-neutral-800/80 dark:bg-neutral-950/60 light:border-neutral-200 light:bg-neutral-50">
              <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-400 light:text-neutral-500 text-xs">
                <Trophy className="h-3.5 w-3.5 text-neutral-400" />
                <span>Reste à gagner</span>
              </div>
              <div className="mt-2 text-2xl font-bold font-mono text-neutral-100 dark:text-neutral-100 light:text-neutral-900 tabular-nums">
                {pointsRemaining}
                <span className="text-xs font-normal text-neutral-500 ml-1">pts</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">Pour atteindre 2000</div>
            </div>

            <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-4 backdrop-blur-sm dark:border-neutral-800/80 dark:bg-neutral-950/60 light:border-neutral-200 light:bg-neutral-50">
              <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-400 light:text-neutral-500 text-xs">
                <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                <span>Jours Restants</span>
              </div>
              <div className="mt-2 text-2xl font-bold font-mono text-neutral-100 dark:text-neutral-100 light:text-neutral-900 tabular-nums">
                {daysRemaining}
                <span className="text-xs font-normal text-neutral-500 ml-1">j</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">Jusqu'au 31/12/2027</div>
            </div>
          </div>
        </div>

        {/* The Main Master Progress Bar */}
        <div className="mt-10 pt-6 border-t border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
              Progression Vers L'Objectif (1500 → 2000 Elo)
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-amber-400 tabular-nums">
                {percentage}%
              </span>
              <span className="text-xs text-neutral-400">accompli</span>
            </div>
          </div>

          {/* Bar track */}
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-neutral-950 border border-neutral-800/80 dark:bg-neutral-950 dark:border-neutral-800/80 light:bg-neutral-200 light:border-neutral-300 p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-300 transition-all duration-700 ease-out shadow-[0_0_12px_rgba(245,158,11,0.4)]"
              style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
            />
          </div>

          {/* Milestones markers along the bar */}
          <div className="mt-3 flex justify-between text-[11px] font-mono text-neutral-500 dark:text-neutral-500 light:text-neutral-400">
            <div className="flex flex-col items-start">
              <span className="font-semibold text-neutral-300 dark:text-neutral-300 light:text-neutral-700">1500 Elo</span>
              <span className="text-[10px]">0%</span>
            </div>
            <div className="flex flex-col items-center">
              <span>1600 Elo</span>
              <span className="text-[10px]">20%</span>
            </div>
            <div className="flex flex-col items-center">
              <span>1700 Elo</span>
              <span className="text-[10px]">40%</span>
            </div>
            <div className="flex flex-col items-center">
              <span>1750 Elo</span>
              <span className="text-[10px]">50%</span>
            </div>
            <div className="flex flex-col items-center">
              <span>1800 Elo</span>
              <span className="text-[10px]">60%</span>
            </div>
            <div className="flex flex-col items-center">
              <span>1900 Elo</span>
              <span className="text-[10px]">80%</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-semibold text-amber-400">2000 Elo</span>
              <span className="text-[10px] text-amber-500/80">100% (Cible)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
