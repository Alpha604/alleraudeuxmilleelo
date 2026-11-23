/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppSettings, SyncRecord } from '../types/chess';
import {
  getStoredSettings,
  getStoredSyncHistory,
  mergeSyncHistories,
  normalizeParisDayKey,
  OFFICIAL_DAILY_RECORDS,
  saveStoredSettings,
  saveStoredSyncHistory,
} from './storage';
import { fetchPlayerDataFromFirestore, mirrorDataToFirestore } from './firebaseMirror';
import { safeApiFetch } from './backendApi';
import {
  reportSyncIssue,
  resolveSyncIssuesByKeyPrefix,
  updateFirebaseDiagnostics,
} from './syncDiagnostics';

/**
 * Cloud Sync Utility (Dual-Mode: Express Server + Vercel Direct Client-Side JSONBin):
 * Synchronizes sync history and settings between PC, Smartphone, and Tablet
 * with per-account Bin isolation, Merge-Before-PUT protection against data loss,
 * and real-time last-updated timestamp reporting.
 */

const DEFAULT_BIN_ID = '6af3559affd5d16053b75b82';
const DEFAULT_API_KEY = '$2a$10$nOO6WNU996CcWwBht/K8MuDshQsOPktO28uEy.WTBESmEHAsRjcZy';

const STORAGE_KEYS = {
  binId: 'roadto2000_jsonbin_binid',
  apiKey: 'roadto2000_jsonbin_apikey',
  enabled: 'roadto2000_jsonbin_enabled',
  metricsPrefix: 'roadto2000_jsonbin_metrics_v3_',
  lastPullPrefix: 'roadto2000_jsonbin_lastpull_',
};

export interface JsonBinUpdateEventDetail {
  username: string;
  lastSyncTime: number | null;
  remoteUpdatedAt?: string | null;
  lastStatus: 'synced' | 'pending_keys' | 'error' | 'syncing';
  lastError?: string | null;
  pushed?: boolean;
  skipped?: boolean;
  confirmedDayHashes?: Record<string, string>;
}

export function computeRecordVerificationHash(
  r: Partial<SyncRecord> | null | undefined,
  username = 'alpharomeo1500'
): string {
  const clean = (username || 'alpharomeo1500').trim().toLowerCase();
  const dayKey = (r?.timestamp ? normalizeParisDayKey(r.timestamp) : null) || '';
  return `${clean}|${dayKey}|${r?.bullet ?? ''}|${r?.blitz ?? ''}|${r?.rapid ?? ''}|${r?.puzzles ?? ''}|${r?.bestRating ?? ''}|${r?.bestMode ?? ''}`;
}

export function buildConfirmedDayHashes(records: any[], username = 'alpharomeo1500'): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(records)) return map;
  for (const r of records) {
    if (!r || !r.timestamp) continue;
    const dayKey = normalizeParisDayKey(r.timestamp);
    if (!dayKey) continue;
    map[dayKey] = computeRecordVerificationHash(r, username);
  }
  return map;
}

export function formatJsonBinTimestamp(ts: number | string | null | undefined): string {
  if (!ts) return 'Jamais synchronisé';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (isNaN(d.getTime())) return 'Date invalide';
  try {
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return d.toLocaleString('fr-FR');
  }
}

export function formatJsonBinShortTime(ts: number | string | null | undefined): string {
  if (!ts) return 'Non sync';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (isNaN(d.getTime())) return 'Non sync';
  try {
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
}

function emitJsonBinUpdate(detail: JsonBinUpdateEventDetail): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<JsonBinUpdateEventDetail>('roadto2000:jsonbin-updated', { detail }));
    }
  } catch {}
}

export function getClientJsonBinCredentials(username?: string): { binId: string; apiKey: string; enabled: boolean } {
  const cleanUser = username ? username.trim().toLowerCase() : '';
  const isAlpha = cleanUser === 'alpharomeo1500';

  const userBinKey = cleanUser ? `roadto2000_jsonbin_binid_${cleanUser}` : STORAGE_KEYS.binId;
  const userKeyKey = cleanUser ? `roadto2000_jsonbin_apikey_${cleanUser}` : STORAGE_KEYS.apiKey;
  const userEnabledKey = cleanUser ? `roadto2000_jsonbin_enabled_${cleanUser}` : STORAGE_KEYS.enabled;

  // Default to official bin only for AlphaRoméo; other accounts start with their own private configuration
  let binId = isAlpha ? DEFAULT_BIN_ID : '';
  let storedApiKey = '';
  let enabled = true;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedBin =
        window.localStorage.getItem(userBinKey) || (isAlpha ? window.localStorage.getItem(STORAGE_KEYS.binId) : null);
      const storedKey =
        window.localStorage.getItem(userKeyKey) || (isAlpha ? window.localStorage.getItem(STORAGE_KEYS.apiKey) : null);
      const storedEnabled = window.localStorage.getItem(userEnabledKey);
      if (storedBin && storedBin.trim()) binId = storedBin.trim();
      if (storedKey && storedKey.trim()) storedApiKey = storedKey.trim();
      if (storedEnabled !== null) enabled = storedEnabled === 'true';
    }
  } catch {}

  const apiKey = storedApiKey || (binId ? DEFAULT_API_KEY : '');

  return { binId, apiKey, enabled };
}

interface LocalMetrics {
  requestsToday: number;
  savedRequests: number;
  lastDayTracked: string;
  lastSyncTime: number | null;
  remoteUpdatedAt?: string | null;
  lastSignature?: string;
  confirmedDayHashes?: Record<string, string>;
  lastSkippedReason?: string | null;
  lastStatus: 'synced' | 'pending_keys' | 'error' | 'syncing';
  lastError?: string | null;
}

function getMetricsStorageKey(username?: string): string {
  const clean = (username || 'alpharomeo1500').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `${STORAGE_KEYS.metricsPrefix}${clean}`;
}

export function getLocalMetrics(username?: string): LocalMetrics {
  const today = new Date().toISOString().split('T')[0];
  const creds = getClientJsonBinCredentials(username);
  const defaults: LocalMetrics = {
    requestsToday: 0,
    savedRequests: 0,
    lastDayTracked: today,
    lastSyncTime: null,
    remoteUpdatedAt: null,
    lastStatus: creds.binId ? 'synced' : 'pending_keys',
    lastError: null,
  };

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(getMetricsStorageKey(username));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.lastDayTracked !== today) {
          parsed.requestsToday = 0;
          parsed.lastDayTracked = today;
        }
        return { ...defaults, ...parsed };
      }
    }
  } catch {}

  return defaults;
}

function saveLocalMetrics(username: string, patch: Partial<LocalMetrics>): LocalMetrics {
  const cleanUser = (username || 'alpharomeo1500').trim().toLowerCase();
  const current = getLocalMetrics(cleanUser);
  const updated = { ...current, ...patch };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(getMetricsStorageKey(cleanUser), JSON.stringify(updated));
    }
  } catch {}
  return updated;
}

export interface JsonBinStatusInfo {
  configured: boolean;
  binId: string | null;
  hasApiKey: boolean;
  enabled: boolean;
  lastSyncTime: number | null;
  remoteUpdatedAt?: string | null;
  lastStatus: 'synced' | 'pending_keys' | 'error' | 'syncing';
  lastError: string | null;
  confirmedDayHashes?: Record<string, string>;
  quotaInfo?: {
    requestsToday: number;
    savedRequests: number;
    quotaSaverActive: boolean;
    lastSkippedReason: string | null;
    minThrottleSeconds?: number;
  };
  template?: any;
}

export interface SaveServerDataResult {
  ok: boolean;
  jsonBinSynced: boolean;
  skipped?: boolean;
  reason?: string | null;
  lastSyncTime: number | null;
  remoteUpdatedAt?: string | null;
  status: 'synced' | 'pending_keys' | 'error' | 'syncing';
  error?: string | null;
  history?: SyncRecord[];
  settings?: AppSettings | null;
  confirmedDayHashes?: Record<string, string>;
}

export function computeClientDataSignature(
  username: string,
  records: SyncRecord[],
  settings?: Partial<AppSettings> | null
): string {
  const cleanUser = (username || 'alpharomeo1500').trim().toLowerCase();
  const sorted = [...(Array.isArray(records) ? records : [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const allRecordsSig = sorted
    .map(
      (r) =>
        `${r.id || ''}_${r.timestamp}_${r.bullet ?? ''}_${r.blitz ?? ''}_${r.rapid ?? ''}_${r.puzzles ?? ''}_${r.bestRating}_${r.bestMode}_${r.source || ''}_${r.note || ''}`
    )
    .join(';');
  const s = settings || {};
  const settingsStr = JSON.stringify({
    username: s.username || cleanUser,
    startElo: s.startElo,
    targetElo: s.targetElo,
    startDate: s.startDate,
    targetDate: s.targetDate,
    selectedMode: s.selectedMode,
    trajectoryModel: s.trajectoryModel,
    autoSyncMinutes: s.autoSyncMinutes,
    theme: s.theme,
    notifications: s.notifications,
    customMilestones: s.customMilestones,
  });
  // Simple deterministic hash suitable for browser without async crypto
  const raw = `${cleanUser}:::${allRecordsSig}:::${settingsStr}`;
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ ch, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}_${raw.length}`;
}

export async function fetchServerData(username: string): Promise<{
  history: SyncRecord[];
  settings: AppSettings | null;
  lastUpdated: number;
  jsonBinLastSyncTime?: number | null;
  jsonBinRemoteUpdatedAt?: string | null;
  confirmedDayHashes?: Record<string, string>;
} | null> {
  const clean = (username || '').trim().toLowerCase();
  if (!clean) return null;

  let serverHistory: SyncRecord[] = [];
  let serverSettings: AppSettings | null = null;
  let lastUpdated = 0;
  let jsonBinLastSyncTime: number | null = null;
  let jsonBinRemoteUpdatedAt: string | null = null;
  let confirmedDayHashes: Record<string, string> | undefined = undefined;
  let serverAvailable = false;

  // 1. Try local Express server endpoint
  try {
    const res = await safeApiFetch(`/api/user-data/${clean}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res && res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        serverAvailable = true;
        serverHistory = Array.isArray(data.history) ? data.history : [];
        serverSettings = data.settings || null;
        lastUpdated = data.lastUpdated || 0;
        jsonBinLastSyncTime = data.jsonBinLastSyncTime || null;
        jsonBinRemoteUpdatedAt = data.jsonBinRemoteUpdatedAt || null;
        if (data.confirmedDayHashes && typeof data.confirmedDayHashes === 'object') {
          confirmedDayHashes = data.confirmedDayHashes;
        }

        if (jsonBinLastSyncTime || confirmedDayHashes) {
          saveLocalMetrics(clean, {
            ...(jsonBinLastSyncTime ? { lastSyncTime: jsonBinLastSyncTime } : {}),
            remoteUpdatedAt: jsonBinRemoteUpdatedAt,
            lastStatus: data.jsonBinStatus || 'synced',
            ...(confirmedDayHashes ? { confirmedDayHashes } : {}),
          });
        }
      }
    }
  } catch {
    // Endpoint unavailable (Vercel static SPA)
  }

  if (serverAvailable && serverHistory.length > 0) {
    return {
      history: serverHistory,
      settings: serverSettings,
      lastUpdated,
      jsonBinLastSyncTime,
      jsonBinRemoteUpdatedAt,
      confirmedDayHashes,
    };
  }

  // 2. Fallback to JSONBin if server has 0 records OR server is unavailable (Vercel)
  const pullResult = await pullFromJsonBin(clean);
  if (pullResult.success) {
    return {
      history: mergeSyncHistories(pullResult.history || [], serverHistory, clean),
      settings: pullResult.settings || serverSettings,
      lastUpdated: Date.now(),
      jsonBinLastSyncTime: pullResult.lastSyncTime ?? null,
      jsonBinRemoteUpdatedAt: pullResult.remoteUpdatedAt ?? null,
      confirmedDayHashes: pullResult.confirmedDayHashes ?? confirmedDayHashes,
    };
  }

  if (serverAvailable) {
    return {
      history: serverHistory,
      settings: serverSettings,
      lastUpdated,
      jsonBinLastSyncTime,
      jsonBinRemoteUpdatedAt,
      confirmedDayHashes,
    };
  }

  return null;
}

export async function saveServerData(
  username: string,
  history: SyncRecord[],
  settings?: AppSettings,
  options?: { force?: boolean; replaceExact?: boolean }
): Promise<SaveServerDataResult> {
  const clean = (username || '').trim().toLowerCase();
  if (!clean) {
    return {
      ok: false,
      jsonBinSynced: false,
      lastSyncTime: null,
      status: 'error',
      error: 'Nom d’utilisateur manquant',
    };
  }

  const creds = getClientJsonBinCredentials(clean);
  const forcePush = options?.force ?? true;
  const replaceExact = Boolean(options?.replaceExact);

  // 1. Try Express backend (which awaits JSONBin push + merge-before-PUT protection)
  try {
    const res = await safeApiFetch(`/api/user-data/${clean}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        history,
        settings,
        forcePush,
        replaceExact,
        binId: creds.binId || undefined,
        apiKey: creds.apiKey || undefined,
      }),
    });

    if (res && res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        const jb = data.jsonBin || {};
        const status: 'synced' | 'pending_keys' | 'error' | 'syncing' =
          jb.status === 'error'
            ? 'error'
            : jb.status === 'pending_keys'
            ? 'pending_keys'
            : 'synced';
        const lastSyncTime = jb.lastSyncTime ?? getLocalMetrics(clean).lastSyncTime;
        const remoteUpdatedAt = jb.remoteUpdatedAt ?? getLocalMetrics(clean).remoteUpdatedAt ?? null;

        // If server merged additional remote days or settings back, mirror them locally too
        if (Array.isArray(data.history) && data.history.length > 0 && !replaceExact) {
          saveStoredSyncHistory(data.history, clean);
        }

        const confirmedDayHashes =
          status === 'synced' && jb.confirmedDayHashes && typeof jb.confirmedDayHashes === 'object'
            ? jb.confirmedDayHashes
            : getLocalMetrics(clean).confirmedDayHashes;

        saveLocalMetrics(clean, {
          lastSyncTime,
          remoteUpdatedAt,
          lastStatus: status,
          lastError: jb.error || null,
          lastSkippedReason: jb.reason || null,
          lastSignature: computeClientDataSignature(clean, data.history || history, data.settings || settings),
          ...(confirmedDayHashes ? { confirmedDayHashes } : {}),
        });

        emitJsonBinUpdate({
          username: clean,
          lastSyncTime,
          remoteUpdatedAt,
          lastStatus: status,
          lastError: jb.error || null,
          pushed: Boolean(jb.pushed),
          skipped: Boolean(jb.skipped),
          confirmedDayHashes,
        });

        mirrorDataToFirestore({
          username: clean,
          history: Array.isArray(data.history) && !replaceExact ? data.history : history,
          settings: data.settings || settings || getStoredSettings(clean),
          jsonBinSyncedAt: remoteUpdatedAt,
          replaceExact,
        }).catch(() => {});

        return {
          ok: true,
          jsonBinSynced: Boolean(jb.pushed),
          skipped: Boolean(jb.skipped),
          reason: jb.reason || null,
          lastSyncTime,
          remoteUpdatedAt,
          status,
          error: jb.error || null,
          history: data.history,
          settings: data.settings || null,
          confirmedDayHashes,
        };
      }
    }
  } catch {
    // Express unreachable -> Vercel client-side direct fallback
  }

  // 2. Direct client JSONBin push (Vercel / static hosting)
  const directRes = await syncNowToJsonBin(clean, forcePush, {
    replaceExact,
    history,
    settings,
  });
  const metrics = getLocalMetrics(clean);

  return {
    ok: directRes.success,
    jsonBinSynced: Boolean(directRes.success && !directRes.skipped),
    skipped: Boolean(directRes.skipped),
    reason: directRes.reason || null,
    lastSyncTime: directRes.lastSyncTime ?? metrics.lastSyncTime,
    remoteUpdatedAt: directRes.remoteUpdatedAt ?? metrics.remoteUpdatedAt ?? null,
    status: metrics.lastStatus,
    error: directRes.error || null,
    history: directRes.history,
    confirmedDayHashes: directRes.confirmedDayHashes ?? metrics.confirmedDayHashes,
  };
}

/**
 * Reconciles local, Express server, and JSONBin sync records + settings.
 * Guarantees that syncs & edits performed on PC immediately appear on Phone and vice-versa,
 * and ensures remote JSONBin history is NEVER overwritten by empty/stale local cache.
 */
export async function reconcileCloudSync(
  username: string,
  localHistory: SyncRecord[],
  localSettings?: AppSettings,
  options?: { isSpectator?: boolean; forcePull?: boolean }
): Promise<{
  history: SyncRecord[];
  settings?: AppSettings;
  didUpdate: boolean;
  lastJsonBinSyncTime: number | null;
  confirmedDayHashes?: Record<string, string>;
  sourceUsed?: 'firebase' | 'jsonbin' | 'local';
}> {
  const clean = (username || '').trim().toLowerCase();
  if (!clean) {
    return {
      history: localHistory,
      settings: localSettings,
      didUpdate: false,
      lastJsonBinSyncTime: null,
      sourceUsed: 'local',
    };
  }

  const isSpectator = Boolean(options?.isSpectator);
  const forcePull = Boolean(options?.forcePull);
  const lastPullKey = `${STORAGE_KEYS.lastPullPrefix}${clean}`;

  const initialMetrics = getLocalMetrics(clean);
  let lastJsonBinSyncTime: number | null = initialMetrics.lastSyncTime;
  let confirmedDayHashes: Record<string, string> | undefined = initialMetrics.confirmedDayHashes;

  let fallbackReason: string | null = null;

  // 1. PRIMARY SOURCE: Try Firebase Firestore first
  try {
    const fbRes = await fetchPlayerDataFromFirestore(clean);
    if (fbRes.available && fbRes.history.length > 0) {
      const mergedFromFb = mergeSyncHistories(localHistory, fbRes.history, clean);
      const didHistoryChange =
        mergedFromFb.length !== localHistory.length ||
        JSON.stringify(mergedFromFb) !== JSON.stringify(localHistory);

      if (didHistoryChange) {
        saveStoredSyncHistory(mergedFromFb, clean);
      }

      let nextSettings = localSettings;
      let didSettingsChange = false;
      if (fbRes.settingsPatch) {
        const mergedSettingsObj: AppSettings = {
          ...(localSettings || getStoredSettings(clean)),
          ...fbRes.settingsPatch,
          username: clean,
        };
        if (!localSettings || JSON.stringify(mergedSettingsObj) !== JSON.stringify(localSettings)) {
          nextSettings = mergedSettingsObj;
          if (!isSpectator) {
            saveStoredSettings(mergedSettingsObj);
          }
          didSettingsChange = true;
        }
      }

      const fbSyncMs = fbRes.updatedAt ? new Date(fbRes.updatedAt).getTime() : Date.now();
      const validFbMs = Number.isFinite(fbSyncMs) ? fbSyncMs : Date.now();
      const fbHashes = buildConfirmedDayHashes(fbRes.history, clean);

      if (!isSpectator && localHistory.length > 0 && mergedFromFb.length > fbRes.history.length) {
        saveServerData(clean, mergedFromFb, nextSettings, { force: false }).catch(() => {});
      }

      updateFirebaseDiagnostics({
        activeReadSource: 'firebase',
        lastFallbackReason: null,
        lastReadAt: Date.now(),
        recordsCount: mergedFromFb.length,
      });
      resolveSyncIssuesByKeyPrefix('sync_fallback');

      return {
        history: mergedFromFb,
        settings: nextSettings,
        didUpdate: didHistoryChange || didSettingsChange,
        lastJsonBinSyncTime: lastJsonBinSyncTime || validFbMs,
        confirmedDayHashes: fbHashes,
        sourceUsed: 'firebase',
      };
    }

    fallbackReason =
      fbRes.reason === 'auth_required'
        ? 'Session Google Firebase non connectée sur cet appareil'
        : fbRes.reason === 'empty'
        ? 'Base Firestore vide : récupération depuis JSONBin'
        : 'Firestore temporairement indisponible';
  } catch {
    // Firebase unavailable -> seamless fallback to JSONBin below
    fallbackReason = 'Erreur réseau ou blocage Firestore : repli JSONBin actif';
  }

  // 2. FALLBACK SOURCE: JSONBin + Express Server if Firebase is unavailable/empty
  let shouldPullJsonBin = forcePull || localHistory.length === 0;
  try {
    if (!shouldPullJsonBin && typeof window !== 'undefined' && window.sessionStorage) {
      const sessionPull = Number(window.sessionStorage.getItem(lastPullKey) || '0');
      if (!sessionPull || Date.now() - sessionPull > 60 * 1000) {
        shouldPullJsonBin = true;
      }
    }
  } catch {
    shouldPullJsonBin = true;
  }

  let remoteHistory: SyncRecord[] = [];
  let remoteSettings: AppSettings | null = null;

  const serverResult = await fetchServerData(clean);
  if (serverResult) {
    remoteHistory = mergeSyncHistories(serverResult.history || [], remoteHistory, clean);
    if (serverResult.settings) remoteSettings = serverResult.settings;
    if (serverResult.jsonBinLastSyncTime) lastJsonBinSyncTime = serverResult.jsonBinLastSyncTime;
    if (serverResult.confirmedDayHashes) confirmedDayHashes = serverResult.confirmedDayHashes;
  }

  if (shouldPullJsonBin && (!isSpectator || remoteHistory.length === 0)) {
    const binPull = await pullFromJsonBin(clean);
    if (binPull.success) {
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem(lastPullKey, String(Date.now()));
        }
      } catch {}
      if (Array.isArray(binPull.history) && binPull.history.length > 0) {
        remoteHistory = mergeSyncHistories(binPull.history, remoteHistory, clean);
      }
      if (binPull.settings) {
        remoteSettings = { ...(remoteSettings || {}), ...binPull.settings, username: clean } as AppSettings;
      }
      if (binPull.lastSyncTime) {
        lastJsonBinSyncTime = binPull.lastSyncTime;
      }
      if (binPull.confirmedDayHashes) {
        confirmedDayHashes = binPull.confirmedDayHashes;
      }
    }
  }

  if (remoteHistory.length === 0 && !remoteSettings) {
    updateFirebaseDiagnostics({
      activeReadSource: 'local',
      lastFallbackReason: fallbackReason,
    });
    return {
      history: localHistory,
      settings: localSettings,
      didUpdate: false,
      lastJsonBinSyncTime,
      confirmedDayHashes,
      sourceUsed: 'local',
    };
  }

  const mergedHistory = mergeSyncHistories(localHistory, remoteHistory, clean);

  const didHistoryChange =
    mergedHistory.length !== localHistory.length ||
    JSON.stringify(mergedHistory) !== JSON.stringify(localHistory);

  if (didHistoryChange) {
    saveStoredSyncHistory(mergedHistory, clean);
  }

  let nextSettings = localSettings;
  let didSettingsChange = false;
  if (remoteSettings) {
    const mergedSettingsObj: AppSettings = {
      ...(localSettings || getStoredSettings(clean)),
      ...remoteSettings,
      username: clean,
      notifications: {
        ...(localSettings?.notifications || getStoredSettings(clean).notifications),
        ...(remoteSettings.notifications || {}),
      },
      customMilestones:
        Array.isArray(remoteSettings.customMilestones) && remoteSettings.customMilestones.length > 0
          ? remoteSettings.customMilestones
          : localSettings?.customMilestones || getStoredSettings(clean).customMilestones,
    };
    if (!localSettings || JSON.stringify(mergedSettingsObj) !== JSON.stringify(localSettings)) {
      nextSettings = mergedSettingsObj;
      if (!isSpectator) {
        saveStoredSettings(mergedSettingsObj);
      }
      didSettingsChange = true;
    }
  }

  if (!isSpectator && localHistory.length > 0 && mergedHistory.length > remoteHistory.length) {
    saveServerData(clean, mergedHistory, nextSettings, { force: false }).catch(() => {});
  }

  updateFirebaseDiagnostics({
    activeReadSource: 'jsonbin',
    lastFallbackReason: fallbackReason,
    lastReadAt: Date.now(),
    recordsCount: mergedHistory.length,
  });

  return {
    history: mergedHistory,
    settings: nextSettings,
    didUpdate: didHistoryChange || didSettingsChange,
    lastJsonBinSyncTime,
    confirmedDayHashes,
    sourceUsed: 'jsonbin',
  };
}

export async function fetchJsonBinStatus(username = 'alpharomeo1500'): Promise<JsonBinStatusInfo> {
  const cleanUser = username.trim().toLowerCase();

  // 1. Try local Express server endpoint
  try {
    const res = await safeApiFetch(`/api/jsonbin/status?username=${encodeURIComponent(cleanUser)}`, {
      cache: 'no-store',
    });
    if (res && res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data && typeof data.configured === 'boolean') {
          if (data.lastSyncTime || data.confirmedDayHashes) {
            saveLocalMetrics(cleanUser, {
              ...(data.lastSyncTime ? { lastSyncTime: data.lastSyncTime } : {}),
              remoteUpdatedAt: data.remoteUpdatedAt || null,
              lastStatus: data.lastStatus || 'synced',
              lastError: data.lastError || null,
              ...(data.confirmedDayHashes && typeof data.confirmedDayHashes === 'object'
                ? { confirmedDayHashes: data.confirmedDayHashes }
                : {}),
            });
          }
          return data;
        }
      }
    }
  } catch {
    // Fallback to client-side direct
  }

  // 2. Direct client-side mode for Vercel
  const creds = getClientJsonBinCredentials(cleanUser);
  const metrics = getLocalMetrics(cleanUser);

  return {
    configured: Boolean(creds.binId),
    binId: creds.binId || null,
    hasApiKey: Boolean(creds.apiKey),
    enabled: creds.enabled,
    lastSyncTime: metrics.lastSyncTime,
    remoteUpdatedAt: metrics.remoteUpdatedAt || null,
    lastStatus: creds.binId ? metrics.lastStatus : 'pending_keys',
    lastError: metrics.lastError || null,
    confirmedDayHashes: metrics.confirmedDayHashes || {},
    quotaInfo: {
      requestsToday: metrics.requestsToday,
      savedRequests: metrics.savedRequests,
      quotaSaverActive: true,
      lastSkippedReason: metrics.lastSkippedReason || null,
    },
    template: {
      exportedAt: new Date().toISOString(),
      project: 'Road to 2000 Elo',
      username: cleanUser,
      version: '2.0',
      recordsCount: cleanUser === 'alpharomeo1500' ? OFFICIAL_DAILY_RECORDS.length : 0,
      records: cleanUser === 'alpharomeo1500' ? OFFICIAL_DAILY_RECORDS : [],
    },
  };
}

export async function saveJsonBinConfig(config: {
  binId?: string;
  apiKey?: string;
  enabled?: boolean;
  username?: string;
}): Promise<{ success: boolean; lastStatus?: string; lastError?: string | null; lastSyncTime?: number | null }> {
  const cleanUser = (config.username || 'alpharomeo1500').trim().toLowerCase();
  const userBinKey = `roadto2000_jsonbin_binid_${cleanUser}`;
  const userKeyKey = `roadto2000_jsonbin_apikey_${cleanUser}`;
  const userEnabledKey = `roadto2000_jsonbin_enabled_${cleanUser}`;

  // Save locally in browser immediately
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (typeof config.binId === 'string') {
        window.localStorage.setItem(userBinKey, config.binId.trim());
        if (cleanUser === 'alpharomeo1500') window.localStorage.setItem(STORAGE_KEYS.binId, config.binId.trim());
      }
      if (typeof config.apiKey === 'string' && config.apiKey.trim()) {
        window.localStorage.setItem(userKeyKey, config.apiKey.trim());
        if (cleanUser === 'alpharomeo1500') window.localStorage.setItem(STORAGE_KEYS.apiKey, config.apiKey.trim());
      }
      if (typeof config.enabled === 'boolean') {
        window.localStorage.setItem(userEnabledKey, String(config.enabled));
        if (cleanUser === 'alpharomeo1500') window.localStorage.setItem(STORAGE_KEYS.enabled, String(config.enabled));
      }
    }
  } catch {}

  // Also persist on Express server if running
  try {
    const serverRes = await safeApiFetch('/api/jsonbin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, username: cleanUser }),
    });
    if (serverRes && serverRes.ok) {
      const serverData = await serverRes.json();
      if (typeof serverData.configured === 'boolean') {
        saveLocalMetrics(cleanUser, {
          lastStatus: serverData.lastStatus || 'synced',
          lastError: serverData.lastError || null,
          lastSyncTime: serverData.lastSyncTime ?? getLocalMetrics(cleanUser).lastSyncTime,
          remoteUpdatedAt: serverData.remoteUpdatedAt ?? null,
        });
        return {
          success: serverData.lastStatus !== 'error',
          lastStatus: serverData.lastStatus,
          lastError: serverData.lastError,
          lastSyncTime: serverData.lastSyncTime ?? null,
        };
      }
    }
  } catch {}

  // Test the bin credentials directly with JSONBin.io (CORS supported)
  const creds = getClientJsonBinCredentials(cleanUser);
  if (creds.binId) {
    try {
      const headers: Record<string, string> = {};
      if (creds.apiKey) {
        headers['X-Master-Key'] = creds.apiKey;
        headers['X-Access-Key'] = creds.apiKey;
      }

      const testRes = await fetch(`https://api.jsonbin.io/v3/b/${creds.binId}/latest`, {
        headers,
      });

      if (testRes.ok) {
        let remoteUpdatedAt: string | null = null;
        try {
          const testBody = await testRes.json();
          const rec = testBody.record || testBody;
          if (rec?.exportedAt) remoteUpdatedAt = rec.exportedAt;
        } catch {}
        saveLocalMetrics(cleanUser, { lastStatus: 'synced', lastError: null, remoteUpdatedAt });
        return { success: true, lastStatus: 'synced', lastSyncTime: getLocalMetrics(cleanUser).lastSyncTime };
      } else {
        const msg = `Erreur ${testRes.status}: Clé ou Bin invalide`;
        saveLocalMetrics(cleanUser, { lastStatus: 'error', lastError: msg });
        return { success: false, lastStatus: 'error', lastError: msg };
      }
    } catch {
      saveLocalMetrics(cleanUser, { lastStatus: 'error', lastError: 'Connexion impossible à jsonbin.io' });
      return { success: false, lastStatus: 'error', lastError: 'Connexion impossible à jsonbin.io' };
    }
  }

  return { success: true, lastStatus: 'pending_keys' };
}

export async function syncNowToJsonBin(
  username = 'alpharomeo1500',
  force = true,
  options?: { replaceExact?: boolean; history?: SyncRecord[]; settings?: AppSettings }
): Promise<{
  success: boolean;
  error?: string;
  skipped?: boolean;
  reason?: string;
  lastSyncTime?: number | null;
  remoteUpdatedAt?: string | null;
  history?: SyncRecord[];
  confirmedDayHashes?: Record<string, string>;
}> {
  const cleanUser = username.trim().toLowerCase();
  const creds = getClientJsonBinCredentials(cleanUser);
  const localHistory = options?.history ?? getStoredSyncHistory(cleanUser);
  const settings = options?.settings ?? getStoredSettings(cleanUser);
  const replaceExact = Boolean(options?.replaceExact);

  // 1. Try Express server first (sending current client history, settings & credentials!)
  try {
    const res = await safeApiFetch('/api/jsonbin/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cleanUser,
        force,
        replaceExact,
        history: localHistory,
        settings,
        binId: creds.binId || undefined,
        apiKey: creds.apiKey || undefined,
      }),
    });
    if (res && res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        const status: 'synced' | 'pending_keys' | 'error' | 'syncing' =
          data.status === 'error' ? 'error' : data.status === 'pending_keys' ? 'pending_keys' : 'synced';
        const lastSyncTime = data.lastSyncTime ?? getLocalMetrics(cleanUser).lastSyncTime;
        const remoteUpdatedAt = data.remoteUpdatedAt ?? null;
        const confirmedDayHashes =
          status === 'synced' && data.confirmedDayHashes && typeof data.confirmedDayHashes === 'object'
            ? data.confirmedDayHashes
            : getLocalMetrics(cleanUser).confirmedDayHashes;

        if (Array.isArray(data.history) && data.history.length > 0 && !replaceExact) {
          saveStoredSyncHistory(data.history, cleanUser);
        }

        saveLocalMetrics(cleanUser, {
          lastSyncTime,
          remoteUpdatedAt,
          lastStatus: status,
          lastError: data.error || null,
          lastSkippedReason: data.reason || null,
          ...(confirmedDayHashes ? { confirmedDayHashes } : {}),
        });

        emitJsonBinUpdate({
          username: cleanUser,
          lastSyncTime,
          remoteUpdatedAt,
          lastStatus: status,
          lastError: data.error || null,
          pushed: Boolean(data.pushed),
          skipped: Boolean(data.skipped),
          confirmedDayHashes,
        });

        mirrorDataToFirestore({
          username: cleanUser,
          history: Array.isArray(data.history) && !replaceExact ? data.history : localHistory,
          settings,
          jsonBinSyncedAt: remoteUpdatedAt,
          replaceExact,
        }).catch(() => {});

        return {
          success: data.success !== false,
          error: data?.error,
          skipped: data?.skipped,
          reason: data?.reason,
          lastSyncTime,
          remoteUpdatedAt,
          history: data?.history,
          confirmedDayHashes,
        };
      }
    } else if (res && res.status >= 500) {
      const errData = await res.json().catch(() => null);
      if (errData?.error) {
        saveLocalMetrics(cleanUser, { lastStatus: 'error', lastError: errData.error });
        emitJsonBinUpdate({
          username: cleanUser,
          lastSyncTime: getLocalMetrics(cleanUser).lastSyncTime,
          lastStatus: 'error',
          lastError: errData.error,
        });
        reportSyncIssue({
          key: 'jsonbin_sync_server_error',
          source: 'jsonbin',
          severity: 'error',
          title: 'Erreur JSONBin (sauvegarde)',
          message: errData.error,
        });
        return { success: false, error: errData.error };
      }
    }
  } catch {
    // Fallback to direct client
  }

  // 2. Direct client-side push to JSONBin.io (Works on Vercel)
  if (!creds.enabled || !creds.binId) {
    return { success: false, error: 'JSONBin non configuré pour ce compte' };
  }

  const metrics = getLocalMetrics(cleanUser);
  let recordsToPush = [...localHistory];

  // Signature check BEFORE network requests (unless forced or explicit replace)
  const initialSig = computeClientDataSignature(cleanUser, recordsToPush, settings);
  if (!force && !replaceExact && metrics.lastSignature === initialSig && metrics.lastStatus === 'synced') {
    const updated = saveLocalMetrics(cleanUser, {
      savedRequests: (metrics.savedRequests || 0) + 1,
      lastSkippedReason: 'Données et paramètres identiques : 0 requête consommée',
      lastStatus: 'synced',
    });
    return {
      success: true,
      skipped: true,
      reason: updated.lastSkippedReason || 'Données identiques',
      lastSyncTime: updated.lastSyncTime,
      remoteUpdatedAt: updated.remoteUpdatedAt,
    };
  }

  // CRITICAL SAFETY GUARD: Merge-Before-PUT on direct client path too!
  if (!replaceExact) {
    try {
      const readHeaders: Record<string, string> = {};
      if (creds.apiKey) {
        readHeaders['X-Master-Key'] = creds.apiKey;
        readHeaders['X-Access-Key'] = creds.apiKey;
      }
      const latestRes = await fetch(`https://api.jsonbin.io/v3/b/${creds.binId}/latest`, { headers: readHeaders });
      if (latestRes.ok) {
        const latestBody = await latestRes.json();
        const remoteBin = latestBody.record || latestBody;
        const remoteUser = (remoteBin.username || remoteBin.player?.username || cleanUser).trim().toLowerCase();
        if (remoteUser === cleanUser) {
          const remoteList = Array.isArray(remoteBin.records)
            ? remoteBin.records
            : Array.isArray(remoteBin.history)
            ? remoteBin.history
            : [];
          if (remoteList.length > 0) {
            recordsToPush = mergeSyncHistories(recordsToPush, remoteList, cleanUser);
            saveStoredSyncHistory(recordsToPush, cleanUser);
          }
        }
      }
    } catch {
      // Proceed only if we actually have local records to protect against accidental wipe
      if (recordsToPush.length === 0) {
        return { success: false, error: 'Impossible de lire le bin JSONBin avant écriture' };
      }
    }
  }

  const finalSig = computeClientDataSignature(cleanUser, recordsToPush, settings);
  if (!force && !replaceExact && metrics.lastSignature === finalSig && metrics.lastStatus === 'synced') {
    const updated = saveLocalMetrics(cleanUser, {
      savedRequests: (metrics.savedRequests || 0) + 1,
      lastSkippedReason: 'Données déjà synchronisées sur JSONBin',
      lastStatus: 'synced',
    });
    return {
      success: true,
      skipped: true,
      reason: updated.lastSkippedReason || 'Données identiques',
      lastSyncTime: updated.lastSyncTime,
      remoteUpdatedAt: updated.remoteUpdatedAt,
      history: recordsToPush,
    };
  }

  const latest = recordsToPush[0] || ({} as Partial<SyncRecord>);
  const exportedAt = new Date().toISOString();
  const payload = {
    exportedAt,
    project: 'Road to 2000 Elo',
    username: cleanUser,
    version: '2.0',
    recordsCount: recordsToPush.length,
    records: recordsToPush,
    history: recordsToPush,
    player: {
      username: cleanUser,
      targetElo: settings.targetElo || 2000,
      targetDate: settings.targetDate || '2027-12-31T23:59:59.000Z',
      startDate: settings.startDate || '2026-10-31',
      startRatings: {
        bullet: 1500,
        blitz: 1458,
        rapid: 1289,
      },
      currentRatings: {
        bullet: latest.bullet ?? 1500,
        blitz: latest.blitz ?? 1458,
        rapid: latest.rapid ?? 1289,
        ...(typeof latest.puzzles === 'number' ? { puzzles: latest.puzzles } : {}),
      },
      bestMode: latest.bestMode ?? 'bullet',
      bestRating: latest.bestRating ?? (settings.startElo || 1500),
    },
    settings,
  };

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (creds.apiKey) {
      headers['X-Master-Key'] = creds.apiKey;
      headers['X-Access-Key'] = creds.apiKey;
    }

    const res = await fetch(`https://api.jsonbin.io/v3/b/${creds.binId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const errMsg = `Erreur ${res.status}: ${errText.substring(0, 80)}`;
      saveLocalMetrics(cleanUser, { lastStatus: 'error', lastError: errMsg });
      emitJsonBinUpdate({
        username: cleanUser,
        lastSyncTime: metrics.lastSyncTime,
        lastStatus: 'error',
        lastError: errMsg,
      });
      reportSyncIssue({
        key: 'jsonbin_put_error',
        source: 'jsonbin',
        severity: 'error',
        title: `Rejet JSONBin (${res.status})`,
        message: errMsg,
        suggestion: 'Vérifiez le Bin ID, la clé API et le quota journalier JSONBin.',
      });
      return { success: false, error: `Erreur ${res.status} JSONBin` };
    }

    // Parse echoed remote JSONBin payload to verify what JSONBin actually stored
    const putBody = await res.json().catch(() => null);
    const echoedRecords = Array.isArray(putBody?.record?.records)
      ? putBody.record.records
      : Array.isArray(putBody?.record?.history)
      ? putBody.record.history
      : recordsToPush;
    const confirmedDayHashes = buildConfirmedDayHashes(echoedRecords, cleanUser);

    const nowMs = Date.now();
    saveLocalMetrics(cleanUser, {
      requestsToday: (metrics.requestsToday || 0) + 1,
      lastSyncTime: nowMs,
      remoteUpdatedAt: exportedAt,
      lastSignature: finalSig,
      confirmedDayHashes,
      lastSkippedReason: null,
      lastStatus: 'synced',
      lastError: null,
    });

    emitJsonBinUpdate({
      username: cleanUser,
      lastSyncTime: nowMs,
      remoteUpdatedAt: exportedAt,
      lastStatus: 'synced',
      lastError: null,
      pushed: true,
      skipped: false,
      confirmedDayHashes,
    });

    mirrorDataToFirestore({
      username: cleanUser,
      history: recordsToPush,
      settings,
      jsonBinSyncedAt: exportedAt,
      replaceExact,
    }).catch(() => {});
    resolveSyncIssuesByKeyPrefix('jsonbin_');

    return {
      success: true,
      lastSyncTime: nowMs,
      remoteUpdatedAt: exportedAt,
      history: recordsToPush,
      confirmedDayHashes,
    };
  } catch (err: any) {
    const errMsg = err?.message || 'Erreur réseau vers JSONBin';
    saveLocalMetrics(cleanUser, { lastStatus: 'error', lastError: errMsg });
    emitJsonBinUpdate({
      username: cleanUser,
      lastSyncTime: metrics.lastSyncTime,
      lastStatus: 'error',
      lastError: errMsg,
    });
    reportSyncIssue({
      key: 'jsonbin_network_error',
      source: 'jsonbin',
      severity: 'error',
      title: 'Réseau JSONBin inaccessible',
      message: errMsg,
    });
    return { success: false, error: errMsg };
  }
}

export async function pullFromJsonBin(targetUsername?: string): Promise<{
  success: boolean;
  history?: SyncRecord[];
  settings?: AppSettings | null;
  lastSyncTime?: number | null;
  remoteUpdatedAt?: string | null;
  confirmedDayHashes?: Record<string, string>;
  error?: string;
}> {
  const cleanUser = (targetUsername || getStoredSettings().username || 'alpharomeo1500').trim().toLowerCase();
  const creds = getClientJsonBinCredentials(cleanUser);

  // 1. Try server first (passing user's binId/apiKey if configured in client)
  try {
    const res = await safeApiFetch('/api/jsonbin/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cleanUser,
        binId: creds.binId || undefined,
        apiKey: creds.apiKey || undefined,
      }),
    });
    if (res && res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data && Array.isArray(data.history)) {
          const mergedLocal = mergeSyncHistories(data.history, getStoredSyncHistory(cleanUser), cleanUser);
          if (mergedLocal.length > 0) {
            saveStoredSyncHistory(mergedLocal, cleanUser);
          }
          if (data.settings && typeof data.settings === 'object') {
            saveStoredSettings({ ...getStoredSettings(cleanUser), ...data.settings, username: cleanUser });
          }
          const lastSyncTime = data.lastSyncTime || Date.now();
          const remoteUpdatedAt = data.remoteUpdatedAt || null;
          const confirmedDayHashes =
            data.confirmedDayHashes && typeof data.confirmedDayHashes === 'object'
              ? data.confirmedDayHashes
              : buildConfirmedDayHashes(data.history, cleanUser);

          saveLocalMetrics(cleanUser, {
            lastStatus: 'synced',
            lastError: null,
            lastSyncTime,
            remoteUpdatedAt,
            lastSignature: computeClientDataSignature(cleanUser, mergedLocal, data.settings),
            confirmedDayHashes,
          });
          emitJsonBinUpdate({
            username: cleanUser,
            lastSyncTime,
            remoteUpdatedAt,
            lastStatus: 'synced',
            lastError: null,
            confirmedDayHashes,
          });
          mirrorDataToFirestore({
            username: cleanUser,
            history: mergedLocal,
            settings: data.settings ? { ...getStoredSettings(cleanUser), ...data.settings, username: cleanUser } : getStoredSettings(cleanUser),
            jsonBinSyncedAt: remoteUpdatedAt,
          }).catch(() => {});
          return {
            success: true,
            history: mergedLocal,
            settings: data.settings || null,
            lastSyncTime,
            remoteUpdatedAt,
            confirmedDayHashes,
          };
        }
      }
    }
  } catch {
    // Fallback to client-side direct
  }

  // 2. Direct client-side fetch from JSONBin.io (Works on Vercel)
  if (!creds.binId) {
    return { success: false, error: 'Bin ID non configuré' };
  }

  try {
    const headers: Record<string, string> = {};
    if (creds.apiKey) {
      headers['X-Master-Key'] = creds.apiKey;
      headers['X-Access-Key'] = creds.apiKey;
    }

    const res = await fetch(`https://api.jsonbin.io/v3/b/${creds.binId}/latest`, {
      headers,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const errMsg = `Erreur ${res.status}: Clé ou Bin invalide`;
      saveLocalMetrics(cleanUser, { lastStatus: 'error', lastError: errMsg });
      emitJsonBinUpdate({
        username: cleanUser,
        lastSyncTime: getLocalMetrics(cleanUser).lastSyncTime,
        lastStatus: 'error',
        lastError: errMsg,
      });
      reportSyncIssue({
        key: 'jsonbin_pull_error',
        source: 'jsonbin',
        severity: 'error',
        title: `Lecture JSONBin refusée (${res.status})`,
        message: errMsg,
        suggestion: 'Vérifiez le Bin ID et la clé d’accès JSONBin.',
      });
      return { success: false, error: `Erreur ${res.status} JSONBin: ${errText.substring(0, 80)}` };
    }

    const body = await res.json();
    const binRecord = body.record || body;
    const rawList = Array.isArray(binRecord.records)
      ? binRecord.records
      : Array.isArray(binRecord.history)
      ? binRecord.history
      : [];

    const username = (binRecord.username || binRecord.player?.username || cleanUser).trim().toLowerCase();
    const mergedHistory = mergeSyncHistories(rawList, getStoredSyncHistory(username), username);

    if (mergedHistory.length > 0) {
      saveStoredSyncHistory(mergedHistory, username);
    }

    let restoredSettings: AppSettings | null = null;
    if (binRecord.settings && typeof binRecord.settings === 'object') {
      const nextSettings: AppSettings = {
        ...getStoredSettings(username),
        ...binRecord.settings,
        username,
      };
      restoredSettings = nextSettings;
      saveStoredSettings(nextSettings);
    }

    const nowMs = Date.now();
    const remoteUpdatedAt = typeof binRecord.exportedAt === 'string' ? binRecord.exportedAt : null;
    // Strictly confirm ONLY records truly present on remote JSONBin
    const confirmedDayHashes = buildConfirmedDayHashes(rawList, username);

    saveLocalMetrics(username, {
      lastStatus: 'synced',
      lastError: null,
      lastSyncTime: nowMs,
      remoteUpdatedAt,
      lastSignature: computeClientDataSignature(username, mergedHistory, restoredSettings),
      confirmedDayHashes,
    });

    emitJsonBinUpdate({
      username,
      lastSyncTime: nowMs,
      remoteUpdatedAt,
      lastStatus: 'synced',
      lastError: null,
      confirmedDayHashes,
    });

    mirrorDataToFirestore({
      username,
      history: mergedHistory,
      settings: restoredSettings || getStoredSettings(username),
      jsonBinSyncedAt: remoteUpdatedAt,
    }).catch(() => {});
    resolveSyncIssuesByKeyPrefix('jsonbin_');

    return {
      success: true,
      history: mergedHistory,
      settings: restoredSettings,
      lastSyncTime: nowMs,
      remoteUpdatedAt,
      confirmedDayHashes,
    };
  } catch (err: any) {
    const errMsg = err?.message || 'Erreur réseau vers JSONBin';
    saveLocalMetrics(cleanUser, { lastStatus: 'error', lastError: errMsg });
    emitJsonBinUpdate({
      username: cleanUser,
      lastSyncTime: getLocalMetrics(cleanUser).lastSyncTime,
      lastStatus: 'error',
      lastError: errMsg,
    });
    reportSyncIssue({
      key: 'jsonbin_pull_network_error',
      source: 'jsonbin',
      severity: 'error',
      title: 'Lecture JSONBin impossible',
      message: errMsg,
    });
    return { success: false, error: errMsg };
  }
}

/**
 * Verifies live against remote JSONBin /latest that local records strictly match what is stored in the cloud.
 */
export async function verifyJsonBinSync(
  username = 'alpharomeo1500',
  localHistoryOverride?: SyncRecord[]
): Promise<{
  verified: boolean;
  matchingDays: number;
  pendingDays: number;
  totalLocalDays: number;
  confirmedDayHashes: Record<string, string>;
  lastSyncTime: number | null;
  error?: string;
}> {
  const cleanUser = username.trim().toLowerCase();
  const localRecords = localHistoryOverride ?? getStoredSyncHistory(cleanUser);

  emitJsonBinUpdate({
    username: cleanUser,
    lastSyncTime: getLocalMetrics(cleanUser).lastSyncTime,
    lastStatus: 'syncing',
  });

  const pullRes = await pullFromJsonBin(cleanUser);
  if (!pullRes.success) {
    return {
      verified: false,
      matchingDays: 0,
      pendingDays: localRecords.length,
      totalLocalDays: localRecords.length,
      confirmedDayHashes: getLocalMetrics(cleanUser).confirmedDayHashes || {},
      lastSyncTime: getLocalMetrics(cleanUser).lastSyncTime,
      error: pullRes.error || 'Vérification JSONBin impossible',
    };
  }

  const confirmedDayHashes = pullRes.confirmedDayHashes || {};
  let matchingDays = 0;
  let pendingDays = 0;
  for (const r of localRecords) {
    const dayKey = normalizeParisDayKey(r.timestamp);
    const hash = computeRecordVerificationHash(r, cleanUser);
    if (dayKey && confirmedDayHashes[dayKey] === hash) {
      matchingDays++;
    } else {
      pendingDays++;
    }
  }

  return {
    verified: pendingDays === 0,
    matchingDays,
    pendingDays,
    totalLocalDays: localRecords.length,
    confirmedDayHashes,
    lastSyncTime: pullRes.lastSyncTime ?? getLocalMetrics(cleanUser).lastSyncTime,
  };
}

/**
 * Generates the exact initial JSON payload to paste into jsonbin.io when creating a new Bin for a player.
 */
export function buildInitialJsonBinPayload(params: {
  username: string;
  startElo?: number;
  targetElo?: number;
  startDate?: string;
  targetDate?: string;
  selectedMode?: string;
  trajectoryModel?: string;
}) {
  const cleanUser = (params.username || 'nouveau_joueur').trim().toLowerCase() || 'nouveau_joueur';
  const startElo = params.startElo ?? 1500;
  const targetElo = params.targetElo ?? 2000;
  const startDate = params.startDate || new Date().toISOString().split('T')[0];
  const targetDate = params.targetDate || '2027-12-31T23:59:59';
  const selectedMode = params.selectedMode || 'auto';
  const trajectoryModel = params.trajectoryModel || 'linear';

  return {
    exportedAt: new Date().toISOString(),
    project: 'Road to 2000 Elo',
    username: cleanUser,
    version: '2.0',
    recordsCount: 0,
    records: [],
    history: [],
    player: {
      username: cleanUser,
      targetElo,
      targetDate,
      startDate,
      startRatings: {
        bullet: startElo,
        blitz: startElo,
        rapid: startElo,
      },
      currentRatings: {
        bullet: startElo,
        blitz: startElo,
        rapid: startElo,
      },
      bestMode: selectedMode === 'auto' ? 'blitz' : selectedMode,
      bestRating: startElo,
    },
    settings: {
      username: cleanUser,
      startElo,
      targetElo,
      startDate,
      targetDate,
      timezone: 'Europe/Paris',
      selectedMode,
      trajectoryModel,
      autoSyncMinutes: 15,
      theme: 'dark',
      notifications: {
        newPeak: true,
        milestoneReached: true,
        goalReached: true,
        syncErrors: true,
        significantDelay: true,
      },
      customMilestones: [],
    },
  };
}
