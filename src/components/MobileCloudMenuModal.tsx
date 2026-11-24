/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  Flame,
  Radio,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { formatJsonBinTimestamp, JsonBinSyncState } from '../utils/cloudSync';
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

  useEffect(() => {
    if (!isOpen) return;
    setDiag(getSyncDiagnosticsSnapshot());

    const handleUpdate = (e: Event) => {
      const custom = e as CustomEvent<SyncDiagnosticsSnapshot>;
      setDiag(custom.detail || getSyncDiagnosticsSnapshot());
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('roadto2000:sync-diagnostics-updated', handleUpdate);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('roadto2000:sync-diagnostics-updated', handleUpdate);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose]);

  const unresolvedCount = useMemo(
    () => diag.issues.filter((i) => !i.resolved && i.severity !== 'info').length,
    [diag.issues]
  );

  if (!isOpen) return null;

  const fb = diag.firebase;

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Centre Cloud Unifié"
      onClick={onClose}
      className="sm:hidden fixed inset-0 z-[130] flex items-end justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-sheet w-full max-h-[86vh] flex flex-col rounded-t-[30px] border-t border-x border-white/[0.18] bg-[#0a0e16]/94 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_-18px_50px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.22)] overflow-hidden"
      >
        {/* Drag Handle & Header */}
        <div className="pt-2.5 pb-1 flex justify-center">
          <span className="w-11 h-1.5 rounded-full bg-white/30" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08]">
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
                Firebase Principal + Repli JSONBin · @{username}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Fermer le menu Cloud"
            className="h-9 w-9 rounded-xl border border-white/[0.12] bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white flex items-center justify-center shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-3.5">
          {/* 1. Firebase Card */}
          <div className="liquid-glass-card rounded-2xl border border-white/[0.12] bg-white/[0.04] p-4 space-y-3">
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
              <div className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2">
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
              <div className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2">
                <span className="text-[10px] text-neutral-400 block font-sans">Dernière lecture</span>
                <span className="font-bold text-neutral-200 block truncate mt-0.5">
                  {formatJsonBinTimestamp(fb.lastReadAt)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
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
          <div className="liquid-glass-card rounded-2xl border border-white/[0.12] bg-white/[0.04] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    jsonBinStatus === 'synced'
                      ? 'bg-[#10b981]/15 border-[#10b981]/40 text-[#10b981]'
                      : jsonBinStatus === 'error'
                      ? 'bg-[#ef4444]/15 border-[#ef4444]/40 text-[#ef4444]'
                      : 'bg-[#facc15]/15 border-[#facc15]/40 text-[#facc15]'
                  }`}
                >
                  <Database className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white">Cache Secours JSONBin</div>
                  <div className="text-[11px] font-mono text-neutral-400 truncate">
                    MàJ : {formatJsonBinTimestamp(jsonBinLastSync)}
                  </div>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                  jsonBinStatus === 'synced'
                    ? 'bg-[#10b981]/15 border-[#10b981]/40 text-[#10b981]'
                    : jsonBinStatus === 'syncing'
                    ? 'bg-[#facc15]/15 border-[#facc15]/40 text-[#facc15]'
                    : jsonBinStatus === 'error'
                    ? 'bg-[#ef4444]/15 border-[#ef4444]/40 text-[#ef4444]'
                    : 'bg-white/10 border-white/20 text-neutral-300'
                }`}
              >
                {jsonBinStatus === 'synced'
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
                onClose();
                onOpenNetworkModal();
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-white/[0.12] bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-neutral-200 transition-colors"
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
              className="flex items-center justify-center gap-2 px-3.5 py-3 rounded-2xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-black transition-all shadow-[0_6px_20px_rgba(250,204,21,0.3)] disabled:opacity-50"
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
