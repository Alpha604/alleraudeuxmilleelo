/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Calendar, Check, Clock, Flag, Shield, Target, Trophy, Zap } from 'lucide-react';
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
    bullet: { label: 'Bullet (1-2 min)', icon: <Zap className="h-4 w-4 text-amber-400" />, desc: 'Cadence ultra-rapide' },
    blitz: { label: 'Blitz (3-5 min)', icon: <Clock className="h-4 w-4 text-amber-400" />, desc: 'Cadence dynamique' },
    rapid: { label: 'Rapid (10-15 min)', icon: <Shield className="h-4 w-4 text-amber-400" />, desc: 'Cadence stratégique' },
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

  const milestoneSteps = [
    { elo: 1500, label: 'Départ', pct: 0 },
    { elo: 1600, label: 'Club', pct: 20 },
    { elo: 1700, label: 'Intermédiaire', pct: 40 },
    { elo: 1800, label: 'Avancé', pct: 60 },
    { elo: 1900, label: 'Expert', pct: 80 },
    { elo: 2000, label: 'Candidat Maître', pct: 100 },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-[#0c0e14] shadow-2xl transition-all dark:border-neutral-800 dark:bg-[#0c0e14] light:border-neutral-200 light:bg-white">
      {/* Background ambient luxury chess imagery */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20 dark:opacity-20 light:opacity-5">
        <img
          src="/src/assets/images/chess_luxury_hero_1793448977426.jpg"
          alt="Luxury Chess Knight Backdrop"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover object-right"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c0e14] via-[#0c0e14]/90 to-transparent dark:from-[#0c0e14] dark:via-[#0c0e14]/90 light:from-white light:via-white/90 light:to-transparent" />
      </div>

      <div className="relative z-10 p-6 sm:p-8 lg:p-10">
        {/* Top Header unboxed metadata (anti-pill compliant) */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800/80 pb-5 dark:border-neutral-800/80 light:border-neutral-200">
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
            <span className="text-amber-400 font-bold uppercase tracking-wider">Programme Officiel</span>
            <span aria-hidden="true">·</span>
            <span>Échéance {formattedDeadline}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-neutral-300 dark:text-neutral-300 light:text-neutral-700">{daysRemaining} jours restants</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
            <span>Dernière synchro :</span>
            <span className="font-mono text-neutral-200 dark:text-neutral-200 light:text-neutral-700">{formattedSync}</span>
          </div>
        </div>

        {/* Central Display: Primary Rating */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center gap-2.5 text-xs font-semibold text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
              <span className="uppercase tracking-widest">Meilleur Classement Actuel</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1">
                {modeLabels[bestMode]?.icon}
                <span>{bestMode}</span>
              </span>
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
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Trophy className="h-4 w-4" />
                <span>Objectif de 2000 Elo atteint avec succès ! Félicitations !</span>
              </div>
            ) : isBelowStart ? (
              <p className="text-xs text-amber-300/80">
                Classement temporairement inférieur à la base de départ (1500 Elo). La barre de progression reste calée à 0%.
              </p>
            ) : (
              <p className="text-xs text-neutral-400 dark:text-neutral-400 light:text-neutral-600">
                Progression calculée depuis la base de <strong className="text-neutral-200 dark:text-neutral-200 light:text-neutral-800">{startElo} Elo</strong> jusqu'à la cible ultime de <strong className="text-amber-400">{targetElo} Elo</strong>.
              </p>
            )}
          </div>

          {/* 4-Metric Grid with hairline borders */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-3.5">
            <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/70 p-4.5 backdrop-blur-sm dark:border-neutral-800/80 dark:bg-neutral-950/70 light:border-neutral-200 light:bg-neutral-50">
              <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-400 light:text-neutral-500 text-xs">
                <Flag className="h-3.5 w-3.5 text-neutral-400" />
                <span>Départ fixé</span>
              </div>
              <div className="mt-2 text-2xl font-black font-mono text-neutral-200 dark:text-neutral-200 light:text-neutral-800 tabular-nums">
                {startElo}
                <span className="text-xs font-normal text-neutral-500 ml-1">Elo</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">Repère immuable</div>
            </div>

            <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/70 p-4.5 backdrop-blur-sm dark:border-neutral-800/80 dark:bg-neutral-950/70 light:border-neutral-200 light:bg-neutral-50">
              <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-400 light:text-neutral-500 text-xs">
                <Target className="h-3.5 w-3.5 text-amber-400" />
                <span>Objectif Final</span>
              </div>
              <div className="mt-2 text-2xl font-black font-mono text-amber-400 tabular-nums">
                {targetElo}
                <span className="text-xs font-normal text-amber-500/80 ml-1">Elo</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">Avant le 31/12/2027</div>
            </div>

            <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/70 p-4.5 backdrop-blur-sm dark:border-neutral-800/80 dark:bg-neutral-950/70 light:border-neutral-200 light:bg-neutral-50">
              <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-400 light:text-neutral-500 text-xs">
                <Trophy className="h-3.5 w-3.5 text-neutral-400" />
                <span>Reste à conquérir</span>
              </div>
              <div className="mt-2 text-2xl font-black font-mono text-neutral-100 dark:text-neutral-100 light:text-neutral-900 tabular-nums">
                {pointsRemaining}
                <span className="text-xs font-normal text-neutral-500 ml-1">pts</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">Pour atteindre 2000</div>
            </div>

            <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/70 p-4.5 backdrop-blur-sm dark:border-neutral-800/80 dark:bg-neutral-950/70 light:border-neutral-200 light:bg-neutral-50">
              <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-400 light:text-neutral-500 text-xs">
                <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                <span>Jours Restants</span>
              </div>
              <div className="mt-2 text-2xl font-black font-mono text-neutral-100 dark:text-neutral-100 light:text-neutral-900 tabular-nums">
                {daysRemaining}
                <span className="text-xs font-normal text-neutral-500 ml-1">j</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">Compte à rebours</div>
            </div>
          </div>
        </div>

        {/* Master Progress Bar */}
        <div className="mt-10 pt-6 border-t border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
              Progression Vers L'Objectif (1500 → 2000 Elo)
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-black text-amber-400 tabular-nums">
                {percentage}%
              </span>
              <span className="text-xs text-neutral-400">accompli</span>
            </div>
          </div>

          {/* Bar track */}
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-neutral-950 border border-neutral-800/80 dark:bg-neutral-950 dark:border-neutral-800/80 light:bg-neutral-200 light:border-neutral-300 p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-300 transition-all duration-700 ease-out shadow-[0_0_15px_rgba(245,158,11,0.45)]"
              style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
            />
          </div>

          {/* Milestones markers along the bar */}
          <div className="mt-4 grid grid-cols-6 text-center text-xs font-mono">
            {milestoneSteps.map((m) => {
              const isPassed = currentElo >= m.elo;
              const isTarget = !isPassed && currentElo >= m.elo - 100;

              return (
                <div key={m.elo} className="flex flex-col items-center">
                  <div className="flex items-center gap-1">
                    {isPassed ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : isTarget ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    ) : null}
                    <span
                      className={`font-semibold ${
                        isPassed
                          ? 'text-emerald-400'
                          : isTarget
                          ? 'text-amber-400 font-bold'
                          : 'text-neutral-400'
                      }`}
                    >
                      {m.elo}
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-500 mt-0.5">{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
