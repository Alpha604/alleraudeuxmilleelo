/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Activity,
  BarChart2,
  Bell,
  Calendar,
  CheckCircle2,
  Cloud,
  Code2,
  Database,
  Eye,
  Flame,
  Lock,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { ChessComProfileResponse, ChessComStatsResponse } from '../types/chess';
import { formatJsonBinShortTime, formatJsonBinTimestamp } from '../utils/cloudSync';
import { FirebaseIndicatorStatus } from '../utils/syncDiagnostics';
import { BrandLogo } from './BrandLogo';
import { UserDropdown } from './UserDropdown';

export type NavTab = 'dashboard' | 'charts' | 'calendar' | 'history' | 'tests' | 'iframe' | 'settings' | 'profile' | 'admin';

interface NavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onSync: () => void;
  isSyncing: boolean;
  lastSyncTime: string | null;
  lastJsonBinSyncTime?: number | null;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  profile?: ChessComProfileResponse;
  stats?: ChessComStatsResponse | null;
  username: string;
  isAdmin: boolean;
  isIframe: boolean;
  isSpectator?: boolean;
  onOpenSecurityModal: (title?: string, onGranted?: () => void) => void;
  onLockAdmin: () => void;
  onOpenNetworkModal?: () => void;
  jsonBinStatus?: 'synced' | 'pending_keys' | 'error' | 'syncing';
  onOpenFirebaseModal?: () => void;
  firebaseStatus?: FirebaseIndicatorStatus;
  lastFirebaseSyncTime?: number | null;
  firebaseIssuesCount?: number;
  isNetworkOnline?: boolean;
  onLogout?: () => void;
  sessionExpiresAt?: number;
  hasAdminAccess?: boolean;
  onQuickSwitchAccount?: (targetUsername: string) => void;
  unreadNotificationsCount?: number;
  onOpenNotificationCenter?: () => void;
  onOpenProfileSheet?: () => void;
  onOpenMobileCloudMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onSync,
  isSyncing,
  lastJsonBinSyncTime,
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
  onOpenFirebaseModal,
  firebaseStatus = 'auth_required',
  lastFirebaseSyncTime,
  firebaseIssuesCount = 0,
  isNetworkOnline = true,
  onLogout = () => {},
  sessionExpiresAt,
  hasAdminAccess = false,
  unreadNotificationsCount = 0,
  onOpenNotificationCenter,
  onOpenProfileSheet,
  onOpenMobileCloudMenu,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

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
          : 'Suite de tests',
        () => onSelectTab(tab)
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
    <header className="sticky top-0 z-30 w-full border-b border-neutral-800 bg-[#07090e]/95 backdrop-blur-xl transition-all overflow-x-clip">
      <div className="w-full flex h-14 sm:h-16 items-center justify-between gap-1.5 sm:gap-4 px-2 sm:px-6 lg:px-8">
        {/* Brand identity: Minimalist King Crown + Rising Elo Arrow */}
        <button
          onClick={() => onSelectTab('dashboard')}
          className="group flex items-center text-left transition-opacity hover:opacity-90 min-w-0 shrink"
        >
          <BrandLogo
            size="sm"
            showSubtitle
            subtitle="Suivi Performance Elo"
          />
        </button>

        {/* Action Controls pushed to the right extremity */}
        <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
          {/* Spectator Mode Indicator */}
          {isSpectator && (
            <div className="flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-2 sm:px-3 text-xs font-bold text-sky-400 whitespace-nowrap">
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Spectateur (Lecture Seule)</span>
            </div>
          )}

          {/* Classic Sync Button (Blocked in spectator mode to preserve quota) */}
          {!isIframe && !isSpectator && (
            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className="flex h-8 min-w-[32px] sm:h-9 sm:w-auto items-center justify-center gap-2 rounded-xl px-2 sm:px-3.5 py-1.5 text-xs font-bold transition-all disabled:opacity-50 border border-[#facc15]/40 bg-neutral-900 text-[#facc15] hover:bg-[#facc15]/10 hover:border-[#facc15] shadow-[0_0_10px_rgba(250,204,21,0.12)] active:scale-95 whitespace-nowrap"
              title="Synchroniser immédiatement avec l'API Chess.com"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-[#facc15]' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Sync...' : 'Synchroniser'}</span>
            </button>
          )}

          {/* Mobile & Desktop Notification Center Trigger */}
          {onOpenNotificationCenter && (
            <button
              type="button"
              onClick={onOpenNotificationCenter}
              className="relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-white/[0.14] bg-white/[0.04] hover:bg-white/[0.1] text-neutral-200 hover:text-[#facc15] transition-all active:scale-95 shrink-0"
              title="Centre de notifications"
              aria-label={`Ouvrir les notifications${unreadNotificationsCount > 0 ? ` (${unreadNotificationsCount} non lues)` : ''}`}
            >
              <Bell className="h-4 w-4" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#facc15] text-black text-[9px] font-black leading-none flex items-center justify-center tabular-nums shadow-[0_2px_8px_rgba(250,204,21,0.45)]">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>
          )}

          {/* Unified Mobile Cloud Button (< sm, Admin 2FA ONLY) */}
          {isAdmin && !isSpectator && onOpenMobileCloudMenu && (() => {
            const hasCloudError =
              !isNetworkOnline ||
              jsonBinStatus === 'error' ||
              firebaseStatus === 'error' ||
              firebaseStatus === 'offline';
            const allCloudGreen =
              isNetworkOnline &&
              jsonBinStatus === 'synced' &&
              firebaseStatus === 'synced' &&
              firebaseIssuesCount === 0;
            return (
              <button
                type="button"
                onClick={onOpenMobileCloudMenu}
                className={`relative sm:hidden flex h-8 items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                  hasCloudError
                    ? 'border-[#ef4444]/40 bg-[#ef4444]/15 text-[#ef4444]'
                    : allCloudGreen
                    ? 'border-[#10b981]/40 bg-[#10b981]/15 text-[#10b981]'
                    : 'border-amber-500/40 bg-amber-500/12 text-amber-300'
                }`}
                aria-label="Ouvrir le menu Cloud unifié (Firebase et JSONBin)"
                title="Cloud unifié : Firebase + JSONBin"
              >
                <Cloud className="h-4 w-4 shrink-0" />
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    hasCloudError
                      ? 'bg-[#ef4444]'
                      : allCloudGreen
                      ? 'bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                      : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]'
                  }`}
                />
                {firebaseIssuesCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-amber-500 text-black text-[9px] font-black leading-none flex items-center justify-center tabular-nums shadow">
                    {firebaseIssuesCount > 9 ? '9+' : firebaseIssuesCount}
                  </span>
                )}
              </button>
            );
          })()}

          {/* Live Network & JSONBin Status Button (Desktop/Tablet + Strictly Admin 2FA Only) */}
          {isAdmin && !isSpectator && (
            <button
              onClick={onOpenNetworkModal}
              className={`hidden sm:flex h-9 items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-all ${
                !isNetworkOnline
                  ? 'border-[#ef4444]/40 bg-[#ef4444]/15 text-[#ef4444] hover:bg-[#ef4444]/25'
                  : jsonBinStatus === 'error'
                  ? 'border-[#ef4444]/40 bg-[#ef4444]/15 text-[#ef4444] hover:bg-[#ef4444]/25'
                  : jsonBinStatus === 'synced'
                  ? 'border-[#10b981]/40 bg-[#10b981]/15 text-[#10b981] hover:bg-[#10b981]/25'
                  : 'border-[#facc15]/40 bg-[#facc15]/10 text-[#facc15] hover:bg-[#facc15]/20'
              }`}
              title={`Réseau : ${isNetworkOnline ? 'En ligne' : 'Déconnecté'} · JSONBin : ${
                jsonBinStatus === 'synced'
                  ? 'Synchronisé'
                  : jsonBinStatus === 'syncing'
                  ? 'Synchro en cours...'
                  : jsonBinStatus === 'error'
                  ? 'Erreur de sauvegarde'
                  : 'En attente de clés'
              } · Dernière MàJ JSONBin : ${formatJsonBinTimestamp(lastJsonBinSyncTime)}`}
            >
              <Database className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">
                {lastJsonBinSyncTime ? `JSONBin · ${formatJsonBinShortTime(lastJsonBinSyncTime)}` : 'JSONBin'}
              </span>
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  !isNetworkOnline || jsonBinStatus === 'error'
                    ? 'bg-[#ef4444]'
                    : jsonBinStatus === 'synced'
                    ? 'bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                    : 'bg-[#facc15] shadow-[0_0_8px_rgba(250,204,21,0.7)]'
                }`}
              />
            </button>
          )}

          {/* Live Firebase Sync & Diagnostics Indicator Button (Desktop/Tablet + Strictly Admin 2FA Only) */}
          {isAdmin && !isSpectator && onOpenFirebaseModal && (
            <button
              type="button"
              onClick={onOpenFirebaseModal}
              className={`relative hidden sm:flex h-9 items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-all ${
                firebaseStatus === 'error' || firebaseStatus === 'offline'
                  ? 'border-[#ef4444]/40 bg-[#ef4444]/15 text-[#ef4444] hover:bg-[#ef4444]/25'
                  : firebaseStatus === 'synced'
                  ? 'border-[#10b981]/40 bg-[#10b981]/15 text-[#10b981] hover:bg-[#10b981]/25'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
              }`}
              title={`Firebase : ${
                firebaseStatus === 'synced'
                  ? 'Principal actif'
                  : firebaseStatus === 'syncing'
                  ? 'Synchro...'
                  : firebaseStatus === 'blocked'
                  ? 'Canal bloqué par client (Repli JSONBin)'
                  : firebaseStatus === 'offline'
                  ? 'Hors ligne'
                  : firebaseStatus === 'error'
                  ? 'Erreur détectée'
                  : firebaseStatus === 'fallback'
                  ? 'Repli JSONBin actif'
                  : 'Connexion Google requise'
              } · Dernière synchro : ${formatJsonBinTimestamp(lastFirebaseSyncTime)}${
                firebaseIssuesCount > 0 ? ` · ${firebaseIssuesCount} problème(s)` : ''
              }`}
            >
              <Flame className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">
                {lastFirebaseSyncTime ? `Firebase · ${formatJsonBinShortTime(lastFirebaseSyncTime)}` : 'Firebase'}
              </span>
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  firebaseStatus === 'error' || firebaseStatus === 'offline'
                    ? 'bg-[#ef4444]'
                    : firebaseStatus === 'synced'
                    ? 'bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                    : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]'
                }`}
              />
              {firebaseIssuesCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-amber-500 text-black text-[9px] font-black leading-none flex items-center justify-center tabular-nums shadow">
                  {firebaseIssuesCount > 9 ? '9+' : firebaseIssuesCount}
                </span>
              )}
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

          {/* Player Avatar Button: Mobile opens swipeable Profile Sheet, Desktop opens UserDropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 640 && onOpenProfileSheet) {
                  onOpenProfileSheet();
                  return;
                }
                setDropdownOpen(!dropdownOpen);
              }}
              className="flex items-center pl-1 border-l border-neutral-800 hover:opacity-80 transition-opacity active:scale-95"
              title={`Menu du compte : @${username}`}
            >
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile.name || username}
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-full border border-[#facc15] object-cover shadow-[0_0_10px_rgba(250,204,21,0.25)] shrink-0"
                />
              ) : (
                <div
                  className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-[#facc15] bg-neutral-900 text-xs font-black text-[#facc15] shrink-0"
                >
                  {username.substring(0, 2).toUpperCase()}
                </div>
              )}
            </button>

            <div className="hidden sm:block">
              <UserDropdown
                isOpen={dropdownOpen}
                onClose={() => setDropdownOpen(false)}
                profile={profile}
                stats={stats}
                username={username}
                isAdmin={isAdmin}
                isSpectator={isSpectator}
                onSelectTab={handleTabClick}
                onLogout={onLogout}
                onOpenSecurityModal={onOpenSecurityModal}
                onLockAdmin={onLockAdmin}
                sessionExpiresAt={sessionExpiresAt}
                placement="bottom-right"
              />
            </div>
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
