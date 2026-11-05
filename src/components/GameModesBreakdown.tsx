/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Clock, ExternalLink, Shield, Trophy, Zap } from 'lucide-react';
import { ChessComStatsResponse, GameMode } from '../types/chess';

interface GameModesBreakdownProps {
  stats?: ChessComStatsResponse | null;
  bestMode: GameMode;
}

export const GameModesBreakdown: React.FC<GameModesBreakdownProps> = ({ stats, bestMode }) => {
  const modes: {
    key: GameMode;
    title: string;
    cadence: string;
    icon: React.ReactNode;
    data?: ChessComStatsResponse['chess_bullet'];
  }[] = [
    {
      key: 'bullet',
      title: 'Bullet',
      cadence: '1 min · 2 min',
      icon: <Zap className="h-5 w-5 text-amber-400" />,
      data: stats?.chess_bullet,
    },
    {
      key: 'blitz',
      title: 'Blitz',
      cadence: '3 min · 5 min',
      icon: <Clock className="h-5 w-5 text-amber-400" />,
      data: stats?.chess_blitz,
    },
    {
      key: 'rapid',
      title: 'Rapide',
      cadence: '10 min · 15 min',
      icon: <Shield className="h-5 w-5 text-sky-400" />,
      data: stats?.chess_rapid,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-white">
            Détail Par Cadence Officielle
          </h3>
          <p className="text-xs text-neutral-400">
            Relevés directs issus du profil officiel Chess.com
          </p>
        </div>
        <div className="text-xs font-mono text-neutral-300">
          Mode de référence : <span className="font-bold text-amber-400 uppercase">{bestMode}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {modes.map((mode) => {
          const isCurrentBest = mode.key === bestMode;
          const currentRating = mode.data?.last?.rating ?? null;
          const bestRating = mode.data?.best?.rating ?? null;
          const rd = mode.data?.last?.rd;
          const record = mode.data?.record;
          const totalGames = record ? record.win + record.loss + record.draw : 0;
          const winRate = totalGames > 0 && record ? Math.round((record.win / totalGames) * 100) : 0;
          const bestGameUrl = mode.data?.best?.game;

          return (
            <div
              key={mode.key}
              className={`relative overflow-hidden rounded-3xl border p-6 transition-all backdrop-blur-xl ${
                isCurrentBest
                  ? 'border-amber-500/50 bg-[#0f1422]/90 shadow-[0_0_30px_rgba(245,158,11,0.12)]'
                  : 'border-white/[0.08] bg-[#0c1019]/80 shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:border-white/[0.15]'
              }`}
            >
              {isCurrentBest && (
                <div className="absolute top-0 right-0 rounded-bl-2xl bg-gradient-to-l from-amber-500/30 to-amber-500/10 border-l border-b border-amber-500/40 px-3.5 py-1 text-[10px] font-black text-amber-300 uppercase tracking-widest">
                  Leader
                </div>
              )}

              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-900 border border-white/[0.08]">
                  {mode.icon}
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-white">
                    {mode.title}
                  </h4>
                  <span className="text-xs text-neutral-400 font-mono">{mode.cadence}</span>
                </div>
              </div>

              {/* Main Rating Display */}
              <div className="mt-6 flex items-baseline justify-between border-b border-white/[0.06] pb-4">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Classement Actuel
                  </span>
                  <div className="font-mono text-4xl font-black text-white tabular-nums">
                    {currentRating !== null ? currentRating : '—'}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Record
                  </span>
                  <div className="font-mono text-2xl font-bold text-amber-400 tabular-nums">
                    {bestRating !== null ? bestRating : '—'}
                  </div>
                  {rd && <div className="text-[10px] text-neutral-500 font-mono">RD : {rd}</div>}
                </div>
              </div>

              {/* Detailed Game Record & Winrate */}
              <div className="mt-4 space-y-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">Bilan des duels :</span>
                  <div className="font-mono text-xs font-bold">
                    <span className="text-emerald-400">{record?.win ?? 0}V</span>
                    <span className="mx-1.5 text-neutral-600">·</span>
                    <span className="text-neutral-400">{record?.draw ?? 0}N</span>
                    <span className="mx-1.5 text-neutral-600">·</span>
                    <span className="text-rose-400">{record?.loss ?? 0}D</span>
                  </div>
                </div>

                {/* Winrate Bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-neutral-400">Ratio de victoire</span>
                    <span className="font-mono font-bold text-amber-300">{winRate}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-neutral-950 overflow-hidden border border-white/[0.06]">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                      style={{ width: `${winRate}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] text-neutral-500 font-mono">
                    <span>{totalGames} parties jouées</span>
                  </div>
                </div>

                {bestGameUrl && (
                  <div className="pt-2 border-t border-white/[0.06]">
                    <a
                      href={bestGameUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-amber-400/90 hover:text-amber-300 transition-colors font-medium"
                    >
                      <span>Consulter la meilleure partie</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chess.com Auxiliary Achievements */}
      {(stats?.fide || stats?.tactics?.highest?.rating || stats?.puzzle_rush?.best?.score) && (
        <div className="rounded-3xl border border-white/[0.08] bg-[#0c1019]/80 p-4.5 flex flex-wrap items-center justify-between gap-4 text-xs backdrop-blur-xl shadow-lg">
          <div className="flex items-center gap-2.5 text-neutral-400">
            <Trophy className="h-4 w-4 text-amber-400" />
            <span className="font-bold text-white">
              Indicateurs Tactiques Chess.com :
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-6 font-mono text-xs">
            {stats.fide && (
              <div>
                <span className="text-neutral-400 mr-1.5">FIDE Estimé :</span>
                <span className="font-bold text-white">{stats.fide}</span>
              </div>
            )}
            {stats.tactics?.highest?.rating && (
              <div>
                <span className="text-neutral-400 mr-1.5">Record Problèmes :</span>
                <span className="font-bold text-amber-400">{stats.tactics.highest.rating}</span>
              </div>
            )}
            {stats.puzzle_rush?.best?.score && (
              <div>
                <span className="text-neutral-400 mr-1.5">Puzzle Rush Max :</span>
                <span className="font-bold text-amber-300">{stats.puzzle_rush.best.score}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
