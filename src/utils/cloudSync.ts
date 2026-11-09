/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppSettings, SyncRecord } from '../types/chess';
import { getStoredSettings, getStoredSyncHistory, saveStoredSettings, saveStoredSyncHistory } from './storage';

/**
 * Cloud Sync Utility:
 * Synchronizes sync history and settings between PC and Smartphone using the server-side persistent JSON store.
 */

export async function fetchServerData(username: string): Promise<{
  history: SyncRecord[];
  settings: AppSettings | null;
  lastUpdated: number;
} | null> {
  const clean = (username || '').trim().toLowerCase();
  if (!clean) return null;

  try {
    const res = await fetch(`/api/user-data/${clean}`, {
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      history: Array.isArray(data.history) ? data.history : [],
      settings: data.settings || null,
      lastUpdated: data.lastUpdated || 0,
    };
  } catch (err) {
    console.warn('[CloudSync] Server unreachable:', err);
    return null;
  }
}

export async function saveServerData(
  username: string,
  history: SyncRecord[],
  settings?: AppSettings
): Promise<boolean> {
  const clean = (username || '').trim().toLowerCase();
  if (!clean) return false;

  try {
    const res = await fetch(`/api/user-data/${clean}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        history,
        settings,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[CloudSync] Failed to push to server:', err);
    return false;
  }
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
    // Server unreachable, fallback to local
    return { history: localHistory, settings: localSettings, didUpdate: false };
  }

  const serverHistory = serverResult.history || [];

  // Merge server records and local records
  const allRecords = [...localHistory, ...serverHistory];
  const valid = allRecords.filter((r) => {
    if (!r || typeof r.bestRating !== 'number' || r.bestRating <= 0) return false;
    if (clean === 'alpharomeo1500' && r.bestRating === 1938) return false;
    if (r.username && r.username.toLowerCase() !== clean) return false;
    return true;
  });

  // Sort newest first
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

  // If local had records that the server did not have, push merged up to server
  if (localHistory.length > 0 && mergedHistory.length >= serverHistory.length) {
    saveServerData(clean, mergedHistory, localSettings || serverResult.settings || undefined).catch(() => {});
  }

  return {
    history: mergedHistory,
    settings: localSettings || serverResult.settings || undefined,
    didUpdate: didHistoryChange,
  };
}
