/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeApiFetch } from './backendApi';
import { detectDeviceCategory, DeviceCategory } from './siteActivity';
import { getAdminAuthHeaders } from './security';

const VISITOR_ID_KEY = 'roadto2000_visitor_id_v1';

export interface VisitorRecord {
  visitorId: string;
  ip: string;
  ipHistory: string[];
  deviceType: DeviceCategory;
  browser: string;
  os: string;
  screen: string;
  currentTab: string;
  username: string;
  isGoogleAuth: boolean;
  isAdminActive: boolean;
  firstSeen: number;
  lastSeen: number;
  connectionCount: number;
  isOnline: boolean;
  blocked: boolean;
  blockedByIp?: boolean;
  blockedAt: number | null;
  blockReason: string | null;
  userAgent?: string;
}

export interface VisitorHeartbeatResponse {
  ok: boolean;
  isOnline: boolean;
  blocked: boolean;
  blockReason: string | null;
  ip?: string;
  ipPrefix?: string;
  serverTime?: number;
}

export interface VisitorsListResponse {
  success: boolean;
  visitors: VisitorRecord[];
  onlineCount: number;
  totalCount: number;
  blockedCount: number;
  serverTime: number;
  unauthorized?: boolean;
  error?: string;
}

export function getOrCreateVisitorId(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const existing = window.localStorage.getItem(VISITOR_ID_KEY);
      if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
        return existing;
      }
      const rand =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '')
          : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
      const fresh = `vis_${rand}`.slice(0, 48);
      window.localStorage.setItem(VISITOR_ID_KEY, fresh);
      return fresh;
    }
  } catch {}
  return `vis_${Date.now().toString(36)}`;
}

export function detectBrowserAndOs(): { browser: string; os: string; screen: string } {
  if (typeof navigator === 'undefined') {
    return { browser: 'Navigateur', os: 'Inconnu', screen: '' };
  }
  const ua = navigator.userAgent || '';

  let os = 'Autre OS';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Navigateur';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  const screen =
    typeof window !== 'undefined' && window.screen
      ? `${window.screen.width}x${window.screen.height}`
      : '';

  return { browser, os, screen };
}

export async function sendVisitorHeartbeat(params: {
  currentTab: string;
  username: string;
  isGoogleAuth: boolean;
}): Promise<VisitorHeartbeatResponse | null> {
  try {
    const visitorId = getOrCreateVisitorId();
    const deviceType = detectDeviceCategory();
    const { browser, os, screen } = detectBrowserAndOs();

    const res = await safeApiFetch('/api/visitors/heartbeat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify({
        visitorId,
        deviceType,
        browser,
        os,
        screen,
        currentTab: params.currentTab,
        username: params.username,
        isGoogleAuth: params.isGoogleAuth,
      }),
      timeoutMs: 3500,
    });
    if (res && res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        return (await res.json()) as VisitorHeartbeatResponse;
      }
    }
  } catch {}
  return null;
}

export async function fetchVisitorsList(): Promise<VisitorsListResponse> {
  try {
    const res = await safeApiFetch('/api/visitors', {
      headers: {
        Accept: 'application/json',
        ...getAdminAuthHeaders(),
      },
      cache: 'no-store',
      timeoutMs: 4000,
    });
    if (!res) {
      return {
        success: false,
        visitors: [],
        onlineCount: 0,
        totalCount: 0,
        blockedCount: 0,
        serverTime: Date.now(),
        error: 'Serveur backend indisponible.',
      };
    }
    if (res.status === 401) {
      return {
        success: false,
        visitors: [],
        onlineCount: 0,
        totalCount: 0,
        blockedCount: 0,
        serverTime: Date.now(),
        unauthorized: true,
        error: 'Session A2F serveur requise pour consulter les connexions.',
      };
    }
    if (res.ok) {
      return (await res.json()) as VisitorsListResponse;
    }
    const err = await res.json().catch(() => null);
    return {
      success: false,
      visitors: [],
      onlineCount: 0,
      totalCount: 0,
      blockedCount: 0,
      serverTime: Date.now(),
      error: err?.error || `Erreur HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      success: false,
      visitors: [],
      onlineCount: 0,
      totalCount: 0,
      blockedCount: 0,
      serverTime: Date.now(),
      error: err?.message || 'Erreur réseau',
    };
  }
}

export async function blockVisitor(params: {
  visitorId: string;
  blockIp?: boolean;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await safeApiFetch('/api/visitors/block', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify({
        ...params,
        currentAdminVisitorId: getOrCreateVisitorId(),
      }),
      timeoutMs: 4000,
    });
    if (!res) return { success: false, error: 'Serveur indisponible' };
    const data = await res.json().catch(() => null);
    if (!res.ok) return { success: false, error: data?.error || `Erreur HTTP ${res.status}` };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erreur réseau' };
  }
}

export async function unblockVisitor(params: {
  visitorId: string;
  unblockIp?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await safeApiFetch('/api/visitors/unblock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify(params),
      timeoutMs: 4000,
    });
    if (!res) return { success: false, error: 'Serveur indisponible' };
    const data = await res.json().catch(() => null);
    if (!res.ok) return { success: false, error: data?.error || `Erreur HTTP ${res.status}` };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erreur réseau' };
  }
}

export async function deleteVisitorRecord(visitorId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await safeApiFetch(`/api/visitors/${encodeURIComponent(visitorId)}`, {
      method: 'DELETE',
      headers: {
        ...getAdminAuthHeaders(),
      },
      timeoutMs: 4000,
    });
    if (!res) return { success: false, error: 'Serveur indisponible' };
    const data = await res.json().catch(() => null);
    if (!res.ok) return { success: false, error: data?.error || `Erreur HTTP ${res.status}` };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erreur réseau' };
  }
}
