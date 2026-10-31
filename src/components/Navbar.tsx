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
  Moon,
  RefreshCw,
  Settings,
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
}) => {
  const formattedSyncTime = lastSyncTime
    ? new Date(lastSyncTime).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur-md transition-colors dark:border-neutral-800/80 dark:bg-neutral-950/90 light:border-neutral-200 light:bg-white/90">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          onClick={() => onSelectTab('dashboard')}
          className="group flex items-center gap-3 text-left transition-opacity hover:opacity-90 shrink-0"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-600/5 text-amber-400">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-sm font-bold tracking-wider text-neutral-100 uppercase dark:text-neutral-100 light:text-neutral-900 whitespace-nowrap">
              ROAD TO 2000 <span className="text-amber-400">ELO</span>
            </span>
            <span className="text-[10px] tracking-tight text-neutral-400 dark:text-neutral-400 light:text-neutral-500 whitespace-nowrap">
              Chess Performance Tracker
            </span>
          </div>
        </button>

        {/* Zone 2: Navigation Links (Single-line controls) */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2 text-xs font-medium">
          <button
            onClick={() => onSelectTab('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              currentTab === 'dashboard'
                ? 'bg-neutral-800 text-amber-300 font-semibold dark:bg-neutral-800 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-200 dark:text-neutral-400 dark:hover:text-neutral-200 light:text-neutral-600 light:hover:text-neutral-900'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Tableau de bord</span>
          </button>

          <button
            onClick={() => onSelectTab('charts')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              currentTab === 'charts'
                ? 'bg-neutral-800 text-amber-300 font-semibold dark:bg-neutral-800 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-200 dark:text-neutral-400 dark:hover:text-neutral-200 light:text-neutral-600 light:hover:text-neutral-900'
            }`}
          >
            <BarChart2 className="h-3.5 w-3.5" />
            <span>Graphiques</span>
          </button>

          <button
            onClick={() => onSelectTab('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              currentTab === 'calendar'
                ? 'bg-neutral-800 text-amber-300 font-semibold dark:bg-neutral-800 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-200 dark:text-neutral-400 dark:hover:text-neutral-200 light:text-neutral-600 light:hover:text-neutral-900'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Calendrier</span>
          </button>

          <button
            onClick={() => onSelectTab('history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              currentTab === 'history'
                ? 'bg-neutral-800 text-amber-300 font-semibold dark:bg-neutral-800 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-200 dark:text-neutral-400 dark:hover:text-neutral-200 light:text-neutral-600 light:hover:text-neutral-900'
            }`}
          >
            <span>Journal Syncs</span>
          </button>

          <button
            onClick={() => onSelectTab('tests')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              currentTab === 'tests'
                ? 'bg-neutral-800 text-amber-300 font-semibold dark:bg-neutral-800 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-200 dark:text-neutral-400 dark:hover:text-neutral-200 light:text-neutral-600 light:hover:text-neutral-900'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Tests (10 cas)</span>
          </button>

          <button
            onClick={() => onSelectTab('iframe')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              currentTab === 'iframe'
                ? 'bg-neutral-800 text-amber-300 font-semibold dark:bg-neutral-800 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-200 dark:text-neutral-400 dark:hover:text-neutral-200 light:text-neutral-600 light:hover:text-neutral-900'
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>Iframe</span>
          </button>

          <button
            onClick={() => onSelectTab('settings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              currentTab === 'settings'
                ? 'bg-neutral-800 text-amber-300 font-semibold dark:bg-neutral-800 dark:text-amber-300 light:bg-neutral-200 light:text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-200 dark:text-neutral-400 dark:hover:text-neutral-200 light:text-neutral-600 light:hover:text-neutral-900'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Paramètres</span>
          </button>
        </nav>

        {/* Zone 3: Actions (Sync button + Theme + User profile badge) */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {formattedSyncTime && (
            <span className="hidden md:inline-block text-[11px] text-neutral-400 font-mono">
              Sync {formattedSyncTime}
            </span>
          )}

          <button
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
            title="Synchroniser avec Chess.com"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Synchronisation...' : 'Synchroniser'}</span>
          </button>

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
              className="h-8 w-8 rounded-full border border-amber-500/30 object-cover"
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
      <div className="flex lg:hidden overflow-x-auto border-t border-neutral-800/80 px-4 py-2 gap-2 scrollbar-none">
        <button
          onClick={() => onSelectTab('dashboard')}
          className={`px-2.5 py-1 text-xs rounded whitespace-nowrap shrink-0 ${
            currentTab === 'dashboard' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-neutral-400'
          }`}
        >
          Tableau de bord
        </button>
        <button
          onClick={() => onSelectTab('charts')}
          className={`px-2.5 py-1 text-xs rounded whitespace-nowrap shrink-0 ${
            currentTab === 'charts' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-neutral-400'
          }`}
        >
          Graphiques
        </button>
        <button
          onClick={() => onSelectTab('calendar')}
          className={`px-2.5 py-1 text-xs rounded whitespace-nowrap shrink-0 ${
            currentTab === 'calendar' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-neutral-400'
          }`}
        >
          Calendrier
        </button>
        <button
          onClick={() => onSelectTab('history')}
          className={`px-2.5 py-1 text-xs rounded whitespace-nowrap shrink-0 ${
            currentTab === 'history' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-neutral-400'
          }`}
        >
          Journal
        </button>
        <button
          onClick={() => onSelectTab('tests')}
          className={`px-2.5 py-1 text-xs rounded whitespace-nowrap shrink-0 ${
            currentTab === 'tests' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-neutral-400'
          }`}
        >
          Tests (10)
        </button>
        <button
          onClick={() => onSelectTab('iframe')}
          className={`px-2.5 py-1 text-xs rounded whitespace-nowrap shrink-0 ${
            currentTab === 'iframe' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-neutral-400'
          }`}
        >
          Iframe
        </button>
        <button
          onClick={() => onSelectTab('settings')}
          className={`px-2.5 py-1 text-xs rounded whitespace-nowrap shrink-0 ${
            currentTab === 'settings' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-neutral-400'
          }`}
        >
          Paramètres
        </button>
      </div>
    </header>
  );
};
