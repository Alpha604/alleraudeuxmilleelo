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

const SETTINGS_KEY = 'roadto2000_settings_v1';
const HISTORY_KEY = 'roadto2000_sync_history_v1';
const NOTIFICATIONS_KEY = 'roadto2000_notifications_v1';

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
  const raw = safeGetItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
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
  return safeSetItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getStoredSyncHistory(): SyncRecord[] {
  const raw = safeGetItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (e) {
    console.error('Failed to parse history:', e);
    return [];
  }
}

export function saveStoredSyncHistory(history: SyncRecord[]): boolean {
  return safeSetItem(HISTORY_KEY, JSON.stringify(history));
}

/**
 * Adds a new sync record with duplicate detection.
 * If ratings match the latest record and occurred within 10 minutes, marks as duplicate.
 */
export function addSyncRecord(
  data: Omit<SyncRecord, 'id'>,
  force: boolean = false
): { record: SyncRecord; isDuplicate: boolean; history: SyncRecord[] } {
  const history = getStoredSyncHistory();
  const latest = history[0];

  const nowMs = new Date(data.timestamp).getTime();
  const TEN_MINUTES_MS = 10 * 60 * 1000;

  if (
    !force &&
    latest &&
    latest.bullet === data.bullet &&
    latest.blitz === data.blitz &&
    latest.rapid === data.rapid &&
    latest.bestRating === data.bestRating &&
    nowMs - new Date(latest.timestamp).getTime() < TEN_MINUTES_MS
  ) {
    return {
      record: latest,
      isDuplicate: true,
      history,
    };
  }

  const newRecord: SyncRecord = {
    ...data,
    id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };

  const updated = [newRecord, ...history].slice(0, 500); // Keep last 500 records
  saveStoredSyncHistory(updated);

  return {
    record: newRecord,
    isDuplicate: false,
    history: updated,
  };
}

export function deleteSyncRecord(id: string): SyncRecord[] {
  const history = getStoredSyncHistory();
  const updated = history.filter((r) => r.id !== id);
  saveStoredSyncHistory(updated);
  return updated;
}

export function clearSyncHistory(): boolean {
  return safeSetItem(HISTORY_KEY, JSON.stringify([]));
}

export function exportSyncHistoryJSON(): string {
  const history = getStoredSyncHistory();
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      project: 'Road to 2000 Elo',
      version: '1.0',
      recordsCount: history.length,
      records: history,
    },
    null,
    2
  );
}

export function exportSyncHistoryCSV(): string {
  const history = getStoredSyncHistory();
  const headers = ['id', 'timestamp', 'date_iso', 'bullet', 'blitz', 'rapid', 'best_rating', 'best_mode', 'source', 'note'];
  const rows = history.map((r) => [
    `"${r.id}"`,
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
 * Validates and imports sync history from JSON or CSV.
 */
export function importSyncHistory(
  rawContent: string,
  format: 'json' | 'csv'
): { success: boolean; importedCount: number; errors: string[]; history: SyncRecord[] } {
  const errors: string[] = [];
  const currentHistory = getStoredSyncHistory();
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

      // Expected order: id, timestamp, date_iso, bullet, blitz, rapid, best_rating, best_mode, source, note
      const timestamp = cols[1] || cols[0];
      if (isNaN(new Date(timestamp).getTime())) {
        errors.push(`Ligne ${i + 1}: Timestamp invalide (${timestamp}).`);
        continue;
      }

      const bullet = cols[3] && !isNaN(Number(cols[3])) ? Number(cols[3]) : null;
      const blitz = cols[4] && !isNaN(Number(cols[4])) ? Number(cols[4]) : null;
      const rapid = cols[5] && !isNaN(Number(cols[5])) ? Number(cols[5]) : null;
      const bestRating = cols[6] && !isNaN(Number(cols[6])) ? Number(cols[6]) : Math.max(bullet ?? 0, blitz ?? 0, rapid ?? 0);
      const bestMode = (['bullet', 'blitz', 'rapid'].includes(cols[7]) ? cols[7] : 'blitz') as GameMode;

      newRecords.push({
        id: `sync_csv_${Date.now()}_${i}`,
        timestamp: new Date(timestamp).toISOString(),
        bullet,
        blitz,
        rapid,
        bestRating: bestRating > 0 ? bestRating : DEFAULT_START_ELO,
        bestMode,
        source: 'Import fichier',
        note: cols[9] || undefined,
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

  saveStoredSyncHistory(combined);
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
