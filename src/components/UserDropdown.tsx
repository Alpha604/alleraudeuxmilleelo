/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  KeyRound,
  Lock,
  LogOut,
  Settings,
  ShieldAlert,
  ShieldCheck,
  User,
  UserPlus,
  Zap,
} from 'lucide-react';
import { ChessComProfileResponse, ChessComStatsResponse } from '../types/chess';
import { NavTab } from './Navbar';

interface UserDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  profile?: ChessComProfileResponse;
  stats?: ChessComStatsResponse | null;
  username: string;
  isAdmin: boolean;
  isSpectator?: boolean;
  onOpenSecurityModal: (title?: string) => void;
  onLockAdmin: () => void;
  onSelectTab: (tab: NavTab) => void;
  onLogout: () => void;
  onSwitchAccount: (newUsername: string) => void;
  onOpenCreateAccount?: () => void;
  sessionExpiresAt?: number;
  placement?: 'bottom-right' | 'top-right' | 'sidebar-bottom';
}

export const UserDropdown: React.FC<UserDropdownProps> = ({
  isOpen,
  onClose,
  profile,
  stats,
  username,
  isAdmin,
  isSpectator,
  onOpenSecurityModal,
  onLockAdmin,
  onSelectTab,
  onLogout,
  onSwitchAccount,
  onOpenCreateAccount,
  sessionExpiresAt,
  placement = 'bottom-right',
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showSwitchInput, setShowSwitchInput] = useState(false);
  const [newUsernameInput, setNewUsernameInput] = useState('');

  const isAlphaRomeo = username.toLowerCase() === 'alpharomeo1500';

  // Format joined date
  const joinedDateFormatted = profile?.joined
    ? new Date(profile.joined * 1000).toLocaleDateString('fr-FR', {
        month: 'short',
        year: 'numeric',
      })
    : '';

  // Handle click outside to close dropdown
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Format session expiration
  const sessionExpFormatted = sessionExpiresAt
    ? new Date(sessionExpiresAt).toLocaleString('fr-FR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris',
      })
    : '24h active';

  const handleSwitchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsernameInput.trim()) return;
    onSwitchAccount(newUsernameInput.trim().toLowerCase());
    setShowSwitchInput(false);
    setNewUsernameInput('');
    onClose();
  };

  const handleTabClick = (tab: NavTab) => {
    onSelectTab(tab);
    onClose();
  };

  // Position classes depending on placement
  let positionClasses = 'right-0 top-full mt-2';
  if (placement === 'sidebar-bottom') {
    positionClasses = 'left-0 bottom-full mb-2 w-72 sm:w-80';
  } else if (placement === 'top-right') {
    positionClasses = 'right-0 bottom-full mb-2';
  }

  return (
    <div
      ref={dropdownRef}
      className={`absolute ${positionClasses} z-50 w-80 sm:w-88 rounded-2xl border border-neutral-800 bg-[#0c0f14]/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. Header Profile Banner with Blurred Photo Background & Base Info */}
      <div className="relative p-4.5 border-b border-neutral-800/80 overflow-hidden">
        {/* Blurred background photo layer */}
        {profile?.avatar ? (
          <div
            className="absolute inset-0 bg-cover bg-center blur-xl scale-125 opacity-25 pointer-events-none transition-all"
            style={{ backgroundImage: `url(${profile.avatar})` }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#facc15]/15 via-transparent to-transparent pointer-events-none" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c0f14]/50 via-[#0c0f14]/85 to-[#0c0f14]" />

        {/* Foreground Content */}
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-3">
            {profile?.avatar ? (
              <img
                src={profile.avatar}
                alt={profile.name || username}
                referrerPolicy="no-referrer"
                className="h-12 w-12 rounded-2xl border-2 border-[#facc15] object-cover shadow-[0_0_15px_rgba(250,204,21,0.35)] shrink-0"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-[#facc15] bg-neutral-900 text-sm font-black text-[#facc15] shrink-0 shadow-lg">
                {username.substring(0, 2).toUpperCase()}
              </div>
            )}

            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-bold text-white truncate">
                  {profile?.name || username}
                </span>
                {isAlphaRomeo ? (
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-[#facc15]/20 border border-[#facc15]/40 text-[#facc15] text-[9px] font-black uppercase tracking-wider shrink-0">
                    Admin
                  </span>
                ) : isSpectator ? (
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-sky-500/20 border border-sky-500/40 text-sky-400 text-[9px] font-black uppercase tracking-wider shrink-0">
                    Spectateur
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[9px] font-black uppercase tracking-wider shrink-0">
                    Joueur
                  </span>
                )}
              </div>
              <span className="text-xs font-mono text-neutral-300 truncate">
                @{username}
              </span>
              {(joinedDateFormatted || profile?.location) && (
                <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 truncate">
                  {joinedDateFormatted && <span>Inscrit {joinedDateFormatted}</span>}
                  {profile?.location && (
                    <>
                      <span>·</span>
                      <span className="truncate">{profile.location}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Quick Elo Ratings Row */}
          <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-neutral-800/60 font-mono text-center">
            <div className="p-1.5 rounded-xl bg-neutral-900/80 border border-neutral-800/80 backdrop-blur-sm">
              <span className="text-[9px] text-neutral-400 block font-sans uppercase">Bullet</span>
              <span className="text-xs font-bold text-white">
                {stats?.chess_bullet?.last?.rating ?? '—'}
              </span>
            </div>
            <div className="p-1.5 rounded-xl bg-neutral-900/80 border border-neutral-800/80 backdrop-blur-sm">
              <span className="text-[9px] text-neutral-400 block font-sans uppercase">Blitz</span>
              <span className="text-xs font-bold text-[#facc15]">
                {stats?.chess_blitz?.last?.rating ?? '—'}
              </span>
            </div>
            <div className="p-1.5 rounded-xl bg-neutral-900/80 border border-neutral-800/80 backdrop-blur-sm">
              <span className="text-[9px] text-neutral-400 block font-sans uppercase">Rapide</span>
              <span className="text-xs font-bold text-white">
                {stats?.chess_rapid?.last?.rating ?? '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Menu Items List */}
      <div className="p-2 space-y-1 text-xs">
        {/* Profile on Chess.com */}
        <a
          href={`https://www.chess.com/member/${username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-between p-2 rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-colors group"
        >
          <div className="flex items-center gap-2.5">
            <User className="h-4 w-4 text-[#facc15]" />
            <span>Profil Chess.com</span>
          </div>
          <ExternalLink className="h-3.5 w-3.5 text-neutral-500 group-hover:text-white" />
        </a>

        {/* Statistiques / Dashboard */}
        <button
          type="button"
          onClick={() => handleTabClick('charts')}
          className="w-full flex items-center justify-between p-2 rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <BarChart2 className="h-4 w-4 text-[#facc15]" />
            <span>Statistiques & Courbe Elo</span>
          </div>
        </button>

        {/* Calendrier des jalons */}
        <button
          type="button"
          onClick={() => handleTabClick('calendar')}
          className="w-full flex items-center justify-between p-2 rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Calendar className="h-4 w-4 text-[#facc15]" />
            <span>Calendrier de Performance</span>
          </div>
        </button>

        {/* Paramètres */}
        {!isSpectator && (
          <button
            type="button"
            onClick={() => handleTabClick('settings')}
            className="w-full flex items-center justify-between p-2 rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Settings className="h-4 w-4 text-[#facc15]" />
              <span>Paramètres du Projet</span>
            </div>
            {!isAdmin && <Lock className="h-3 w-3 text-neutral-500" />}
          </button>
        )}

        {/* Panel ADMIN (AlphaRoméo exclusif) */}
        {isAlphaRomeo && (
          <div className="pt-1 border-t border-neutral-800/60 my-1">
            <div className="px-2 py-1 flex items-center justify-between text-[11px] font-bold text-[#facc15]">
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" />
                Panel Administrateur
              </span>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={onLockAdmin}
                  className="text-[10px] px-2 py-0.5 rounded bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40 hover:bg-[#10b981]/30 transition-colors"
                >
                  2FA Déverrouillé (Verrouiller)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenSecurityModal('Panel Administrateur')}
                  className="text-[10px] px-2 py-0.5 rounded bg-[#facc15] text-black font-black hover:bg-[#eab308] transition-colors"
                >
                  Déverrouiller 2FA
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleTabClick('tests')}
              className="w-full flex items-center gap-2.5 p-2 rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-colors text-xs"
            >
              <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
              <span>Suite de Tests & Diagnostics Moteur</span>
            </button>

            {/* Create Account Wizard (Admin only) */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onOpenCreateAccount) onOpenCreateAccount();
              }}
              className="w-full flex items-center justify-between p-2 rounded-xl text-neutral-200 hover:text-white bg-[#facc15]/10 hover:bg-[#facc15]/20 border border-[#facc15]/30 transition-all text-xs font-bold mt-1"
            >
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-[#facc15]" />
                <span>Créer un Compte Joueur</span>
              </div>
              <span className="text-[10px] text-[#facc15] font-black uppercase tracking-wider">A2F + Bin</span>
            </button>
          </div>
        )}

        {/* Changer de Compte */}
        <div className="pt-1 border-t border-neutral-800/60 my-1">
          {!showSwitchInput ? (
            <button
              type="button"
              onClick={() => setShowSwitchInput(true)}
              className="w-full flex items-center justify-between p-2 rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <KeyRound className="h-4 w-4 text-[#facc15]" />
                <span>Changer de Compte</span>
              </div>
            </button>
          ) : (
            <form onSubmit={handleSwitchSubmit} className="p-2 space-y-2 bg-neutral-900/60 rounded-xl border border-neutral-800">
              <span className="text-[10px] font-bold text-neutral-400 block uppercase">
                Bascule vers un autre pseudo
              </span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  autoFocus
                  value={newUsernameInput}
                  onChange={(e) => setNewUsernameInput(e.target.value)}
                  placeholder="Pseudo Chess.com..."
                  className="flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-white focus:border-[#facc15] focus:outline-none font-mono"
                />
                <button
                  type="submit"
                  disabled={!newUsernameInput.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-[#facc15] text-black font-bold text-xs disabled:opacity-50"
                >
                  OK
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Session status info */}
        <div className="px-2.5 py-1.5 rounded-xl bg-neutral-950/60 border border-neutral-800/60 flex items-center justify-between text-[10px] text-neutral-400">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#10b981] shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            <span>Session 24h</span>
          </div>
          <span className="font-mono text-[9px]">{sessionExpFormatted}</span>
        </div>

        {/* Déconnexion */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 p-2 rounded-xl text-[#ef4444] hover:bg-[#ef4444]/15 transition-colors font-bold"
          >
            <LogOut className="h-4 w-4" />
            <span>Se Déconnecter</span>
          </button>
        </div>
      </div>
    </div>
  );
};
