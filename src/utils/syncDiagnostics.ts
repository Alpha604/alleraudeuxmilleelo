/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized Synchronization Diagnostics & Error Console Engine
 * - Tracks live Firebase Firestore health & primary active state
 * - Captures runtime JS errors, unhandled rejections, console.error/warn,
 *   failed network/API fetches, and Firestore/Sync diagnostics
 * - Persists logs in a bounded local ring-buffer for the Admin Error Console
 */

export type DiagnosticSource = 'firebase' | 'jsonbin' | 'network' | 'chess' | 'system';
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type ConsoleLogLevel = 'error' | 'warn' | 'info';
export type ConsoleLogSource =
  | 'runtime'
  | 'promise'
  | 'console'
  | 'network'
  | 'api'
  | 'firebase'
  | 'sync';

export interface ConsoleLogEntry {
  id: string;
  fingerprint: string;
  level: ConsoleLogLevel;
  source: ConsoleLogSource;
  title: string;
  message: string;
  stack?: string;
  url?: string;
  statusCode?: number;
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
  resolved: boolean;
}

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
const CONSOLE_LOGS_STORAGE_KEY = 'roadto2000_error_console_v1';
const MAX_ISSUES = 35;
const MAX_CONSOLE_LOGS = 120;

let globalCaptureInstalled = false;
let consoleCapturePaused = false;
let isRecordingInternal = false;

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

let consoleLogs: ConsoleLogEntry[] = loadStoredConsoleLogs();

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

function loadStoredConsoleLogs(): ConsoleLogEntry[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(CONSOLE_LOGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, MAX_CONSOLE_LOGS);
        }
      }
    }
  } catch {}
  return [];
}

function saveStoredConsoleLogs(entries: ConsoleLogEntry[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        CONSOLE_LOGS_STORAGE_KEY,
        JSON.stringify(entries.slice(0, MAX_CONSOLE_LOGS))
      );
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

function emitConsoleLogsUpdated(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<ConsoleLogEntry[]>('roadto2000:error-console-updated', {
          detail: getConsoleLogs(),
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

export function getConsoleLogs(): ConsoleLogEntry[] {
  return consoleLogs.map((entry) => ({ ...entry }));
}

export function getUnresolvedConsoleErrorsCount(): number {
  return consoleLogs.filter((entry) => !entry.resolved && entry.level === 'error').length;
}

export function isConsoleCapturePaused(): boolean {
  return consoleCapturePaused;
}

export function setConsoleCapturePaused(paused: boolean): void {
  consoleCapturePaused = paused;
  emitConsoleLogsUpdated();
}

export function pushConsoleLog(params: {
  level: ConsoleLogLevel;
  source: ConsoleLogSource;
  title: string;
  message: string;
  stack?: string;
  url?: string;
  statusCode?: number;
  fingerprint?: string;
}): ConsoleLogEntry | null {
  if (consoleCapturePaused || isRecordingInternal) return null;
  isRecordingInternal = true;
  try {
    const now = Date.now();
    const cleanTitle = (params.title || 'Événement').trim().slice(0, 140);
    const cleanMessage = (params.message || '').trim().slice(0, 1400);
    const fp = (
      params.fingerprint ||
      `${params.level}|${params.source}|${cleanTitle}|${cleanMessage.slice(0, 180)}|${params.url || ''}`
    ).slice(0, 240);

    const existingIdx = consoleLogs.findIndex(
      (item) => item.fingerprint === fp && !item.resolved
    );

    let saved: ConsoleLogEntry;
    if (existingIdx !== -1) {
      const existing = consoleLogs[existingIdx];
      saved = {
        ...existing,
        lastSeenAt: now,
        count: existing.count + 1,
        stack: params.stack || existing.stack,
        url: params.url || existing.url,
        statusCode: params.statusCode ?? existing.statusCode,
      };
      consoleLogs = [saved, ...consoleLogs.filter((_, idx) => idx !== existingIdx)].slice(
        0,
        MAX_CONSOLE_LOGS
      );
    } else {
      saved = {
        id: `log_${now}_${Math.random().toString(36).slice(2, 7)}`,
        fingerprint: fp,
        level: params.level,
        source: params.source,
        title: cleanTitle,
        message: cleanMessage || cleanTitle,
        ...(params.stack ? { stack: params.stack.slice(0, 2400) } : {}),
        ...(params.url ? { url: params.url.slice(0, 400) } : {}),
        ...(typeof params.statusCode === 'number' ? { statusCode: params.statusCode } : {}),
        firstSeenAt: now,
        lastSeenAt: now,
        count: 1,
        resolved: false,
      };
      consoleLogs = [saved, ...consoleLogs].slice(0, MAX_CONSOLE_LOGS);
    }

    saveStoredConsoleLogs(consoleLogs);
    emitConsoleLogsUpdated();
    return saved;
  } finally {
    isRecordingInternal = false;
  }
}

export function resolveConsoleLog(id: string): void {
  let changed = false;
  consoleLogs = consoleLogs.map((entry) => {
    if (entry.id === id && !entry.resolved) {
      changed = true;
      return { ...entry, resolved: true };
    }
    return entry;
  });
  if (changed) {
    saveStoredConsoleLogs(consoleLogs);
    emitConsoleLogsUpdated();
  }
}

export function resolveAllConsoleLogs(): void {
  let changed = false;
  consoleLogs = consoleLogs.map((entry) => {
    if (!entry.resolved) {
      changed = true;
      return { ...entry, resolved: true };
    }
    return entry;
  });
  if (changed) {
    saveStoredConsoleLogs(consoleLogs);
    emitConsoleLogsUpdated();
  }
}

export function clearConsoleLogs(): void {
  consoleLogs = [];
  saveStoredConsoleLogs([]);
  emitConsoleLogsUpdated();
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

  // Mirror warning/error sync issues directly into the unified Error Console
  if (params.severity === 'error' || params.severity === 'warning') {
    pushConsoleLog({
      level: params.severity === 'error' ? 'error' : 'warn',
      source: params.source === 'firebase' ? 'firebase' : params.source === 'network' ? 'network' : 'sync',
      title: params.title,
      message: params.technicalDetail
        ? `${params.message} (${params.technicalDetail})`
        : params.message,
      fingerprint: `diag|${cleanKey}`,
    });
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
    const isTerminateBeacon = lower.includes('type=terminate') || lower.includes('write/channel');
    return {
      key: 'firebase_blocked_by_client',
      severity: 'warning',
      title: isTerminateBeacon
        ? 'Fermeture du canal Firestore bloquée par le navigateur (ERR_BLOCKED_BY_CLIENT)'
        : 'Canal Firebase bloqué par le navigateur ou une extension',
      message: isTerminateBeacon
        ? 'Votre navigateur ou un bloqueur (uBlock, AdGuard, Brave Shields) a bloqué la requête de fermeture WebChannel (Write/channel). Vos données enregistrées restent intactes dans Firebase et le cache local.'
        : 'Le navigateur (ou un bloqueur type uBlock, AdGuard, Brave Shields) a interrompu le canal Firestore temps réel. Le cache local assure la continuité.',
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
      suggestion: 'Vérifiez votre connexion Internet ; le cache local conserve vos relevés en attendant Firebase.',
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
        'Vérifiez que ce domaine est bien ajouté dans Firebase → Authentication → Domaines autorisés.',
      isBlockedClient: false,
    };
  }

  return {
    key: 'firebase_generic_error',
    severity: 'error',
    title: 'Erreur de synchronisation Firebase',
    message: rawMessage.slice(0, 180) || 'Erreur inconnue Firestore.',
    suggestion: 'Consultez les détails techniques ci-dessous ou dans la Console Erreurs.',
    isBlockedClient: false,
  };
}

function stringifyConsoleArgs(args: unknown[]): { text: string; stack?: string } {
  let stack: string | undefined;
  const parts = args.map((arg) => {
    if (arg instanceof Error) {
      if (!stack && arg.stack) stack = arg.stack;
      return `${arg.name}: ${arg.message}`;
    }
    if (typeof arg === 'string') return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  });
  return {
    text: parts.join(' ').trim(),
    stack,
  };
}

function classifyConsoleMessageSource(text: string): ConsoleLogSource {
  const lower = text.toLowerCase();
  if (
    lower.includes('firestore') ||
    lower.includes('firebase') ||
    lower.includes('write/channel') ||
    lower.includes('listen/channel') ||
    lower.includes('err_blocked_by_client')
  ) {
    return 'firebase';
  }
  if (lower.includes('/api/')) return 'api';
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('net::err_') ||
    lower.includes('chess.com')
  ) {
    return 'network';
  }
  return 'console';
}

/**
 * Installs lightweight global browser listeners to automatically detect and report:
 * - Uncaught JS runtime errors & broken local asset loads
 * - Unhandled promise rejections (all + Firestore channel issues)
 * - console.error & console.warn stream (forwarded to Error Console)
 * - Failed fetch/network calls (status >= 500 or blocked external channels)
 */
export function installGlobalSyncDiagnosticsCapture(): void {
  if (globalCaptureInstalled || typeof window === 'undefined') return;
  globalCaptureInstalled = true;

  // 1. Window error listener (JS exceptions + resource 404s)
  window.addEventListener(
    'error',
    (event: Event) => {
      if (event instanceof ErrorEvent) {
        const msg = event.message || 'Erreur JavaScript non interceptée';
        const location = event.filename
          ? `${event.filename.split('/').pop() || event.filename}:${event.lineno}:${event.colno}`
          : undefined;
        pushConsoleLog({
          level: 'error',
          source: 'runtime',
          title: msg.slice(0, 120),
          message: location ? `${msg} (${location})` : msg,
          stack: event.error instanceof Error ? event.error.stack : undefined,
          url: event.filename || undefined,
        });
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && target !== (window as unknown as HTMLElement)) {
        const tag = (target.tagName || '').toUpperCase();
        const src =
          (target as HTMLImageElement).src ||
          (target as HTMLScriptElement).src ||
          (target as HTMLLinkElement).href ||
          '';
        if ((tag === 'IMG' || tag === 'SCRIPT' || tag === 'LINK') && src) {
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

  // 2. Unhandled Promise Rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
        ? reason
        : (() => {
            try {
              return JSON.stringify(reason);
            } catch {
              return String(reason || '');
            }
          })();
    if (!msg) return;

    const lower = msg.toLowerCase();
    const isFirebaseRelated =
      lower.includes('firestore') ||
      lower.includes('firebase') ||
      lower.includes('err_blocked_by_client') ||
      lower.includes('write/channel') ||
      lower.includes('listen/channel');

    if (isFirebaseRelated) {
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
    } else {
      pushConsoleLog({
        level: 'error',
        source: 'promise',
        title: 'Promesse rejetée non gérée',
        message: msg,
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    }
  });

  // 3. Intercept console.error & console.warn non-destructively
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    origError(...args);
    const { text, stack } = stringifyConsoleArgs(args);
    if (!text) return;
    // Ignore React/Vite HMR WebSocket disconnect noise in dev iframes
    const lower = text.toLowerCase();
    if (lower.includes('websocket') && lower.includes('vite')) return;
    const src = classifyConsoleMessageSource(text);
    pushConsoleLog({
      level: 'error',
      source: src,
      title:
        src === 'firebase'
          ? 'Erreur Firebase / Firestore'
          : src === 'api'
          ? 'Erreur API serveur'
          : 'console.error',
      message: text,
      stack,
    });
  };

  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    const { text, stack } = stringifyConsoleArgs(args);
    if (!text) return;
    const lower = text.toLowerCase();
    if (lower.includes('websocket') && lower.includes('vite')) return;
    const src = classifyConsoleMessageSource(text);
    pushConsoleLog({
      level: 'warn',
      source: src,
      title: src === 'firebase' ? 'Alerte Firebase / Firestore' : 'console.warn',
      message: text,
      stack,
    });
  };

  // 4. Observe failed HTTP 5xx and blocked network requests via fetch wrapper
  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const rawUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.toString()
          : input?.url || '';
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

      try {
        const res = await origFetch(input, init);
        // Log unexpected HTTP 5xx server errors (ignore expected /api/* 404 probes on static hosts)
        if (res.status >= 500) {
          pushConsoleLog({
            level: 'error',
            source: rawUrl.includes('/api/') ? 'api' : 'network',
            title: `HTTP ${res.status} (${method})`,
            message: `Réponse serveur ${res.status} ${res.statusText || ''} sur ${rawUrl}`,
            url: rawUrl,
            statusCode: res.status,
          });
        }
        return res;
      } catch (err: any) {
        const errName = err?.name || '';
        const errMsg = err instanceof Error ? err.message : String(err || 'Erreur réseau');
        // Do not alarm on intentional AbortController timeouts or internal HMR pings
        if (errName !== 'AbortError' && !rawUrl.includes('/@vite/')) {
          const isFirestoreUrl = rawUrl.includes('firestore.googleapis.com');
          pushConsoleLog({
            level: isFirestoreUrl ? 'warn' : 'error',
            source: isFirestoreUrl ? 'firebase' : rawUrl.includes('/api/') ? 'api' : 'network',
            title: isFirestoreUrl
              ? 'Requête Firestore interrompue / bloquée'
              : `Échec réseau (${method})`,
            message: `${errMsg} — ${rawUrl}`,
            url: rawUrl,
            stack: err instanceof Error ? err.stack : undefined,
          });
        }
        throw err;
      }
    };
  }
}
