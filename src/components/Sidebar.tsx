/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  BarChart2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Database,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { ChessComProfileResponse, ChessComStatsResponse } from '../types/chess';
import { AccountStatus, getPublicAuthorizedAccounts } from '../utils/security';
import { NavTab } from './Navbar';
import { UserDropdown } from './UserDropdown';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onSync: () => void;
  isSyncing: boolean;
  lastSyncTime: string | null;
  isAdmin: boolean;
  isIframe: boolean;
  isSpectator?: boolean;
  onOpenSecurityModal: (title?: string) => void;
  onLockAdmin: () => void;
  onOpenNetworkModal?: () => void;
  jsonBinStatus?: 'synced' | 'pending_keys' | 'error' | 'syncing';
  isNetworkOnline?: boolean;
  profile?: ChessComProfileResponse;
  stats?: ChessComStatsResponse | null;
  username: string;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onLogout?: () => void;
  sessionExpiresAt?: number;
  hasAdminAccess?: boolean;
  onQuickSwitchAccount?: (targetUsername: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onSync,
  isSyncing,
  lastSyncTime,
  isAdmin,
  isIframe,
  isSpectator = false,
  onOpenSecurityModal,
  onLockAdmin,
  onOpenNetworkModal,
  jsonBinStatus = 'pending_keys',
  isNetworkOnline = true,
  profile,
  stats,
  username,
  isExpanded,
  onToggleExpanded,
  onLogout = () => {},
  sessionExpiresAt,
  hasAdminAccess = false,
  onQuickSwitchAccount,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [authorizedAccounts, setAuthorizedAccounts] = useState<
    { username: string; status: AccountStatus; isMaster: boolean }[]
  >([]);

  useEffect(() => {
    const refresh = () => setAuthorizedAccounts(getPublicAuthorizedAccounts());
    refresh();
    window.addEventListener('roadto2000:accounts-updated', refresh);
    return () => window.removeEventListener('roadto2000:accounts-updated', refresh);
  }, [username, currentTab, switcherOpen]);

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

  const navItems: { key: NavTab; label: string; icon: React.ReactNode; protected?: boolean }[] = [
    { key: 'dashboard', label: 'Tableau de bord', icon: <Activity className="h-4 w-4" /> },
    { key: 'charts', label: 'Graphique', icon: <BarChart2 className="h-4 w-4" /> },
    { key: 'calendar', label: 'Calendrier', icon: <Calendar className="h-4 w-4" /> },
    ...(!isSpectator ? [{ key: 'history' as NavTab, label: 'Journal Syncs', icon: <RefreshCw className="h-4 w-4" /> }] : []),
    ...(!isIframe && !isSpectator
      ? [{ key: 'tests' as NavTab, label: 'Tests', icon: <CheckCircle2 className="h-4 w-4" />, protected: true }]
      : []),
    ...(!isSpectator ? [{ key: 'iframe' as NavTab, label: 'Iframe', icon: <Code2 className="h-4 w-4" /> }] : []),
    ...(!isIframe && !isSpectator
      ? [{ key: 'settings' as NavTab, label: 'Paramètres', icon: <Settings className="h-4 w-4" />, protected: true }]
      : []),
    ...(!isIframe && !isSpectator && hasAdminAccess
      ? [{ key: 'admin' as NavTab, label: 'Panel Admin', icon: <ShieldAlert className="h-4 w-4" />, protected: true }]
      : []),
  ];

  const formattedSyncTime = lastSyncTime
    ? new Date(lastSyncTime).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <aside
      aria-label="Navigation latérale gauche"
      className={`hidden lg:flex fixed top-0 left-0 bottom-0 z-40 flex-col bg-[#07090e]/95 backdrop-blur-2xl border-r border-neutral-800/80 transition-all duration-300 ease-in-out shadow-2xl ${
        isExpanded ? 'w-64' : 'w-20'
      }`}
    >
      {/* Top Header: Open/Close Toggle Button (Zero Logo) */}
      <div className="flex items-center justify-between p-3 border-b border-neutral-800/80 h-14 shrink-0">
        {isExpanded ? (
          <>
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 pl-1">
              Menu
            </span>
            <button
              type="button"
              onClick={onToggleExpanded}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-[#facc15] hover:border-[#facc15]/50 transition-all"
              title="Fermer le menu"
            >
              <PanelLeftClose className="h-4 w-4 text-[#facc15]" />
              <span className="text-[11px] font-medium">Fermer</span>
            </button>
          </>
        ) : (
          <div className="w-full flex justify-center">
            <button
              type="button"
              onClick={onToggleExpanded}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-[#facc15] hover:border-[#facc15] hover:bg-[#facc15]/10 transition-all shadow-sm"
              title="Ouvrir le menu"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1 scrollbar-none">
        {navItems.map((item) => {
          const isActive = currentTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleTabClick(item.key)}
              title={!isExpanded ? item.label : undefined}
              className={`w-full flex items-center rounded-xl text-xs font-bold transition-all relative group ${
                isExpanded ? 'gap-3 px-3 py-2.5' : 'justify-center p-2.5'
              } ${
                isActive
                  ? 'bg-[#facc15] text-black shadow-md'
                  : 'text-neutral-300 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <span className={`shrink-0 ${isActive ? 'text-black' : 'text-neutral-400 group-hover:text-white'}`}>
                {item.icon}
              </span>

              {isExpanded && (
                <span className="truncate flex-1 text-left">{item.label}</span>
              )}

              {item.protected && !isAdmin && (
                <Lock
                  className={`h-3 w-3 shrink-0 ${
                    isActive ? 'text-black' : 'text-[#facc15]'
                  } ${!isExpanded ? 'absolute top-1.5 right-1.5' : ''}`}
                />
              )}

              {/* Floating Tooltip in collapsed mode (docked to right of sidebar) */}
              {!isExpanded && (
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700 text-xs text-white whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-xl">
                  {item.label}
                  {item.protected && !isAdmin && ' (2FA)'}
                </div>
              )}
            </button>
          );
        })}
      </div>

        {/* Action Controls Section: Quick Account Switch, Sync, JSONBin, 2FA */}
      <div className="border-t border-neutral-800/80 p-2.5 space-y-2 bg-[#090c12]/60">
        {/* 1-Click Quick Account Switcher (Authenticated users) */}
        {!isIframe && !isSpectator && onQuickSwitchAccount && activeSwitchAccounts.length > 1 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setSwitcherOpen((prev) => !prev)}
              title="Basculer instantanément de compte sans reconnexion"
              className={`w-full flex items-center rounded-xl font-bold text-xs transition-all border border-[#facc15]/30 bg-[#facc15]/10 text-[#facc15] hover:bg-[#facc15]/15 ${
                isExpanded ? 'justify-between px-3 py-2' : 'justify-center p-2.5'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <ArrowLeftRight className="h-4 w-4 shrink-0" />
                {isExpanded && <span className="truncate">Changer de compte</span>}
              </div>
              {isExpanded && (
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${switcherOpen ? 'rotate-180' : ''}`}
                />
              )}
            </button>

            {switcherOpen && (
              <div
                className={
                  isExpanded
                    ? 'mt-1.5 rounded-xl border border-neutral-800 bg-neutral-950/95 p-1.5 space-y-1 max-h-44 overflow-y-auto shadow-inner'
                    : 'absolute left-full ml-3 bottom-0 z-50 w-56 rounded-2xl border border-neutral-800 bg-[#0c0f14]/98 backdrop-blur-xl p-2 space-y-1 shadow-2xl'
                }
              >
                {!isExpanded && (
                  <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-400 border-b border-neutral-800/80 mb-1">
                    Switch Rapide
                  </div>
                )}
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
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px] transition-all text-left ${
                        isCurrent
                          ? 'bg-[#facc15]/15 text-[#facc15] font-black'
                          : 'text-neutral-300 hover:bg-neutral-800/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0 ${
                            acc.isMaster ? 'bg-[#facc15] text-black' : 'bg-neutral-800 text-neutral-200'
                          }`}
                        >
                          {acc.username.substring(0, 2).toUpperCase()}
                        </span>
                        <span className="font-mono truncate">@{acc.username}</span>
                      </div>
                      {isCurrent && <Check className="h-3 w-3 text-[#facc15] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Spectator Mode Indicator */}
        {isSpectator && (
          <div
            className={`w-full flex items-center rounded-xl font-bold text-xs border border-sky-500/40 bg-sky-500/10 text-sky-400 ${
              isExpanded ? 'gap-2.5 px-3 py-2' : 'justify-center p-2.5'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-sky-400 shrink-0" />
            {isExpanded && <span className="text-[11px] truncate font-sans">Mode Spectateur</span>}
          </div>
        )}

        {/* 1. Classic Sync Button (Blocked in spectator mode) */}
        {!isIframe && !isSpectator && (
          <button
            type="button"
            onClick={onSync}
            disabled={isSyncing}
            title="Synchroniser immédiatement avec l'API Chess.com"
            className={`w-full flex items-center rounded-xl font-bold text-xs transition-all active:scale-95 disabled:opacity-50 border ${
              isExpanded
                ? 'gap-2.5 px-3 py-2.5 bg-neutral-900 border-[#facc15]/40 hover:border-[#facc15] hover:bg-[#facc15]/10 text-white'
                : 'justify-center p-2.5 bg-neutral-900 border-neutral-800 hover:border-[#facc15] text-[#facc15]'
            }`}
          >
            <RefreshCw
              className={`h-4 w-4 shrink-0 text-[#facc15] ${
                isSyncing ? 'animate-spin' : ''
              }`}
            />
            {isExpanded && (
              <div className="flex flex-col text-left leading-tight truncate">
                <span className="text-white font-bold">
                  {isSyncing ? 'Sync...' : 'Synchroniser'}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">
                  {formattedSyncTime ? `Dernière : ${formattedSyncTime}` : 'Non synchronisé'}
                </span>
              </div>
            )}
          </button>
        )}

        {/* 2. JSONBin & Network Status (Hidden in spectator mode) */}
        {!isSpectator && (
          <button
            type="button"
            onClick={onOpenNetworkModal}
            title={`Réseau : ${isNetworkOnline ? 'En ligne' : 'Déconnecté'} · JSONBin : ${
              jsonBinStatus === 'synced' ? 'Synchronisé' : 'En attente'
            }`}
            className={`w-full flex items-center rounded-xl font-bold text-xs transition-all border ${
              isExpanded
                ? 'gap-2.5 px-3 py-2 bg-black/40 hover:bg-neutral-900/90'
                : 'justify-center p-2.5 bg-black/40 hover:bg-neutral-900/90'
            } ${
              !isNetworkOnline
                ? 'border-[#ef4444]/40 text-[#ef4444]'
                : jsonBinStatus === 'synced'
                ? 'border-[#10b981]/40 text-[#10b981]'
                : 'border-[#facc15]/40 text-[#facc15]'
            }`}
          >
            <Database className="h-4 w-4 shrink-0" />
            {isExpanded && (
              <div className="flex-1 flex items-center justify-between text-left leading-tight">
                <span className="text-neutral-200">Cache Cloud</span>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    jsonBinStatus === 'synced'
                      ? 'bg-[#10b981]/20 text-[#10b981]'
                      : 'bg-[#facc15]/20 text-[#facc15]'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      jsonBinStatus === 'synced' ? 'bg-[#10b981]' : 'bg-[#facc15]'
                    }`}
                  />
                  {jsonBinStatus === 'synced' ? 'OK' : 'Attente'}
                </span>
              </div>
            )}
          </button>
        )}

        {/* 3. Admin 2FA (Hidden in spectator mode) */}
        {!isIframe && !isSpectator && (
          <div>
            {isAdmin ? (
              <button
                type="button"
                onClick={onLockAdmin}
                title="Session active. Cliquez pour verrouiller."
                className={`w-full flex items-center rounded-xl font-bold text-xs transition-all border border-[#10b981]/40 bg-[#10b981]/15 text-[#10b981] hover:bg-[#10b981]/25 ${
                  isExpanded ? 'gap-2 px-3 py-2' : 'justify-center p-2.5'
                }`}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                {isExpanded && (
                  <div className="flex-1 flex items-center justify-between">
                    <span>Admin</span>
                    <span className="text-[10px] underline">Verrouiller</span>
                  </div>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenSecurityModal('Espace Administrateur')}
                title="Accès protégé par 2FA Authenticator. Cliquez pour déverrouiller."
                className={`w-full flex items-center rounded-xl font-bold text-xs transition-all border border-[#facc15]/40 bg-[#facc15]/10 text-[#facc15] hover:bg-[#facc15]/20 ${
                  isExpanded ? 'gap-2 px-3 py-2' : 'justify-center p-2.5'
                }`}
              >
                <Lock className="h-4 w-4 shrink-0" />
                {isExpanded && (
                  <div className="flex-1 flex items-center justify-between">
                    <span>2FA</span>
                    <span className="text-[10px] text-[#facc15]">Déverrouiller</span>
                  </div>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* User Account Footer with Dropdown Menu */}
      <div className="relative border-t border-neutral-800/80">
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          title="Ouvrir le menu déroulant de votre compte"
          className="p-3 flex items-center gap-2.5 bg-[#07090e] hover:bg-neutral-900/60 transition-colors w-full text-left group"
        >
          {profile?.avatar ? (
            <img
              src={profile.avatar}
              alt={profile.name || username}
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-full border border-[#facc15] object-cover shrink-0 group-hover:scale-105 transition-transform"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#facc15] bg-neutral-900 text-xs font-black text-[#facc15] shrink-0 group-hover:scale-105 transition-transform">
              {username.substring(0, 2).toUpperCase()}
            </div>
          )}

          {isExpanded && (
            <div className="flex flex-col leading-tight min-w-0 flex-1">
              <span className="text-xs font-bold text-white truncate group-hover:text-[#facc15] transition-colors">
                {profile?.name || username}
              </span>
              <span className="text-[10px] font-mono text-neutral-400 truncate">
                @{username}
              </span>
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
          placement="sidebar-bottom"
        />
      </div>
    </aside>
  );
};
