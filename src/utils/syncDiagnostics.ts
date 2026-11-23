/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized Synchronization Diagnostics & Problem Reporter
 * Tracks live Firebase Firestore health, fallback usage (JSONBin / local),
 * real-time siteActivity listener state, and captures reported runtime issues
 * with deduplication and human-readable French troubleshooting hints.
 */

export type DiagnosticSource = 'firebase' | 'jsonbin' | 'network' | 'chess' | 'system';
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface SyncDiagnosticIssue {
  id: string;
  key: string;
  source: DiagnosticSource;
  severity: DiagnosticSeverity;
  title: string;
  message: string;
  technicalDetail?: string;
  suggestion?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
  resolved: boolean;
}

export interface FirebaseLiveState {
  connection: 'checking' | 'online' | 'offline' | 'blocked';
  authState: 'authenticated' | 'unauthenticated' | 'unverified';
  authEmail: string | null;
  activeReadSource: 'firebase' | 'jsonbin' | 'local';
  lastReadAt: number | null;
  lastWriteAt: number | null;
  recordsCount: number;
  latencyMs: number | null;
  realtimeListener: 'connected' | 'connecting' | 'error' | 'inactive';
  lastRealtimeEventAt: number | null;
  lastFallbackReason: string | null;
  lastError: string | null;
}

export interface SyncDiagnosticsSnapshot {
  firebase: FirebaseLiveState;
  issues: SyncDiagnosticIssue[];
}

const ISSUES_STORAGE_KEY = 'roadto2000_sync_diagnostic_issues_v1';
const MAX_ISSUES = 35;

let globalCaptureInstalled = false;

const snapshot: SyncDiagnosticsSnapshot = {
  firebase: {
    connection: 'checking',
    authState: 'unauthenticated',
    authEmail: null,
    activeReadSource: 'firebase',
    lastReadAt: null,
    lastWriteAt: null,
    recordsCount: 0,
    latencyMs: null,
    realtimeListener: 'connecting',
    lastRealtimeEventAt: null,
    lastFallbackReason: null,
    lastError: null,
  },
  issues: loadStoredIssues(),
};

function loadStoredIssues(): SyncDiagnosticIssue[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(ISSUES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, MAX_ISSUES);
        }
      }
    }
  } catch {}
  return [];
}

function saveStoredIssues(issues: SyncDiagnosticIssue[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(ISSUES_STORAGE_KEY, JSON.stringify(issues.slice(0, MAX_ISSUES)));
    }
  } catch {}
}

function emitDiagnosticsUpdated(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<SyncDiagnosticsSnapshot>('roadto2000:sync-diagnostics-updated', {
          detail: getSyncDiagnosticsSnapshot(),
        })
      );
    }
  } catch {}
}

export function getSyncDiagnosticsSnapshot(): SyncDiagnosticsSnapshot {
  return {
    firebase: { ...snapshot.firebase },
    issues: snapshot.issues.map((i) => ({ ...i })),
  };
}

export function updateFirebaseDiagnostics(patch: Partial<FirebaseLiveState>): void {
  snapshot.firebase = {
    ...snapshot.firebase,
    ...patch,
  };
  emitDiagnosticsUpdated();
}

export function reportSyncIssue(params: {
  key: string;
  source: DiagnosticSource;
  severity: DiagnosticSeverity;
  title: string;
  message: string;
  technicalDetail?: string;
  suggestion?: string;
}): SyncDiagnosticIssue {
  const now = Date.now();
  const cleanKey = params.key.slice(0, 100);
  const existingIdx = snapshot.issues.findIndex((item) => item.key === cleanKey && !item.resolved);

  let saved: SyncDiagnosticIssue;

  if (existingIdx !== -1) {
    const existing = snapshot.issues[existingIdx];
    saved = {
      ...existing,
      severity: params.severity,
      title: params.title,
      message: params.message,
      technicalDetail: params.technicalDetail ?? existing.technicalDetail,
      suggestion: params.suggestion ?? existing.suggestion,
      lastSeenAt: now,
      count: existing.count + 1,
    };
    const nextList = [saved, ...snapshot.issues.filter((_, idx) => idx !== existingIdx)];
    snapshot.issues = nextList.slice(0, MAX_ISSUES);
  } else {
    saved = {
      id: `diag_${now}_${Math.random().toString(36).slice(2, 7)}`,
      key: cleanKey,
      source: params.source,
      severity: params.severity,
      title: params.title,
      message: params.message,
      technicalDetail: params.technicalDetail,
      suggestion: params.suggestion,
      firstSeenAt: now,
      lastSeenAt: now,
      count: 1,
      resolved: false,
    };
    snapshot.issues = [saved, ...snapshot.issues].slice(0, MAX_ISSUES);
  }

  if (params.source === 'firebase' && params.severity === 'error') {
    snapshot.firebase.lastError = params.title;
  }

  saveStoredIssues(snapshot.issues);
  emitDiagnosticsUpdated();
  return saved;
}

export function resolveSyncIssuesByKeyPrefix(prefix: string): void {
  let changed = false;
  snapshot.issues = snapshot.issues.map((item) => {
    if (!item.resolved && item.key.startsWith(prefix)) {
      changed = true;
      return { ...item, resolved: true };
    }
    return item;
  });
  if (changed) {
    saveStoredIssues(snapshot.issues);
    emitDiagnosticsUpdated();
  }
}

export function clearSyncIssues(): void {
  snapshot.issues = [];
  snapshot.firebase.lastError = null;
  saveStoredIssues([]);
  emitDiagnosticsUpdated();
}

export function getUnresolvedIssuesCount(): number {
  return snapshot.issues.filter((i) => !i.resolved && i.severity !== 'info').length;
}

export type FirebaseIndicatorStatus =
  | 'synced'
  | 'syncing'
  | 'fallback'
  | 'auth_required'
  | 'blocked'
  | 'offline'
  | 'error';

export function deriveFirebaseIndicatorStatus(
  snap: SyncDiagnosticsSnapshot,
  isSyncingMirror = false
): FirebaseIndicatorStatus {
  const { firebase } = snap;
  if (firebase.connection === 'blocked') return 'blocked';
  if (firebase.connection === 'offline') return 'offline';
  if (isSyncingMirror) return 'syncing';
  if (firebase.lastError && firebase.activeReadSource !== 'firebase') return 'error';
  if (firebase.authState !== 'authenticated') {
    return firebase.activeReadSource === 'jsonbin' ? 'fallback' : 'auth_required';
  }
  if (firebase.activeReadSource === 'jsonbin') return 'fallback';
  return 'synced';
}

export function interpretFirebaseError(rawMessage: string): {
  key: string;
  severity: DiagnosticSeverity;
  title: string;
  message: string;
  suggestion: string;
  isBlockedClient: boolean;
} {
  const lower = (rawMessage || '').toLowerCase();

  if (
    lower.includes('err_blocked_by_client') ||
    lower.includes('blocked by client') ||
    lower.includes('write/channel') ||
    lower.includes('listen/channel')
  ) {
    return {
      key: 'firebase_blocked_by_client',
      severity: 'warning',
      title: 'Canal Firebase bloqué par le navigateur ou une extension',
      message:
        'Le navigateur (ou un bloqueur type uBlock, AdGuard, Brave Shields) a interrompu le canal Firestore temps réel. Le repli JSONBin assure la continuité.',
      suggestion:
        'Autorisez « firestore.googleapis.com » dans votre bloqueur de contenu ou Brave Shields, puis rechargez la page.',
      isBlockedClient: true,
    };
  }

  if (lower.includes('client is offline') || lower.includes('offline')) {
    return {
      key: 'firebase_offline',
      severity: 'warning',
      title: 'Firestore hors ligne',
      message: 'Impossible de joindre les serveurs Google Firestore pour le moment.',
      suggestion: 'Vérifiez votre connexion Internet ; le site utilise JSONBin ou le cache local en attendant.',
      isBlockedClient: false,
    };
  }

  if (lower.includes('permission-denied') || lower.includes('missing or insufficient permissions')) {
    return {
      key: 'firebase_permission_denied',
      severity: 'error',
      title: 'Permission Firestore refusée',
      message: 'Les règles Firestore ont refusé l’opération (compte Google non autorisé ou session expirée).',
      suggestion: 'Connectez-vous avec votre compte Google autorisé dans Paramètres → Paramètre Firebase.',
      isBlockedClient: false,
    };
  }

  if (lower.includes('unauthorized-domain') || lower.includes('auth/')) {
    return {
      key: 'firebase_auth_domain',
      severity: 'error',
      title: 'Erreur d’authentification Firebase',
      message: 'La connexion Google Firebase a rencontré un problème de domaine ou de jeton.',
      suggestion:
        'Vérifiez que ce domaine (ex. alleraudeuxmilleelo-5g11.vercel.app) est bien ajouté dans Firebase → Authentication → Domaines autorisés.',
      isBlockedClient: false,
    };
  }

  return {
    key: 'firebase_generic_error',
    severity: 'error',
    title: 'Erreur de synchronisation Firebase',
    message: rawMessage.slice(0, 180) || 'Erreur inconnue Firestore.',
    suggestion: 'Consultez les détails techniques ci-dessous. Le repli JSONBin reste actif.',
    isBlockedClient: false,
  };
}

/**
 * Installs lightweight global browser listeners to automatically detect and report
 * broken asset loads (like missing images) or blocked Firestore network channels.
 */
export function installGlobalSyncDiagnosticsCapture(): void {
  if (globalCaptureInstalled || typeof window === 'undefined') return;
  globalCaptureInstalled = true;

  window.addEventListener(
    'error',
    (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target && target !== (window as unknown as HTMLElement)) {
        const tag = (target.tagName || '').toUpperCase();
        const src =
          (target as HTMLImageElement).src ||
          (target as HTMLScriptElement).src ||
          (target as HTMLLinkElement).href ||
          '';
        if ((tag === 'IMG' || tag === 'SCRIPT' || tag === 'LINK') && src) {
          // Skip external avatars that may be blocked by user privacy settings unless internal asset
          if (src.includes(window.location.origin) || !src.startsWith('http')) {
            reportSyncIssue({
              key: `asset_load_${src.split('/').pop() || 'resource'}`,
              source: 'system',
              severity: 'warning',
              title: 'Ressource locale introuvable (404)',
              message: `Impossible de charger le fichier : ${src.split('/').pop() || src}`,
              technicalDetail: src,
              suggestion: 'Vérifiez que la ressource est bien incluse dans le build de production.',
            });
          }
        }
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
    if (!msg) return;

    const lower = msg.toLowerCase();
    if (
      lower.includes('firestore') ||
      lower.includes('err_blocked_by_client') ||
      lower.includes('write/channel') ||
      lower.includes('listen/channel')
    ) {
      const parsed = interpretFirebaseError(msg);
      if (parsed.isBlockedClient) {
        updateFirebaseDiagnostics({ connection: 'blocked', lastError: parsed.title });
      }
      reportSyncIssue({
        key: parsed.key,
        source: 'firebase',
        severity: parsed.severity,
        title: parsed.title,
        message: parsed.message,
        technicalDetail: msg.slice(0, 260),
        suggestion: parsed.suggestion,
      });
    }
  });
}
