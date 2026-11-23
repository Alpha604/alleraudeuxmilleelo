/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Code2,
  Database,
  Flame,
  Lock,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { NavTab } from './Navbar';
import { triggerNotificationHaptic } from '../utils/notifications';
import { FirebaseIndicatorStatus } from '../utils/syncDiagnostics';

interface MobileMoreSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  username: string;
  isAdmin: boolean;
  isIframe: boolean;
  isSpectator: boolean;
  hasAdminAccess: boolean;
  isSyncing: boolean;
  unreadNotificationsCount: number;
  jsonBinStatus?: 'synced' | 'pending_keys' | 'error' | 'syncing';
  firebaseStatus?: FirebaseIndicatorStatus;
  firebaseIssuesCount?: number;
  onOpenSecurityModal: (title?: string, onGranted?: () => void) => void;
  onLockAdmin: () => void;
  onSync: () => void;
  onOpenNotificationCenter: () => void;
  onOpenNetworkModal: () => void;
  onOpenFirebaseModal?: () => void;
}

export const MobileMoreSheet: React.FC<MobileMoreSheetProps> = ({
  isOpen,
  onClose,
  currentTab,
  onSelectTab,
  username,
  isAdmin,
  isIframe,
  isSpectator,
  hasAdminAccess,
  isSyncing,
  unreadNotificationsCount,
  jsonBinStatus = 'pending_keys',
  firebaseStatus = 'auth_required',
  firebaseIssuesCount = 0,
  onOpenSecurityModal,
  onLockAdmin,
  onSync,
  onOpenNotificationCenter,
  onOpenNetworkModal,
  onOpenFirebaseModal,
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

  const handleSheetPointerDown = (e: React.PointerEvent<HTMLDivElement>, fromHandle: boolean) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!fromHandle && e.pointerType === 'touch') return;
    if (!fromHandle && (e.target as HTMLElement).closest('button, input, a')) {
      return;
    }
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
        if (!isDragging) {
          st.active = false;
        }
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

    const clampedY = dy >= 0 ? dy : dy * 0.16;
    setDragY(clampedY);
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

  const handleNavigate = (tab: NavTab, protectedTab = false, modalTitle?: string) => {
    requestAnimatedClose();
    if (protectedTab && !isAdmin) {
      window.setTimeout(() => {
        onOpenSecurityModal(modalTitle || 'Accès Protégé', () => onSelectTab(tab));
      }, 110);
      return;
    }
    onSelectTab(tab);
  };

  if (!rendered) return null;

  const dragOpacityFactor = dragY > 0 ? Math.max(0.2, 1 - dragY / 380) : 1;
  const sheetTransform = !entered
    ? 'translate3d(0, 100%, 0)'
    : `translate3d(0, ${dragY}px, 0)`;

  const menuDestinations: {
    key: NavTab;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
    protectedTab?: boolean;
    visible: boolean;
    accent?: string;
  }[] = [
    {
      key: 'settings',
      label: 'Paramètres & Réglages',
      subtitle: 'Objectifs, trajectoire Elo, notifications & export',
      icon: <Settings className="h-4.5 w-4.5" />,
      protectedTab: true,
      visible: !isIframe && !isSpectator,
      accent: 'text-[#facc15] bg-[#facc15]/15 border-[#facc15]/30',
    },
    {
      key: 'admin',
      label: 'Panel Administrateur',
      subtitle: 'Pause du site, sécurité A2F & accès multi-appareils',
      icon: <ShieldAlert className="h-4.5 w-4.5" />,
      protectedTab: true,
      visible: !isIframe && !isSpectator && hasAdminAccess,
      accent: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
    },
    {
      key: 'profile',
      label: 'Mon Profil',
      subtitle: `Statistiques joueur et avatar de @${username}`,
      icon: <User className="h-4.5 w-4.5" />,
      visible: true,
      accent: 'text-sky-300 bg-sky-500/15 border-sky-500/30',
    },
    {
      key: 'tests',
      label: 'Suite de Tests',
      subtitle: 'Vérification du moteur Elo et des calculs',
      icon: <CheckCircle2 className="h-4.5 w-4.5" />,
      protectedTab: true,
      visible: !isIframe && !isSpectator,
      accent: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
    },
    {
      key: 'iframe',
      label: 'Intégration Iframe',
      subtitle: "Code d'intégration lecture seule externe",
      icon: <Code2 className="h-4.5 w-4.5" />,
      visible: !isSpectator,
      accent: 'text-purple-300 bg-purple-500/15 border-purple-500/30',
    },
  ];

  return (
    <div
      onClick={requestAnimatedClose}
      style={{
        opacity: entered ? dragOpacityFactor : 0,
        transition: isDragging ? 'none' : 'opacity 240ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu Plus"
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
        className="w-full sm:max-w-md max-h-[86vh] flex flex-col rounded-t-[30px] sm:rounded-3xl border border-white/[0.16] bg-[#0a0e16]/94 backdrop-blur-2xl backdrop-saturate-[180%] shadow-[0_-18px_50px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.24)] overflow-hidden text-left will-change-transform"
      >
        {/* Top Swipe Handle & Header */}
        <div
          onPointerDown={(e) => handleSheetPointerDown(e, true)}
          className="touch-none select-none cursor-grab active:cursor-grabbing"
        >
          <div className="flex justify-center pt-2.5 pb-1">
            <span className="w-11 h-1.5 rounded-full bg-white/30" />
          </div>

          <div className="flex items-center justify-between gap-3 px-5 pt-2 pb-3.5 border-b border-white/[0.08]">
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Menu Plus</h2>
              <p className="text-[11px] text-neutral-400">
                @{username} ·{' '}
                {isAdmin ? (
                  <span className="text-[#10b981] font-semibold">Admin 2FA actif</span>
                ) : (
                  <span>Session standard</span>
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={requestAnimatedClose}
              className="h-10 w-10 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.1] flex items-center justify-center text-neutral-300 hover:text-white transition-colors shrink-0"
              aria-label="Fermer le menu Plus"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div
          ref={scrollBodyRef}
          onPointerDown={(e) => handleSheetPointerDown(e, false)}
          onTouchStart={handleBodyTouchStart}
          onTouchMove={handleBodyTouchMove}
          onTouchEnd={handleBodyTouchEnd}
          onTouchCancel={handleBodyTouchEnd}
          className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain"
        >
          {/* Quick Actions Pills Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {!isIframe && !isSpectator && (
              <button
                type="button"
                onClick={() => {
                  requestAnimatedClose();
                  onSync();
                }}
                disabled={isSyncing}
                className="flex items-center gap-2.5 p-3 rounded-2xl border border-[#facc15]/30 bg-[#facc15]/10 hover:bg-[#facc15]/15 text-left transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <div className="h-9 w-9 rounded-xl bg-[#facc15]/20 border border-[#facc15]/35 flex items-center justify-center text-[#facc15] shrink-0">
                  <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {isSyncing ? 'Synchro...' : 'Synchroniser'}
                  </div>
                  <div className="text-[10px] text-neutral-400 truncate">Chess.com</div>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                requestAnimatedClose();
                window.setTimeout(() => onOpenNotificationCenter(), 100);
              }}
              className="flex items-center gap-2.5 p-3 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-left transition-all active:scale-[0.98]"
            >
              <div className="relative h-9 w-9 rounded-xl bg-white/[0.08] border border-white/15 flex items-center justify-center text-[#facc15] shrink-0">
                <Bell className="h-4 w-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#facc15] text-black text-[9px] font-black flex items-center justify-center tabular-nums">
                    {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">Notifications</div>
                <div className="text-[10px] text-neutral-400 truncate">
                  {unreadNotificationsCount > 0
                    ? `${unreadNotificationsCount} non lue(s)`
                    : 'Tout est lu'}
                </div>
              </div>
            </button>

            {!isSpectator && (
              <button
                type="button"
                onClick={() => {
                  requestAnimatedClose();
                  window.setTimeout(() => onOpenNetworkModal(), 100);
                }}
                className="flex items-center gap-2.5 p-3 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-left transition-all active:scale-[0.98]"
              >
                <div
                  className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    jsonBinStatus === 'synced'
                      ? 'bg-[#10b981]/15 border-[#10b981]/35 text-[#10b981]'
                      : jsonBinStatus === 'error'
                      ? 'bg-[#ef4444]/15 border-[#ef4444]/35 text-[#ef4444]'
                      : 'bg-[#facc15]/15 border-[#facc15]/35 text-[#facc15]'
                  }`}
                >
                  <Database className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">Cloud JSONBin</div>
                  <div className="text-[10px] text-neutral-400 truncate">
                    {jsonBinStatus === 'synced'
                      ? 'Synchronisé'
                      : jsonBinStatus === 'error'
                      ? 'Erreur'
                      : 'Statut & clés'}
                  </div>
                </div>
              </button>
            )}

            {!isSpectator && onOpenFirebaseModal && (
              <button
                type="button"
                onClick={() => {
                  requestAnimatedClose();
                  window.setTimeout(() => onOpenFirebaseModal(), 100);
                }}
                className="flex items-center gap-2.5 p-3 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-left transition-all active:scale-[0.98]"
              >
                <div
                  className={`relative h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    firebaseStatus === 'synced'
                      ? 'bg-[#10b981]/15 border-[#10b981]/35 text-[#10b981]'
                      : firebaseStatus === 'error' || firebaseStatus === 'offline'
                      ? 'bg-[#ef4444]/15 border-[#ef4444]/35 text-[#ef4444]'
                      : 'bg-amber-500/15 border-amber-500/35 text-amber-300'
                  }`}
                >
                  <Flame className="h-4 w-4" />
                  {firebaseIssuesCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-black text-[9px] font-black flex items-center justify-center tabular-nums">
                      {firebaseIssuesCount > 9 ? '9+' : firebaseIssuesCount}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">Firebase</div>
                  <div className="text-[10px] text-neutral-400 truncate">
                    {firebaseIssuesCount > 0
                      ? `${firebaseIssuesCount} alerte(s)`
                      : firebaseStatus === 'synced'
                      ? 'Principal actif'
                      : firebaseStatus === 'blocked'
                      ? 'Canal bloqué'
                      : 'Synchro & suivi'}
                  </div>
                </div>
              </button>
            )}

            {!isIframe && !isSpectator && (
              <button
                type="button"
                onClick={() => {
                  requestAnimatedClose();
                  if (isAdmin) {
                    onLockAdmin();
                  } else {
                    window.setTimeout(() => onOpenSecurityModal('Déverrouillage Admin 2FA'), 100);
                  }
                }}
                className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                  isAdmin
                    ? 'border-[#10b981]/30 bg-[#10b981]/10 hover:bg-[#10b981]/15'
                    : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                }`}
              >
                <div
                  className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    isAdmin
                      ? 'bg-[#10b981]/20 border-[#10b981]/40 text-[#10b981]'
                      : 'bg-amber-500/15 border-amber-500/35 text-amber-300'
                  }`}
                >
                  {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {isAdmin ? 'Verrouiller 2FA' : 'Déverrouiller 2FA'}
                  </div>
                  <div className="text-[10px] text-neutral-400 truncate">
                    {isAdmin ? 'Session active' : 'Accès sécurisé'}
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Pages & Settings List */}
          <div className="space-y-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Pages & Paramètres
            </div>

            {menuDestinations
              .filter((d) => d.visible)
              .map((item) => {
                const isActive = currentTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() =>
                      handleNavigate(item.key, item.protectedTab, item.label)
                    }
                    className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all active:scale-[0.99] ${
                      isActive
                        ? 'border-[#facc15]/50 bg-[#facc15]/12 shadow-[0_6px_20px_rgba(250,204,21,0.12)]'
                        : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07]'
                    }`}
                  >
                    <div
                      className={`h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 ${
                        item.accent || 'bg-white/10 border-white/15 text-white'
                      }`}
                    >
                      {item.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-white truncate">
                          {item.label}
                        </span>
                        {item.protectedTab && !isAdmin && (
                          <Lock className="h-3 w-3 text-[#facc15] shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate">{item.subtitle}</p>
                    </div>

                    <ChevronRight
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? 'text-[#facc15]' : 'text-neutral-500'
                      }`}
                    />
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};
