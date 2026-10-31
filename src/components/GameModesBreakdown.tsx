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
      cadence: '1 min / 2 min',
      icon: <Zap className="h-4 w-4 text-amber-400" />,
      data: stats?.chess_bullet,
    },
    {
      key: 'blitz',
      title: 'Blitz',
      cadence: '3 min / 5 min',
      icon: <Clock className="h-4 w-4 text-amber-400" />,
      data: stats?.chess_blitz,
    },
    {
      key: 'rapid',
      title: 'Rapide',
      cadence: '10 min / 15 min',
      icon: <Shield className="h-4 w-4 text-amber-400" />,
      data: stats?.chess_rapid,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-300 dark:text-neutral-300 light:text-neutral-800">
            Détail Par Cadence De Jeu
          </h3>
          <p className="text-xs text-neutral-500">
            Données officielles synchronisées avec le profil Chess.com
          </p>
        </div>
        <span className="text-xs text-neutral-400 font-mono">
          Meilleur mode actif : <strong className="text-amber-400 uppercase">{bestMode}</strong>
        </span>
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
              className={`relative overflow-hidden rounded-xl border p-5 transition-all ${
                isCurrentBest
                  ? 'border-amber-500/40 bg-neutral-900/90 shadow-[0_0_20px_rgba(245,158,11,0.08)] dark:bg-neutral-900/90 light:bg-white'
                  : 'border-neutral-800 bg-neutral-900/60 dark:border-neutral-800 dark:bg-neutral-900/60 light:border-neutral-200 light:bg-white'
              }`}
            >
              {isCurrentBest && (
                <div className="absolute top-0 right-0 rounded-bl-lg bg-amber-500/20 border-l border-b border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                  Top Élo
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 dark:border-neutral-800 dark:bg-neutral-950 light:border-neutral-200 light:bg-neutral-100">
                  {mode.icon}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-neutral-100 dark:text-neutral-100 light:text-neutral-900">
                    {mode.title}
                  </h4>
                  <span className="text-[11px] text-neutral-500">{mode.cadence}</span>
                </div>
              </div>

              {/* Main Rating */}
              <div className="mt-4 flex items-baseline justify-between border-b border-neutral-800/80 pb-3 dark:border-neutral-800/80 light:border-neutral-200">
                <div>
                  <span className="text-[11px] text-neutral-400">Classement actuel</span>
                  <div className="font-mono text-3xl font-extrabold text-neutral-100 dark:text-neutral-100 light:text-neutral-900 tabular-nums">
                    {currentRating !== null ? currentRating : '—'}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-neutral-400">Record historique</span>
                  <div className="font-mono text-lg font-bold text-amber-400/90 tabular-nums">
                    {bestRating !== null ? bestRating : '—'}
                  </div>
                  {rd && <div className="text-[10px] text-neutral-500 font-mono">RD: {rd}</div>}
                </div>
              </div>

              {/* Record & Stats */}
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">Bilan parties :</span>
                  <div className="font-mono text-neutral-200 dark:text-neutral-200 light:text-neutral-800">
                    <span className="text-emerald-400 font-semibold">{record?.win ?? 0}V</span>
                    <span className="mx-1 text-neutral-600">/</span>
                    <span className="text-neutral-400">{record?.draw ?? 0}N</span>
                    <span className="mx-1 text-neutral-600">/</span>
                    <span className="text-rose-400 font-semibold">{record?.loss ?? 0}D</span>
                  </div>
                </div>

                {/* Winrate Bar */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-neutral-400">Taux de victoire</span>
                    <span className="font-mono font-medium text-amber-300">{winRate}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-neutral-950 overflow-hidden dark:bg-neutral-950 light:bg-neutral-200">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all"
                      style={{ width: `${winRate}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-neutral-500 font-mono">
                    <span>{totalGames} parties jouées</span>
                  </div>
                </div>

                {bestGameUrl && (
                  <div className="pt-2">
                    <a
                      href={bestGameUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] text-neutral-400 hover:text-amber-300 transition-colors"
                    >
                      <span>Revoir la meilleure partie</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Complementary FIDE / Tactics banner */}
      {(stats?.fide || stats?.tactics?.highest?.rating || stats?.puzzle_rush?.best?.score) && (
        <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-4 flex flex-wrap items-center justify-between gap-4 text-xs dark:border-neutral-800/80 dark:bg-neutral-950/60 light:border-neutral-200 light:bg-neutral-50">
          <div className="flex items-center gap-2 text-neutral-400">
            <Trophy className="h-4 w-4 text-amber-400" />
            <span className="font-semibold text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
              Indicateurs annexes Chess.com :
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-6 font-mono">
            {stats.fide && (
              <div>
                <span className="text-neutral-500 text-[11px] mr-1.5">FIDE Estimé :</span>
                <span className="font-bold text-neutral-200 dark:text-neutral-200 light:text-neutral-900">{stats.fide}</span>
              </div>
            )}
            {stats.tactics?.highest?.rating && (
              <div>
                <span className="text-neutral-500 text-[11px] mr-1.5">Record Problèmes :</span>
                <span className="font-bold text-amber-400">{stats.tactics.highest.rating}</span>
              </div>
            )}
            {stats.puzzle_rush?.best?.score && (
              <div>
                <span className="text-neutral-500 text-[11px] mr-1.5">Puzzle Rush Max :</span>
                <span className="font-bold text-amber-300">{stats.puzzle_rush.best.score}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
