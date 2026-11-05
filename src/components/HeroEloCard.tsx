/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Flag,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
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
  const deltaFromStart = currentElo - startElo;

  const modeConfig: Record<GameMode, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
    bullet: {
      label: 'Bullet',
      icon: <Zap className="h-4 w-4 text-amber-400" />,
      color: 'from-amber-500/20 to-amber-600/5 text-amber-300 border-amber-500/30',
      desc: 'Cadence 1 à 2 min',
    },
    blitz: {
      label: 'Blitz',
      icon: <Clock className="h-4 w-4 text-amber-400" />,
      color: 'from-amber-500/20 to-amber-600/5 text-amber-300 border-amber-500/30',
      desc: 'Cadence 3 à 5 min',
    },
    rapid: {
      label: 'Rapide',
      icon: <Shield className="h-4 w-4 text-sky-400" />,
      color: 'from-sky-500/20 to-sky-600/5 text-sky-300 border-sky-500/30',
      desc: 'Cadence 10 à 15 min',
    },
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

  const milestones = [
    { elo: 1500, label: 'Départ', pct: 0 },
    { elo: 1600, label: 'Club', pct: 20 },
    { elo: 1700, label: 'Intermédiaire', pct: 40 },
    { elo: 1800, label: 'Avancé', pct: 60 },
    { elo: 1900, label: 'Expert', pct: 80 },
    { elo: 2000, label: 'Candidat Maître', pct: 100 },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c1019]/90 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-all">
      {/* Cinematic Knight Visual Backdrop with high-end ambient mask */}
      <div className="absolute inset-0 z-0 pointer-events-none select-none overflow-hidden">
        <img
          src="/src/assets/images/grandmaster_chess_hero_1793877218857.jpg"
          alt="Grandmaster Chess Knight"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover object-right-top opacity-30 transform scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c1019] via-[#0c1019]/90 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c1019] via-transparent to-transparent" />
      </div>

      <div className="relative z-10 p-6 sm:p-8 lg:p-10 space-y-8">
        {/* Top Header Row with status pills */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-bold uppercase tracking-wider text-amber-300">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Programme d'Ascension 2000 Elo</span>
            </span>
            <span className="hidden sm:inline text-xs text-neutral-400 font-medium">
              Objectif officiel au {formattedDeadline}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span>Relevé en direct :</span>
            <span className="text-white font-semibold">{formattedSync}</span>
          </div>
        </div>

        {/* Hero Spotlight: Big Elo Number & Key Drivers */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                Meilleur Classement Officiel
              </span>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-neutral-900/90 border border-neutral-700/80 text-xs font-bold text-amber-300">
                {modeConfig[bestMode]?.icon}
                <span className="capitalize">{bestMode}</span>
                <span className="text-neutral-500 text-[10px] font-normal">({modeConfig[bestMode]?.desc})</span>
              </div>
            </div>

            <div className="flex items-baseline gap-5">
              <span className="font-mono text-7xl sm:text-8xl lg:text-9xl font-black tracking-tight text-white drop-shadow-[0_4px_30px_rgba(245,158,11,0.2)] tabular-nums">
                {currentElo}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-extrabold uppercase tracking-widest text-amber-400">
                  POINTS ELO
                </span>
                <span className="text-xs font-mono text-neutral-400 mt-0.5">
                  {deltaFromStart >= 0 ? `+${deltaFromStart}` : deltaFromStart} pts depuis la base (1500)
                </span>
              </div>
            </div>

            {isGoalReached ? (
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                <Trophy className="h-5 w-5 text-emerald-400" />
                <span>TRIOMPHE ÉCHICQUÉEN : Le sommet des 2000 Elo est officiellement conquis !</span>
              </div>
            ) : isBelowStart ? (
              <p className="text-xs text-amber-300/80 font-medium">
                Classement temporairement sous la base initiale (1500 Elo). Le point d'ancrage reste fixé à 1500.
              </p>
            ) : (
              <p className="text-xs text-neutral-300/90 leading-relaxed max-w-xl">
                Trajectoire athlétique calibrée pour franchir la barrière des <strong className="text-amber-300">2000 Elo</strong>. Chaque point gagné vous rapproche de la classe Expert Chess.com.
              </p>
            )}
          </div>

          {/* 4 Interactive Tactical Tiles */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/[0.06] bg-neutral-950/60 p-4.5 backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <Flag className="h-3.5 w-3.5 text-neutral-400" />
                <span>Base de départ</span>
              </div>
              <div className="mt-2 text-2xl font-black font-mono text-white tabular-nums">
                {startElo}
                <span className="text-xs font-normal text-neutral-400 ml-1">Elo</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">Niveau de référence</div>
            </div>

            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-4.5 backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <Target className="h-3.5 w-3.5 text-amber-400" />
                <span>Cible Ultime</span>
              </div>
              <div className="mt-2 text-2xl font-black font-mono text-amber-300 tabular-nums">
                {targetElo}
                <span className="text-xs font-normal text-amber-400/70 ml-1">Elo</span>
              </div>
              <div className="mt-1 text-[11px] text-amber-400/60 font-mono">31 Décembre 2027</div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-neutral-950/60 p-4.5 backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <Trophy className="h-3.5 w-3.5 text-neutral-400" />
                <span>Reste à gagner</span>
              </div>
              <div className="mt-2 text-2xl font-black font-mono text-white tabular-nums">
                {pointsRemaining}
                <span className="text-xs font-normal text-neutral-400 ml-1">pts</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">Pour valider le défi</div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-neutral-950/60 p-4.5 backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                <span>Jours restants</span>
              </div>
              <div className="mt-2 text-2xl font-black font-mono text-white tabular-nums">
                {daysRemaining}
                <span className="text-xs font-normal text-neutral-400 ml-1">j</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">Compte à rebours</div>
            </div>
          </div>
        </div>

        {/* Master Milestones Track with glowing bar */}
        <div className="pt-6 border-t border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="uppercase tracking-wider text-neutral-300 flex items-center gap-2">
              <Compass className="h-4 w-4 text-amber-400" />
              <span>Avancement Global Vers Les 2000 Elo</span>
            </span>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-xl font-black text-amber-400">{percentage}%</span>
              <span className="text-xs text-neutral-400">accompli</span>
            </div>
          </div>

          {/* Master Progress Bar */}
          <div className="relative h-4 w-full rounded-full bg-neutral-950 p-0.5 border border-neutral-800 shadow-inner overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-300 transition-all duration-700 ease-out shadow-[0_0_20px_rgba(245,158,11,0.6)]"
              style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
            />
          </div>

          {/* Steppers along the road */}
          <div className="grid grid-cols-6 text-center text-xs font-mono pt-2">
            {milestones.map((m) => {
              const isPassed = currentElo >= m.elo;
              const isTarget = !isPassed && currentElo >= m.elo - 100;

              return (
                <div key={m.elo} className="flex flex-col items-center">
                  <div className="flex items-center gap-1">
                    {isPassed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : isTarget ? (
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                    ) : (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-700" />
                    )}
                    <span
                      className={`font-bold ${
                        isPassed
                          ? 'text-emerald-400'
                          : isTarget
                          ? 'text-amber-400 font-black'
                          : 'text-neutral-500'
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
