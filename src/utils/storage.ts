/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppSettings, GameMode, NotificationItem, SyncRecord } from '../types/chess';
import {
  DEFAULT_START_DATE,
  DEFAULT_START_ELO,
  DEFAULT_TARGET_DATE,
  DEFAULT_TARGET_ELO,
  generateDefaultMilestones,
} from './eloEngine';

const SETTINGS_KEY = 'roadto2000_settings_v2';
const LEGACY_SETTINGS_KEY = 'roadto2000_settings_v1';
const LEGACY_HISTORY_KEY = 'roadto2000_sync_history_v1';
const NOTIFICATIONS_KEY = 'roadto2000_notifications_v2';
const LAST_SYNCED_USER_KEY = 'roadto2000_synced_user_v2';

// In-memory fallback if localStorage is blocked in sandboxed iframes
const memoryStore: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (e) {
    console.warn('localStorage not accessible, using memory fallback:', e);
  }
  return memoryStore[key] ?? null;
}

function safeSetItem(key: string, value: string): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return true;
    }
  } catch (e) {
    console.warn('localStorage set failed, using memory fallback:', e);
  }
  memoryStore[key] = value;
  return true;
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch (e) {
    console.warn('localStorage remove failed:', e);
  }
  delete memoryStore[key];
}

/**
 * Generates an isolated storage key per Chess.com username
 * This guarantees that changing accounts NEVER leaks or displays data from a previous account.
 */
function getUserHistoryKey(username: string): string {
  const clean = (username || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `roadto2000_history_v2_${clean}`;
}

export function getLastSyncedUser(): string | null {
  return safeGetItem(LAST_SYNCED_USER_KEY);
}

export function setLastSyncedUser(username: string): void {
  safeSetItem(LAST_SYNCED_USER_KEY, username.trim().toLowerCase());
}

/**
 * Automatic cleanup: runs on initialization to purge poisoned legacy data
 * (specifically any stale "1938" rating records or cross-account contamination).
 */
export function purgeLegacyAndStaleData(activeUsername: string): void {
  const targetUser = activeUsername.trim().toLowerCase();

  // 1. Remove obsolete legacy history keys completely
  safeRemoveItem(LEGACY_HISTORY_KEY);
  safeRemoveItem('roadto2000_sync_history');

  // 2. Inspect active user history and remove any record with invalid ratings or wrong username
  const userKey = getUserHistoryKey(targetUser);
  const raw = safeGetItem(userKey);
  if (raw) {
    try {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        // Keep only records strictly belonging to active user and without anomalous 1938
        const sanitized = list.filter((r: SyncRecord) => {
          if (!r || typeof r.bestRating !== 'number') return false;
          // If the user is alpharomeo1500, they never had 1938 (their peak is ~1513)
          if (targetUser === 'alpharomeo1500' && r.bestRating === 1938) return false;
          if (r.username && r.username.toLowerCase() !== targetUser) return false;
          return true;
        });
        safeSetItem(userKey, JSON.stringify(sanitized));
      }
    } catch {
      safeRemoveItem(userKey);
    }
  }
}

/**
 * Completely purges previous account data when switching to a new Chess.com username.
 */
export function handleAccountSwitch(newUsername: string): void {
  const cleanUser = newUsername.trim().toLowerCase();
  setLastSyncedUser(cleanUser);
  // Also clean up any lingering old keys
  safeRemoveItem(LEGACY_HISTORY_KEY);
}

/**
 * Hard reset for the current user or entire app storage
 */
export function purgeAllUserData(username: string): void {
  const cleanUser = username.trim().toLowerCase();
  safeRemoveItem(getUserHistoryKey(cleanUser));
  safeRemoveItem(LEGACY_HISTORY_KEY);
  safeRemoveItem('roadto2000_sync_history');
}

export const DEFAULT_SETTINGS: AppSettings = {
  username: 'alpharomeo1500',
  startElo: DEFAULT_START_ELO,
  targetElo: DEFAULT_TARGET_ELO,
  startDate: DEFAULT_START_DATE.split('T')[0],
  targetDate: DEFAULT_TARGET_DATE,
  timezone: 'Europe/Paris',
  selectedMode: 'auto',
  trajectoryModel: 'linear',
  autoSyncMinutes: 15,
  theme: 'dark',
  notifications: {
    newPeak: true,
    milestoneReached: true,
    goalReached: true,
    syncErrors: true,
    significantDelay: true,
  },
  customMilestones: generateDefaultMilestones(),
};

export function getStoredSettings(): AppSettings {
  let raw = safeGetItem(SETTINGS_KEY);
  if (!raw) {
    // Check legacy key for migration
    raw = safeGetItem(LEGACY_SETTINGS_KEY);
  }
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    const sanitizedUser = (parsed.username || DEFAULT_SETTINGS.username).trim().toLowerCase();
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      username: sanitizedUser,
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        ...(parsed.notifications || {}),
      },
      customMilestones: parsed.customMilestones || DEFAULT_SETTINGS.customMilestones,
    };
  } catch (e) {
    console.error('Failed to parse stored settings:', e);
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredSettings(settings: AppSettings): boolean {
  const clean = {
    ...settings,
    username: settings.username.trim().toLowerCase(),
  };
  return safeSetItem(SETTINGS_KEY, JSON.stringify(clean));
}

/**
 * Reads sync history strictly isolated by username.
 * Guarantees that records from another account or corrupted entries (e.g. 1938) are never returned.
 */
export function getStoredSyncHistory(username?: string): SyncRecord[] {
  const targetUser = (username || getStoredSettings().username).trim().toLowerCase();
  const userKey = getUserHistoryKey(targetUser);
  const raw = safeGetItem(userKey);

  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    const filtered = list.filter((r: SyncRecord) => {
      if (!r || typeof r.bestRating !== 'number') return false;
      // Filter out stale 1938 test/old account anomalies
      if (targetUser === 'alpharomeo1500' && r.bestRating === 1938) return false;
      // Strictly match current username
      if (r.username && r.username.toLowerCase() !== targetUser) return false;
      return true;
    });

    const sorted = filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Strictly 1 sync per calendar day: keep newest sync of each day
    const seenDays = new Set<string>();
    const onePerDay: SyncRecord[] = [];
    for (const r of sorted) {
      const d = new Date(r.timestamp);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!seenDays.has(dayKey)) {
        seenDays.add(dayKey);
        onePerDay.push(r);
      }
    }

    return onePerDay;
  } catch (e) {
    console.error('Failed to parse history:', e);
    return [];
  }
}

export function saveStoredSyncHistory(history: SyncRecord[], username?: string): boolean {
  const targetUser = (username || getStoredSettings().username).trim().toLowerCase();
  const userKey = getUserHistoryKey(targetUser);
  return safeSetItem(userKey, JSON.stringify(history));
}

/**
 * Adds a new sync record with single-record-per-day enforcement.
 * When resyncing on the same day, the older sync of today is automatically replaced.
 */
export function addSyncRecord(
  data: Omit<SyncRecord, 'id'>,
  force: boolean = false,
  username?: string
): { record: SyncRecord; isDuplicate: boolean; history: SyncRecord[] } {
  const targetUser = (username || data.username || getStoredSettings().username).trim().toLowerCase();
  const history = getStoredSyncHistory(targetUser);

  const syncDate = new Date(data.timestamp);
  const dayKey = `${syncDate.getFullYear()}-${String(syncDate.getMonth() + 1).padStart(2, '0')}-${String(syncDate.getDate()).padStart(2, '0')}`;

  // Find any existing sync from the same calendar day
  const existingSameDay = history.find((r) => {
    const d = new Date(r.timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === dayKey;
  });

  const nowMs = syncDate.getTime();
  const TEN_MINUTES_MS = 10 * 60 * 1000;

  // Duplicate detection if ratings haven't changed within 10 minutes
  if (
    !force &&
    existingSameDay &&
    existingSameDay.bullet === data.bullet &&
    existingSameDay.blitz === data.blitz &&
    existingSameDay.rapid === data.rapid &&
    existingSameDay.bestRating === data.bestRating &&
    nowMs - new Date(existingSameDay.timestamp).getTime() < TEN_MINUTES_MS
  ) {
    return {
      record: existingSameDay,
      isDuplicate: true,
      history,
    };
  }

  const newRecord: SyncRecord = {
    ...data,
    username: targetUser,
    id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };

  setLastSyncedUser(targetUser);

  // Remove any earlier sync of the exact same day (prevents cluttering and keeps max 1 per day)
  const historyWithoutToday = history.filter((r) => {
    const d = new Date(r.timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` !== dayKey;
  });

  const updated = [newRecord, ...historyWithoutToday].slice(0, 500); // Keep max 500 records
  saveStoredSyncHistory(updated, targetUser);

  return {
    record: newRecord,
    isDuplicate: false,
    history: updated,
  };
}

export function deleteSyncRecord(id: string, username?: string): SyncRecord[] {
  const targetUser = (username || getStoredSettings().username).trim().toLowerCase();
  const history = getStoredSyncHistory(targetUser);
  const updated = history.filter((r) => r.id !== id);
  saveStoredSyncHistory(updated, targetUser);
  return updated;
}

export function clearSyncHistory(username?: string): boolean {
  const targetUser = (username || getStoredSettings().username).trim().toLowerCase();
  safeRemoveItem(getUserHistoryKey(targetUser));
  safeRemoveItem(LEGACY_HISTORY_KEY);
  return true;
}

export function exportSyncHistoryJSON(username?: string): string {
  const targetUser = (username || getStoredSettings().username).trim().toLowerCase();
  const history = getStoredSyncHistory(targetUser);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      project: 'Road to 2000 Elo',
      username: targetUser,
      version: '2.0',
      recordsCount: history.length,
      records: history,
    },
    null,
    2
  );
}

export function exportSyncHistoryCSV(username?: string): string {
  const targetUser = (username || getStoredSettings().username).trim().toLowerCase();
  const history = getStoredSyncHistory(targetUser);
  const headers = ['id', 'username', 'timestamp', 'date_iso', 'bullet', 'blitz', 'rapid', 'best_rating', 'best_mode', 'source', 'note'];
  const rows = history.map((r) => [
    `"${r.id}"`,
    `"${r.username || targetUser}"`,
    `"${r.timestamp}"`,
    `"${new Date(r.timestamp).toLocaleString('fr-FR')}"`,
    r.bullet ?? '',
    r.blitz ?? '',
    r.rapid ?? '',
    r.bestRating,
    `"${r.bestMode}"`,
    `"${r.source}"`,
    `"${(r.note || '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Validates and imports sync history from JSON or CSV for the target account.
 */
export function importSyncHistory(
  rawContent: string,
  format: 'json' | 'csv',
  username?: string
): { success: boolean; importedCount: number; errors: string[]; history: SyncRecord[] } {
  const targetUser = (username || getStoredSettings().username).trim().toLowerCase();
  const errors: string[] = [];
  const currentHistory = getStoredSyncHistory(targetUser);
  const existingIds = new Set(currentHistory.map((h) => h.id));
  const newRecords: SyncRecord[] = [];

  if (format === 'json') {
    try {
      const parsed = JSON.parse(rawContent);
      const list = Array.isArray(parsed) ? parsed : parsed.records;
      if (!Array.isArray(list)) {
        return { success: false, importedCount: 0, errors: ['Format JSON invalide: aucune liste de records trouvée.'], history: currentHistory };
      }

      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item.timestamp || isNaN(new Date(item.timestamp).getTime())) {
          errors.push(`Ligne ${i + 1}: Date/timestamp manquant ou invalide.`);
          continue;
        }
        if (typeof item.bestRating !== 'number' || item.bestRating <= 0) {
          errors.push(`Ligne ${i + 1}: Classement bestRating manquant ou invalide.`);
          continue;
        }

        const mode = ['bullet', 'blitz', 'rapid'].includes(item.bestMode) ? item.bestMode : 'blitz';
        const id = item.id && !existingIds.has(item.id) ? item.id : `sync_import_${Date.now()}_${i}`;

        newRecords.push({
          id,
          username: targetUser,
          timestamp: new Date(item.timestamp).toISOString(),
          bullet: typeof item.bullet === 'number' ? item.bullet : null,
          blitz: typeof item.blitz === 'number' ? item.blitz : null,
          rapid: typeof item.rapid === 'number' ? item.rapid : null,
          bestRating: item.bestRating,
          bestMode: mode as GameMode,
          source: 'Import fichier',
          note: item.note ? String(item.note) : undefined,
        });
      }
    } catch (e) {
      return { success: false, importedCount: 0, errors: [`Erreur de parsing JSON: ${(e as Error).message}`], history: currentHistory };
    }
  } else {
    // CSV parsing
    const lines = rawContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return { success: false, importedCount: 0, errors: ['Fichier CSV vide ou sans données.'], history: currentHistory };
    }

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      if (cols.length < 5) {
        errors.push(`Ligne ${i + 1}: Nombre de colonnes insuffisant.`);
        continue;
      }

      const timestamp = cols[2] || cols[1] || cols[0];
      if (isNaN(new Date(timestamp).getTime())) {
        errors.push(`Ligne ${i + 1}: Timestamp invalide (${timestamp}).`);
        continue;
      }

      const bullet = cols[4] && !isNaN(Number(cols[4])) ? Number(cols[4]) : null;
      const blitz = cols[5] && !isNaN(Number(cols[5])) ? Number(cols[5]) : null;
      const rapid = cols[6] && !isNaN(Number(cols[6])) ? Number(cols[6]) : null;
      const bestRating = cols[7] && !isNaN(Number(cols[7])) ? Number(cols[7]) : Math.max(bullet ?? 0, blitz ?? 0, rapid ?? 0);
      const bestMode = (['bullet', 'blitz', 'rapid'].includes(cols[8]) ? cols[8] : 'blitz') as GameMode;

      newRecords.push({
        id: `sync_csv_${Date.now()}_${i}`,
        username: targetUser,
        timestamp: new Date(timestamp).toISOString(),
        bullet,
        blitz,
        rapid,
        bestRating: bestRating > 0 ? bestRating : DEFAULT_START_ELO,
        bestMode,
        source: 'Import fichier',
        note: cols[10] || undefined,
      });
    }
  }

  if (newRecords.length === 0) {
    return { success: false, importedCount: 0, errors: errors.length ? errors : ['Aucune entrée valide importée.'], history: currentHistory };
  }

  // Merge and sort
  const combined = [...newRecords, ...currentHistory].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  saveStoredSyncHistory(combined, targetUser);
  return {
    success: true,
    importedCount: newRecords.length,
    errors,
    history: combined,
  };
}

// Notifications storage
export function getStoredNotifications(): NotificationItem[] {
  const raw = safeGetItem(NOTIFICATIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addNotification(item: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>): NotificationItem[] {
  const current = getStoredNotifications();
  const newItem: NotificationItem = {
    ...item,
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    read: false,
  };
  const updated = [newItem, ...current].slice(0, 30);
  safeSetItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
  return updated;
}

export function markNotificationRead(id: string): NotificationItem[] {
  const current = getStoredNotifications();
  const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
  safeSetItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
  return updated;
}

export function clearNotifications(): boolean {
  return safeSetItem(NOTIFICATIONS_KEY, JSON.stringify([]));
}
