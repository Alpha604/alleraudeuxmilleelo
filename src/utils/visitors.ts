/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocsFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  isAuthorizedOwnerUser,
  sha256Hex,
  waitForFirebaseAuthReady,
} from '../firebase';
import { safeApiFetch } from './backendApi';
import { detectDeviceCategory, DeviceCategory } from './siteActivity';
import {
  getAdminAuthHeaders,
  getClientIp,
  isAdminSessionActive,
} from './security';

const VISITOR_ID_KEY = 'roadto2000_visitor_id_v1';
const CACHED_PUBLIC_IP_KEY = 'roadto2000_cached_public_ip_v1';
const ONLINE_TTL_MS = 45 * 1000;
const VALID_VISITOR_DOC_RE = /^vis_[a-zA-Z0-9_-]{8,60}$/;

export interface VisitorRecord {
  visitorId: string;
  ip: string;
  ipPrefix?: string;
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
  sourceOrigin?: string;
  syncChannel?: 'firebase' | 'express' | 'hybrid';
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
  firestoreConnected?: boolean;
  expressAuthorized?: boolean;
  error?: string;
}

export function getOrCreateVisitorId(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const existing = window.localStorage.getItem(VISITOR_ID_KEY);
      if (existing && VALID_VISITOR_DOC_RE.test(existing)) {
        return existing;
      }
      const rand =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '')
          : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
      const fresh = `vis_${rand}`.padEnd(14, '0').slice(0, 48);
      window.localStorage.setItem(VISITOR_ID_KEY, fresh);
      return fresh;
    }
  } catch {}
  return `vis_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

function formatIpPrefixClient(ip: string): string {
  const clean = (ip || '').trim();
  if (!clean || clean === 'Inconnue') return '';
  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}.***`;
  } else if (clean.includes(':')) {
    const parts = clean.split(':');
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}:***`;
  }
  return clean.slice(0, 6) + '***';
}

function isUsefulPublicIp(ip?: string | null): boolean {
  if (!ip) return false;
  const clean = ip.trim();
  if (!clean || clean === 'Inconnue' || clean === '::1' || clean === '127.0.0.1' || clean === '::ffff:127.0.0.1') {
    return false;
  }
  return clean.length >= 7;
}

async function resolveEffectiveVisitorIp(expressIp?: string): Promise<string> {
  if (isUsefulPublicIp(expressIp)) {
    const clean = expressIp!.trim();
    try {
      window.sessionStorage?.setItem(
        CACHED_PUBLIC_IP_KEY,
        JSON.stringify({ ip: clean, ts: Date.now() })
      );
    } catch {}
    return clean;
  }

  try {
    const cachedRaw = window.sessionStorage?.getItem(CACHED_PUBLIC_IP_KEY);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      if (parsed?.ip && isUsefulPublicIp(parsed.ip) && Date.now() - Number(parsed.ts || 0) < 10 * 60 * 1000) {
        return String(parsed.ip).trim();
      }
    }
  } catch {}

  try {
    let resolved = await getClientIp();
    if (!isUsefulPublicIp(resolved)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        if (ipRes.ok) {
          const data = await ipRes.json();
          if (typeof data?.ip === 'string' && isUsefulPublicIp(data.ip)) {
            resolved = data.ip.trim();
          }
        }
      } finally {
        clearTimeout(timer);
      }
    }
    if (isUsefulPublicIp(resolved)) {
      const clean = resolved.trim();
      try {
        window.sessionStorage?.setItem(
          CACHED_PUBLIC_IP_KEY,
          JSON.stringify({ ip: clean, ts: Date.now() })
        );
      } catch {}
      return clean;
    }
  } catch {}

  return (expressIp || '').trim() || 'Inconnue';
}

function mapFirestoreVisitorDoc(id: string, data: Record<string, any>): VisitorRecord {
  const now = Date.now();
  const lastSeen = typeof data.lastSeen === 'number' ? data.lastSeen : 0;
  const firstSeen = typeof data.firstSeen === 'number' ? data.firstSeen : lastSeen;
  const blockedAtVal = typeof data.blockedAt === 'number' && data.blockedAt > 0 ? data.blockedAt : null;
  const blockReasonVal =
    typeof data.blockReason === 'string' && data.blockReason.trim() ? data.blockReason.trim() : null;

  return {
    visitorId: typeof data.visitorId === 'string' ? data.visitorId : id,
    ip: typeof data.ip === 'string' && data.ip.trim() ? data.ip.trim() : 'Inconnue',
    ipPrefix: typeof data.ipPrefix === 'string' ? data.ipPrefix : '',
    ipHistory: Array.isArray(data.ipHistory) ? data.ipHistory.map((x) => String(x)) : [],
    deviceType:
      data.deviceType === 'mobile' || data.deviceType === 'tablet' ? data.deviceType : 'desktop',
    browser: typeof data.browser === 'string' && data.browser ? data.browser : 'Navigateur',
    os: typeof data.os === 'string' && data.os ? data.os : 'Inconnu',
    screen: typeof data.screen === 'string' ? data.screen : '',
    currentTab: typeof data.currentTab === 'string' && data.currentTab ? data.currentTab : 'dashboard',
    username: typeof data.username === 'string' && data.username ? data.username : 'visiteur',
    isGoogleAuth: Boolean(data.isGoogleAuth),
    isAdminActive: Boolean(data.isAdminActive),
    firstSeen,
    lastSeen,
    connectionCount: typeof data.connectionCount === 'number' ? data.connectionCount : 1,
    isOnline: now - lastSeen <= ONLINE_TTL_MS,
    blocked: Boolean(data.blocked),
    blockedByIp: Boolean(data.blockedByIp),
    blockedAt: blockedAtVal,
    blockReason: blockReasonVal,
    sourceOrigin: typeof data.sourceOrigin === 'string' ? data.sourceOrigin : undefined,
    syncChannel: 'firebase',
  };
}

export function mergeVisitorLists(
  firestoreVisitors: VisitorRecord[],
  expressVisitors: VisitorRecord[]
): VisitorRecord[] {
  const byId = new Map<string, VisitorRecord>();

  for (const v of expressVisitors) {
    byId.set(v.visitorId, { ...v, syncChannel: 'express' });
  }

  for (const fv of firestoreVisitors) {
    const ev = byId.get(fv.visitorId);
    if (!ev) {
      byId.set(fv.visitorId, fv);
      continue;
    }

    const newest = fv.lastSeen >= ev.lastSeen ? fv : ev;
    const mergedIpSet = new Set<string>([...(ev.ipHistory || []), ...(fv.ipHistory || [])]);
    if (isUsefulPublicIp(ev.ip)) mergedIpSet.add(ev.ip);
    if (isUsefulPublicIp(fv.ip)) mergedIpSet.add(fv.ip);

    const bestIp = isUsefulPublicIp(newest.ip)
      ? newest.ip
      : isUsefulPublicIp(ev.ip)
      ? ev.ip
      : fv.ip;

    byId.set(fv.visitorId, {
      ...newest,
      ip: bestIp,
      ipHistory: Array.from(mergedIpSet).slice(-5),
      firstSeen: Math.min(ev.firstSeen || newest.firstSeen, fv.firstSeen || newest.firstSeen),
      lastSeen: Math.max(ev.lastSeen, fv.lastSeen),
      connectionCount: Math.max(ev.connectionCount || 1, fv.connectionCount || 1),
      isOnline: Math.max(ev.lastSeen, fv.lastSeen) >= Date.now() - ONLINE_TTL_MS,
      blocked: Boolean(ev.blocked || fv.blocked),
      blockedByIp: Boolean(ev.blockedByIp || fv.blockedByIp),
      blockedAt: fv.blockedAt ?? ev.blockedAt ?? null,
      blockReason: fv.blockReason || ev.blockReason || null,
      isAdminActive: Boolean(ev.isAdminActive || fv.isAdminActive),
      sourceOrigin: fv.sourceOrigin || ev.sourceOrigin,
      syncChannel: 'hybrid',
    });
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return b.lastSeen - a.lastSeen;
  });
}

async function syncVisitorPresenceToFirestore(params: {
  visitorId: string;
  ip: string;
  deviceType: DeviceCategory;
  browser: string;
  os: string;
  screen: string;
  currentTab: string;
  username: string;
  isGoogleAuth: boolean;
}): Promise<{ blocked: boolean; blockReason: string | null }> {
  if (!VALID_VISITOR_DOC_RE.test(params.visitorId)) {
    return { blocked: false, blockReason: null };
  }

  await waitForFirebaseAuthReady();
  const isFirestoreAdmin = await isAuthorizedOwnerUser(auth.currentUser);
  const now = Date.now();
  const cleanIp = (params.ip || 'Inconnue').trim().slice(0, 64) || 'Inconnue';
  const ipPrefix = formatIpPrefixClient(cleanIp).slice(0, 48);
  const sourceOrigin =
    typeof window !== 'undefined' && window.location?.host
      ? window.location.host.slice(0, 120)
      : '';
  const cleanUsername = (params.username || 'visiteur').trim().toLowerCase().slice(0, 40) || 'visiteur';
  const docRef = doc(db, 'visitors', params.visitorId);

  let blocked = false;
  let blockReason: string | null = null;

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      const ipHistory = isUsefulPublicIp(cleanIp) ? [cleanIp] : [];
      await setDoc(docRef, {
        visitorId: params.visitorId,
        ip: cleanIp,
        ipPrefix,
        ipHistory,
        deviceType: params.deviceType,
        browser: (params.browser || 'Navigateur').slice(0, 40),
        os: (params.os || 'Inconnu').slice(0, 40),
        screen: (params.screen || '').slice(0, 24),
        currentTab: (params.currentTab || 'dashboard').slice(0, 32),
        username: cleanUsername,
        isGoogleAuth: Boolean(params.isGoogleAuth),
        isAdminActive: isFirestoreAdmin,
        firstSeen: now,
        lastSeen: now,
        connectionCount: 1,
        blocked: false,
        blockedByIp: false,
        blockedAt: 0,
        blockReason: '',
        sourceOrigin,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = snap.data() || {};
      blocked = Boolean(existing.blocked);
      blockReason =
        typeof existing.blockReason === 'string' && existing.blockReason.trim()
          ? existing.blockReason.trim()
          : null;

      const prevLastSeen = typeof existing.lastSeen === 'number' ? existing.lastSeen : now;
      const returnedAfterOffline = now - prevLastSeen > 5 * 60 * 1000;
      const prevCount =
        typeof existing.connectionCount === 'number' && existing.connectionCount >= 1
          ? existing.connectionCount
          : 1;
      const ipSet = new Set<string>(
        Array.isArray(existing.ipHistory) ? existing.ipHistory.map((x: unknown) => String(x)) : []
      );
      if (isUsefulPublicIp(cleanIp)) ipSet.add(cleanIp);
      const nextIpHistory = Array.from(ipSet).slice(-5);

      await updateDoc(docRef, {
        ip: cleanIp,
        ipPrefix,
        ipHistory: nextIpHistory,
        deviceType: params.deviceType,
        browser: (params.browser || 'Navigateur').slice(0, 40),
        os: (params.os || 'Inconnu').slice(0, 40),
        screen: (params.screen || '').slice(0, 24),
        currentTab: (params.currentTab || 'dashboard').slice(0, 32),
        username: cleanUsername,
        isGoogleAuth: Boolean(params.isGoogleAuth),
        isAdminActive: isFirestoreAdmin,
        lastSeen: now,
        connectionCount: Math.min(1000000, prevCount + (returnedAfterOffline ? 1 : 0)),
        sourceOrigin,
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Do not break heartbeat if offline or blocked by extension
  }

  // Also check privacy-safe IP hash blocklist across devices/URLs
  if (!isFirestoreAdmin && !isAdminSessionActive() && isUsefulPublicIp(cleanIp)) {
    try {
      const ipHash = await sha256Hex(cleanIp);
      const ipBlockSnap = await getDoc(doc(db, 'blockedIpHashes', ipHash));
      if (ipBlockSnap.exists()) {
        const ipData = ipBlockSnap.data();
        if (ipData?.active === true) {
          blocked = true;
          blockReason =
            (typeof ipData.reason === 'string' && ipData.reason.trim()) ||
            blockReason ||
            'Adresse IP restreinte par l’administrateur.';
        }
      }
    } catch {}
  }

  if (isFirestoreAdmin || isAdminSessionActive()) {
    return { blocked: false, blockReason: null };
  }

  return { blocked, blockReason };
}

export async function sendVisitorHeartbeat(params: {
  currentTab: string;
  username: string;
  isGoogleAuth: boolean;
}): Promise<VisitorHeartbeatResponse | null> {
  const visitorId = getOrCreateVisitorId();
  const deviceType = detectDeviceCategory();
  const { browser, os, screen } = detectBrowserAndOs();

  let expressResData: VisitorHeartbeatResponse | null = null;
  try {
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
        expressResData = (await res.json()) as VisitorHeartbeatResponse;
      }
    }
  } catch {}

  const effectiveIp = await resolveEffectiveVisitorIp(expressResData?.ip);
  const fsState = await syncVisitorPresenceToFirestore({
    visitorId,
    ip: effectiveIp,
    deviceType,
    browser,
    os,
    screen,
    currentTab: params.currentTab,
    username: params.username,
    isGoogleAuth: params.isGoogleAuth,
  });

  const combinedBlocked = Boolean(expressResData?.blocked || fsState.blocked);
  const combinedReason = expressResData?.blockReason || fsState.blockReason || null;

  return {
    ok: true,
    isOnline: true,
    blocked: combinedBlocked,
    blockReason: combinedReason,
    ip: effectiveIp !== 'Inconnue' ? effectiveIp : expressResData?.ip,
    ipPrefix: formatIpPrefixClient(effectiveIp) || expressResData?.ipPrefix,
    serverTime: expressResData?.serverTime || Date.now(),
  };
}

export async function fetchVisitorsFromFirestore(): Promise<{
  connected: boolean;
  visitors: VisitorRecord[];
  error?: string;
}> {
  try {
    await waitForFirebaseAuthReady();
    const isOwner = await isAuthorizedOwnerUser(auth.currentUser);
    if (!isOwner) {
      return { connected: false, visitors: [] };
    }
    const snap = await getDocsFromServer(collection(db, 'visitors'));
    const list: VisitorRecord[] = [];
    snap.forEach((docSnap) => {
      list.push(mapFirestoreVisitorDoc(docSnap.id, docSnap.data() || {}));
    });
    list.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return b.lastSeen - a.lastSeen;
    });
    return { connected: true, visitors: list };
  } catch (err: any) {
    return {
      connected: false,
      visitors: [],
      error: err?.message || 'Erreur lecture Firestore visitors',
    };
  }
}

export function subscribeVisitorsFirestore(params: {
  onUpdate: (visitors: VisitorRecord[]) => void;
  onError?: (err: Error) => void;
}): () => void {
  let active = true;
  let unsub: Unsubscribe | null = null;

  waitForFirebaseAuthReady().then(async () => {
    if (!active) return;
    const isOwner = await isAuthorizedOwnerUser(auth.currentUser);
    if (!isOwner || !active) return;

    try {
      unsub = onSnapshot(
        collection(db, 'visitors'),
        (snap) => {
          if (!active) return;
          const list: VisitorRecord[] = [];
          snap.forEach((docSnap) => {
            list.push(mapFirestoreVisitorDoc(docSnap.id, docSnap.data() || {}));
          });
          list.sort((a, b) => {
            if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
            return b.lastSeen - a.lastSeen;
          });
          params.onUpdate(list);
        },
        (error) => {
          if (active && params.onError) {
            params.onError(error);
          }
        }
      );
    } catch (err: any) {
      if (active && params.onError) {
        params.onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });

  return () => {
    active = false;
    if (unsub) unsub();
  };
}

export async function fetchVisitorsList(): Promise<VisitorsListResponse> {
  const [fsRes, expressOutcome] = await Promise.all([
    fetchVisitorsFromFirestore(),
    (async (): Promise<{
      ok: boolean;
      unauthorized: boolean;
      visitors: VisitorRecord[];
      error?: string;
    }> => {
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
          return { ok: false, unauthorized: false, visitors: [], error: 'Serveur backend indisponible.' };
        }
        if (res.status === 401) {
          return {
            ok: false,
            unauthorized: true,
            visitors: [],
            error: 'Session A2F serveur requise pour le flux Express.',
          };
        }
        if (res.ok) {
          const data = (await res.json()) as VisitorsListResponse;
          return { ok: true, unauthorized: false, visitors: data.visitors || [] };
        }
        const err = await res.json().catch(() => null);
        return {
          ok: false,
          unauthorized: false,
          visitors: [],
          error: err?.error || `Erreur HTTP ${res.status}`,
        };
      } catch (err: any) {
        return {
          ok: false,
          unauthorized: false,
          visitors: [],
          error: err?.message || 'Erreur réseau',
        };
      }
    })(),
  ]);

  if (fsRes.connected || expressOutcome.ok) {
    const merged = mergeVisitorLists(fsRes.visitors, expressOutcome.visitors);
    return {
      success: true,
      visitors: merged,
      onlineCount: merged.filter((v) => v.isOnline).length,
      totalCount: merged.length,
      blockedCount: merged.filter((v) => v.blocked).length,
      serverTime: Date.now(),
      firestoreConnected: fsRes.connected,
      expressAuthorized: expressOutcome.ok,
      unauthorized: !fsRes.connected && expressOutcome.unauthorized,
    };
  }

  return {
    success: false,
    visitors: [],
    onlineCount: 0,
    totalCount: 0,
    blockedCount: 0,
    serverTime: Date.now(),
    unauthorized: expressOutcome.unauthorized,
    firestoreConnected: false,
    expressAuthorized: false,
    error:
      expressOutcome.error ||
      fsRes.error ||
      'Connectez votre compte Google Administrateur ou validez la session A2F.',
  };
}

export async function blockVisitor(params: {
  visitorId: string;
  blockIp?: boolean;
  reason?: string;
  visitor?: VisitorRecord;
}): Promise<{ success: boolean; error?: string }> {
  const cleanReason =
    (params.reason || '').trim().slice(0, 160) || 'Accès bloqué manuellement par l’administrateur.';
  const now = Date.now();
  let expressOk = false;
  let expressError = '';

  try {
    const res = await safeApiFetch('/api/visitors/block', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify({
        visitorId: params.visitorId,
        blockIp: params.blockIp,
        reason: cleanReason,
        currentAdminVisitorId: getOrCreateVisitorId(),
      }),
      timeoutMs: 4000,
    });
    if (res) {
      if (res.ok) {
        expressOk = true;
      } else {
        const data = await res.json().catch(() => null);
        expressError = data?.error || `Erreur HTTP ${res.status}`;
      }
    }
  } catch (err: any) {
    expressError = err?.message || 'Erreur réseau';
  }

  let fsOk = false;
  let fsError = '';
  try {
    await waitForFirebaseAuthReady();
    const isOwner = await isAuthorizedOwnerUser(auth.currentUser);
    if (isOwner && auth.currentUser) {
      await updateDoc(doc(db, 'visitors', params.visitorId), {
        blocked: true,
        blockedByIp: Boolean(params.blockIp),
        blockedAt: now,
        blockReason: cleanReason,
        updatedAt: serverTimestamp(),
      });
      if (params.blockIp && params.visitor?.ip && isUsefulPublicIp(params.visitor.ip)) {
        const ipHash = await sha256Hex(params.visitor.ip.trim());
        await setDoc(doc(db, 'blockedIpHashes', ipHash), {
          ipHash,
          active: true,
          reason: cleanReason,
          blockedAt: now,
          updatedByUid: auth.currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      fsOk = true;
    }
  } catch (err: any) {
    fsError = err?.message || 'Erreur Firestore';
  }

  if (fsOk || expressOk) {
    return { success: true };
  }
  return { success: false, error: fsError || expressError || 'Serveur indisponible' };
}

export async function unblockVisitor(params: {
  visitorId: string;
  unblockIp?: boolean;
  visitor?: VisitorRecord;
}): Promise<{ success: boolean; error?: string }> {
  let expressOk = false;
  let expressError = '';

  try {
    const res = await safeApiFetch('/api/visitors/unblock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify({
        visitorId: params.visitorId,
        unblockIp: params.unblockIp ?? true,
      }),
      timeoutMs: 4000,
    });
    if (res) {
      if (res.ok) {
        expressOk = true;
      } else {
        const data = await res.json().catch(() => null);
        expressError = data?.error || `Erreur HTTP ${res.status}`;
      }
    }
  } catch (err: any) {
    expressError = err?.message || 'Erreur réseau';
  }

  let fsOk = false;
  let fsError = '';
  try {
    await waitForFirebaseAuthReady();
    const isOwner = await isAuthorizedOwnerUser(auth.currentUser);
    if (isOwner) {
      await updateDoc(doc(db, 'visitors', params.visitorId), {
        blocked: false,
        blockedByIp: false,
        blockedAt: 0,
        blockReason: '',
        updatedAt: serverTimestamp(),
      });
      if (
        (params.unblockIp ?? true) &&
        params.visitor?.ip &&
        isUsefulPublicIp(params.visitor.ip)
      ) {
        const ipHash = await sha256Hex(params.visitor.ip.trim());
        await deleteDoc(doc(db, 'blockedIpHashes', ipHash)).catch(() => {});
      }
      fsOk = true;
    }
  } catch (err: any) {
    fsError = err?.message || 'Erreur Firestore';
  }

  if (fsOk || expressOk) {
    return { success: true };
  }
  return { success: false, error: fsError || expressError || 'Serveur indisponible' };
}

export async function deleteVisitorRecord(
  visitorId: string,
  visitor?: VisitorRecord
): Promise<{ success: boolean; error?: string }> {
  let expressOk = false;
  let expressError = '';

  try {
    const res = await safeApiFetch(`/api/visitors/${encodeURIComponent(visitorId)}`, {
      method: 'DELETE',
      headers: {
        ...getAdminAuthHeaders(),
      },
      timeoutMs: 4000,
    });
    if (res) {
      if (res.ok) {
        expressOk = true;
      } else {
        const data = await res.json().catch(() => null);
        expressError = data?.error || `Erreur HTTP ${res.status}`;
      }
    }
  } catch (err: any) {
    expressError = err?.message || 'Erreur réseau';
  }

  let fsOk = false;
  let fsError = '';
  try {
    await waitForFirebaseAuthReady();
    const isOwner = await isAuthorizedOwnerUser(auth.currentUser);
    if (isOwner) {
      await deleteDoc(doc(db, 'visitors', visitorId));
      if (visitor?.ip && isUsefulPublicIp(visitor.ip)) {
        const ipHash = await sha256Hex(visitor.ip.trim());
        await deleteDoc(doc(db, 'blockedIpHashes', ipHash)).catch(() => {});
      }
      fsOk = true;
    }
  } catch (err: any) {
    fsError = err?.message || 'Erreur Firestore';
  }

  if (fsOk || expressOk) {
    return { success: true };
  }
  return { success: false, error: fsError || expressError || 'Serveur indisponible' };
}
