/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Activity,
  BarChart2,
  Calendar,
  CheckCircle2,
  Code2,
  Lock,
  Moon,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sun,
  Trophy,
} from 'lucide-react';
import { ChessComProfileResponse } from '../types/chess';

export type NavTab = 'dashboard' | 'charts' | 'calendar' | 'history' | 'tests' | 'iframe' | 'settings';

interface NavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onSync: () => void;
  isSyncing: boolean;
  lastSyncTime: string | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  profile?: ChessComProfileResponse;
  username: string;
  isAdmin: boolean;
  isIframe: boolean;
  onOpenSecurityModal: (title?: string) => void;
  onLockAdmin: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onSync,
  isSyncing,
  lastSyncTime,
  theme,
  onToggleTheme,
  profile,
  username,
  isAdmin,
  isIframe,
  onOpenSecurityModal,
  onLockAdmin,
}) => {
  const formattedSyncTime = lastSyncTime
    ? new Date(lastSyncTime).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const handleTabClick = (tab: NavTab) => {
    if (isIframe && (tab === 'settings' || tab === 'tests')) {
      return;
    }
    if (!isAdmin && (tab === 'settings' || tab === 'tests')) {
      onOpenSecurityModal(tab === 'settings' ? 'Paramètres du projet' : 'Suite de tests');
      return;
    }
    onSelectTab(tab);
  };

  const handleSyncClick = () => {
    if (isIframe) return;
    if (!isAdmin) {
      onOpenSecurityModal('Synchronisation Chess.com');
      return;
    }
    onSync();
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800/80 bg-[#090b10]/95 backdrop-blur-md transition-colors dark:border-neutral-800/80 dark:bg-[#090b10]/95 light:border-neutral-200 light:bg-white/95">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          onClick={() => onSelectTab('dashboard')}
          className="group flex items-center gap-3 text-left transition-opacity hover:opacity-90 shrink-0"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
            <Trophy className="h-4.5 w-4.5" />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-sm font-black tracking-wider text-white uppercase dark:text-white light:text-neutral-900 whitespace-nowrap">
              ROAD TO 2000 <span className="text-amber-400">ELO</span>
            </span>
            <span className="text-[10px] text-neutral-400 dark:text-neutral-400 light:text-neutral-500 font-mono tracking-tight whitespace-nowrap">
              Chess Performance Tracker
            </span>
          </div>
        </button>

        {/* Zone 2: Navigation Links (Clean single-line text links with active indicator) */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2 text-xs font-semibold">
          <button
            onClick={() => handleTabClick('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
              currentTab === 'dashboard'
                ? 'bg-neutral-800/90 text-amber-300 font-bold dark:bg-neutral-800/90 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900 shadow-sm'
                : 'text-neutral-400 hover:text-white dark:text-neutral-400 dark:hover:text-white light:text-neutral-600 light:hover:text-neutral-900'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Tableau de bord</span>
          </button>

          <button
            onClick={() => handleTabClick('charts')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
              currentTab === 'charts'
                ? 'bg-neutral-800/90 text-amber-300 font-bold dark:bg-neutral-800/90 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900 shadow-sm'
                : 'text-neutral-400 hover:text-white dark:text-neutral-400 dark:hover:text-white light:text-neutral-600 light:hover:text-neutral-900'
            }`}
          >
            <BarChart2 className="h-3.5 w-3.5" />
            <span>Graphique</span>
          </button>

          <button
            onClick={() => handleTabClick('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
              currentTab === 'calendar'
                ? 'bg-neutral-800/90 text-amber-300 font-bold dark:bg-neutral-800/90 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900 shadow-sm'
                : 'text-neutral-400 hover:text-white dark:text-neutral-400 dark:hover:text-white light:text-neutral-600 light:hover:text-neutral-900'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Calendrier</span>
          </button>

          <button
            onClick={() => handleTabClick('history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
              currentTab === 'history'
                ? 'bg-neutral-800/90 text-amber-300 font-bold dark:bg-neutral-800/90 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900 shadow-sm'
                : 'text-neutral-400 hover:text-white dark:text-neutral-400 dark:hover:text-white light:text-neutral-600 light:hover:text-neutral-900'
            }`}
          >
            <span>Journal Syncs</span>
          </button>

          {!isIframe && (
            <button
              onClick={() => handleTabClick('tests')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
                currentTab === 'tests'
                  ? 'bg-neutral-800/90 text-amber-300 font-bold dark:bg-neutral-800/90 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900 shadow-sm'
                  : 'text-neutral-400 hover:text-white dark:text-neutral-400 dark:hover:text-white light:text-neutral-600 light:hover:text-neutral-900'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Tests</span>
              {!isAdmin && <Lock className="h-3 w-3 text-amber-400/80" />}
            </button>
          )}

          <button
            onClick={() => handleTabClick('iframe')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
              currentTab === 'iframe'
                ? 'bg-neutral-800/90 text-amber-300 font-bold dark:bg-neutral-800/90 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900 shadow-sm'
                : 'text-neutral-400 hover:text-white dark:text-neutral-400 dark:hover:text-white light:text-neutral-600 light:hover:text-neutral-900'
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>Iframe</span>
          </button>

          {!isIframe && (
            <button
              onClick={() => handleTabClick('settings')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
                currentTab === 'settings'
                  ? 'bg-neutral-800/90 text-amber-300 font-bold dark:bg-neutral-800/90 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900 shadow-sm'
                : 'text-neutral-400 hover:text-white dark:text-neutral-400 dark:hover:text-white light:text-neutral-600 light:hover:text-neutral-900'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Paramètres</span>
              {!isAdmin && <Lock className="h-3 w-3 text-amber-400/80" />}
            </button>
          )}
        </nav>

        {/* Zone 3: Actions (Sync button, Admin status, Theme toggle, Avatar) */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {formattedSyncTime && (
            <span className="hidden xl:inline-block text-[11px] text-neutral-400 font-mono">
              Sync {formattedSyncTime}
            </span>
          )}

          {/* Admin 2FA Security Controller */}
          {!isIframe && (
            <div>
              {isAdmin ? (
                <button
                  onClick={onLockAdmin}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-all"
                  title="Session administrateur active. Cliquez pour verrouiller."
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="hidden md:inline">Admin Actif</span>
                  <span className="text-[10px] text-emerald-400/70 border-l border-emerald-500/30 pl-1.5 ml-0.5">
                    Verrouiller
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => onOpenSecurityModal('Espace Administrateur')}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-all shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                  title="Accès protégé par 2FA Authenticator. Cliquez pour déverrouiller."
                >
                  <Lock className="h-3.5 w-3.5 text-amber-400" />
                  <span className="hidden sm:inline">2FA Verrouillé</span>
                </button>
              )}
            </div>
          )}

          {/* Sync Button */}
          {isIframe ? (
            <div
              className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-500 cursor-not-allowed select-none"
              title="Mode Iframe : consultation seule."
            >
              <RefreshCw className="h-3.5 w-3.5 opacity-40" />
              <span className="hidden sm:inline">Consultation</span>
            </div>
          ) : (
            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 whitespace-nowrap shrink-0 ${
                isAdmin
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                  : 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-amber-500/40'
              }`}
              title={isAdmin ? 'Synchroniser avec Chess.com' : 'Synchronisation protégée par 2FA'}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Synchronisation...' : 'Synchroniser'}</span>
              {!isAdmin && <Lock className="h-3 w-3 text-amber-400" />}
            </button>
          )}

          <button
            onClick={onToggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-white transition-colors dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 light:border-neutral-300 light:bg-neutral-100 light:text-neutral-700"
            title={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
            aria-label="Changer de thème"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {profile?.avatar ? (
            <img
              src={profile.avatar}
              alt={profile.name || username}
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-full border border-amber-500/40 object-cover shadow-sm"
              title={`${profile.name || username} (@${username})`}
            />
          ) : (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-xs font-bold text-amber-400"
              title={`@${username}`}
            >
              {username.substring(0, 2).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Mobile navigation row */}
      <div className="flex lg:hidden overflow-x-auto border-t border-neutral-800/80 px-4 py-2 gap-1.5 scrollbar-none bg-[#0a0c10]">
        <button
          onClick={() => handleTabClick('dashboard')}
          className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap shrink-0 transition-colors ${
            currentTab === 'dashboard' ? 'bg-amber-500/15 text-amber-300 font-bold' : 'text-neutral-400'
          }`}
        >
          Tableau de bord
        </button>
        <button
          onClick={() => handleTabClick('charts')}
          className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap shrink-0 transition-colors ${
            currentTab === 'charts' ? 'bg-amber-500/15 text-amber-300 font-bold' : 'text-neutral-400'
          }`}
        >
          Graphique
        </button>
        <button
          onClick={() => handleTabClick('calendar')}
          className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap shrink-0 transition-colors ${
            currentTab === 'calendar' ? 'bg-amber-500/15 text-amber-300 font-bold' : 'text-neutral-400'
          }`}
        >
          Calendrier
        </button>
        <button
          onClick={() => handleTabClick('history')}
          className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap shrink-0 transition-colors ${
            currentTab === 'history' ? 'bg-amber-500/15 text-amber-300 font-bold' : 'text-neutral-400'
          }`}
        >
          Journal
        </button>
        {!isIframe && (
          <button
            onClick={() => handleTabClick('tests')}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg whitespace-nowrap shrink-0 transition-colors ${
              currentTab === 'tests' ? 'bg-amber-500/15 text-amber-300 font-bold' : 'text-neutral-400'
            }`}
          >
            <span>Tests</span>
            {!isAdmin && <Lock className="h-2.5 w-2.5 text-amber-400" />}
          </button>
        )}
        <button
          onClick={() => handleTabClick('iframe')}
          className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap shrink-0 transition-colors ${
            currentTab === 'iframe' ? 'bg-amber-500/15 text-amber-300 font-bold' : 'text-neutral-400'
          }`}
        >
          Iframe
        </button>
        {!isIframe && (
          <button
            onClick={() => handleTabClick('settings')}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg whitespace-nowrap shrink-0 transition-colors ${
              currentTab === 'settings' ? 'bg-amber-500/15 text-amber-300 font-bold' : 'text-neutral-400'
            }`}
          >
            <span>Paramètres</span>
            {!isAdmin && <Lock className="h-2.5 w-2.5 text-amber-400" />}
          </button>
        )}
      </div>
    </header>
  );
};
