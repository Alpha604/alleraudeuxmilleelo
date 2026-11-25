/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  Flame,
  PauseCircle,
  Radio,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  formatJsonBinTimestamp,
  JSONBIN_TEMPORARILY_DISABLED,
  JsonBinSyncState,
} from '../utils/cloudSync';
import {
  getSyncDiagnosticsSnapshot,
  SyncDiagnosticsSnapshot,
} from '../utils/syncDiagnostics';
import { triggerNotificationHaptic } from '../utils/notifications';

interface MobileCloudMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  jsonBinStatus: JsonBinSyncState;
  jsonBinLastSync?: string | number | null;
  onReconcileNow: () => Promise<void>;
  onPushToFirebase: () => Promise<boolean>;
  onOpenFirebaseModal: () => void;
  onOpenNetworkModal: () => void;
}

export const MobileCloudMenuModal: React.FC<MobileCloudMenuModalProps> = ({
  isOpen,
  onClose,
  username,
  jsonBinStatus,
  jsonBinLastSync,
  onReconcileNow,
  onPushToFirebase,
  onOpenFirebaseModal,
  onOpenNetworkModal,
}) => {
  const [diag, setDiag] = useState<SyncDiagnosticsSnapshot>(() => getSyncDiagnosticsSnapshot());
  const [busyAction, setBusyAction] = useState<'reconcile' | 'push' | null>(null);

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
    setDiag(getSyncDiagnosticsSnapshot());

    const handleUpdate = (e: Event) => {
      const custom = e as CustomEvent<SyncDiagnosticsSnapshot>;
      setDiag(custom.detail || getSyncDiagnosticsSnapshot());
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestAnimatedClose();
    };

    window.addEventListener('roadto2000:sync-diagnostics-updated', handleUpdate);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('roadto2000:sync-diagnostics-updated', handleUpdate);
      window.removeEventListener('keydown', handleKey);
    };
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

  const unresolvedCount = useMemo(
    () => diag.issues.filter((i) => !i.resolved && i.severity !== 'info').length,
    [diag.issues]
  );

  if (!rendered) return null;

  const fb = diag.firebase;
  const isJsonBinDisabled = JSONBIN_TEMPORARILY_DISABLED || jsonBinStatus === 'disabled';

  const handleQuickReconcile = async () => {
    triggerNotificationHaptic('tap');
    setBusyAction('reconcile');
    try {
      await onReconcileNow();
      setDiag(getSyncDiagnosticsSnapshot());
    } finally {
      setBusyAction(null);
    }
  };

  const handleQuickPushFirebase = async () => {
    triggerNotificationHaptic('tap');
    setBusyAction('push');
    try {
      await onPushToFirebase();
      setDiag(getSyncDiagnosticsSnapshot());
    } finally {
      setBusyAction(null);
    }
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
      onClick={requestAnimatedClose}
      className="sm:hidden fixed inset-0 z-[130] flex items-end justify-center bg-black/80"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Centre Cloud Unifié"
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
        className="w-full max-h-[86vh] flex flex-col rounded-t-[30px] border-t border-x border-neutral-800 bg-[#0a0e16] shadow-2xl overflow-hidden will-change-transform"
      >
        {/* Drag Handle & Header (swipe down with finger to close) */}
        <div
          onPointerDown={(e) => handleSheetPointerDown(e, true)}
          className="touch-none select-none cursor-grab active:cursor-grabbing"
        >
          <div className="pt-2.5 pb-1 flex justify-center">
            <span className="w-11 h-1.5 rounded-full bg-white/30" />
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-2xl bg-[#facc15]/15 border border-[#facc15]/40 text-[#facc15] flex items-center justify-center shrink-0">
                <Cloud className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-white truncate">
                    Cloud Unifié (Admin A2F)
                  </h2>
                  {unresolvedCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black tabular-nums">
                      {unresolvedCount}
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-mono text-neutral-400 truncate">
                  {isJsonBinDisabled
                    ? `Firebase Principal Actif · JSONBin archivé · @${username}`
                    : `Firebase Principal + Repli JSONBin · @${username}`}
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
              aria-label="Fermer le menu Cloud"
              className="h-9 w-9 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body (pull down at top to close) */}
        <div
          ref={scrollBodyRef}
          onPointerDown={(e) => handleSheetPointerDown(e, false)}
          onTouchStart={handleBodyTouchStart}
          onTouchMove={handleBodyTouchMove}
          onTouchEnd={handleBodyTouchEnd}
          onTouchCancel={handleBodyTouchEnd}
          className="flex-1 overflow-y-auto p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-3.5 overscroll-contain"
        >
          {/* 1. Firebase Card */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    fb.connection === 'online'
                      ? 'bg-[#10b981]/15 border-[#10b981]/40 text-[#10b981]'
                      : fb.connection === 'blocked'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                      : 'bg-[#ef4444]/15 border-[#ef4444]/40 text-[#ef4444]'
                  }`}
                >
                  <Flame className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white">Firebase Firestore</div>
                  <div className="text-[11px] font-mono text-neutral-400 truncate">
                    {fb.connection === 'online'
                      ? `En ligne${fb.latencyMs !== null ? ` · ${fb.latencyMs} ms` : ''}`
                      : fb.connection === 'blocked'
                      ? 'Bloqué par extension'
                      : 'Hors ligne'}
                  </div>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                  fb.connection === 'online'
                    ? 'bg-[#10b981]/15 border-[#10b981]/40 text-[#10b981]'
                    : fb.connection === 'blocked'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-[#ef4444]/15 border-[#ef4444]/40 text-[#ef4444]'
                }`}
              >
                {fb.connection === 'online' ? (
                  <Wifi className="h-3 w-3" />
                ) : fb.connection === 'blocked' ? (
                  <ShieldAlert className="h-3 w-3" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                <span>
                  {fb.activeReadSource === 'firebase'
                    ? 'Principal'
                    : fb.activeReadSource === 'jsonbin'
                    ? 'Repli actif'
                    : 'Cache'}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="rounded-xl border border-neutral-800 bg-black/30 px-3 py-2">
                <span className="text-[10px] text-neutral-400 block font-sans">Temps réel</span>
                <span className="font-bold text-white flex items-center gap-1.5 mt-0.5">
                  <Radio
                    className={`h-3 w-3 ${
                      fb.realtimeListener === 'connected' ? 'text-[#10b981]' : 'text-amber-400'
                    }`}
                  />
                  {fb.realtimeListener === 'connected' ? 'Connecté' : 'Veille'}
                </span>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-black/30 px-3 py-2">
                <span className="text-[10px] text-neutral-400 block font-sans">Dernière lecture</span>
                <span className="font-bold text-neutral-200 block truncate mt-0.5">
                  {formatJsonBinTimestamp(fb.lastReadAt)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                requestAnimatedClose();
                onOpenFirebaseModal();
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-bold text-amber-300 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Flame className="h-4 w-4" />
                <span>Ouvrir les diagnostics Firebase</span>
              </span>
              {unresolvedCount > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black">
                  <AlertTriangle className="h-3 w-3" />
                  {unresolvedCount}
                </span>
              ) : (
                <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
              )}
            </button>
          </div>

          {/* 2. JSONBin Card */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    isJsonBinDisabled
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                      : jsonBinStatus === 'synced'
                      ? 'bg-[#10b981]/15 border-[#10b981]/40 text-[#10b981]'
                      : jsonBinStatus === 'error'
                      ? 'bg-[#ef4444]/15 border-[#ef4444]/40 text-[#ef4444]'
                      : 'bg-[#facc15]/15 border-[#facc15]/40 text-[#facc15]'
                  }`}
                >
                  {isJsonBinDisabled ? (
                    <PauseCircle className="h-4 w-4" />
                  ) : (
                    <Database className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white">Archive JSONBin</div>
                  <div className="text-[11px] font-mono text-neutral-400 truncate">
                    {isJsonBinDisabled
                      ? 'Archivé (données préservées)'
                      : `MàJ : ${formatJsonBinTimestamp(jsonBinLastSync)}`}
                  </div>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                  isJsonBinDisabled
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                    : jsonBinStatus === 'synced'
                    ? 'bg-[#10b981]/15 border-[#10b981]/40 text-[#10b981]'
                    : jsonBinStatus === 'syncing'
                    ? 'bg-[#facc15]/15 border-[#facc15]/40 text-[#facc15]'
                    : jsonBinStatus === 'error'
                    ? 'bg-[#ef4444]/15 border-[#ef4444]/40 text-[#ef4444]'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-300'
                }`}
              >
                {isJsonBinDisabled
                  ? 'Archivé (Firebase Actif)'
                  : jsonBinStatus === 'synced'
                  ? 'Synchronisé'
                  : jsonBinStatus === 'syncing'
                  ? 'Synchro...'
                  : jsonBinStatus === 'error'
                  ? 'Erreur'
                  : 'En attente'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                requestAnimatedClose();
                onOpenNetworkModal();
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-neutral-800 bg-neutral-950/70 hover:bg-neutral-800 text-xs font-bold text-neutral-200 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Database className="h-4 w-4 text-[#facc15]" />
                <span>Inspecter Réseau & Cache JSONBin</span>
              </span>
              <span className="text-[11px] font-mono text-[#facc15]">Ouvrir</span>
            </button>
          </div>

          {/* 3. Quick Unified Cloud Actions */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleQuickReconcile}
              className="flex items-center justify-center gap-2 px-3.5 py-3 rounded-2xl border border-[#10b981]/40 bg-[#10b981]/15 hover:bg-[#10b981]/25 text-xs font-bold text-[#10b981] transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busyAction === 'reconcile' ? 'animate-spin' : ''}`} />
              <span>Recharger Cloud</span>
            </button>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleQuickPushFirebase}
              className="flex items-center justify-center gap-2 px-3.5 py-3 rounded-2xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-black transition-all disabled:opacity-50"
            >
              <UploadCloud className={`h-4 w-4 ${busyAction === 'push' ? 'animate-bounce' : ''}`} />
              <span>Pousser Cloud</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
