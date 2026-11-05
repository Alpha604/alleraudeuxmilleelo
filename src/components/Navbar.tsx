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
  Crown,
  Lock,
  Moon,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sun,
  Unlock,
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

  const navItems: { key: NavTab; label: string; icon: React.ReactNode; protected?: boolean }[] = [
    { key: 'dashboard', label: 'Tableau de bord', icon: <Activity className="h-4 w-4" /> },
    { key: 'charts', label: 'Graphique Live', icon: <BarChart2 className="h-4 w-4" /> },
    { key: 'calendar', label: 'Calendrier', icon: <Calendar className="h-4 w-4" /> },
    { key: 'history', label: 'Journal Syncs', icon: <RefreshCw className="h-4 w-4" /> },
    ...(!isIframe ? [{ key: 'tests' as NavTab, label: 'Tests', icon: <CheckCircle2 className="h-4 w-4" />, protected: true }] : []),
    { key: 'iframe', label: 'Iframe', icon: <Code2 className="h-4 w-4" /> },
    ...(!isIframe ? [{ key: 'settings' as NavTab, label: 'Paramètres', icon: <Settings className="h-4 w-4" />, protected: true }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#070a10]/90 backdrop-blur-xl transition-all">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand identity */}
        <button
          onClick={() => onSelectTab('dashboard')}
          className="group flex items-center gap-3 text-left transition-opacity hover:opacity-90 shrink-0"
        >
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 p-0.5 shadow-[0_0_20px_rgba(245,158,11,0.35)]">
            <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-[#070a10]">
              <Crown className="h-5 w-5 text-amber-400 transition-transform group-hover:scale-110" />
            </div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 font-display text-base font-black tracking-wider text-white">
              <span>ROAD TO 2000</span>
              <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">ELO</span>
            </div>
            <span className="text-[10px] font-mono tracking-wider uppercase text-neutral-400">
              Pro Chess Athletics
            </span>
          </div>
        </button>

        {/* Central Segmented Pill Navigation */}
        <nav className="hidden lg:flex items-center p-1 rounded-2xl bg-neutral-900/90 border border-white/[0.08] shadow-inner">
          {navItems.map((item) => {
            const isActive = currentTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleTabClick(item.key)}
                className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-neutral-950 shadow-[0_2px_12px_rgba(245,158,11,0.4)]'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.protected && !isAdmin && (
                  <Lock className={`h-3 w-3 ${isActive ? 'text-neutral-900' : 'text-amber-400/80'}`} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Action Controls & User Identity */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Admin 2FA Badge */}
          {!isIframe && (
            <div>
              {isAdmin ? (
                <button
                  onClick={onLockAdmin}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all shadow-sm"
                  title="Session administrateur active. Cliquez pour verrouiller."
                >
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span className="hidden sm:inline">Admin</span>
                  <span className="text-[10px] opacity-75 border-l border-emerald-500/30 pl-1.5">Verrouiller</span>
                </button>
              ) : (
                <button
                  onClick={() => onOpenSecurityModal('Espace Administrateur')}
                  className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-all shadow-[0_0_15px_rgba(245,158,11,0.15)]"
                  title="Accès protégé par 2FA Authenticator. Cliquez pour déverrouiller."
                >
                  <Lock className="h-3.5 w-3.5 text-amber-400" />
                  <span className="hidden sm:inline">2FA Protégé</span>
                </button>
              )}
            </div>
          )}

          {/* Sync Button */}
          {!isIframe && (
            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all disabled:opacity-50 border ${
                isAdmin
                  ? 'border-amber-500/40 bg-neutral-900 text-amber-300 hover:bg-amber-500/10 hover:border-amber-400'
                  : 'border-white/[0.08] bg-neutral-900 text-neutral-300 hover:border-white/[0.15]'
              }`}
              title={isAdmin ? 'Synchroniser les statistiques Chess.com' : 'Synchronisation protégée par 2FA'}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Actualisation...' : 'Actualiser'}</span>
            </button>
          )}

          {/* Player Avatar */}
          <div className="flex items-center gap-2 pl-1 border-l border-white/[0.08]">
            {profile?.avatar ? (
              <img
                src={profile.avatar}
                alt={profile.name || username}
                referrerPolicy="no-referrer"
                className="h-9 w-9 rounded-full border-2 border-amber-400/80 object-cover shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                title={`${profile.name || username} (@${username})`}
              />
            ) : (
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-amber-400/60 bg-neutral-900 text-xs font-black text-amber-400 shadow-inner"
                title={`@${username}`}
              >
                {username.substring(0, 2).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Horizontal Navigation Tabs */}
      <div className="flex lg:hidden overflow-x-auto border-t border-white/[0.06] px-4 py-2 gap-2 scrollbar-none bg-[#090d15]">
        {navItems.map((item) => {
          const isActive = currentTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => handleTabClick(item.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-amber-500 text-neutral-950 shadow'
                  : 'text-neutral-400 bg-neutral-900/60 hover:text-white'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.protected && !isAdmin && <Lock className="h-2.5 w-2.5" />}
            </button>
          );
        })}
      </div>
    </header>
  );
};
