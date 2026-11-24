/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Mail,
  MailOpen,
  Save,
  SlidersHorizontal,
  Trash2,
  Vibrate,
  X,
} from 'lucide-react';
import {
  AppNotificationItem,
  formatRelativeNotificationTime,
  MobileNotificationPrefs,
  NOTIFICATION_CATEGORY_LABEL,
  NotificationCategory,
  triggerNotificationHaptic,
} from '../utils/notifications';
import { LiquidGlassDurationSlider } from './LiquidGlassDurationSlider';
import { NavTab } from './Navbar';

interface MobileNotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotificationItem[];
  prefs: MobileNotificationPrefs;
  onUpdatePrefs: (next: MobileNotificationPrefs) => void;
  onMarkAllRead: () => void;
  onMarkOneRead: (id: string) => void;
  onDeleteOne: (id: string) => void;
  onClearAll: () => void;
  onNavigateTab: (tab: NavTab) => void;
  onSendTestNotification?: () => void;
  onSavePreferences?: () => void;
}

export const MobileNotificationCenter: React.FC<MobileNotificationCenterProps> = ({
  isOpen,
  onClose,
  notifications,
  prefs,
  onUpdatePrefs,
  onMarkAllRead,
  onMarkOneRead,
  onDeleteOne,
  onClearAll,
  onNavigateTab,
  onSavePreferences,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'alerts' | 'message' | 'settings'>('all');
  const [expandedLetterIds, setExpandedLetterIds] = useState<Record<string, boolean>>({});
  const [prefsSavedFlash, setPrefsSavedFlash] = useState(false);
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

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const standardUnreadCount = useMemo(
    () => notifications.filter((n) => !n.read && !n.isOfficialLetter && n.category !== 'message').length,
    [notifications]
  );

  const alertsCount = useMemo(
    () => notifications.filter((n) => n.type === 'warning' && !n.isOfficialLetter && n.category !== 'message').length,
    [notifications]
  );

  const messagesCount = useMemo(
    () => notifications.filter((n) => n.isOfficialLetter || n.category === 'message').length,
    [notifications]
  );

  const unreadLettersCount = useMemo(
    () =>
      notifications.filter((n) => !n.read && (n.isOfficialLetter || n.category === 'message'))
        .length,
    [notifications]
  );

  const filteredList = useMemo(() => {
    if (filter === 'unread') return notifications.filter((n) => !n.read);
    if (filter === 'alerts')
      return notifications.filter(
        (n) => n.type === 'warning' && !n.isOfficialLetter && n.category !== 'message'
      );
    if (filter === 'message')
      return notifications.filter((n) => n.isOfficialLetter || n.category === 'message');
    return notifications;
  }, [notifications, filter]);

  const handleSavePrefsClick = () => {
    onUpdatePrefs(prefs);
    triggerNotificationHaptic('success');
    setPrefsSavedFlash(true);
    onSavePreferences?.();
    window.setTimeout(() => {
      setPrefsSavedFlash(false);
      setFilter('all');
    }, 650);
  };

  if (!rendered) return null;

  const iconForType = (type: AppNotificationItem['type']) => {
    if (type === 'success') return <CheckCircle2 className="h-4 w-4 text-[#10b981]" />;
    if (type === 'warning') return <AlertTriangle className="h-4 w-4 text-[#ef4444]" />;
    return <Info className="h-4 w-4 text-[#facc15]" />;
  };

  const iconBgForType = (type: AppNotificationItem['type']) => {
    if (type === 'success') return 'bg-[#10b981]/15 border-[#10b981]/30';
    if (type === 'warning') return 'bg-[#ef4444]/15 border-[#ef4444]/30';
    return 'bg-[#facc15]/15 border-[#facc15]/30';
  };

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
      className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md sm:p-4"
      onClick={requestAnimatedClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Centre de Notifications"
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
        className="liquid-glass-sheet w-full sm:max-w-lg max-h-[86vh] flex flex-col rounded-t-[30px] sm:rounded-3xl border border-white/[0.15] bg-[#0a0e16]/95 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_-18px_50px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.22)] overflow-hidden text-left will-change-transform"
      >
        {/* Top Drag Handle & Header Zone (swipe down anywhere here to close) */}
        <div
          onPointerDown={(e) => handleSheetPointerDown(e, true)}
          className="touch-none select-none cursor-grab active:cursor-grabbing"
        >
          {/* Mobile Drag Handle Bar */}
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <span className="w-11 h-1.5 rounded-full bg-white/30" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 pt-2.5 pb-3.5 border-b border-white/[0.08]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-2xl bg-[#facc15]/15 border border-[#facc15]/30 flex items-center justify-center text-[#facc15] shrink-0">
                {prefs.dnd ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-white leading-tight truncate">
                  Centre de Notifications
                </h2>
                <p className="text-[11px] text-neutral-400">
                  {unreadCount > 0 ? `${unreadCount} non lue(s)` : 'Tout est lu'} ·{' '}
                  {prefs.dnd ? 'Mode silencieux actif' : 'Bannières actives'}
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
              aria-label="Fermer les notifications"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Filter & Settings Bar (Pastilles compactes) */}
        <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5 p-1 rounded-full bg-white/[0.04] border border-white/[0.08]">
            {(
              [
                {
                  id: 'all',
                  title: 'Toutes',
                  count: notifications.length,
                  dotClass: 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.65)]',
                  isMail: false,
                },
                {
                  id: 'unread',
                  title: 'Non lues',
                  count: unreadCount,
                  dotClass: 'bg-[#facc15] shadow-[0_0_8px_rgba(250,204,21,0.75)]',
                  isMail: false,
                },
                {
                  id: 'alerts',
                  title: 'Alertes',
                  count: alertsCount,
                  dotClass: 'bg-[#ef4444] shadow-[0_0_8px_rgba(239,68,68,0.75)]',
                  isMail: false,
                },
                {
                  id: 'message',
                  title: 'Messages',
                  count: messagesCount,
                  dotClass: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.75)]',
                  isMail: true,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                title={`${tab.title} (${tab.count})`}
                aria-label={`${tab.title} (${tab.count})`}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-mono font-bold whitespace-nowrap transition-all ${
                  filter === tab.id
                    ? 'bg-white/15 text-white ring-1 ring-[#facc15]/60 shadow-sm'
                    : 'text-neutral-300 hover:bg-white/[0.06]'
                }`}
              >
                {tab.isMail ? (
                  <>
                    <Mail
                      className={`h-3.5 w-3.5 shrink-0 ${
                        unreadLettersCount > 0 ? 'text-[#facc15]' : 'text-sky-400'
                      }`}
                    />
                    <span className="font-sans text-[11px]">Messages</span>
                  </>
                ) : (
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${tab.dotClass}`} />
                )}
                <span className="tabular-nums text-[11px]">{tab.count}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setFilter((f) => (f === 'settings' ? 'all' : 'settings'))}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              filter === 'settings'
                ? 'border-[#facc15] bg-[#facc15]/15 text-[#facc15]'
                : 'border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white'
            }`}
            aria-label="Réglages des notifications"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Réglages</span>
          </button>
        </div>

        {/* Scrollable Content (Swipe down when scrolled to top to dismiss) */}
        <div
          ref={scrollBodyRef}
          onPointerDown={(e) => handleSheetPointerDown(e, false)}
          onTouchStart={handleBodyTouchStart}
          onTouchMove={handleBodyTouchMove}
          onTouchEnd={handleBodyTouchEnd}
          onTouchCancel={handleBodyTouchEnd}
          className="flex-1 overflow-y-auto p-4 space-y-2.5 overscroll-contain"
        >
          {filter === 'settings' ? (
            <div className="space-y-4">
              {/* Mobile Notification Toggles */}
              <div className="space-y-2.5 text-xs">
                <label className="flex items-center justify-between p-3.5 rounded-2xl border border-white/10 bg-white/[0.03] cursor-pointer">
                  <div className="flex items-center gap-3">
                    <BellOff className="h-4 w-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-bold text-white">Mode Silencieux (Ne pas déranger)</div>
                      <div className="text-[11px] text-neutral-400">
                        Enregistre ici sans afficher de bannière flottante
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.dnd}
                    onChange={(e) => onUpdatePrefs({ ...prefs, dnd: e.target.checked })}
                    className="h-5 w-5 accent-[#facc15]"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-2xl border border-white/10 bg-white/[0.03] cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Vibrate className="h-4 w-4 text-[#10b981] shrink-0" />
                    <div>
                      <div className="font-bold text-white">Retour tactile (Vibration)</div>
                      <div className="text-[11px] text-neutral-400">
                        Vibre doucement lors des notifications et du glissement du dock
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.haptic}
                    onChange={(e) => onUpdatePrefs({ ...prefs, haptic: e.target.checked })}
                    className="h-5 w-5 accent-[#10b981]"
                  />
                </label>

                <LiquidGlassDurationSlider
                  value={prefs.autoHideSeconds}
                  onChange={(autoHideSeconds) => onUpdatePrefs({ ...prefs, autoHideSeconds })}
                  compact
                />

                <div className="p-3.5 rounded-2xl border border-white/10 bg-white/[0.03] space-y-2">
                  <div className="font-bold text-white mb-1">Catégories actives sur mobile</div>
                  {(Object.keys(NOTIFICATION_CATEGORY_LABEL) as NotificationCategory[]).map((cat) => (
                    <label
                      key={cat}
                      className="flex items-center justify-between py-1.5 cursor-pointer"
                    >
                      <span className="text-neutral-200">{NOTIFICATION_CATEGORY_LABEL[cat]}</span>
                      <input
                        type="checkbox"
                        checked={prefs.categories[cat]}
                        onChange={(e) =>
                          onUpdatePrefs({
                            ...prefs,
                            categories: { ...prefs.categories, [cat]: e.target.checked },
                          })
                        }
                        className="h-4 w-4 accent-[#facc15]"
                      />
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleSavePrefsClick}
                  className="w-full py-3 px-4 rounded-2xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-extrabold flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
                >
                  {prefsSavedFlash ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Enregistré !</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Enregistrer</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-neutral-500">
                <Bell className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-neutral-300">Aucune notification ici</p>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                Vos alertes de progression Elo, synchronisations JSONBin et événements de sécurité apparaîtront ici.
              </p>
            </div>
          ) : (
            filteredList.map((item) => {
              const isLetter = Boolean(item.isOfficialLetter || item.category === 'message');
              const isExpanded = Boolean(expandedLetterIds[item.id]);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    onMarkOneRead(item.id);
                    if (isLetter) {
                      triggerNotificationHaptic('tap');
                      setExpandedLetterIds((prev) => ({
                        ...prev,
                        [item.id]: !prev[item.id],
                      }));
                    }
                  }}
                  className={`liquid-glass-card rounded-2xl border p-3.5 transition-all cursor-pointer ${
                    isLetter
                      ? item.read
                        ? 'border-sky-500/25 bg-sky-500/[0.04]'
                        : 'border-sky-400/50 bg-sky-500/[0.11] shadow-[0_6px_22px_rgba(56,189,248,0.12)]'
                      : item.read
                      ? 'border-white/[0.07] bg-white/[0.02] opacity-80'
                      : 'border-[#facc15]/30 bg-[#facc15]/[0.06]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                        isLetter
                          ? item.read
                            ? 'bg-sky-500/15 border-sky-400/35 text-sky-400'
                            : 'bg-[#facc15]/20 border-[#facc15]/45 text-[#facc15]'
                          : iconBgForType(item.type)
                      }`}
                    >
                      {isLetter ? (
                        item.read ? (
                          <MailOpen className="h-4 w-4" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )
                      ) : (
                        iconForType(item.type)
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-bold text-white truncate">{item.title}</span>
                          {isLetter && !item.read && (
                            <span className="px-1.5 py-0.5 rounded bg-[#facc15] text-black text-[9px] font-black uppercase shrink-0">
                              Non lue
                            </span>
                          )}
                          {isLetter && item.priority === 'important' && (
                            <span className="px-1.5 py-0.5 rounded bg-[#ef4444]/20 border border-[#ef4444]/40 text-[#ef4444] text-[9px] font-bold uppercase shrink-0">
                              Important
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-neutral-400 shrink-0 tabular-nums">
                          {formatRelativeNotificationTime(item.createdAt)}
                        </span>
                      </div>

                      {isLetter ? (
                        isExpanded ? (
                          <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-2 animate-in fade-in duration-150">
                            <p className="text-xs text-neutral-200 leading-relaxed whitespace-pre-line">
                              {item.fullContent || item.message}
                            </p>
                            <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-1 border-t border-white/10">
                              <span className="font-semibold text-sky-400">
                                {item.senderLabel || 'Administration Road to 2000'}
                              </span>
                              <span className="inline-flex items-center gap-1 font-bold text-neutral-300">
                                <ChevronUp className="h-3 w-3" />
                                <span>Réduire</span>
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-neutral-300 leading-snug line-clamp-2">
                              {item.message}
                            </p>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-400 shrink-0">
                              <span>Lire</span>
                              <ChevronDown className="h-3 w-3" />
                            </span>
                          </div>
                        )
                      ) : (
                        <p className="text-xs text-neutral-300 leading-snug">{item.message}</p>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-0.5 text-[10px] text-neutral-400">
                        <span>
                          {isLetter
                            ? item.senderLabel || 'Lettre officielle'
                            : NOTIFICATION_CATEGORY_LABEL[item.category]}
                        </span>

                        <div className="flex items-center gap-3">
                          {item.targetTab && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMarkOneRead(item.id);
                                onNavigateTab(item.targetTab!);
                                requestAnimatedClose();
                              }}
                              className="inline-flex items-center gap-1 font-bold text-[#facc15] hover:underline"
                            >
                              <span>Ouvrir</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteOne(item.id);
                            }}
                            className="text-neutral-500 hover:text-[#ef4444] p-1"
                            aria-label="Supprimer cette notification"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        {filter !== 'settings' && notifications.length > 0 && (
          <div className="px-4 py-3 border-t border-white/[0.08] bg-black/30 flex items-center justify-between gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={standardUnreadCount === 0}
              title={
                unreadLettersCount > 0 && standardUnreadCount === 0
                  ? 'Les lettres officielles doivent être ouvertes individuellement pour être marquées lues'
                  : 'Marquer toutes les alertes standard comme lues'
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-neutral-200 disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5 text-[#10b981]" />
              <span>Tout marquer lu</span>
            </button>

            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-xs font-semibold text-[#ef4444]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Tout effacer</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
