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

  const modeConfig: Record<GameMode, { label: string; icon: React.ReactNode; desc: string }> = {
    bullet: {
      label: 'Bullet',
      icon: <Zap className="h-4 w-4 text-[#facc15]" />,
      desc: '1 à 2 min',
    },
    blitz: {
      label: 'Blitz',
      icon: <Clock className="h-4 w-4 text-[#facc15]" />,
      desc: '3 à 5 min',
    },
    rapid: {
      label: 'Rapide',
      icon: <Shield className="h-4 w-4 text-white" />,
      desc: '10 à 15 min',
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

  // Calculate exact mathematical positions for milestones along the progress bar
  const milestoneRange = Math.max(1, targetElo - startElo);
  const baseMilestones = [1500, 1600, 1700, 1800, 1900, 2000];
  const allElos = Array.from(new Set([startElo, ...baseMilestones, targetElo]))
    .filter((e) => e >= startElo && e <= targetElo)
    .sort((a, b) => a - b);

  const getMilestoneLabel = (elo: number) => {
    if (elo === startElo) return 'Départ';
    if (elo === targetElo) return 'Candidat Maître';
    if (elo === 1600) return 'Club';
    if (elo === 1700) return 'Intermédiaire';
    if (elo === 1800) return 'Avancé';
    if (elo === 1900) return 'Expert';
    return `${elo}`;
  };

  const milestones = allElos.map((elo) => {
    const rawPct = ((elo - startElo) / milestoneRange) * 100;
    return {
      elo,
      label: getMilestoneLabel(elo),
      pct: Math.min(100, Math.max(0, rawPct)),
    };
  });

  return (
    <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-[#0c0f14] shadow-2xl transition-all">
      {/* Cinematic Knight Visual Backdrop with high-end ambient mask */}
      <div className="absolute inset-0 z-0 pointer-events-none select-none overflow-hidden">
        <img
          src="/src/assets/images/grandmaster_chess_hero_1793877218857.jpg"
          alt="Grandmaster Chess Knight"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover object-right-top opacity-25 transform scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c0f14] via-[#0c0f14]/90 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0f14] via-transparent to-transparent" />
      </div>

      <div className="relative z-10 p-4 sm:p-8 lg:p-10 space-y-6 sm:space-y-8">
        {/* Top Header Row with status pills (Blanc, Vert, Jaune) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 border-b border-neutral-800 pb-4 sm:pb-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-[#facc15]/10 border border-[#facc15]/30 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#facc15]">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#facc15]" />
              <span>Programme 2000 Elo</span>
            </span>
            <span className="hidden sm:inline text-xs text-neutral-300 font-medium">
              Objectif au {formattedDeadline}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] sm:text-xs font-mono text-neutral-400">
            <span className="inline-block h-2 w-2 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            <span className="hidden sm:inline">Relevé en direct :</span>
            <span className="text-white font-semibold">{formattedSync}</span>
          </div>
        </div>

        {/* Hero Spotlight: Big Elo Number & Key Drivers */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
          <div className="lg:col-span-7 space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-neutral-400">
                Meilleur Classement
              </span>
              <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg bg-neutral-900 border border-neutral-700 text-xs font-bold text-[#facc15]">
                {modeConfig[bestMode]?.icon}
                <span className="capitalize">{bestMode}</span>
                <span className="text-neutral-400 text-[10px] font-normal hidden sm:inline">({modeConfig[bestMode]?.desc})</span>
              </div>
            </div>

            <div className="flex flex-wrap items-baseline gap-3 sm:gap-5">
              <span className="font-mono text-5xl sm:text-7xl lg:text-9xl font-black tracking-tight text-white drop-shadow-[0_4px_24px_rgba(255,255,255,0.15)] tabular-nums">
                {currentElo}
              </span>
              <div className="flex flex-col">
                <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-[#facc15]">
                  POINTS ELO
                </span>
                <span className={`text-[11px] sm:text-xs font-mono font-bold mt-0.5 ${deltaFromStart >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                  {deltaFromStart >= 0 ? `+${deltaFromStart}` : deltaFromStart} pts
                  <span className="hidden sm:inline"> depuis la base ({startElo})</span>
                </span>
              </div>
            </div>

            {isGoalReached ? (
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-[#10b981]/15 border border-[#10b981]/30 text-[#10b981] text-xs font-bold">
                <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-[#10b981]" />
                <span>TRIOMPHE : Le sommet des 2000 Elo est franchi avec succès !</span>
              </div>
            ) : isBelowStart ? (
              <p className="text-xs text-[#ef4444] font-medium">
                Classement sous la base ({startElo} Elo). Le point d&apos;ancrage reste fixé à {startElo}.
              </p>
            ) : (
              <p className="text-xs text-neutral-300 leading-relaxed max-w-xl hidden sm:block">
                Trajectoire calibrée pour franchir la barrière des <strong className="text-[#facc15]">2000 Elo</strong>. Progression continue vers le palier Expert.
              </p>
            )}
          </div>

          {/* 4 Interactive Tactical Tiles (Noir, Blanc, Jaune, Vert) */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-3 sm:p-4.5">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-neutral-400">
                <Flag className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />
                <span>Base départ</span>
              </div>
              <div className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-black font-mono text-white tabular-nums">
                {startElo}
                <span className="text-xs font-normal text-neutral-400 ml-1">Elo</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500 hidden sm:block">Repère immuable</div>
            </div>

            <div className="rounded-2xl border border-[#facc15]/30 bg-[#facc15]/[0.06] p-3 sm:p-4.5">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-[#facc15]">
                <Target className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#facc15]" />
                <span>Cible Ultime</span>
              </div>
              <div className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-black font-mono text-[#facc15] tabular-nums">
                {targetElo}
                <span className="text-xs font-normal text-neutral-300 ml-1">Elo</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-400 font-mono hidden sm:block">31 Décembre 2027</div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-3 sm:p-4.5">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-neutral-400">
                <Trophy className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#facc15]" />
                <span>À conquérir</span>
              </div>
              <div className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-black font-mono text-white tabular-nums">
                {pointsRemaining}
                <span className="text-xs font-normal text-neutral-400 ml-1">pts</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500 hidden sm:block">Pour atteindre 2000</div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-3 sm:p-4.5">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-neutral-400">
                <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />
                <span>Jours restants</span>
              </div>
              <div className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-black font-mono text-white tabular-nums">
                {daysRemaining}
                <span className="text-xs font-normal text-neutral-400 ml-1">j</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500 hidden sm:block">Compte à rebours</div>
            </div>
          </div>
        </div>

        {/* Master Milestones Track with glowing bar */}
        <div className="pt-4 sm:pt-6 border-t border-neutral-800 space-y-2.5 sm:space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="uppercase tracking-wider text-neutral-300 flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
              <Compass className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#facc15]" />
              <span>Avancement Global Vers 2000 Elo</span>
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2 font-mono">
              <span className="text-base sm:text-xl font-black text-[#facc15]">{percentage}%</span>
              <span className="text-[10px] sm:text-xs text-neutral-400">validé</span>
            </div>
          </div>

          {/* Master Progress Bar (Jaune vif #facc15) with Tick Marks */}
          <div className="relative pt-2 pb-1">
            <div className="relative h-4 sm:h-5 w-full rounded-full bg-neutral-950 p-0.5 border border-neutral-800 shadow-inner overflow-hidden">
              {/* Glowing Progress Fill */}
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#facc15] via-[#fde047] to-white transition-all duration-700 ease-out shadow-[0_0_15px_rgba(250,204,21,0.6)]"
                style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
              />

              {/* Precise Vertical Tick Marks on the Bar (Petits traits sur la barre) */}
              {milestones.map((m) => {
                const isPassed = currentElo >= m.elo;
                if (m.pct <= 0.5 || m.pct >= 99.5) return null;
                return (
                  <div
                    key={`bar-tick-${m.elo}`}
                    className={`absolute top-0 bottom-0 w-0.5 pointer-events-none transition-colors z-10 ${
                      isPassed ? 'bg-black/40' : 'bg-white/20'
                    }`}
                    style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}
                    title={`${m.elo} Elo (${m.label})`}
                  />
                );
              })}
            </div>

            {/* Milestone Markers & Labels accurately positioned with tick marks */}
            <div className="relative h-12 w-full mt-1.5 select-none">
              {milestones.map((m) => {
                const isPassed = currentElo >= m.elo;
                const isTarget = !isPassed && currentElo >= m.elo - 100;

                // Adjust horizontal transform so labels at 0% or 100% don't clip outside card
                let transformStyle = 'translateX(-50%)';
                if (m.pct <= 3) transformStyle = 'translateX(0%)';
                else if (m.pct >= 97) transformStyle = 'translateX(-100%)';

                return (
                  <div
                    key={m.elo}
                    className="absolute top-0 flex flex-col items-center pointer-events-auto group"
                    style={{
                      left: `${m.pct}%`,
                      transform: transformStyle,
                    }}
                  >
                    {/* Tick Mark protruding directly below the bar */}
                    <div
                      className={`w-0.5 h-2 transition-colors ${
                        isPassed
                          ? 'bg-[#10b981]'
                          : isTarget
                          ? 'bg-[#facc15]'
                          : 'bg-neutral-600'
                      }`}
                    />

                    {/* Milestone badge / number */}
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {isPassed ? (
                        <CheckCircle2 className="h-3 w-3 text-[#10b981] shrink-0" />
                      ) : isTarget ? (
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#facc15] animate-ping shrink-0" />
                      ) : (
                        <span className="inline-block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                      )}
                      <span
                        className={`text-[11px] sm:text-xs font-mono font-bold ${
                          isPassed
                            ? 'text-[#10b981]'
                            : isTarget
                            ? 'text-[#facc15] font-black'
                            : 'text-neutral-500 group-hover:text-neutral-300'
                        }`}
                      >
                        {m.elo}
                      </span>
                    </div>

                    {/* Label */}
                    <span className="text-[9px] sm:text-[10px] text-neutral-400 font-mono tracking-tight whitespace-nowrap mt-0.5 hidden sm:inline">
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
