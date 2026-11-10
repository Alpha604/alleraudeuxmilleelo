/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppSettings, SyncRecord } from '../types/chess';
import {
  getStoredSettings,
  getStoredSyncHistory,
  OFFICIAL_DAILY_RECORDS,
  saveStoredSettings,
  saveStoredSyncHistory,
} from './storage';

/**
 * Cloud Sync Utility (Dual-Mode: Express Server + Vercel Direct Client-Side JSONBin):
 * Synchronizes sync history and settings between PC, Smartphone, and Tablet.
 * On Vercel (where no Express backend runs), it connects directly to JSONBin.io's CORS-enabled API.
 */

const DEFAULT_BIN_ID = '6af3559affd5d16053b75b82';
const DEFAULT_API_KEY = '$2a$10$nOO6WNU996CcWwBht/K8MuDshQsOPktO28uEy.WTBESmEHAsRjcZy';

const STORAGE_KEYS = {
  binId: 'roadto2000_jsonbin_binid',
  apiKey: 'roadto2000_jsonbin_apikey',
  enabled: 'roadto2000_jsonbin_enabled',
  metrics: 'roadto2000_jsonbin_metrics_v2',
};

export function getClientJsonBinCredentials(): { binId: string; apiKey: string; enabled: boolean } {
  let binId = DEFAULT_BIN_ID;
  let apiKey = DEFAULT_API_KEY;
  let enabled = true;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedBin = window.localStorage.getItem(STORAGE_KEYS.binId);
      const storedKey = window.localStorage.getItem(STORAGE_KEYS.apiKey);
      const storedEnabled = window.localStorage.getItem(STORAGE_KEYS.enabled);
      if (storedBin && storedBin.trim()) binId = storedBin.trim();
      if (storedKey && storedKey.trim()) apiKey = storedKey.trim();
      if (storedEnabled !== null) enabled = storedEnabled === 'true';
    }
  } catch {}

  return { binId, apiKey, enabled };
}

interface LocalMetrics {
  requestsToday: number;
  savedRequests: number;
  lastDayTracked: string;
  lastSyncTime: number | null;
  lastSignature?: string;
  lastSkippedReason?: string | null;
  lastStatus: 'synced' | 'pending_keys' | 'error' | 'syncing';
  lastError?: string | null;
}

function getLocalMetrics(): LocalMetrics {
  const today = new Date().toISOString().split('T')[0];
  const defaults: LocalMetrics = {
    requestsToday: 0,
    savedRequests: 0,
    lastDayTracked: today,
    lastSyncTime: null,
    lastStatus: 'synced',
    lastError: null,
  };

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEYS.metrics);
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

function saveLocalMetrics(patch: Partial<LocalMetrics>): LocalMetrics {
  const current = getLocalMetrics();
  const updated = { ...current, ...patch };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEYS.metrics, JSON.stringify(updated));
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
  lastStatus: 'synced' | 'pending_keys' | 'error' | 'syncing';
  lastError: string | null;
  quotaInfo?: {
    requestsToday: number;
    savedRequests: number;
    quotaSaverActive: boolean;
    lastSkippedReason: string | null;
    minThrottleSeconds: number;
  };
  template?: any;
}

export async function fetchServerData(username: string): Promise<{
  history: SyncRecord[];
  settings: AppSettings | null;
  lastUpdated: number;
} | null> {
  const clean = (username || '').trim().toLowerCase();
  if (!clean) return null;

  // 1. Try local Express server endpoint (local dev or Node environment)
  try {
    const res = await fetch(`/api/user-data/${clean}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        return {
          history: Array.isArray(data.history) ? data.history : [],
          settings: data.settings || null,
          lastUpdated: data.lastUpdated || 0,
        };
      }
    }
  } catch {
    // Endpoint unavailable (Vercel static SPA)
  }

  // 2. Direct client fallback on Vercel: pull directly from JSONBin.io
  const pullResult = await pullFromJsonBin();
  if (pullResult.success && pullResult.history && pullResult.history.length > 0) {
    return {
      history: pullResult.history,
      settings: null,
      lastUpdated: Date.now(),
    };
  }

  return null;
}

export async function saveServerData(
  username: string,
  history: SyncRecord[],
  settings?: AppSettings
): Promise<boolean> {
  const clean = (username || '').trim().toLowerCase();
  if (!clean) return false;

  // 1. Try Express backend
  let backendOk = false;
  try {
    const res = await fetch(`/api/user-data/${clean}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ history, settings }),
    });
    backendOk = res.ok;
  } catch {
    backendOk = false;
  }

  // 2. On Vercel or if backend is unreachable: trigger direct client JSONBin push
  if (!backendOk) {
    syncNowToJsonBin(clean, false).catch(() => {});
  }

  return true;
}

/**
 * Reconciles local and server sync records.
 * Guarantees that syncs performed on PC immediately appear on Phone and vice-versa.
 */
export async function reconcileCloudSync(
  username: string,
  localHistory: SyncRecord[],
  localSettings?: AppSettings
): Promise<{
  history: SyncRecord[];
  settings?: AppSettings;
  didUpdate: boolean;
}> {
  const clean = (username || '').trim().toLowerCase();
  if (!clean) {
    return { history: localHistory, settings: localSettings, didUpdate: false };
  }

  const serverResult = await fetchServerData(clean);
  if (!serverResult) {
    return { history: localHistory, settings: localSettings, didUpdate: false };
  }

  const serverHistory = serverResult.history || [];
  const allRecords = [...localHistory, ...serverHistory];
  const valid = allRecords.filter((r) => {
    if (!r || typeof r.bestRating !== 'number' || r.bestRating <= 0) return false;
    if (clean === 'alpharomeo1500' && r.bestRating === 1938) return false;
    if (r.username && r.username.toLowerCase() !== clean) return false;
    return true;
  });

  valid.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Strictly 1 sync per day
  const seenDays = new Set<string>();
  const mergedHistory: SyncRecord[] = [];
  for (const r of valid) {
    const d = new Date(r.timestamp);
    if (isNaN(d.getTime())) continue;
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!seenDays.has(dayKey)) {
      seenDays.add(dayKey);
      mergedHistory.push(r);
    }
  }

  const didHistoryChange =
    mergedHistory.length !== localHistory.length ||
    JSON.stringify(mergedHistory) !== JSON.stringify(localHistory);

  if (didHistoryChange) {
    saveStoredSyncHistory(mergedHistory, clean);
  }

  if (localHistory.length > 0 && mergedHistory.length >= serverHistory.length) {
    saveServerData(clean, mergedHistory, localSettings || serverResult.settings || undefined).catch(() => {});
  }

  return {
    history: mergedHistory,
    settings: localSettings || serverResult.settings || undefined,
    didUpdate: didHistoryChange,
  };
}

export async function fetchJsonBinStatus(username = 'alpharomeo1500'): Promise<JsonBinStatusInfo> {
  // 1. Try local Express server endpoint
  try {
    const res = await fetch(`/api/jsonbin/status?username=${encodeURIComponent(username)}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data && typeof data.configured === 'boolean') {
          return data;
        }
      }
    }
  } catch {
    // Fallback to client-side direct
  }

  // 2. Direct client-side mode for Vercel
  const creds = getClientJsonBinCredentials();
  const metrics = getLocalMetrics();

  return {
    configured: Boolean(creds.binId),
    binId: creds.binId || null,
    hasApiKey: Boolean(creds.apiKey),
    enabled: creds.enabled,
    lastSyncTime: metrics.lastSyncTime,
    lastStatus: metrics.lastStatus,
    lastError: metrics.lastError || null,
    quotaInfo: {
      requestsToday: metrics.requestsToday,
      savedRequests: metrics.savedRequests,
      quotaSaverActive: true,
      lastSkippedReason: metrics.lastSkippedReason || null,
      minThrottleSeconds: 300,
    },
    template: {
      exportedAt: new Date().toISOString(),
      project: 'Road to 2000 Elo',
      username,
      version: '2.0',
      recordsCount: OFFICIAL_DAILY_RECORDS.length,
      records: OFFICIAL_DAILY_RECORDS,
    },
  };
}

export async function saveJsonBinConfig(config: {
  binId?: string;
  apiKey?: string;
  enabled?: boolean;
}): Promise<{ success: boolean; lastStatus?: string; lastError?: string | null }> {
  // Save locally in browser immediately
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (typeof config.binId === 'string') {
        window.localStorage.setItem(STORAGE_KEYS.binId, config.binId.trim());
      }
      if (typeof config.apiKey === 'string') {
        window.localStorage.setItem(STORAGE_KEYS.apiKey, config.apiKey.trim());
      }
      if (typeof config.enabled === 'boolean') {
        window.localStorage.setItem(STORAGE_KEYS.enabled, String(config.enabled));
      }
    }
  } catch {}

  // Also notify server if running
  try {
    fetch('/api/jsonbin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).catch(() => {});
  } catch {}

  // Test the bin credentials directly with JSONBin.io (CORS supported)
  const creds = getClientJsonBinCredentials();
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
        saveLocalMetrics({ lastStatus: 'synced', lastError: null });
        return { success: true, lastStatus: 'synced' };
      } else {
        const msg = `Erreur ${testRes.status}: Clé ou Bin invalide`;
        saveLocalMetrics({ lastStatus: 'error', lastError: msg });
        return { success: false, lastStatus: 'error', lastError: msg };
      }
    } catch (testErr: any) {
      saveLocalMetrics({ lastStatus: 'error', lastError: 'Connexion impossible à jsonbin.io' });
      return { success: false, lastStatus: 'error', lastError: 'Connexion impossible à jsonbin.io' };
    }
  }

  return { success: true, lastStatus: 'pending_keys' };
}

export async function syncNowToJsonBin(
  username = 'alpharomeo1500',
  force = true
): Promise<{ success: boolean; error?: string; skipped?: boolean; reason?: string }> {
  // 1. Try server first
  try {
    const res = await fetch('/api/jsonbin/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, force }),
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        return { success: true, error: data?.error, skipped: data?.skipped, reason: data?.reason };
      }
    }
  } catch {
    // Fallback to direct client
  }

  // 2. Direct client-side push to JSONBin.io (Works on Vercel)
  const creds = getClientJsonBinCredentials();
  if (!creds.enabled || !creds.binId) {
    return { success: false, error: 'JSONBin non configuré' };
  }

  const metrics = getLocalMetrics();
  const cleanUser = username.trim().toLowerCase();
  const localHistory = getStoredSyncHistory(cleanUser);
  const settings = getStoredSettings();
  const currentRecords = localHistory.length > 0 ? localHistory : OFFICIAL_DAILY_RECORDS;

  // Client Quota Optimization 1: Compare signature
  const sig = `${currentRecords.length}_${currentRecords[0]?.id}_${currentRecords[0]?.bestRating}_${settings.selectedMode}`;
  if (!force && metrics.lastSignature === sig) {
    const updated = saveLocalMetrics({
      savedRequests: (metrics.savedRequests || 0) + 1,
      lastSkippedReason: 'Données strictement identiques : 0 requête consommée',
      lastStatus: 'synced',
    });
    return {
      success: true,
      skipped: true,
      reason: updated.lastSkippedReason || 'Données identiques',
    };
  }

  // Client Quota Optimization 2: 5-minute throttle unless forced
  if (!force && metrics.lastSyncTime && Date.now() - metrics.lastSyncTime < 5 * 60 * 1000) {
    const updated = saveLocalMetrics({
      savedRequests: (metrics.savedRequests || 0) + 1,
      lastSkippedReason: 'Intervalle de temporisation actif (5 min) : requête économisée',
      lastStatus: 'synced',
    });
    return {
      success: true,
      skipped: true,
      reason: updated.lastSkippedReason || 'Temporisation active',
    };
  }

  const latest = currentRecords[0] || {};
  const payload = {
    exportedAt: new Date().toISOString(),
    project: 'Road to 2000 Elo',
    username: cleanUser,
    version: '2.0',
    recordsCount: currentRecords.length,
    records: currentRecords,
    history: currentRecords,
    player: {
      username: cleanUser,
      targetElo: settings.targetElo || 2000,
      targetDate: settings.targetDate || '2027-12-31T23:59:59.000Z',
      startDate: settings.startDate || '2026-11-06',
      startRatings: {
        bullet: 1500,
        blitz: 1458,
        rapid: 1289,
      },
      currentRatings: {
        bullet: latest.bullet ?? 1605,
        blitz: latest.blitz ?? 1504,
        rapid: latest.rapid ?? 1300,
      },
      bestMode: latest.bestMode ?? 'bullet',
      bestRating: latest.bestRating ?? 1605,
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
      saveLocalMetrics({ lastStatus: 'error', lastError: `Erreur ${res.status}: ${errText.substring(0, 80)}` });
      return { success: false, error: `Erreur ${res.status} JSONBin` };
    }

    saveLocalMetrics({
      requestsToday: (metrics.requestsToday || 0) + 1,
      lastSyncTime: Date.now(),
      lastSignature: sig,
      lastSkippedReason: null,
      lastStatus: 'synced',
      lastError: null,
    });

    return { success: true };
  } catch (err: any) {
    saveLocalMetrics({ lastStatus: 'error', lastError: err?.message || 'Erreur réseau vers JSONBin' });
    return { success: false, error: err?.message || 'Erreur réseau vers JSONBin' };
  }
}

export async function pullFromJsonBin(): Promise<{ success: boolean; history?: SyncRecord[]; error?: string }> {
  // 1. Try server first
  try {
    const res = await fetch('/api/jsonbin/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data && Array.isArray(data.history)) {
          return { success: true, history: data.history };
        }
      }
    }
  } catch {
    // Fallback to client-side direct
  }

  // 2. Direct client-side fetch from JSONBin.io (Works on Vercel)
  const creds = getClientJsonBinCredentials();
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
      saveLocalMetrics({ lastStatus: 'error', lastError: `Erreur ${res.status}: Clé ou Bin invalide` });
      return { success: false, error: `Erreur ${res.status} JSONBin: ${errText.substring(0, 80)}` };
    }

    const body = await res.json();
    const binRecord = body.record || body;
    const rawList = Array.isArray(binRecord.records)
      ? binRecord.records
      : (Array.isArray(binRecord.history) ? binRecord.history : []);

    const username = (binRecord.username || binRecord.player?.username || 'alpharomeo1500').trim().toLowerCase();
    const valid = rawList.filter((r: any) => r && typeof r.bestRating === 'number' && r.bestRating > 0);
    valid.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Deduplicate by day
    const seenDays = new Set<string>();
    const onePerDay: SyncRecord[] = [];
    for (const r of valid) {
      const d = new Date(r.timestamp);
      if (isNaN(d.getTime())) continue;
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!seenDays.has(dayKey)) {
        seenDays.add(dayKey);
        onePerDay.push(r);
      }
    }

    if (onePerDay.length > 0) {
      saveStoredSyncHistory(onePerDay, username);
    }

    saveLocalMetrics({
      lastStatus: 'synced',
      lastError: null,
      lastSyncTime: Date.now(),
    });

    return { success: true, history: onePerDay };
  } catch (err: any) {
    saveLocalMetrics({ lastStatus: 'error', lastError: err?.message || 'Erreur réseau vers JSONBin' });
    return { success: false, error: err?.message || 'Erreur réseau vers JSONBin' };
  }
}
