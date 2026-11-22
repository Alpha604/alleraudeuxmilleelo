/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cloud Accounts Registry Utility (JSONBin.io + Express Backend Sync)
 * Automatically catalogs and synchronizes all created player accounts, statuses,
 * isolated JSONBin Bin IDs, and project settings across devices.
 */

const REGISTRY_CONFIG_KEYS = {
  binId: 'roadto2000_accounts_registry_binid',
  apiKey: 'roadto2000_accounts_registry_apikey',
  enabled: 'roadto2000_accounts_registry_enabled',
  lastSync: 'roadto2000_accounts_registry_last_sync',
  lastPull: 'roadto2000_accounts_registry_last_pull',
  lastStatus: 'roadto2000_accounts_registry_status',
  lastError: 'roadto2000_accounts_registry_error',
};

const ACCOUNTS_LIST_KEY = 'roadto2000_managed_accounts_list_v2';

// Global Accounts Registry JSONBin defaults
const DEFAULT_REGISTRY_BIN_ID = '6af9f1d7ffd5d16053c38f30';
const DEFAULT_REGISTRY_API_KEY = '$2a$10$nOO6WNU996CcWwBht/K8MuDshQsOPktO28uEy.WTBESmEHAsRjcZy';

export type RegistryAccountStatus = 'active' | 'suspended' | 'banned';

export interface RegistryAccountEntry {
  username: string;
  status: RegistryAccountStatus;
  isMaster: boolean;
  createdAt: string;
  jsonBinId: string;
  settings: {
    username: string;
    startElo: number;
    targetElo: number;
    startDate: string;
    targetDate: string;
    selectedMode: string;
    trajectoryModel: string;
  };
}

export interface AccountsRegistryPayload {
  project: string;
  type: 'accounts_registry';
  version: string;
  updatedAt: string;
  accountsCount: number;
  accounts: RegistryAccountEntry[];
}

export interface AccountsRegistryConfigState {
  binId: string;
  apiKey: string;
  enabled: boolean;
  configured: boolean;
  lastSyncTime: number | null;
  lastStatus: 'synced' | 'pending_keys' | 'error' | 'syncing';
  lastError: string | null;
}

function safeGet(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {}
  return null;
}

function safeSet(key: string, val: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, val);
    }
  } catch {}
}

export function getAccountsRegistryConfig(): AccountsRegistryConfigState {
  const storedBin = (safeGet(REGISTRY_CONFIG_KEYS.binId) || '').trim();
  const storedKey = (safeGet(REGISTRY_CONFIG_KEYS.apiKey) || '').trim();
  const storedEnabled = safeGet(REGISTRY_CONFIG_KEYS.enabled);
  const storedLastSync = safeGet(REGISTRY_CONFIG_KEYS.lastSync);
  const storedStatus = safeGet(REGISTRY_CONFIG_KEYS.lastStatus) as
    | 'synced'
    | 'pending_keys'
    | 'error'
    | 'syncing'
    | null;
  const storedError = safeGet(REGISTRY_CONFIG_KEYS.lastError);

  const binId = storedBin || DEFAULT_REGISTRY_BIN_ID;
  const apiKey = storedKey || (binId ? DEFAULT_REGISTRY_API_KEY : '');
  const enabled = storedEnabled !== null ? storedEnabled === 'true' : true;
  const configured = Boolean(binId);

  return {
    binId,
    apiKey,
    enabled,
    configured,
    lastSyncTime: storedLastSync ? Number(storedLastSync) || null : null,
    lastStatus: configured ? storedStatus || 'synced' : 'pending_keys',
    lastError: storedError || null,
  };
}

/**
 * Builds the complete JSON payload representing all registered platform accounts.
 * This is also the exact base JSON format to paste when creating the Bin on jsonbin.io.
 */
export function buildAccountsRegistryPayload(): AccountsRegistryPayload {
  let usernames: string[] = ['alpharomeo1500'];
  try {
    const raw = safeGet(ACCOUNTS_LIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        usernames = Array.from(
          new Set(['alpharomeo1500', ...parsed.map((u) => String(u).trim().toLowerCase()).filter(Boolean)])
        );
      }
    }
  } catch {}

  const accounts: RegistryAccountEntry[] = usernames.map((uname) => {
    const isMaster = uname === 'alpharomeo1500';
    const rawStatus = safeGet(`roadto2000_acc_status_${uname}`);
    const status: RegistryAccountStatus =
      !isMaster && (rawStatus === 'suspended' || rawStatus === 'banned') ? rawStatus : 'active';

    const binId =
      (safeGet(`roadto2000_jsonbin_binid_${uname}`) ||
        (isMaster ? safeGet('roadto2000_jsonbin_binid') || '6af3559affd5d16053b75b82' : '')).trim();

    let parsedSettings: Record<string, any> = {};
    try {
      const rawSettings = safeGet(`roadto2000_settings_${uname}`);
      if (rawSettings) parsedSettings = JSON.parse(rawSettings);
    } catch {}

    const createdAt =
      safeGet(`roadto2000_acc_created_${uname}`) ||
      (isMaster ? '2026-11-01T00:00:00.000Z' : new Date().toISOString());

    return {
      username: uname,
      status,
      isMaster,
      createdAt,
      jsonBinId: binId,
      settings: {
        username: uname,
        startElo: typeof parsedSettings.startElo === 'number' ? parsedSettings.startElo : 1500,
        targetElo: typeof parsedSettings.targetElo === 'number' ? parsedSettings.targetElo : 2000,
        startDate: parsedSettings.startDate || '2026-11-06',
        targetDate: parsedSettings.targetDate || '2027-12-31',
        selectedMode: parsedSettings.selectedMode || 'auto',
        trajectoryModel: parsedSettings.trajectoryModel || 'linear',
      },
    };
  });

  return {
    project: 'Road to 2000 Elo',
    type: 'accounts_registry',
    version: '1.0',
    updatedAt: new Date().toISOString(),
    accountsCount: accounts.length,
    accounts,
  };
}

export async function saveAccountsRegistryConfig(config: {
  binId?: string;
  apiKey?: string;
  enabled?: boolean;
}): Promise<{ success: boolean; status: 'synced' | 'pending_keys' | 'error'; error?: string | null }> {
  if (typeof config.binId === 'string') {
    safeSet(REGISTRY_CONFIG_KEYS.binId, config.binId.trim());
  }
  if (typeof config.apiKey === 'string') {
    safeSet(REGISTRY_CONFIG_KEYS.apiKey, config.apiKey.trim());
  }
  if (typeof config.enabled === 'boolean') {
    safeSet(REGISTRY_CONFIG_KEYS.enabled, String(config.enabled));
  }

  // Notify Express backend if active
  try {
    if (typeof fetch !== 'undefined') {
      fetch('/api/accounts-registry/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }).catch(() => {});
    }
  } catch {}

  const current = getAccountsRegistryConfig();
  if (!current.binId) {
    safeSet(REGISTRY_CONFIG_KEYS.lastStatus, 'pending_keys');
    safeSet(REGISTRY_CONFIG_KEYS.lastError, '');
    return { success: true, status: 'pending_keys', error: null };
  }

  // Test connection to JSONBin.io
  try {
    const headers: Record<string, string> = {};
    if (current.apiKey) {
      headers['X-Master-Key'] = current.apiKey;
      headers['X-Access-Key'] = current.apiKey;
    }

    const res = await fetch(`https://api.jsonbin.io/v3/b/${current.binId}/latest`, { headers });
    if (!res.ok) {
      const msg = `Erreur ${res.status} : Bin ID ou Clé API invalide`;
      safeSet(REGISTRY_CONFIG_KEYS.lastStatus, 'error');
      safeSet(REGISTRY_CONFIG_KEYS.lastError, msg);
      return { success: false, status: 'error', error: msg };
    }

    safeSet(REGISTRY_CONFIG_KEYS.lastStatus, 'synced');
    safeSet(REGISTRY_CONFIG_KEYS.lastError, '');
    safeSet(REGISTRY_CONFIG_KEYS.lastSync, String(Date.now()));
    return { success: true, status: 'synced', error: null };
  } catch {
    const msg = 'Connexion impossible à api.jsonbin.io';
    safeSet(REGISTRY_CONFIG_KEYS.lastStatus, 'error');
    safeSet(REGISTRY_CONFIG_KEYS.lastError, msg);
    return { success: false, status: 'error', error: msg };
  }
}

export async function pushAccountsRegistryToJsonBin(): Promise<{
  success: boolean;
  accountsCount?: number;
  error?: string;
}> {
  const cfg = getAccountsRegistryConfig();
  if (!cfg.enabled || !cfg.binId) {
    return { success: false, error: 'Bin du registre non configuré' };
  }

  const payload = buildAccountsRegistryPayload();

  // Also notify Express backend if running
  try {
    if (typeof fetch !== 'undefined') {
      fetch('/api/accounts-registry/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  } catch {}

  try {
    safeSet(REGISTRY_CONFIG_KEYS.lastStatus, 'syncing');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cfg.apiKey) {
      headers['X-Master-Key'] = cfg.apiKey;
      headers['X-Access-Key'] = cfg.apiKey;
    }

    // Read existing remote record first (Merge-Before-PUT) to preserve siteActivity, totpConfig, etc.
    let remoteRecord: Record<string, any> = {};
    try {
      const latestRes = await fetch(`https://api.jsonbin.io/v3/b/${cfg.binId}/latest`, {
        headers: cfg.apiKey
          ? { 'X-Master-Key': cfg.apiKey, 'X-Access-Key': cfg.apiKey }
          : {},
      });
      if (latestRes.ok) {
        const latestBody = await latestRes.json();
        if (latestBody && typeof latestBody === 'object') {
          remoteRecord = latestBody.record || latestBody;
        }
      }
    } catch {}

    const mergedPayload = {
      ...remoteRecord,
      ...payload,
    };

    const res = await fetch(`https://api.jsonbin.io/v3/b/${cfg.binId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(mergedPayload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const errMsg = `Erreur ${res.status} : ${errText.substring(0, 80) || 'Rejet JSONBin'}`;
      safeSet(REGISTRY_CONFIG_KEYS.lastStatus, 'error');
      safeSet(REGISTRY_CONFIG_KEYS.lastError, errMsg);
      return { success: false, error: errMsg };
    }

    safeSet(REGISTRY_CONFIG_KEYS.lastStatus, 'synced');
    safeSet(REGISTRY_CONFIG_KEYS.lastError, '');
    safeSet(REGISTRY_CONFIG_KEYS.lastSync, String(Date.now()));
    return { success: true, accountsCount: payload.accountsCount };
  } catch (err: any) {
    const msg = err?.message || 'Erreur réseau vers JSONBin';
    safeSet(REGISTRY_CONFIG_KEYS.lastStatus, 'error');
    safeSet(REGISTRY_CONFIG_KEYS.lastError, msg);
    return { success: false, error: msg };
  }
}

/**
 * Pulls registered accounts from the global Registry JSONBin into localStorage
 * and dispatches 'roadto2000:accounts-updated'.
 * Throttled to 2 minutes unless force = true to protect JSONBin quota.
 */
export async function pullAccountsRegistryFromJsonBin(force = false): Promise<{
  success: boolean;
  importedCount?: number;
  skipped?: boolean;
  error?: string;
}> {
  const cfg = getAccountsRegistryConfig();
  if (!cfg.enabled || !cfg.binId) {
    return { success: false, error: 'Bin du registre non configuré' };
  }

  const lastPull = Number(safeGet(REGISTRY_CONFIG_KEYS.lastPull) || '0');
  if (!force && lastPull && Date.now() - lastPull < 2 * 60 * 1000) {
    return { success: true, skipped: true };
  }

  try {
    const headers: Record<string, string> = {};
    if (cfg.apiKey) {
      headers['X-Master-Key'] = cfg.apiKey;
      headers['X-Access-Key'] = cfg.apiKey;
    }

    const res = await fetch(`https://api.jsonbin.io/v3/b/${cfg.binId}/latest`, { headers });
    if (!res.ok) {
      const errMsg = `Erreur ${res.status} JSONBin`;
      safeSet(REGISTRY_CONFIG_KEYS.lastStatus, 'error');
      safeSet(REGISTRY_CONFIG_KEYS.lastError, errMsg);
      return { success: false, error: errMsg };
    }

    const body = await res.json();
    const record = body.record || body;
    const remoteAccounts: any[] = Array.isArray(record.accounts) ? record.accounts : [];
    const deletedSet = new Set<string>(
      Array.isArray(record.deletedUsernames)
        ? record.deletedUsernames.map((u: any) => String(u).trim().toLowerCase())
        : []
    );

    let localUsernames: string[] = ['alpharomeo1500'];
    try {
      const rawLocal = safeGet(ACCOUNTS_LIST_KEY);
      if (rawLocal) {
        const parsedLocal = JSON.parse(rawLocal);
        if (Array.isArray(parsedLocal)) {
          localUsernames = parsedLocal
            .map((u) => String(u).trim().toLowerCase())
            .filter((u) => u && !deletedSet.has(u));
        }
      }
    } catch {}

    const validUsernames: string[] = Array.from(new Set(['alpharomeo1500', ...localUsernames]));

    for (const entry of remoteAccounts) {
      if (!entry || typeof entry.username !== 'string') continue;
      const cleanUser = entry.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!cleanUser || cleanUser.length < 3 || deletedSet.has(cleanUser)) continue;

      if (!validUsernames.includes(cleanUser)) {
        validUsernames.push(cleanUser);
      }

      if (cleanUser !== 'alpharomeo1500') {
        const status: RegistryAccountStatus =
          entry.status === 'suspended' || entry.status === 'banned' ? entry.status : 'active';
        safeSet(`roadto2000_acc_status_${cleanUser}`, status);
      }

      if (typeof entry.createdAt === 'string' && entry.createdAt) {
        safeSet(`roadto2000_acc_created_${cleanUser}`, entry.createdAt);
      }

      if (typeof entry.jsonBinId === 'string' && entry.jsonBinId.trim()) {
        safeSet(`roadto2000_jsonbin_binid_${cleanUser}`, entry.jsonBinId.trim());
        safeSet(`roadto2000_jsonbin_enabled_${cleanUser}`, 'true');
      }

      if (entry.settings && typeof entry.settings === 'object') {
        let existingSettings: Record<string, any> = {};
        try {
          const rawExisting = safeGet(`roadto2000_settings_${cleanUser}`);
          if (rawExisting) existingSettings = JSON.parse(rawExisting);
        } catch {}

        const merged = {
          autoSyncMinutes: 0,
          notifications: { newPeak: true, goalReached: true, syncErrors: true },
          theme: 'dark',
          customMilestones: [],
          ...existingSettings,
          ...entry.settings,
          username: cleanUser,
        };
        safeSet(`roadto2000_settings_${cleanUser}`, JSON.stringify(merged));
      }
    }

    safeSet(ACCOUNTS_LIST_KEY, JSON.stringify(Array.from(new Set(validUsernames))));
    safeSet(REGISTRY_CONFIG_KEYS.lastPull, String(Date.now()));
    safeSet(REGISTRY_CONFIG_KEYS.lastStatus, 'synced');
    safeSet(REGISTRY_CONFIG_KEYS.lastError, '');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('roadto2000:accounts-updated'));
    }

    return { success: true, importedCount: validUsernames.length };
  } catch (err: any) {
    const msg = err?.message || 'Erreur réseau vers JSONBin';
    safeSet(REGISTRY_CONFIG_KEYS.lastStatus, 'error');
    safeSet(REGISTRY_CONFIG_KEYS.lastError, msg);
    return { success: false, error: msg };
  }
}

let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced background push triggered automatically whenever accounts are created, edited, banned, or deleted.
 */
export function scheduleAccountsRegistryPush(): void {
  const cfg = getAccountsRegistryConfig();
  if (!cfg.enabled || !cfg.binId) return;

  if (pushDebounceTimer) {
    clearTimeout(pushDebounceTimer);
  }
  pushDebounceTimer = setTimeout(() => {
    pushDebounceTimer = null;
    pushAccountsRegistryToJsonBin().catch(() => {});
  }, 600);
}
