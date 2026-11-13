/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  BarChart2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Crown,
  Database,
  Eye,
  Lock,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { ChessComProfileResponse, ChessComStatsResponse } from '../types/chess';
import { AccountStatus, getPublicAuthorizedAccounts } from '../utils/security';
import { UserDropdown } from './UserDropdown';

export type NavTab = 'dashboard' | 'charts' | 'calendar' | 'history' | 'tests' | 'iframe' | 'settings' | 'profile' | 'admin';

interface NavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onSync: () => void;
  isSyncing: boolean;
  lastSyncTime: string | null;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  profile?: ChessComProfileResponse;
  stats?: ChessComStatsResponse | null;
  username: string;
  isAdmin: boolean;
  isIframe: boolean;
  isSpectator?: boolean;
  onOpenSecurityModal: (title?: string) => void;
  onLockAdmin: () => void;
  onOpenNetworkModal?: () => void;
  jsonBinStatus?: 'synced' | 'pending_keys' | 'error' | 'syncing';
  isNetworkOnline?: boolean;
  onLogout?: () => void;
  sessionExpiresAt?: number;
  hasAdminAccess?: boolean;
  onQuickSwitchAccount?: (targetUsername: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onSync,
  isSyncing,
  lastSyncTime,
  profile,
  stats,
  username,
  isAdmin,
  isIframe,
  isSpectator = false,
  onOpenSecurityModal,
  onLockAdmin,
  onOpenNetworkModal,
  jsonBinStatus = 'pending_keys',
  isNetworkOnline = true,
  onLogout = () => {},
  sessionExpiresAt,
  hasAdminAccess = false,
  onQuickSwitchAccount,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const [authorizedAccounts, setAuthorizedAccounts] = useState<
    { username: string; status: AccountStatus; isMaster: boolean }[]
  >([]);

  useEffect(() => {
    const refresh = () => setAuthorizedAccounts(getPublicAuthorizedAccounts());
    refresh();
    window.addEventListener('roadto2000:accounts-updated', refresh);
    return () => window.removeEventListener('roadto2000:accounts-updated', refresh);
  }, [username, switcherOpen]);

  useEffect(() => {
    if (!switcherOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [switcherOpen]);

  const activeSwitchAccounts = authorizedAccounts.filter((a) => a.status === 'active');

  const handleTabClick = (tab: NavTab) => {
    if (isSpectator && (tab === 'history' || tab === 'iframe' || tab === 'settings' || tab === 'tests' || tab === 'admin')) {
      return;
    }
    if (isIframe && (tab === 'settings' || tab === 'tests' || tab === 'admin')) {
      return;
    }
    if (!isAdmin && (tab === 'settings' || tab === 'tests' || tab === 'admin')) {
      onOpenSecurityModal(
        tab === 'settings'
          ? 'Paramètres du projet'
          : tab === 'admin'
          ? 'Panel Administrateur'
          : 'Suite de tests'
      );
      return;
    }
    onSelectTab(tab);
  };

  const handleSyncClick = () => {
    if (isIframe || isSpectator) return;
    onSync();
  };

  const navItems: { key: NavTab; label: string; icon: React.ReactNode; protected?: boolean }[] = [
    { key: 'dashboard', label: 'Tableau de bord', icon: <Activity className="h-4 w-4" /> },
    { key: 'charts', label: 'Graphique', icon: <BarChart2 className="h-4 w-4" /> },
    { key: 'calendar', label: 'Calendrier', icon: <Calendar className="h-4 w-4" /> },
    ...(!isSpectator ? [{ key: 'history' as NavTab, label: 'Journal Syncs', icon: <RefreshCw className="h-4 w-4" /> }] : []),
    ...(!isIframe && !isSpectator ? [{ key: 'tests' as NavTab, label: 'Tests', icon: <CheckCircle2 className="h-4 w-4" />, protected: true }] : []),
    ...(!isSpectator ? [{ key: 'iframe' as NavTab, label: 'Iframe', icon: <Code2 className="h-4 w-4" /> }] : []),
    ...(!isIframe && !isSpectator ? [{ key: 'settings' as NavTab, label: 'Paramètres', icon: <Settings className="h-4 w-4" />, protected: true }] : []),
    ...(!isIframe && !isSpectator && hasAdminAccess
      ? [{ key: 'admin' as NavTab, label: 'Panel Admin', icon: <ShieldAlert className="h-4 w-4" />, protected: true }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-30 w-full border-b border-neutral-800 bg-[#07090e]/95 backdrop-blur-xl transition-all">
      <div className="w-full flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 lg:px-8">
        {/* Brand identity: White, Black & Yellow Crown (comme avant) */}
        <button
          onClick={() => onSelectTab('dashboard')}
          className="group flex items-center gap-2.5 sm:gap-3 text-left transition-opacity hover:opacity-90 shrink-0"
        >
          <div className="relative flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#facc15] via-[#eab308] to-[#ca8a04] p-0.5 shadow-[0_0_15px_rgba(250,204,21,0.3)]">
            <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-[#07090e]">
              <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-[#facc15] transition-transform group-hover:scale-110" />
            </div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1 font-display text-sm sm:text-base font-black tracking-wider text-white">
              <span>ROAD TO 2000</span>
              <span className="text-[#facc15]">ELO</span>
            </div>
            <span className="text-[9px] sm:text-[10px] font-mono tracking-wider uppercase text-neutral-400 hidden sm:block">
              Chess Performance Tracker
            </span>
          </div>
        </button>

        {/* Action Controls pushed to the right extremity */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Spectator Mode Indicator */}
          {isSpectator && (
            <div className="flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-2.5 sm:px-3 text-xs font-bold text-sky-400">
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Spectateur (Lecture Seule)</span>
            </div>
          )}

          {/* 1-Click Quick Account Switcher (Authenticated users only) */}
          {!isIframe && !isSpectator && onQuickSwitchAccount && activeSwitchAccounts.length > 1 && (
            <div className="relative" ref={switcherRef}>
              <button
                type="button"
                onClick={() => setSwitcherOpen((o) => !o)}
                title="Basculer instantanément de compte sans reconnexion"
                className="flex h-8 sm:h-9 items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900/90 hover:border-[#facc15]/60 px-2.5 sm:px-3 text-xs font-bold text-neutral-200 hover:text-white transition-all active:scale-95"
              >
                <ArrowLeftRight className="h-3.5 w-3.5 text-[#facc15] shrink-0" />
                <span className="hidden md:inline font-mono truncate max-w-[115px]">@{username}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${switcherOpen ? 'rotate-180' : ''}`} />
              </button>

              {switcherOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-2xl border border-neutral-800 bg-[#0c0f14]/98 backdrop-blur-xl shadow-2xl p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-neutral-800/80 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                      Switch Rapide (Sans A2F)
                    </span>
                    <span className="text-[10px] font-mono text-[#10b981] font-bold">
                      {activeSwitchAccounts.length} actifs
                    </span>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1 pr-0.5">
                    {activeSwitchAccounts.map((acc) => {
                      const isCurrent = acc.username.toLowerCase() === username.toLowerCase();
                      return (
                        <button
                          key={acc.username}
                          type="button"
                          onClick={() => {
                            setSwitcherOpen(false);
                            if (!isCurrent) {
                              onQuickSwitchAccount(acc.username);
                            }
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all text-left ${
                            isCurrent
                              ? 'bg-[#facc15]/15 border border-[#facc15]/40 text-[#facc15] font-black'
                              : 'text-neutral-200 hover:bg-neutral-800/80 hover:text-white border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`h-6 w-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                                acc.isMaster ? 'bg-[#facc15] text-black' : 'bg-neutral-800 text-neutral-200'
                              }`}
                            >
                              {acc.username.substring(0, 2).toUpperCase()}
                            </span>
                            <span className="font-mono truncate">@{acc.username}</span>
                          </div>
                          {isCurrent && <Check className="h-3.5 w-3.5 text-[#facc15] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Classic Sync Button (Blocked in spectator mode to preserve quota) */}
          {!isIframe && !isSpectator && (
            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className="flex h-8 sm:h-9 items-center justify-center gap-2 rounded-xl px-2.5 sm:px-3.5 py-1.5 text-xs font-bold transition-all disabled:opacity-50 border border-[#facc15]/40 bg-neutral-900 text-[#facc15] hover:bg-[#facc15]/10 hover:border-[#facc15] shadow-[0_0_10px_rgba(250,204,21,0.12)] active:scale-95"
              title="Synchroniser immédiatement avec l'API Chess.com"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-[#facc15]' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Sync...' : 'Synchroniser'}</span>
            </button>
          )}

          {/* Live Network & JSONBin Status Button (Completely HIDDEN in spectator mode to protect bin ID & credentials) */}
          {!isSpectator && (
            <button
              onClick={onOpenNetworkModal}
              className={`flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1.5 text-xs font-bold transition-all ${
                !isNetworkOnline
                  ? 'border-[#ef4444]/40 bg-[#ef4444]/15 text-[#ef4444] hover:bg-[#ef4444]/25'
                  : jsonBinStatus === 'synced'
                  ? 'border-[#10b981]/40 bg-[#10b981]/15 text-[#10b981] hover:bg-[#10b981]/25'
                  : 'border-[#facc15]/40 bg-[#facc15]/10 text-[#facc15] hover:bg-[#facc15]/20'
              }`}
              title={`Réseau : ${isNetworkOnline ? 'En ligne' : 'Déconnecté'} · JSONBin : ${
                jsonBinStatus === 'synced' ? 'Synchronisé' : jsonBinStatus === 'syncing' ? 'Synchro en cours...' : 'En attente de clés'
              }`}
            >
              <Database className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">JSONBin</span>
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  !isNetworkOnline
                    ? 'bg-[#ef4444]'
                    : jsonBinStatus === 'synced'
                    ? 'bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                    : 'bg-[#facc15] shadow-[0_0_8px_rgba(250,204,21,0.7)]'
                }`}
              />
            </button>
          )}

          {/* Admin 2FA Badge: Green if active, Yellow if locked (Hidden in spectator mode) */}
          {!isIframe && !isSpectator && (
            <div>
              {isAdmin ? (
                <button
                  onClick={onLockAdmin}
                  className="flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-xl border border-[#10b981]/40 bg-[#10b981]/15 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-[#10b981] hover:bg-[#10b981]/25 transition-all"
                  title="Session active. Cliquez pour verrouiller."
                >
                  <ShieldCheck className="h-4 w-4 text-[#10b981]" />
                  <span className="hidden md:inline">Admin</span>
                </button>
              ) : (
                <button
                  onClick={() => onOpenSecurityModal('Espace Administrateur')}
                  className="flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-xl border border-[#facc15]/40 bg-[#facc15]/10 px-2 sm:px-2.5 py-1.5 text-xs font-bold text-[#facc15] hover:bg-[#facc15]/20 transition-all shadow-[0_0_12px_rgba(250,204,21,0.15)]"
                  title="Accès protégé par 2FA Authenticator. Cliquez pour déverrouiller."
                >
                  <Lock className="h-3.5 w-3.5 text-[#facc15]" />
                  <span className="hidden md:inline">2FA</span>
                </button>
              )}
            </div>
          )}

          {/* Player Avatar Button with Dropdown Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center pl-1 border-l border-neutral-800 hover:opacity-80 transition-opacity active:scale-95"
              title={`Menu déroulant du compte : @${username}`}
            >
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile.name || username}
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-full border border-[#facc15] object-cover shadow-[0_0_10px_rgba(250,204,21,0.25)]"
                />
              ) : (
                <div
                  className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-[#facc15] bg-neutral-900 text-xs font-black text-[#facc15]"
                >
                  {username.substring(0, 2).toUpperCase()}
                </div>
              )}
            </button>

            <UserDropdown
              isOpen={dropdownOpen}
              onClose={() => setDropdownOpen(false)}
              profile={profile}
              stats={stats}
              username={username}
              isAdmin={isAdmin}
              isSpectator={isSpectator}
              onSelectTab={onSelectTab}
              onLogout={onLogout}
              sessionExpiresAt={sessionExpiresAt}
              placement="bottom-right"
            />
          </div>
        </div>
      </div>

      {/* Tablet Horizontal Navigation Tabs (Hidden on mobile phones because bottom dock is used!) */}
      <div className="hidden sm:flex lg:hidden overflow-x-auto border-t border-neutral-800 px-3 sm:px-4 py-2 gap-1.5 sm:gap-2 scrollbar-none bg-[#090b10] -webkit-overflow-scrolling-touch">
        {navItems.map((item) => {
          const isActive = currentTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => handleTabClick(item.key)}
              className={`flex items-center gap-1.5 min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all ${
                isActive
                  ? 'bg-[#facc15] text-black shadow-md'
                  : 'text-neutral-300 bg-neutral-900 hover:text-white border border-neutral-800/80'
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
