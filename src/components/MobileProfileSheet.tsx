/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart2,
  Calendar,
  ChevronRight,
  Lock,
  LogOut,
  Settings,
  ShieldCheck,
  Unlock,
  User,
  X,
} from 'lucide-react';
import { ChessComProfileResponse, ChessComStatsResponse } from '../types/chess';
import { NavTab } from './Navbar';
import { triggerNotificationHaptic } from '../utils/notifications';

interface MobileProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  profile?: ChessComProfileResponse;
  stats?: ChessComStatsResponse | null;
  username: string;
  isAdmin: boolean;
  isIframe?: boolean;
  isSpectator?: boolean;
  sessionExpiresAt?: number;
  onSelectTab: (tab: NavTab) => void;
  onOpenSecurityModal?: (title?: string, onGranted?: () => void) => void;
  onLockAdmin?: () => void;
  onLogout: () => void;
}

export const MobileProfileSheet: React.FC<MobileProfileSheetProps> = ({
  isOpen,
  onClose,
  profile,
  stats,
  username,
  isAdmin,
  isIframe = false,
  isSpectator = false,
  sessionExpiresAt,
  onSelectTab,
  onOpenSecurityModal,
  onLockAdmin,
  onLogout,
}) => {
  const [rendered, setRendered] = useState(isOpen);
  const [entered, setEntered] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const swipeRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startY: number;
    lastY: number;
    lastTime: number;
    velocityY: number;
    fromHandle: boolean;
  }>({
    active: false,
    pointerId: null,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    velocityY: 0,
    fromHandle: false,
  });

  const touchBodyRef = useRef<{
    active: boolean;
    pulling: boolean;
    startY: number;
    lastY: number;
    lastTime: number;
    velocityY: number;
  }>({
    active: false,
    pulling: false,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    velocityY: 0,
  });

  useEffect(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (isOpen) {
      setRendered(true);
      setDragY(0);
      setIsDragging(false);
      const raf1 = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setEntered(true);
        });
      });
      return () => cancelAnimationFrame(raf1);
    } else if (rendered) {
      setEntered(false);
      closeTimerRef.current = window.setTimeout(() => {
        setRendered(false);
        setDragY(0);
      }, 260);
      return () => {
        if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      };
    }
  }, [isOpen, rendered]);

  const requestAnimatedClose = useCallback(() => {
    setEntered(false);
    setIsDragging(false);
    setDragY(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestAnimatedClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, requestAnimatedClose]);

  const handleSheetPointerDown = (e: React.PointerEvent<HTMLDivElement>, fromHandle: boolean) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if ((e.target as HTMLElement).closest('button, input, label, select, textarea, a')) {
      return;
    }
    if (!fromHandle && e.pointerType === 'touch') return;
    const scrollTop = scrollBodyRef.current?.scrollTop ?? 0;
    if (!fromHandle && scrollTop > 2) return;

    const now = performance.now();
    swipeRef.current = {
      active: true,
      pointerId: e.pointerId,
      startY: e.clientY,
      lastY: e.clientY,
      lastTime: now,
      velocityY: 0,
      fromHandle,
    };

    if (fromHandle) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleSheetPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = swipeRef.current;
    if (!st.active || st.pointerId !== e.pointerId) return;

    const dy = e.clientY - st.startY;
    if (!st.fromHandle) {
      const scrollTop = scrollBodyRef.current?.scrollTop ?? 0;
      if (dy <= 0 || scrollTop > 2) {
        if (!isDragging) st.active = false;
        return;
      }
    }

    const now = performance.now();
    const dt = Math.max(1, now - st.lastTime);
    st.velocityY = (e.clientY - st.lastY) / dt;
    st.lastY = e.clientY;
    st.lastTime = now;

    if (dy > 4 && !isDragging) {
      setIsDragging(true);
    }

    setDragY(dy >= 0 ? dy : dy * 0.16);
  };

  const handleSheetPointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const st = swipeRef.current;
    if (!st.active || st.pointerId !== e.pointerId) return;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}

    const dy = e.clientY - st.startY;
    const velocity = st.velocityY;
    st.active = false;

    const shouldClose = !cancelled && (dy > 90 || (dy > 35 && velocity > 0.45));
    setIsDragging(false);

    if (shouldClose) {
      triggerNotificationHaptic('tap');
      requestAnimatedClose();
    } else {
      setDragY(0);
    }
  };

  const handleBodyTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const scrollTop = scrollBodyRef.current?.scrollTop ?? 0;
    if (scrollTop > 2) {
      touchBodyRef.current.active = false;
      return;
    }
    const y = e.touches[0].clientY;
    const now = performance.now();
    touchBodyRef.current = {
      active: true,
      pulling: false,
      startY: y,
      lastY: y,
      lastTime: now,
      velocityY: 0,
    };
  };

  const handleBodyTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const st = touchBodyRef.current;
    if (!st.active || e.touches.length !== 1) return;
    const y = e.touches[0].clientY;
    const dy = y - st.startY;
    const scrollTop = scrollBodyRef.current?.scrollTop ?? 0;

    if (!st.pulling) {
      if (dy > 8 && scrollTop <= 1) {
        st.pulling = true;
        setIsDragging(true);
      } else if (dy < -4 || scrollTop > 2) {
        st.active = false;
        return;
      } else {
        return;
      }
    }

    const now = performance.now();
    const dt = Math.max(1, now - st.lastTime);
    st.velocityY = (y - st.lastY) / dt;
    st.lastY = y;
    st.lastTime = now;

    setDragY(dy >= 0 ? dy : 0);
  };

  const handleBodyTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const st = touchBodyRef.current;
    if (!st.active) return;
    const wasPulling = st.pulling;
    const dy = st.lastY - st.startY;
    const velocity = st.velocityY;
    st.active = false;
    st.pulling = false;

    if (!wasPulling) return;
    setIsDragging(false);

    if (e.type !== 'touchcancel' && (dy > 90 || (dy > 35 && velocity > 0.45))) {
      triggerNotificationHaptic('tap');
      requestAnimatedClose();
    } else {
      setDragY(0);
    }
  };

  if (!rendered) return null;

  const navigateAndClose = (tab: NavTab) => {
    triggerNotificationHaptic('tap');
    if (!isAdmin && (tab === 'settings' || tab === 'tests' || tab === 'admin')) {
      if (onOpenSecurityModal) {
        onOpenSecurityModal('Accès Paramètres', () => onSelectTab(tab));
      }
    } else {
      onSelectTab(tab);
    }
    requestAnimatedClose();
  };

  const sessionExpFormatted = sessionExpiresAt
    ? new Date(sessionExpiresAt).toLocaleString('fr-FR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris',
      })
    : 'Session active';

  const dragOpacityFactor = dragY > 0 ? Math.max(0.2, 1 - dragY / 380) : 1;
  const sheetTransform = !entered
    ? 'translate3d(0, 100%, 0)'
    : `translate3d(0, ${dragY}px, 0)`;

  return (
    <div
      style={{
        opacity: entered ? dragOpacityFactor : 0,
        transition: isDragging ? 'none' : 'opacity 240ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      className="sm:hidden fixed inset-0 z-[125] flex items-end justify-center bg-black/80"
      onClick={requestAnimatedClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profil joueur"
        onClick={(e) => e.stopPropagation()}
        onPointerMove={handleSheetPointerMove}
        onPointerUp={(e) => handleSheetPointerUpOrCancel(e, false)}
        onPointerCancel={(e) => handleSheetPointerUpOrCancel(e, true)}
        style={{
          transform: sheetTransform,
          transition: isDragging
            ? 'none'
            : 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className="w-full max-h-[85vh] flex flex-col rounded-t-[30px] border-t border-x border-neutral-800 bg-[#0a0e16] shadow-2xl overflow-hidden text-left will-change-transform"
      >
        {/* Top Handle & Header Banner (Swipe down to close) */}
        <div
          onPointerDown={(e) => handleSheetPointerDown(e, true)}
          className="relative touch-none select-none cursor-grab active:cursor-grabbing overflow-hidden border-b border-white/[0.08]"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#facc15]/12 via-transparent to-transparent pointer-events-none" />

          {/* Drag Handle Bar */}
          <div className="relative z-10 flex justify-center pt-2.5 pb-1">
            <span className="w-11 h-1.5 rounded-full bg-white/30" />
          </div>

          {/* Profile Header Row */}
          <div className="relative z-10 flex items-center justify-between gap-3 px-5 pt-2 pb-4">
            <div className="flex items-center gap-3.5 min-w-0">
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile.name || username}
                  referrerPolicy="no-referrer"
                  className="h-12 w-12 rounded-2xl border-2 border-[#facc15] object-cover shadow-[0_0_15px_rgba(250,204,21,0.3)] shrink-0"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-[#facc15] bg-neutral-900 text-sm font-black text-[#facc15] shrink-0">
                  {username.substring(0, 2).toUpperCase()}
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-white truncate">
                    {profile?.name || username}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                      isAdmin
                        ? 'bg-[#10b981]/20 border-[#10b981]/40 text-[#10b981]'
                        : 'bg-white/[0.06] border-white/10 text-neutral-300'
                    }`}
                  >
                    {isAdmin ? 'Admin 2FA' : isSpectator ? 'Spectateur' : 'Lecture'}
                  </span>
                </div>
                <p className="text-xs font-mono text-neutral-400 truncate">
                  @{username} · {sessionExpFormatted}
                </p>
              </div>
            </div>

            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                requestAnimatedClose();
              }}
              className="relative z-20 h-10 w-10 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.1] flex items-center justify-center text-neutral-300 hover:text-white transition-colors shrink-0"
              aria-label="Fermer le profil"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Sheet Body (Swipe down when at top to close) */}
        <div
          ref={scrollBodyRef}
          onPointerDown={(e) => handleSheetPointerDown(e, false)}
          onTouchStart={handleBodyTouchStart}
          onTouchMove={handleBodyTouchMove}
          onTouchEnd={handleBodyTouchEnd}
          onTouchCancel={handleBodyTouchEnd}
          className="flex-1 overflow-y-auto p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-3.5 overscroll-contain"
        >
          {/* Compact Ratings Strip */}
          {!isSpectator && (
            <div className="grid grid-cols-3 gap-2 font-mono text-center">
              <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                <span className="text-[9px] text-neutral-400 block font-sans uppercase">Bullet</span>
                <span className="text-sm font-black text-white tabular-nums">
                  {stats?.chess_bullet?.last?.rating ?? '—'}
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-[#facc15]/[0.08] border border-[#facc15]/30">
                <span className="text-[9px] text-neutral-300 block font-sans uppercase">Blitz</span>
                <span className="text-sm font-black text-[#facc15] tabular-nums">
                  {stats?.chess_blitz?.last?.rating ?? '—'}
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                <span className="text-[9px] text-neutral-400 block font-sans uppercase">Rapide</span>
                <span className="text-sm font-black text-white tabular-nums">
                  {stats?.chess_rapid?.last?.rating ?? '—'}
                </span>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => navigateAndClose('profile')}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-white/[0.09] bg-white/[0.04] active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-[#facc15]/15 border border-[#facc15]/30 flex items-center justify-center text-[#facc15]">
                  <User className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-white">Page Profil Complète</div>
                  <div className="text-[11px] text-neutral-400">Bannière & statistiques Chess.com</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            </button>

            {!isSpectator && (
              <>
                <button
                  type="button"
                  onClick={() => navigateAndClose('charts')}
                  className="w-full flex items-center justify-between p-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <BarChart2 className="h-4 w-4 text-[#facc15]" />
                    <span className="text-xs font-semibold text-neutral-200">Courbe & Progression Elo</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-500" />
                </button>

                <button
                  type="button"
                  onClick={() => navigateAndClose('calendar')}
                  className="w-full flex items-center justify-between p-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-[#facc15]" />
                    <span className="text-xs font-semibold text-neutral-200">Calendrier Mensuel</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-500" />
                </button>

                {!isIframe && (
                  <button
                    type="button"
                    onClick={() => navigateAndClose('settings')}
                    className="w-full flex items-center justify-between p-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] active:scale-[0.99] transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <Settings className="h-4 w-4 text-[#facc15]" />
                      <span className="text-xs font-semibold text-neutral-200">Paramètres</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!isAdmin && <Lock className="h-3.5 w-3.5 text-neutral-500" />}
                      <ChevronRight className="h-4 w-4 text-neutral-500" />
                    </div>
                  </button>
                )}
              </>
            )}
          </div>

          {/* Security & Session Buttons */}
          <div className="pt-2 border-t border-white/[0.08] space-y-2">
            {!isSpectator && !isIframe && (
              isAdmin && onLockAdmin ? (
                <button
                  type="button"
                  onClick={() => {
                    onLockAdmin();
                    requestAnimatedClose();
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 text-amber-400 text-xs font-bold active:scale-[0.99]"
                >
                  <Unlock className="h-4 w-4" />
                  <span>Verrouiller les permissions A2F</span>
                </button>
              ) : !isAdmin && onOpenSecurityModal ? (
                <button
                  type="button"
                  onClick={() => {
                    requestAnimatedClose();
                    onOpenSecurityModal('Déverrouiller Admin 2FA');
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl border border-[#facc15]/40 bg-[#facc15]/15 text-[#facc15] text-xs font-bold active:scale-[0.99]"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>Déverrouiller Admin (A2F)</span>
                </button>
              ) : null
            )}

            <button
              type="button"
              onClick={() => {
                onLogout();
                requestAnimatedClose();
              }}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl border border-[#ef4444]/35 bg-[#ef4444]/10 text-[#ef4444] text-xs font-bold active:scale-[0.99]"
            >
              <LogOut className="h-4 w-4" />
              <span>{isSpectator ? 'Déconnexion' : 'Fermer la session'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
