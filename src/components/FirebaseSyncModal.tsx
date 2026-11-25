/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Flame,
  LogIn,
  LogOut,
  Radio,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import {
  FIREBASE_META,
  signInWithGoogleFirebase,
  signOutFirebase,
  testConnection,
} from '../firebase';
import { getBackendHostMode } from '../utils/backendApi';
import { formatJsonBinTimestamp } from '../utils/cloudSync';
import {
  clearSyncIssues,
  DiagnosticSeverity,
  getSyncDiagnosticsSnapshot,
  SyncDiagnosticIssue,
  SyncDiagnosticsSnapshot,
} from '../utils/syncDiagnostics';

interface FirebaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  onPushToFirebase: () => Promise<boolean>;
  onReconcileNow: () => Promise<void>;
  onOpenNetworkModal?: () => void;
  onOpenFirebaseSettings?: () => void;
  onShowMessage?: (msg: string, type?: 'info' | 'success' | 'warning', title?: string) => void;
}

type IssueFilter = 'all' | 'active' | 'errors' | 'warnings';

export const FirebaseSyncModal: React.FC<FirebaseSyncModalProps> = ({
  isOpen,
  onClose,
  username,
  onPushToFirebase,
  onReconcileNow,
  onOpenNetworkModal,
  onOpenFirebaseSettings,
  onShowMessage,
}) => {
  const [diag, setDiag] = useState<SyncDiagnosticsSnapshot>(() => getSyncDiagnosticsSnapshot());
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('all');
  const [testing, setTesting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDiag(getSyncDiagnosticsSnapshot());

    const handleUpdate = (e: Event) => {
      const custom = e as CustomEvent<SyncDiagnosticsSnapshot>;
      if (custom.detail) {
        setDiag(custom.detail);
      } else {
        setDiag(getSyncDiagnosticsSnapshot());
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('roadto2000:sync-diagnostics-updated', handleUpdate);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('roadto2000:sync-diagnostics-updated', handleUpdate);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const filteredIssues = useMemo(() => {
    return diag.issues.filter((issue) => {
      if (issueFilter === 'active') return !issue.resolved;
      if (issueFilter === 'errors') return issue.severity === 'error';
      if (issueFilter === 'warnings') return issue.severity === 'warning';
      return true;
    });
  }, [diag.issues, issueFilter]);

  const unresolvedCount = useMemo(
    () => diag.issues.filter((i) => !i.resolved && i.severity !== 'info').length,
    [diag.issues]
  );

  if (!isOpen) return null;

  const fb = diag.firebase;
  const hostMode = getBackendHostMode();

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const state = await testConnection();
      setDiag(getSyncDiagnosticsSnapshot());
      if (onShowMessage) {
        if (state === 'online') {
          onShowMessage('Connexion directe à Google Firestore opérationnelle.', 'success', 'Firebase en ligne');
        } else if (state === 'blocked') {
          onShowMessage(
            'Le canal Firestore est bloqué par le navigateur ou une extension (AdBlock / Brave).',
            'warning',
            'Canal Firebase bloqué'
          );
        } else {
          onShowMessage('Firestore hors ligne — cache local actif (archive JSONBin préservée).', 'warning', 'Firestore hors ligne');
        }
      }
    } finally {
      setTesting(false);
    }
  };

  const handlePush = async () => {
    setPushing(true);
    try {
      const ok = await onPushToFirebase();
      setDiag(getSyncDiagnosticsSnapshot());
      if (ok && onShowMessage) {
        onShowMessage(`Données de @${username} synchronisées vers Firebase Firestore.`, 'success', 'Firebase à jour');
      }
    } finally {
      setPushing(false);
    }
  };

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      await onReconcileNow();
      setDiag(getSyncDiagnosticsSnapshot());
    } finally {
      setReconciling(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    try {
      await signInWithGoogleFirebase();
      setDiag(getSyncDiagnosticsSnapshot());
      if (onShowMessage) {
        onShowMessage(
          'Connecté à Firebase avec le compte Google autorisé.',
          'success',
          'Connexion Firebase'
        );
      }
      await onReconcileNow();
    } catch (err: any) {
      if (onShowMessage) {
        onShowMessage(
          err?.message || 'Connexion Google Firebase annulée ou refusée.',
          'warning',
          'Authentification Firebase'
        );
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutFirebase();
      setDiag(getSyncDiagnosticsSnapshot());
      if (onShowMessage) {
        onShowMessage('Déconnecté de Firebase (cache local maintenu).', 'info', 'Firebase');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCopyDiagnosticReport = async () => {
    const report = {
      generatedAt: new Date().toISOString(),
      host: typeof window !== 'undefined' ? window.location.origin : '',
      hostMode,
      projectId: FIREBASE_META.projectId,
      databaseId: FIREBASE_META.firestoreDatabaseId,
      firebase: fb,
      issues: diag.issues,
    };
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
      if (onShowMessage) onShowMessage('Rapport diagnostic copié dans le presse-papier.', 'success', 'Diagnostic');
    } catch {}
  };

  const getSeverityBadge = (severity: DiagnosticSeverity, resolved: boolean) => {
    if (resolved) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#10b981]/15 border border-[#10b981]/30 text-[10px] font-bold text-[#10b981]">
          <CheckCircle2 className="h-3 w-3" />
          Résolu
        </span>
      );
    }
    if (severity === 'error') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#ef4444]/15 border border-[#ef4444]/30 text-[10px] font-bold text-[#ef4444]">
          <XCircle className="h-3 w-3" />
          Erreur
        </span>
      );
    }
    if (severity === 'warning') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          Alerte
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-[10px] font-bold text-sky-300">
        Info
      </span>
    );
  };

  const renderIssueCard = (issue: SyncDiagnosticIssue) => (
    <div
      key={issue.id}
      className={`rounded-2xl border p-3.5 space-y-2 transition-colors ${
        issue.resolved
          ? 'border-neutral-800/70 bg-neutral-900/30 opacity-75'
          : issue.severity === 'error'
          ? 'border-[#ef4444]/35 bg-[#ef4444]/10'
          : 'border-amber-500/30 bg-amber-500/10'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {getSeverityBadge(issue.severity, issue.resolved)}
          <span className="px-2 py-0.5 rounded-lg bg-black/40 border border-neutral-800 text-[10px] font-mono uppercase text-neutral-300">
            {issue.source}
          </span>
          {issue.count > 1 && (
            <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-[10px] font-mono font-bold text-white">
              ×{issue.count}
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-neutral-400">
          {formatJsonBinTimestamp(issue.lastSeenAt)}
        </span>
      </div>

      <div>
        <div className="text-xs font-bold text-white">{issue.title}</div>
        <p className="text-[11px] text-neutral-300 mt-0.5 leading-relaxed">{issue.message}</p>
      </div>

      {issue.suggestion && !issue.resolved && (
        <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-[11px] text-[#facc15]">
          <strong>Conseil :</strong> {issue.suggestion}
        </div>
      )}

      {issue.technicalDetail && (
        <div className="rounded-xl bg-black/50 border border-neutral-800/80 px-2.5 py-1.5 font-mono text-[10px] text-neutral-400 break-all">
          {issue.technicalDetail}
        </div>
      )}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="firebase-sync-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl border border-neutral-800 bg-[#0a0d14] text-neutral-100 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800/80 px-5 sm:px-6 py-4 bg-[#0d111a]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-400 shrink-0">
              <Flame className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="firebase-sync-modal-title" className="text-sm sm:text-base font-bold text-white truncate">
                  Suivi Firebase & Problèmes Reportés
                </h2>
                {unresolvedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black tabular-nums">
                    {unresolvedCount}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-400 font-mono truncate">
                {FIREBASE_META.projectId} ·{' '}
                {hostMode === 'static' ? 'Mode Statique (Firebase Principal)' : 'Mode Serveur Express · Firebase Principal'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="relative z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors shrink-0"
            aria-label="Fermer la fenêtre Firebase"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Top 4 Live Indicators */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1. Connectivity */}
            <div className="rounded-2xl border border-neutral-800 bg-[#0d121c] p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    fb.connection === 'online'
                      ? 'bg-[#10b981]/15 border-[#10b981]/35 text-[#10b981]'
                      : fb.connection === 'blocked'
                      ? 'bg-amber-500/15 border-amber-500/35 text-amber-400'
                      : fb.connection === 'offline'
                      ? 'bg-[#ef4444]/15 border-[#ef4444]/35 text-[#ef4444]'
                      : 'bg-[#facc15]/15 border-[#facc15]/35 text-[#facc15]'
                  }`}
                >
                  {fb.connection === 'online' ? (
                    <Wifi className="h-4 w-4" />
                  ) : fb.connection === 'blocked' ? (
                    <ShieldAlert className="h-4 w-4" />
                  ) : (
                    <WifiOff className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-neutral-400 font-medium">Serveur Firestore</div>
                  <div className="text-xs font-bold text-white truncate">
                    {fb.connection === 'online'
                      ? 'En ligne'
                      : fb.connection === 'blocked'
                      ? 'Bloqué par client'
                      : fb.connection === 'offline'
                      ? 'Hors ligne'
                      : 'Vérification...'}
                  </div>
                </div>
              </div>
              {fb.latencyMs !== null && fb.connection === 'online' && (
                <span className="px-2 py-1 rounded-lg bg-[#10b981]/15 text-[#10b981] font-mono text-[11px] font-bold shrink-0">
                  {fb.latencyMs} ms
                </span>
              )}
            </div>

            {/* 2. Active Read Source */}
            <div className="rounded-2xl border border-neutral-800 bg-[#0d121c] p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    fb.activeReadSource === 'firebase'
                      ? 'bg-[#10b981]/15 border-[#10b981]/35 text-[#10b981]'
                      : fb.activeReadSource === 'jsonbin'
                      ? 'bg-amber-500/15 border-amber-500/35 text-amber-400'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-300'
                  }`}
                >
                  {fb.activeReadSource === 'firebase' ? (
                    <Flame className="h-4 w-4" />
                  ) : (
                    <Database className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-neutral-400 font-medium">Source des données</div>
                  <div className="text-xs font-bold text-white truncate">
                    {fb.activeReadSource === 'firebase'
                      ? 'Firebase (Principal)'
                      : fb.activeReadSource === 'jsonbin'
                      ? 'Archive JSONBin'
                      : 'Cache navigateur'}
                  </div>
                </div>
              </div>
              <span className="px-2 py-1 rounded-lg bg-white/5 border border-neutral-800 font-mono text-[11px] font-bold text-neutral-200 shrink-0">
                {fb.recordsCount} j.
              </span>
            </div>

            {/* 3. Realtime Listener */}
            <div className="rounded-2xl border border-neutral-800 bg-[#0d121c] p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    fb.realtimeListener === 'connected'
                      ? 'bg-[#10b981]/15 border-[#10b981]/35 text-[#10b981]'
                      : fb.realtimeListener === 'error'
                      ? 'bg-[#ef4444]/15 border-[#ef4444]/35 text-[#ef4444]'
                      : 'bg-[#facc15]/15 border-[#facc15]/35 text-[#facc15]'
                  }`}
                >
                  <Radio className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-neutral-400 font-medium">Temps réel (Blocage)</div>
                  <div className="text-xs font-bold text-white truncate">
                    {fb.realtimeListener === 'connected'
                      ? 'Écoute active'
                      : fb.realtimeListener === 'connecting'
                      ? 'Connexion...'
                      : fb.realtimeListener === 'error'
                      ? 'Canal interrompu'
                      : 'Inactif'}
                  </div>
                </div>
              </div>
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  fb.realtimeListener === 'connected'
                    ? 'bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                    : fb.realtimeListener === 'error'
                    ? 'bg-[#ef4444]'
                    : 'bg-[#facc15] animate-pulse'
                }`}
              />
            </div>

            {/* 4. Google Firebase Auth */}
            <div className="rounded-2xl border border-neutral-800 bg-[#0d121c] p-3.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    fb.authState === 'authenticated'
                      ? 'bg-[#10b981]/15 border-[#10b981]/35 text-[#10b981]'
                      : 'bg-[#facc15]/15 border-[#facc15]/35 text-[#facc15]'
                  }`}
                >
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-neutral-400 font-medium">Auth Google Firebase</div>
                  <div className="text-xs font-bold text-white truncate">
                    {fb.authState === 'authenticated'
                      ? 'Compte Google autorisé'
                      : fb.authState === 'unverified'
                      ? 'Email non vérifié'
                      : 'Non connecté'}
                  </div>
                </div>
              </div>
              {fb.authState === 'authenticated' ? (
                <button
                  type="button"
                  onClick={handleGoogleSignOut}
                  disabled={authBusy}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[11px] font-bold text-neutral-300 transition-colors shrink-0 disabled:opacity-50"
                  title="Déconnecter le compte Google Firebase"
                >
                  <LogOut className="h-3 w-3" />
                  <span>Quitter</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={authBusy}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#facc15]/40 bg-[#facc15]/15 hover:bg-[#facc15]/25 text-[11px] font-bold text-[#facc15] transition-colors shrink-0 disabled:opacity-50"
                >
                  <LogIn className="h-3 w-3" />
                  <span>{authBusy ? '...' : 'Google'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Blocked Client Advice Banner (when ERR_BLOCKED_BY_CLIENT happens) */}
          {fb.connection === 'blocked' && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Canal Firestore bloqué côté navigateur (ERR_BLOCKED_BY_CLIENT)</span>
              </div>
              <p className="text-[11px] text-neutral-200 leading-relaxed">
                Un bloqueur de publicités ou bouclier de confidentialité (Brave Shields, uBlock Origin, AdGuard) bloque les requêtes vers{' '}
                <code className="text-amber-300 font-mono">firestore.googleapis.com</code>. Le site utilise temporairement le cache navigateur en attendant le déblocage.
              </p>
            </div>
          )}

          {/* Fallback Reason & Timestamps */}
          <div className="rounded-2xl border border-neutral-800 bg-[#0d121c] p-3.5 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center justify-between gap-2 rounded-xl bg-black/30 px-3 py-2 border border-neutral-800/70">
                <span className="flex items-center gap-1.5 text-neutral-400">
                  <Clock className="h-3.5 w-3.5 text-neutral-500" />
                  Dernière lecture :
                </span>
                <span className="font-mono font-semibold text-neutral-200">
                  {formatJsonBinTimestamp(fb.lastReadAt)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-xl bg-black/30 px-3 py-2 border border-neutral-800/70">
                <span className="flex items-center gap-1.5 text-neutral-400">
                  <UploadCloud className="h-3.5 w-3.5 text-neutral-500" />
                  Dernier envoi :
                </span>
                <span className="font-mono font-semibold text-neutral-200">
                  {formatJsonBinTimestamp(fb.lastWriteAt)}
                </span>
              </div>
            </div>

            {fb.lastFallbackReason && fb.activeReadSource !== 'firebase' && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                <strong>Motif du repli :</strong> {fb.lastFallbackReason}
              </div>
            )}

            {/* Quick Sync Actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-xs font-bold text-neutral-200 transition-colors disabled:opacity-50"
              >
                <Server className={`h-3.5 w-3.5 ${testing ? 'animate-pulse text-[#facc15]' : ''}`} />
                <span>{testing ? 'Test...' : 'Tester Firestore'}</span>
              </button>

              <button
                type="button"
                onClick={handlePush}
                disabled={pushing}
                className="flex-1 min-w-[150px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#facc15]/40 bg-[#facc15]/15 hover:bg-[#facc15]/25 text-xs font-bold text-[#facc15] transition-colors disabled:opacity-50"
              >
                <UploadCloud className={`h-3.5 w-3.5 ${pushing ? 'animate-bounce' : ''}`} />
                <span>{pushing ? 'Envoi...' : 'Pousser → Firebase'}</span>
              </button>

              <button
                type="button"
                onClick={handleReconcile}
                disabled={reconciling}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#10b981]/40 bg-[#10b981]/15 hover:bg-[#10b981]/25 text-xs font-bold text-[#10b981] transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${reconciling ? 'animate-spin' : ''}`} />
                <span>{reconciling ? 'Synchro...' : 'Recharger Cloud'}</span>
              </button>
            </div>
          </div>

          {/* Reported Issues Log */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-white">
                  Problèmes reportés ({diag.issues.length})
                </h3>
                <p className="text-[11px] text-neutral-400">
                  Journal automatique des erreurs Firebase, JSONBin et ressources locales
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyDiagnosticReport}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-[11px] font-bold text-neutral-300 transition-colors"
                >
                  {copiedReport ? (
                    <Check className="h-3.5 w-3.5 text-[#10b981]" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedReport ? 'Copié' : 'Copier'}</span>
                </button>
                {diag.issues.length > 0 && (
                  <button
                    type="button"
                    onClick={() => clearSyncIssues()}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-[#ef4444]/15 hover:border-[#ef4444]/40 text-[11px] font-bold text-neutral-300 hover:text-[#ef4444] transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Vider</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `Tous (${diag.issues.length})` },
                  {
                    id: 'active',
                    label: `Actifs (${diag.issues.filter((i) => !i.resolved).length})`,
                  },
                  {
                    id: 'errors',
                    label: `Erreurs (${diag.issues.filter((i) => i.severity === 'error').length})`,
                  },
                  {
                    id: 'warnings',
                    label: `Alertes (${diag.issues.filter((i) => i.severity === 'warning').length})`,
                  },
                ] as { id: IssueFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setIssueFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-colors ${
                    issueFilter === tab.id
                      ? 'border-[#facc15]/50 bg-[#facc15]/15 text-[#facc15]'
                      : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {filteredIssues.length === 0 ? (
              <div className="rounded-2xl border border-[#10b981]/25 bg-[#10b981]/5 p-5 text-center space-y-1.5">
                <CheckCircle2 className="h-6 w-6 text-[#10b981] mx-auto" />
                <div className="text-xs font-bold text-white">Aucun problème reporté</div>
                <p className="text-[11px] text-neutral-400">
                  La synchronisation principale Firebase fonctionne normalement (archive JSONBin préservée).
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">{filteredIssues.map(renderIssueCard)}</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800/80 px-5 sm:px-6 py-3.5 bg-[#0d111a]">
          <div className="flex flex-wrap items-center gap-2">
            {onOpenNetworkModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNetworkModal();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-xs font-bold text-neutral-200 transition-colors"
              >
                <Database className="h-3.5 w-3.5 text-[#facc15]" />
                <span>JSONBin</span>
              </button>
            )}
            {onOpenFirebaseSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFirebaseSettings();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-xs font-bold text-neutral-200 transition-colors"
              >
                <Flame className="h-3.5 w-3.5 text-amber-400" />
                <span>Explorateur Firebase</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-black transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
