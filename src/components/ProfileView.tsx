/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  Crown,
  ExternalLink,
  Flame,
  Globe,
  MapPin,
  ShieldCheck,
  Swords,
  Target,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { AppSettings, ChessComProfileResponse, ChessComStatsResponse } from '../types/chess';

interface ProfileViewProps {
  username: string;
  profile?: ChessComProfileResponse;
  stats?: ChessComStatsResponse | null;
  settings: AppSettings;
  isAdmin: boolean;
  isSpectator?: boolean;
  onBackToDashboard: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  username,
  profile,
  stats,
  settings,
  isAdmin,
  isSpectator,
  onBackToDashboard,
}) => {
  const isAlphaRomeo = username.toLowerCase() === 'alpharomeo1500';

  // Format joined date
  const joinedDateFormatted = profile?.joined
    ? new Date(profile.joined * 1000).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Date non renseignée';

  // Stats helpers
  const bulletStats = stats?.chess_bullet;
  const blitzStats = stats?.chess_blitz;
  const rapidStats = stats?.chess_rapid;
  const puzzleStats = stats?.puzzle_rush;
  const tacticsStats = stats?.tactics;

  const currentBestRating = Math.max(
    bulletStats?.last?.rating || 0,
    blitzStats?.last?.rating || 0,
    rapidStats?.last?.rating || 0,
    settings.startElo
  );

  const progressPercent = Math.min(
    100,
    Math.max(
      0,
      Math.round(((currentBestRating - settings.startElo) / (settings.targetElo - settings.startElo)) * 100)
    )
  );

  const pointsRemaining = Math.max(0, settings.targetElo - currentBestRating);

  const renderGameModeCard = (
    title: string,
    modeStats: typeof bulletStats,
    accentColor: string,
    tag: string
  ) => {
    const lastRating = modeStats?.last?.rating ?? null;
    const bestRating = modeStats?.best?.rating ?? null;
    const bestDate = modeStats?.best?.date
      ? new Date(modeStats.best.date * 1000).toLocaleDateString('fr-FR', {
          month: 'short',
          year: 'numeric',
        })
      : null;
    const record = modeStats?.record;
    const totalGames = record ? record.win + record.loss + record.draw : 0;
    const winRate = totalGames > 0 && record ? Math.round((record.win / totalGames) * 100) : 0;

    return (
      <div className="rounded-2xl border border-neutral-800 bg-[#0c0f14]/80 p-5 space-y-4 hover:border-neutral-700 transition-all shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${accentColor}`} />
            <h3 className="text-sm font-bold text-white tracking-wide uppercase">{title}</h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400">
            {tag}
          </span>
        </div>

        {/* Big Rating Display */}
        <div className="flex items-baseline justify-between pt-1">
          <div>
            <span className="text-xs text-neutral-400 block font-sans">Classement Actuel</span>
            <span className="text-3xl font-black font-mono text-white tracking-tight">
              {lastRating !== null ? lastRating : '—'}
            </span>
          </div>
          {bestRating !== null && (
            <div className="text-right">
              <span className="text-[11px] text-neutral-400 block">Record (Peak)</span>
              <span className="text-lg font-bold font-mono text-[#facc15]">{bestRating}</span>
              {bestDate && <span className="text-[9px] text-neutral-400 block font-mono">{bestDate}</span>}
            </div>
          )}
        </div>

        {/* W/L/D Breakdown */}
        {record && totalGames > 0 ? (
          <div className="space-y-2 pt-2 border-t border-neutral-800/80">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-neutral-400 font-sans">{totalGames} parties jouées</span>
              <span className="text-[#10b981] font-bold">{winRate}% victoires</span>
            </div>

            {/* Proportion Bar */}
            <div className="h-2 w-full rounded-full bg-neutral-900 overflow-hidden flex">
              <div
                style={{ width: `${(record.win / totalGames) * 100}%` }}
                className="bg-[#10b981] h-full"
                title={`Victoires : ${record.win}`}
              />
              <div
                style={{ width: `${(record.draw / totalGames) * 100}%` }}
                className="bg-neutral-500 h-full"
                title={`Nulles : ${record.draw}`}
              />
              <div
                style={{ width: `${(record.loss / totalGames) * 100}%` }}
                className="bg-[#ef4444] h-full"
                title={`Défaites : ${record.loss}`}
              />
            </div>

            <div className="grid grid-cols-3 gap-1 text-center font-mono text-[11px] pt-1">
              <div className="p-1 rounded bg-[#10b981]/10 text-[#10b981]">
                <span className="font-bold">{record.win}</span> <span className="text-[9px] font-sans">V</span>
              </div>
              <div className="p-1 rounded bg-neutral-800/60 text-neutral-400">
                <span className="font-bold">{record.draw}</span> <span className="text-[9px] font-sans">N</span>
              </div>
              <div className="p-1 rounded bg-[#ef4444]/10 text-[#ef4444]">
                <span className="font-bold">{record.loss}</span> <span className="text-[9px] font-sans">D</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-neutral-400 pt-2 border-t border-neutral-800/80 font-mono">
            Aucune partie répertoriée dans ce format
          </div>
        )}

        {/* Link to best game if present */}
        {modeStats?.best?.game && (
          <a
            href={modeStats.best.game}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-[#facc15] hover:underline pt-1"
          >
            <Trophy className="h-3 w-3" />
            <span>Voir la partie référence</span>
          </a>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Back button & Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToDashboard}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-200 hover:text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Retour au Tableau de Bord</span>
        </button>

        <a
          href={`https://www.chess.com/member/${username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-black transition-all shadow-[0_0_18px_rgba(250,204,21,0.25)] active:scale-95"
        >
          <span>Ouvrir sur Chess.com</span>
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* Hero Profile Banner */}
      <div className="relative rounded-3xl border border-neutral-800 bg-[#0c0f14] overflow-hidden shadow-2xl">
        {/* Large stylized blurred background */}
        {profile?.avatar ? (
          <div
            className="absolute inset-0 bg-cover bg-center blur-2xl scale-125 opacity-30 pointer-events-none"
            style={{ backgroundImage: `url(${profile.avatar})` }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-r from-[#facc15]/10 via-[#07090e] to-neutral-900/40 pointer-events-none" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0c0f14]/80 to-[#0c0f14]" />

        {/* Content container */}
        <div className="relative z-10 p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Large avatar photo (Photo de profil en grand) */}
            <div className="relative shrink-0">
              {profile?.avatar ? (
                <div className="relative group">
                  <img
                    src={profile.avatar}
                    alt={profile.name || username}
                    referrerPolicy="no-referrer"
                    className="h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 rounded-3xl border-4 border-[#facc15] object-cover shadow-[0_0_30px_rgba(250,204,21,0.4)]"
                  />
                  <div className="absolute -bottom-2 -right-2 p-1.5 rounded-xl bg-[#07090e] border border-neutral-800 shadow-md">
                    <Crown className="h-4 w-4 text-[#facc15]" />
                  </div>
                </div>
              ) : (
                <div className="flex h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 items-center justify-center rounded-3xl border-4 border-[#facc15] bg-neutral-900 text-3xl sm:text-4xl font-black text-[#facc15] shadow-[0_0_30px_rgba(250,204,21,0.4)]">
                  {username.substring(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            {/* Main Player Info */}
            <div className="flex-1 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-black text-white font-display tracking-tight">
                  {profile?.name || username}
                </h1>
                {isAlphaRomeo ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#facc15]/20 border border-[#facc15]/40 text-[#facc15] text-xs font-black uppercase tracking-wider">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Admin Maître
                  </span>
                ) : isSpectator ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-400 text-xs font-black uppercase tracking-wider">
                    Spectateur
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-black uppercase tracking-wider">
                    Joueur Officiel
                  </span>
                )}
                {profile?.status && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-neutral-800/80 text-neutral-300 font-mono">
                    {profile.status}
                  </span>
                )}
              </div>

              <div className="text-sm font-mono text-[#facc15] font-semibold">
                @{username}
              </div>

              {/* Meta pills: Join date, location, followers */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-neutral-300 pt-1">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-neutral-500" />
                  <span>Inscrit le {joinedDateFormatted}</span>
                </div>
                {profile?.location && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-neutral-500" />
                    <span>{profile.location}</span>
                  </div>
                )}
                {profile?.country && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-neutral-500" />
                    <span>{profile.country.split('/').pop()}</span>
                  </div>
                )}
                {profile?.followers !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-neutral-500" />
                    <span>{profile.followers} abonnés</span>
                  </div>
                )}
                {profile?.league && (
                  <div className="flex items-center gap-1.5">
                    <Trophy className="h-3.5 w-3.5 text-[#facc15]" />
                    <span>Ligue : {profile.league}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Target Elo Progress Highlight Bar */}
          <div className="pt-4 border-t border-neutral-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-neutral-300 flex items-center gap-1.5">
                <Target className="h-4 w-4 text-[#facc15]" />
                Progression vers l'objectif {settings.targetElo} Elo
              </span>
              <span className="font-mono text-[#facc15] font-black">{progressPercent}% accompli</span>
            </div>
            <div className="h-3 w-full rounded-full bg-neutral-900 border border-neutral-800 overflow-hidden p-0.5">
              <div
                style={{ width: `${progressPercent}%` }}
                className="h-full rounded-full bg-gradient-to-r from-[#ca8a04] via-[#eab308] to-[#facc15] transition-all duration-500 shadow-[0_0_12px_rgba(250,204,21,0.5)]"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
              <span>Départ : {settings.startElo} Elo</span>
              <span>Actuel : <strong className="text-white">{currentBestRating} Elo</strong></span>
              <span>Reste : <strong className="text-[#facc15]">{pointsRemaining} pts</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Game Mode Ratings */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Swords className="h-4 w-4 text-[#facc15]" />
          <span>Cadences de Jeu Principales</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {renderGameModeCard('Blitz (Cadence reine)', blitzStats, 'bg-[#facc15]', '3 - 5 min')}
          {renderGameModeCard('Rapide', rapidStats, 'bg-[#10b981]', '10 - 15 min')}
          {renderGameModeCard('Bullet', bulletStats, 'bg-[#38bdf8]', '1 - 2 min')}
        </div>
      </div>

      {/* Tactical & Special Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Puzzle Rush */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0c0f14]/80 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">Puzzle Rush</h3>
          </div>
          {puzzleStats?.best ? (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800">
                <span className="text-xs text-neutral-400 block">Meilleur Score</span>
                <span className="text-2xl font-black font-mono text-orange-400">
                  {puzzleStats.best.score}
                </span>
                <span className="text-[10px] text-neutral-400 block font-sans">problèmes résolus</span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800">
                <span className="text-xs text-neutral-400 block">Total Tentatives</span>
                <span className="text-2xl font-black font-mono text-white">
                  {puzzleStats.best.total_attempts}
                </span>
                <span className="text-[10px] text-neutral-400 block font-sans">sessions</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-400 font-mono">Aucun score Puzzle Rush enregistré.</p>
          )}
        </div>

        {/* Tactiques Générales */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0c0f14]/80 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">Tactiques & Puzzles</h3>
          </div>
          {tacticsStats?.highest ? (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800">
                <span className="text-xs text-neutral-400 block">Plus Haut Elo</span>
                <span className="text-2xl font-black font-mono text-purple-400">
                  {tacticsStats.highest.rating}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800">
                <span className="text-xs text-neutral-400 block">Date du Pic</span>
                <span className="text-sm font-bold font-mono text-white pt-1 block">
                  {new Date(tacticsStats.highest.date * 1000).toLocaleDateString('fr-FR', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-400 font-mono">Aucune statistique tactique disponible.</p>
          )}
        </div>
      </div>
    </div>
  );
};
