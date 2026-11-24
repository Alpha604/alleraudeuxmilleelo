/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  fetchSiteActivityFromFirestore,
  saveSiteActivityToFirestore,
  subscribeSiteActivityFirestore,
} from './firebaseMirror';
import { safeApiFetch } from './backendApi';
import { resolveSyncIssuesByKeyPrefix } from './syncDiagnostics';

export { subscribeSiteActivityFirestore };

export type SitePauseMode =
  | 'arret'
  | 'maintenance'
  | 'administration'
  | 'moderation'
  | 'mise_a_jour';

export type ScheduleType = 'immediate' | 'countdown' | 'exact_date';
export type ResumeType = 'manual' | 'duration' | 'exact_date';
export type IframePolicy = 'block_all' | 'block_only_iframes' | 'allow_iframes';
export type IpPolicyMode = 'all' | 'except_list' | 'only_list';
export type DeviceCategory = 'desktop' | 'mobile' | 'tablet';

export interface SiteActivityConfig {
  enabled: boolean;
  mode: SitePauseMode;
  customTitle: string;
  customMessage: string;
  upcomingVersion?: string;
  extendedDetails?: string;
  scheduleType: ScheduleType;
  countdownMinutes: number;
  pauseAtTimestamp: number | null;
  resumeType: ResumeType;
  resumeDurationMinutes: number;
  resumeAtTimestamp: number | null;
  autoResume: boolean;
  showCountdownBanner: boolean;
  devices: {
    all: boolean;
    desktop: boolean;
    mobile: boolean;
    tablet: boolean;
  };
  iframePolicy: IframePolicy;
  ipPolicy: {
    mode: IpPolicyMode;
    ips: string[];
    exemptTrustedAdminIps: boolean;
  };
  allowAdminBypass: boolean;
  revision: number;
  updatedAt: number;
  updatedBy: string;
}

export interface SiteActivityEvaluation {
  isPausedTimeReached: boolean;
  isCountdownActive: boolean;
  secondsUntilPause: number | null;
  secondsUntilResume: number | null;
  matchesDevice: boolean;
  matchesIframe: boolean;
  matchesIp: boolean;
  matchesTarget: boolean;
  isBlocked: boolean;
  isBypassedByAdmin: boolean;
  autoResumedExpired: boolean;
}

export const SITE_PAUSE_MODE_META: Record<
  SitePauseMode,
  {
    id: SitePauseMode;
    label: string;
    shortLabel: string;
    defaultTitle: string;
    defaultMessage: string;
    accentHex: string;
    badgeClasses: string;
  }
> = {
  arret: {
    id: 'arret',
    label: 'Mode Arrêt',
    shortLabel: 'Arrêt',
    defaultTitle: 'Site temporairement à l’arrêt',
    defaultMessage:
      'La plateforme Road to 2000 Elo a été volontairement mise à l’arrêt par l’administrateur.',
    accentHex: '#ef4444',
    badgeClasses: 'border-[#ef4444]/40 bg-[#ef4444]/15 text-[#ef4444]',
  },
  maintenance: {
    id: 'maintenance',
    label: 'Maintenance',
    shortLabel: 'Maintenance',
    defaultTitle: 'Maintenance technique en cours',
    defaultMessage:
      'Une opération de maintenance est en cours pour sécuriser et optimiser vos données.',
    accentHex: '#f59e0b',
    badgeClasses: 'border-amber-500/40 bg-amber-500/15 text-amber-400',
  },
  administration: {
    id: 'administration',
    label: 'Administration',
    shortLabel: 'Admin',
    defaultTitle: 'Intervention Administrative',
    defaultMessage:
      'L’accès public est momentanément suspendu pendant une opération d’administration.',
    accentHex: '#facc15',
    badgeClasses: 'border-[#facc15]/40 bg-[#facc15]/15 text-[#facc15]',
  },
  moderation: {
    id: 'moderation',
    label: 'Modération',
    shortLabel: 'Modération',
    defaultTitle: 'Vérification & Modération en cours',
    defaultMessage:
      'Le site est temporairement mis en pause le temps d’effectuer une vérification de modération.',
    accentHex: '#a855f7',
    badgeClasses: 'border-purple-500/40 bg-purple-500/15 text-purple-400',
  },
  mise_a_jour: {
    id: 'mise_a_jour',
    label: 'Mise à jour',
    shortLabel: 'Mise à jour',
    defaultTitle: 'Déploiement d’une mise à jour',
    defaultMessage:
      'Nouvelles fonctionnalités et améliorations en cours d’installation sur la plateforme.',
    accentHex: '#38bdf8',
    badgeClasses: 'border-sky-500/40 bg-sky-500/15 text-sky-400',
  },
};

const SITE_ACTIVITY_STORAGE_KEY = 'roadto2000_site_activity_v1';
const GLOBAL_CLOUD_BIN_ID = '6af9f1d7ffd5d16053c38f30';
const GLOBAL_CLOUD_API_KEY = '$2a$10$nOO6WNU996CcWwBht/K8MuDshQsOPktO28uEy.WTBESmEHAsRjcZy';

export function getDefaultSiteActivityConfig(): SiteActivityConfig {
  return {
    enabled: false,
    mode: 'maintenance',
    customTitle: SITE_PAUSE_MODE_META.maintenance.defaultTitle,
    customMessage: SITE_PAUSE_MODE_META.maintenance.defaultMessage,
    upcomingVersion: '',
    extendedDetails: '',
    scheduleType: 'immediate',
    countdownMinutes: 5,
    pauseAtTimestamp: null,
    resumeType: 'manual',
    resumeDurationMinutes: 30,
    resumeAtTimestamp: null,
    autoResume: false,
    showCountdownBanner: true,
    devices: {
      all: true,
      desktop: true,
      mobile: true,
      tablet: true,
    },
    iframePolicy: 'block_all',
    ipPolicy: {
      mode: 'all',
      ips: [],
      exemptTrustedAdminIps: true,
    },
    allowAdminBypass: true,
    revision: 0,
    updatedAt: 0,
    updatedBy: 'alpharomeo1500',
  };
}

export function normalizeSiteActivityConfig(
  raw: Partial<SiteActivityConfig> | null | undefined
): SiteActivityConfig {
  const def = getDefaultSiteActivityConfig();
  if (!raw || typeof raw !== 'object') return def;

  const validModes: SitePauseMode[] = [
    'arret',
    'maintenance',
    'administration',
    'moderation',
    'mise_a_jour',
  ];
  const mode: SitePauseMode = validModes.includes(raw.mode as SitePauseMode)
    ? (raw.mode as SitePauseMode)
    : def.mode;

  return {
    enabled: Boolean(raw.enabled),
    mode,
    customTitle:
      typeof raw.customTitle === 'string' && raw.customTitle.trim()
        ? raw.customTitle.slice(0, 120)
        : SITE_PAUSE_MODE_META[mode].defaultTitle,
    customMessage:
      typeof raw.customMessage === 'string' && raw.customMessage.trim()
        ? raw.customMessage.slice(0, 2000)
        : SITE_PAUSE_MODE_META[mode].defaultMessage,
    upcomingVersion:
      typeof raw.upcomingVersion === 'string'
        ? raw.upcomingVersion.trim().replace(/^v+/i, '').slice(0, 32)
        : '',
    extendedDetails:
      typeof raw.extendedDetails === 'string' ? raw.extendedDetails.slice(0, 2500) : '',
    scheduleType:
      raw.scheduleType === 'countdown' || raw.scheduleType === 'exact_date'
        ? raw.scheduleType
        : 'immediate',
    countdownMinutes:
      typeof raw.countdownMinutes === 'number' && raw.countdownMinutes > 0
        ? raw.countdownMinutes
        : 5,
    pauseAtTimestamp:
      typeof raw.pauseAtTimestamp === 'number' && raw.pauseAtTimestamp > 0
        ? raw.pauseAtTimestamp
        : null,
    resumeType:
      raw.resumeType === 'duration' || raw.resumeType === 'exact_date'
        ? raw.resumeType
        : 'manual',
    resumeDurationMinutes:
      typeof raw.resumeDurationMinutes === 'number' && raw.resumeDurationMinutes > 0
        ? raw.resumeDurationMinutes
        : 30,
    resumeAtTimestamp:
      typeof raw.resumeAtTimestamp === 'number' && raw.resumeAtTimestamp > 0
        ? raw.resumeAtTimestamp
        : null,
    autoResume: Boolean(raw.autoResume),
    showCountdownBanner: raw.showCountdownBanner !== false,
    devices: {
      all: raw.devices?.all !== undefined ? Boolean(raw.devices.all) : true,
      desktop: raw.devices?.desktop !== undefined ? Boolean(raw.devices.desktop) : true,
      mobile: raw.devices?.mobile !== undefined ? Boolean(raw.devices.mobile) : true,
      tablet: raw.devices?.tablet !== undefined ? Boolean(raw.devices.tablet) : true,
    },
    iframePolicy:
      raw.iframePolicy === 'block_only_iframes' || raw.iframePolicy === 'allow_iframes'
        ? raw.iframePolicy
        : 'block_all',
    ipPolicy: {
      mode:
        raw.ipPolicy?.mode === 'except_list' || raw.ipPolicy?.mode === 'only_list'
          ? raw.ipPolicy.mode
          : 'all',
      ips: Array.isArray(raw.ipPolicy?.ips)
        ? Array.from(
            new Set(
              raw.ipPolicy.ips
                .map((ip) => String(ip).trim())
                .filter((ip) => ip.length >= 3)
            )
          )
        : [],
      exemptTrustedAdminIps: raw.ipPolicy?.exemptTrustedAdminIps !== false,
    },
    allowAdminBypass: raw.allowAdminBypass !== false,
    revision: typeof raw.revision === 'number' && Number.isFinite(raw.revision) ? raw.revision : 0,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : 'alpharomeo1500',
  };
}

export function detectDeviceCategory(): DeviceCategory {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = (navigator.userAgent || '').toLowerCase();
  const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const maxTouch = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;

  // Modern iPads identify as Macintosh + maxTouchPoints > 1
  if (
    /ipad|tablet|playbook|silk|(android(?!.*mobi))/i.test(ua) ||
    (/macintosh/i.test(ua) && maxTouch > 1)
  ) {
    return 'tablet';
  }
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua) || width < 640) {
    return 'mobile';
  }
  if (
    width >= 640 &&
    width < 1024 &&
    (maxTouch > 0 || 'ontouchstart' in (typeof window !== 'undefined' ? window : {}))
  ) {
    return 'tablet';
  }
  return 'desktop';
}

export function formatRemainingDuration(totalSeconds: number | null): string {
  if (totalSeconds === null || totalSeconds <= 0) return '00:00';
  const sec = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  if (days > 0) return `${days}j ${hh}:${mm}:${ss}`;
  if (hours > 0) return `${hh}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function evaluateSiteActivity(
  config: SiteActivityConfig,
  context: {
    now?: number;
    deviceType: DeviceCategory;
    isIframe: boolean;
    clientIp: string;
    trustedIps: string[];
    isAdmin: boolean;
    adminOverride?: boolean;
  }
): SiteActivityEvaluation {
  const now = context.now ?? Date.now();

  if (!config.enabled) {
    return {
      isPausedTimeReached: false,
      isCountdownActive: false,
      secondsUntilPause: null,
      secondsUntilResume: null,
      matchesDevice: false,
      matchesIframe: false,
      matchesIp: false,
      matchesTarget: false,
      isBlocked: false,
      isBypassedByAdmin: false,
      autoResumedExpired: false,
    };
  }

  // Check auto-resume expiration
  if (config.autoResume && config.resumeAtTimestamp && now >= config.resumeAtTimestamp) {
    return {
      isPausedTimeReached: false,
      isCountdownActive: false,
      secondsUntilPause: null,
      secondsUntilResume: 0,
      matchesDevice: false,
      matchesIframe: false,
      matchesIp: false,
      matchesTarget: false,
      isBlocked: false,
      isBypassedByAdmin: false,
      autoResumedExpired: true,
    };
  }

  // Timing evaluation
  let isPausedTimeReached = false;
  let isCountdownActive = false;
  let secondsUntilPause: number | null = null;

  if (config.scheduleType === 'immediate' || !config.pauseAtTimestamp) {
    isPausedTimeReached = true;
  } else if (now >= config.pauseAtTimestamp) {
    isPausedTimeReached = true;
  } else {
    isCountdownActive = true;
    secondsUntilPause = Math.max(0, Math.ceil((config.pauseAtTimestamp - now) / 1000));
  }

  const secondsUntilResume =
    config.resumeAtTimestamp && config.resumeAtTimestamp > now
      ? Math.max(0, Math.ceil((config.resumeAtTimestamp - now) / 1000))
      : null;

  // Device targeting
  const matchesDevice = Boolean(config.devices.all || config.devices[context.deviceType]);

  // Iframe targeting
  let matchesIframe = true;
  if (context.isIframe) {
    matchesIframe =
      config.iframePolicy === 'block_all' || config.iframePolicy === 'block_only_iframes';
  } else {
    matchesIframe =
      config.iframePolicy === 'block_all' || config.iframePolicy === 'allow_iframes';
  }

  // IP targeting
  const cleanClientIp = (context.clientIp || '').trim();
  const isTrustedAdminIp =
    config.ipPolicy.exemptTrustedAdminIps &&
    Boolean(cleanClientIp) &&
    context.trustedIps.some((t) => t.trim() === cleanClientIp);

  let matchesIp = true;
  if (isTrustedAdminIp) {
    matchesIp = false;
  } else if (config.ipPolicy.mode === 'all') {
    matchesIp = true;
  } else if (config.ipPolicy.mode === 'except_list') {
    matchesIp = !cleanClientIp || !config.ipPolicy.ips.some((ip) => ip.trim() === cleanClientIp);
  } else if (config.ipPolicy.mode === 'only_list') {
    matchesIp = Boolean(
      cleanClientIp && config.ipPolicy.ips.some((ip) => ip.trim() === cleanClientIp)
    );
  }

  const matchesTarget = matchesDevice && matchesIframe && matchesIp;
  const wouldBlock = isPausedTimeReached && matchesTarget;
  const isBypassedByAdmin =
    wouldBlock && context.isAdmin && (config.allowAdminBypass || Boolean(context.adminOverride));
  const isBlocked = wouldBlock && !isBypassedByAdmin;

  return {
    isPausedTimeReached,
    isCountdownActive,
    secondsUntilPause,
    secondsUntilResume,
    matchesDevice,
    matchesIframe,
    matchesIp,
    matchesTarget,
    isBlocked,
    isBypassedByAdmin,
    autoResumedExpired: false,
  };
}

export function getLocalSiteActivityConfig(): SiteActivityConfig {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(SITE_ACTIVITY_STORAGE_KEY);
      if (raw) {
        return normalizeSiteActivityConfig(JSON.parse(raw));
      }
    }
  } catch {}
  return getDefaultSiteActivityConfig();
}

export function setLocalSiteActivityConfig(config: SiteActivityConfig): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SITE_ACTIVITY_STORAGE_KEY, JSON.stringify(config));
      window.dispatchEvent(
        new CustomEvent<SiteActivityConfig>('roadto2000:site-activity-updated', {
          detail: config,
        })
      );
    }
  } catch {}
}

function getRegistryCreds() {
  try {
    const binId =
      (typeof window !== 'undefined' &&
        window.localStorage?.getItem('roadto2000_accounts_registry_binid')?.trim()) ||
      GLOBAL_CLOUD_BIN_ID;
    const apiKey =
      (typeof window !== 'undefined' &&
        window.localStorage?.getItem('roadto2000_accounts_registry_apikey')?.trim()) ||
      GLOBAL_CLOUD_API_KEY;
    return { binId, apiKey };
  } catch {
    return { binId: GLOBAL_CLOUD_BIN_ID, apiKey: GLOBAL_CLOUD_API_KEY };
  }
}

async function pullSiteActivityFromCloudDirect(): Promise<SiteActivityConfig | null> {
  const { binId, apiKey } = getRegistryCreds();
  if (!binId || typeof fetch === 'undefined') return null;

  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['X-Master-Key'] = apiKey;
      headers['X-Access-Key'] = apiKey;
    }
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = await res.json();
    const record = body?.record || body;
    if (record?.siteActivity && typeof record.siteActivity === 'object') {
      return normalizeSiteActivityConfig(record.siteActivity);
    }
  } catch {}
  return null;
}

async function pushSiteActivityToCloudDirect(
  config: SiteActivityConfig
): Promise<{ success: boolean; error?: string }> {
  const { binId, apiKey } = getRegistryCreds();
  if (!binId || typeof fetch === 'undefined') {
    return { success: false, error: 'Bin Cloud non configuré' };
  }

  try {
    const readHeaders: Record<string, string> = {};
    if (apiKey) {
      readHeaders['X-Master-Key'] = apiKey;
      readHeaders['X-Access-Key'] = apiKey;
    }

    let remoteRecord: Record<string, any> = {};
    const latestRes = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: readHeaders,
      cache: 'no-store',
    });
    if (latestRes.ok) {
      const latestBody = await latestRes.json();
      if (latestBody && typeof latestBody === 'object') {
        remoteRecord = latestBody.record || latestBody;
      }
    }

    const mergedPayload = {
      ...remoteRecord,
      siteActivity: config,
    };

    const putHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...readHeaders,
    };

    const putRes = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: 'PUT',
      headers: putHeaders,
      body: JSON.stringify(mergedPayload),
    });

    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => '');
      return { success: false, error: `JSONBin HTTP ${putRes.status}: ${errText.slice(0, 80)}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erreur réseau JSONBin' };
  }
}

export function isConfigNewer(a: SiteActivityConfig, b: SiteActivityConfig): boolean {
  if ((a.revision || 0) !== (b.revision || 0)) {
    return (a.revision || 0) > (b.revision || 0);
  }
  return (a.updatedAt || 0) > (b.updatedAt || 0);
}

export async function fetchSiteActivity(forceCloud = false): Promise<{
  config: SiteActivityConfig;
  clientIp: string;
  serverTime?: number;
  cloudSynced: boolean;
}> {
  const localConfig = getLocalSiteActivityConfig();

  // 1. Primary ultra-fast source: Firebase Firestore (/siteActivity/global)
  let firestoreCfg: SiteActivityConfig | null = null;
  try {
    firestoreCfg = await fetchSiteActivityFromFirestore(forceCloud);
    if (firestoreCfg) {
      setLocalSiteActivityConfig(firestoreCfg);
    }
  } catch {}

  // 2. Also query Express backend for clientIp / serverTime and JSONBin fallback reconciliation
  try {
    const query = forceCloud ? '?force=1' : '';
    const res = await safeApiFetch(`/api/site-activity${query}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res && res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        const serverNorm = data?.config ? normalizeSiteActivityConfig(data.config) : null;
        const clientIp = typeof data.clientIp === 'string' ? data.clientIp : '';
        const serverTime = typeof data.serverTime === 'number' ? data.serverTime : undefined;

        if (firestoreCfg && (!serverNorm || !isConfigNewer(serverNorm, firestoreCfg))) {
          return {
            config: firestoreCfg,
            clientIp,
            serverTime,
            cloudSynced: true,
          };
        }

        if (serverNorm) {
          setLocalSiteActivityConfig(serverNorm);
          return {
            config: serverNorm,
            clientIp,
            serverTime,
            cloudSynced: Boolean(data.cloudSynced),
          };
        }
      }
    }
  } catch {}

  if (firestoreCfg) {
    resolveSyncIssuesByKeyPrefix('firebase_offline');
    return {
      config: firestoreCfg,
      clientIp: '',
      cloudSynced: true,
    };
  }

  // 3. Standalone / Shared-Static Fallback: fetch directly from JSONBin
  const cloudCfg = await pullSiteActivityFromCloudDirect();
  if (cloudCfg) {
    setLocalSiteActivityConfig(cloudCfg);
    return {
      config: cloudCfg,
      clientIp: '',
      cloudSynced: true,
    };
  }

  return {
    config: localConfig,
    clientIp: '',
    cloudSynced: false,
  };
}

export async function saveSiteActivity(
  config: SiteActivityConfig
): Promise<{ success: boolean; config: SiteActivityConfig; cloudSynced: boolean; error?: string }> {
  const prevLocal = getLocalSiteActivityConfig();
  const nextRevision = Math.max(prevLocal.revision || 0, config.revision || 0) + 1;

  const normalized = normalizeSiteActivityConfig({
    ...config,
    revision: nextRevision,
    updatedAt: Date.now(),
  });
  setLocalSiteActivityConfig(normalized);

  // 1. Push immediately to Firebase Firestore for <100ms real-time blocking across all devices
  const firestorePromise = saveSiteActivityToFirestore(normalized).catch(() => ({ ok: false }));

  // 2. Save via Express backend + JSONBin fallback in parallel
  try {
    const res = await safeApiFetch('/api/site-activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(normalized),
    });
    if (res && res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        if (data?.config) {
          const serverNorm = normalizeSiteActivityConfig(data.config);
          setLocalSiteActivityConfig(serverNorm);
          const fbRes = await firestorePromise;

          // If Express failed to reach JSONBin, try direct client push as fallback
          if (!data.cloudSynced) {
            const directFallback = await pushSiteActivityToCloudDirect(serverNorm);
            return {
              success: directFallback.success || fbRes.ok,
              config: serverNorm,
              cloudSynced: directFallback.success || fbRes.ok,
              error: directFallback.error || data.cloudError || undefined,
            };
          }

          return {
            success: true,
            config: serverNorm,
            cloudSynced: true,
          };
        }
      }
    }
  } catch {}

  const [fbRes, directRes] = await Promise.all([
    firestorePromise,
    pushSiteActivityToCloudDirect(normalized),
  ]);

  return {
    success: fbRes.ok || directRes.success,
    config: normalized,
    cloudSynced: fbRes.ok || directRes.success,
    error: fbRes.ok ? undefined : directRes.error,
  };
}
