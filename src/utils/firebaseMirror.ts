/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  waitForFirebaseAuthReady,
} from '../firebase';
import { AppSettings, AppTheme, GameMode, SyncRecord, TrajectoryModel } from '../types/chess';
import type { SiteActivityConfig } from './siteActivity';
import { normalizeParisDayKey } from './storage';
import {
  interpretFirebaseError,
  reportSyncIssue,
  resolveSyncIssuesByKeyPrefix,
  updateFirebaseDiagnostics,
} from './syncDiagnostics';

export interface FirebaseMirrorStatus {
  status: 'idle' | 'syncing' | 'synced' | 'auth_required' | 'error';
  lastMirroredAt: number | null;
  recordsMirrored: number;
  lastError: string | null;
  lastPlayerId: string;
}

export interface FirestorePlayerDoc {
  id: string;
  ownerUid: string;
  username: string;
  project: string;
  sourceEngine: string;
  recordsCount: number;
  startElo: number;
  targetElo: number;
  startDate: string;
  targetDate: string;
  selectedMode: string;
  trajectoryModel: string;
  autoSyncMinutes: number;
  theme: string;
  bestRating: number;
  bestMode: GameMode;
  bullet?: number;
  blitz?: number;
  rapid?: number;
  puzzles?: number;
  jsonBinSyncedAt?: string;
  siteVersion?: string;
  siteVersionNote?: string;
  siteVersionUpdatedAt?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface FirestoreDailyRecordDoc {
  id: string;
  ownerUid: string;
  recordId: string;
  username: string;
  dayKey: string;
  timestamp: string;
  bestRating: number;
  bestMode: GameMode;
  source: string;
  bullet?: number;
  blitz?: number;
  rapid?: number;
  puzzles?: number;
  note?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const MIRROR_STATUS_KEY = 'roadto2000_firebase_mirror_status_v1';

let currentMirrorStatus: FirebaseMirrorStatus = loadInitialMirrorStatus();

function loadInitialMirrorStatus(): FirebaseMirrorStatus {
  const defaults: FirebaseMirrorStatus = {
    status: 'idle',
    lastMirroredAt: null,
    recordsMirrored: 0,
    lastError: null,
    lastPlayerId: 'alpharomeo1500',
  };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(MIRROR_STATUS_KEY);
      if (raw) {
        return { ...defaults, ...JSON.parse(raw) };
      }
    }
  } catch {}
  return defaults;
}

function updateMirrorStatus(patch: Partial<FirebaseMirrorStatus>): FirebaseMirrorStatus {
  currentMirrorStatus = { ...currentMirrorStatus, ...patch };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(MIRROR_STATUS_KEY, JSON.stringify(currentMirrorStatus));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<FirebaseMirrorStatus>('roadto2000:firebase-mirror-updated', {
          detail: currentMirrorStatus,
        })
      );
    }
  } catch {}
  return currentMirrorStatus;
}

export function getFirebaseMirrorStatus(): FirebaseMirrorStatus {
  return currentMirrorStatus;
}

function sanitizePlayerId(username?: string): string {
  const clean = (username || 'alpharomeo1500')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
  return clean.length >= 2 ? clean : 'alpharomeo1500';
}

function sanitizeRecordId(id?: string): string {
  const clean = (id || `sync_${Date.now()}`)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
  return clean.length >= 1 ? clean : `sync_${Date.now()}`;
}

function sanitizeRating(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const clamped = Math.round(value);
  if (clamped < 0 || clamped > 4000) return undefined;
  return clamped;
}

function formatFirestoreTimestamp(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as any).toDate === 'function') {
    return (val as any).toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return null;
}

function isValidMode(mode: unknown): GameMode {
  return mode === 'bullet' || mode === 'blitz' || mode === 'rapid' ? mode : 'bullet';
}

/**
 * Mirrors JSONBin-sourced history and settings to Firestore.
 * NEVER mutates or overrides app state — Firestore acts strictly as a secondary mirror store.
 */
export async function mirrorDataToFirestore(params: {
  username: string;
  history: SyncRecord[];
  settings: AppSettings;
  jsonBinSyncedAt?: string | null;
  replaceExact?: boolean;
  throwOnError?: boolean;
}): Promise<{ ok: boolean; status: FirebaseMirrorStatus['status']; recordsMirrored: number; error?: string }> {
  const user = auth.currentUser;
  const playerId = sanitizePlayerId(params.username);

  if (!user || !user.emailVerified) {
    const authErr = user
      ? 'Adresse email Google non vérifiée'
      : 'Connexion Google Firebase requise pour synchroniser Firestore';
    updateFirebaseDiagnostics({
      authState: !user ? 'unauthenticated' : 'unverified',
      authEmail: null,
      lastError: authErr,
    });
    const next = updateMirrorStatus({
      status: 'auth_required',
      lastPlayerId: playerId,
      lastError: authErr,
    });
    return {
      ok: false,
      status: next.status,
      recordsMirrored: next.recordsMirrored,
      error: next.lastError || undefined,
    };
  }

  updateMirrorStatus({ status: 'syncing', lastPlayerId: playerId, lastError: null });

  const playerPath = `players/${playerId}`;
  const recordsColPath = `players/${playerId}/dailyRecords`;

  try {
    // 1. Ensure user link doc exists
    const userDocRef = doc(db, 'users', user.uid);
    let userExists = false;
    try {
      const userSnap = await getDoc(userDocRef);
      userExists = userSnap.exists();
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
    }

    // 2. Check existing player doc to preserve immutable createdAt
    const playerDocRef = doc(db, 'players', playerId);
    let existingPlayerCreatedAt: any = null;
    try {
      const playerSnap = await getDoc(playerDocRef);
      if (playerSnap.exists()) {
        existingPlayerCreatedAt = playerSnap.data().createdAt ?? null;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, playerPath);
    }

    // 3. Check existing dailyRecords to preserve createdAt & optionally prune removed records
    const existingRecordsCreatedAt = new Map<string, any>();
    try {
      const existingSnap = await getDocs(collection(db, 'players', playerId, 'dailyRecords'));
      existingSnap.forEach((docSnap) => {
        existingRecordsCreatedAt.set(docSnap.id, docSnap.data().createdAt ?? null);
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, recordsColPath);
    }

    // Build validated PlayerMirror payload strictly matching firebase-blueprint.json
    const sortedHistory = [...(Array.isArray(params.history) ? params.history : [])].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const latest = sortedHistory[0];

    const startElo = sanitizeRating(params.settings?.startElo) ?? 1500;
    const targetElo = sanitizeRating(params.settings?.targetElo) ?? 2000;
    const startDate =
      typeof params.settings?.startDate === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(params.settings.startDate)
        ? params.settings.startDate
        : '2026-10-31';
    const targetDate =
      typeof params.settings?.targetDate === 'string' && params.settings.targetDate.length >= 10
        ? params.settings.targetDate.slice(0, 40)
        : '2027-12-31T23:59:59';
    const selectedMode =
      params.settings?.selectedMode === 'auto' ||
      params.settings?.selectedMode === 'bullet' ||
      params.settings?.selectedMode === 'blitz' ||
      params.settings?.selectedMode === 'rapid'
        ? params.settings.selectedMode
        : 'auto';
    const trajectoryModel =
      params.settings?.trajectoryModel === 'linear' ||
      params.settings?.trajectoryModel === 'milestones' ||
      params.settings?.trajectoryModel === 'custom'
        ? params.settings.trajectoryModel
        : 'linear';
    const autoSyncMinutes =
      typeof params.settings?.autoSyncMinutes === 'number' &&
      Number.isFinite(params.settings.autoSyncMinutes) &&
      params.settings.autoSyncMinutes >= 0 &&
      params.settings.autoSyncMinutes <= 1440
        ? Math.round(params.settings.autoSyncMinutes)
        : 15;
    const theme =
      params.settings?.theme === 'dark' ||
      params.settings?.theme === 'light' ||
      params.settings?.theme === 'ocean' ||
      params.settings?.theme === 'colors' ||
      params.settings?.theme === 'system'
        ? params.settings.theme
        : 'dark';

    const playerPayload: Record<string, any> = {
      ownerUid: user.uid,
      username: playerId,
      project: 'Road to 2000 Elo',
      sourceEngine: 'jsonbin_mirror',
      recordsCount: Math.min(1000, sortedHistory.length),
      startElo,
      targetElo,
      startDate,
      targetDate,
      selectedMode,
      trajectoryModel,
      autoSyncMinutes,
      theme,
      bestRating: sanitizeRating(latest?.bestRating) ?? startElo,
      bestMode: isValidMode(latest?.bestMode),
      createdAt: existingPlayerCreatedAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const latestBullet = sanitizeRating(latest?.bullet);
    const latestBlitz = sanitizeRating(latest?.blitz);
    const latestRapid = sanitizeRating(latest?.rapid);
    const latestPuzzles = sanitizeRating(latest?.puzzles);
    if (latestBullet !== undefined) playerPayload.bullet = latestBullet;
    if (latestBlitz !== undefined) playerPayload.blitz = latestBlitz;
    if (latestRapid !== undefined) playerPayload.rapid = latestRapid;
    if (latestPuzzles !== undefined) playerPayload.puzzles = latestPuzzles;
    if (params.jsonBinSyncedAt && typeof params.jsonBinSyncedAt === 'string') {
      playerPayload.jsonBinSyncedAt = params.jsonBinSyncedAt.slice(0, 64);
    }
    if (typeof params.settings?.siteVersion === 'string' && params.settings.siteVersion.trim().length > 0) {
      playerPayload.siteVersion = params.settings.siteVersion.trim().slice(0, 24);
    }
    if (typeof params.settings?.siteVersionNote === 'string' && params.settings.siteVersionNote.trim().length > 0) {
      playerPayload.siteVersionNote = params.settings.siteVersionNote.trim().slice(0, 240);
    }
    if (
      typeof params.settings?.siteVersionUpdatedAt === 'string' &&
      params.settings.siteVersionUpdatedAt.trim().length > 0
    ) {
      playerPayload.siteVersionUpdatedAt = params.settings.siteVersionUpdatedAt.trim().slice(0, 64);
    }

    // Build validated DailySyncRecord map keyed by YYYY-MM-DD
    const dailyEntries = new Map<string, Record<string, any>>();
    for (const rec of sortedHistory) {
      if (!rec || !rec.timestamp) continue;
      const dayKey = normalizeParisDayKey(rec.timestamp);
      if (!dayKey || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dayKey)) continue;
      if (dailyEntries.has(dayKey)) continue;

      const bestRating = sanitizeRating(rec.bestRating);
      if (bestRating === undefined) continue;

      const recordPayload: Record<string, any> = {
        ownerUid: user.uid,
        recordId: sanitizeRecordId(rec.id),
        username: playerId,
        dayKey,
        timestamp: String(rec.timestamp).slice(0, 64),
        bestRating,
        bestMode: isValidMode(rec.bestMode),
        source: (rec.source || 'API Chess.com directe').slice(0, 64),
        createdAt: existingRecordsCreatedAt.get(dayKey) || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const bullet = sanitizeRating(rec.bullet);
      const blitz = sanitizeRating(rec.blitz);
      const rapid = sanitizeRating(rec.rapid);
      const puzzles = sanitizeRating(rec.puzzles);
      if (bullet !== undefined) recordPayload.bullet = bullet;
      if (blitz !== undefined) recordPayload.blitz = blitz;
      if (rapid !== undefined) recordPayload.rapid = rapid;
      if (puzzles !== undefined) recordPayload.puzzles = puzzles;
      if (typeof rec.note === 'string' && rec.note.trim().length > 0) {
        recordPayload.note = rec.note.trim().slice(0, 240);
      }

      dailyEntries.set(dayKey, recordPayload);
    }

    // Execute atomic batches (parent player doc is written in first batch so existsAfter() succeeds)
    const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

    if (!userExists) {
      operations.push((batch) =>
        batch.set(userDocRef, {
          uid: user.uid,
          displayName: (user.displayName || playerId).slice(0, 80),
          linkedPlayer: playerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }

    operations.push((batch) => batch.set(playerDocRef, playerPayload));

    for (const [dayKey, payload] of dailyEntries.entries()) {
      operations.push((batch) =>
        batch.set(doc(db, 'players', playerId, 'dailyRecords', dayKey), payload)
      );
    }

    if (params.replaceExact) {
      for (const existingDayKey of existingRecordsCreatedAt.keys()) {
        if (!dailyEntries.has(existingDayKey)) {
          operations.push((batch) =>
            batch.delete(doc(db, 'players', playerId, 'dailyRecords', existingDayKey))
          );
        }
      }
    }

    const CHUNK_SIZE = 400;
    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const slice = operations.slice(i, i + CHUNK_SIZE);
      for (const op of slice) op(batch);
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, playerPath);
      }
    }

    const next = updateMirrorStatus({
      status: 'synced',
      lastMirroredAt: Date.now(),
      recordsMirrored: dailyEntries.size,
      lastError: null,
      lastPlayerId: playerId,
    });

    updateFirebaseDiagnostics({
      connection: 'online',
      lastWriteAt: next.lastMirroredAt || Date.now(),
      recordsCount: dailyEntries.size,
      lastError: null,
    });
    resolveSyncIssuesByKeyPrefix('firebase_');

    return {
      ok: true,
      status: next.status,
      recordsMirrored: next.recordsMirrored,
    };
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : 'Erreur de synchronisation Firestore';
    updateMirrorStatus({
      status: 'error',
      lastError: errMsg,
      lastPlayerId: playerId,
    });
    updateFirebaseDiagnostics({
      lastError: errMsg.slice(0, 140),
    });
    if (params.throwOnError) {
      throw err;
    }
    return {
      ok: false,
      status: 'error',
      recordsMirrored: currentMirrorStatus.recordsMirrored,
      error: errMsg,
    };
  }
}

/**
 * Live read-only subscriber for the PC "Paramètre Firebase" inspector tab.
 * Attaches onSnapshot ONLY when auth.currentUser is signed in & email-verified.
 */
export function subscribePlayerFirestoreExplorer(
  username: string,
  callbacks: {
    onPlayerData: (player: FirestorePlayerDoc | null) => void;
    onRecordsData: (records: FirestoreDailyRecordDoc[]) => void;
    onError: (error: Error) => void;
  }
): Unsubscribe {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    callbacks.onPlayerData(null);
    callbacks.onRecordsData([]);
    return () => {};
  }

  const playerId = sanitizePlayerId(username);
  const playerPath = `players/${playerId}`;
  const recordsPath = `players/${playerId}/dailyRecords`;

  const unsubPlayer = onSnapshot(
    doc(db, 'players', playerId),
    (snap) => {
      if (!snap.exists()) {
        callbacks.onPlayerData(null);
        return;
      }
      const d = snap.data();
      callbacks.onPlayerData({
        id: snap.id,
        ownerUid: d.ownerUid,
        username: d.username,
        project: d.project,
        sourceEngine: d.sourceEngine,
        recordsCount: d.recordsCount,
        startElo: d.startElo,
        targetElo: d.targetElo,
        startDate: d.startDate,
        targetDate: d.targetDate,
        selectedMode: d.selectedMode,
        trajectoryModel: d.trajectoryModel,
        autoSyncMinutes: d.autoSyncMinutes,
        theme: d.theme,
        bestRating: d.bestRating,
        bestMode: d.bestMode,
        bullet: d.bullet,
        blitz: d.blitz,
        rapid: d.rapid,
        puzzles: d.puzzles,
        jsonBinSyncedAt: d.jsonBinSyncedAt,
        siteVersion: d.siteVersion,
        siteVersionNote: d.siteVersionNote,
        siteVersionUpdatedAt: d.siteVersionUpdatedAt,
        createdAt: formatFirestoreTimestamp(d.createdAt),
        updatedAt: formatFirestoreTimestamp(d.updatedAt),
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, playerPath);
      } catch (wrapped) {
        callbacks.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  const recordsQuery = query(
    collection(db, 'players', playerId, 'dailyRecords'),
    orderBy('dayKey', 'desc')
  );

  const unsubRecords = onSnapshot(
    recordsQuery,
    (snapshot) => {
      const list: FirestoreDailyRecordDoc[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          ownerUid: d.ownerUid,
          recordId: d.recordId,
          username: d.username,
          dayKey: d.dayKey,
          timestamp: d.timestamp,
          bestRating: d.bestRating,
          bestMode: d.bestMode,
          source: d.source,
          bullet: d.bullet,
          blitz: d.blitz,
          rapid: d.rapid,
          puzzles: d.puzzles,
          note: d.note,
          createdAt: formatFirestoreTimestamp(d.createdAt),
          updatedAt: formatFirestoreTimestamp(d.updatedAt),
        };
      });
      callbacks.onRecordsData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, recordsPath);
      } catch (wrapped) {
        callbacks.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  return () => {
    unsubPlayer();
    unsubRecords();
  };
}

/**
 * Primary Firestore Data Reader:
 * Fetches player configuration & daily records from Firebase Firestore.
 * Returns { available: false } seamlessly if unauthenticated, offline, empty, or unreachable,
 * allowing callers to automatically fall back to JSONBin.
 */
export async function fetchPlayerDataFromFirestore(username: string): Promise<{
  available: boolean;
  history: SyncRecord[];
  settingsPatch?: Partial<AppSettings>;
  updatedAt?: string | null;
  reason?: 'auth_required' | 'empty' | 'error';
}> {
  const playerId = sanitizePlayerId(username);
  const user = await waitForFirebaseAuthReady(1500);

  if (!user || !user.emailVerified) {
    updateFirebaseDiagnostics({
      authState: !user ? 'unauthenticated' : 'unverified',
      authEmail: null,
    });
    return { available: false, history: [], reason: 'auth_required' };
  }

  const playerPath = `players/${playerId}`;
  const recordsPath = `players/${playerId}/dailyRecords`;

  try {
    let playerSnap;
    try {
      playerSnap = await getDocFromServer(doc(db, 'players', playerId));
    } catch {
      playerSnap = await getDoc(doc(db, 'players', playerId));
    }

    if (!playerSnap.exists()) {
      return { available: false, history: [], reason: 'empty' };
    }

    const pData = playerSnap.data();
    const recordsQuery = query(
      collection(db, 'players', playerId, 'dailyRecords'),
      orderBy('dayKey', 'desc')
    );

    let recordsSnap;
    try {
      recordsSnap = await getDocsFromServer(recordsQuery);
    } catch {
      recordsSnap = await getDocs(recordsQuery);
    }

    const history: SyncRecord[] = recordsSnap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        const validSources: SyncRecord['source'][] = [
          'API Chess.com directe',
          'Proxy API',
          'Import fichier',
          'Saisie manuelle',
        ];
        const source = validSources.includes(d.source) ? d.source : 'API Chess.com directe';
        return {
          id: typeof d.recordId === 'string' && d.recordId ? d.recordId : docSnap.id,
          username: playerId,
          timestamp: typeof d.timestamp === 'string' ? d.timestamp : `${d.dayKey}T12:00:00.000Z`,
          bullet: typeof d.bullet === 'number' ? d.bullet : null,
          blitz: typeof d.blitz === 'number' ? d.blitz : null,
          rapid: typeof d.rapid === 'number' ? d.rapid : null,
          puzzles: typeof d.puzzles === 'number' ? d.puzzles : null,
          bestRating: typeof d.bestRating === 'number' ? d.bestRating : 1500,
          bestMode: isValidMode(d.bestMode),
          source,
          ...(typeof d.note === 'string' && d.note ? { note: d.note } : {}),
        };
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (history.length === 0) {
      return { available: false, history: [], reason: 'empty' };
    }

    const validThemes: AppTheme[] = ['dark', 'light', 'ocean', 'colors', 'system'];
    const validTrajectories: TrajectoryModel[] = ['linear', 'milestones', 'custom'];

    const settingsPatch: Partial<AppSettings> = {
      username: playerId,
      ...(typeof pData.startElo === 'number' ? { startElo: pData.startElo } : {}),
      ...(typeof pData.targetElo === 'number' ? { targetElo: pData.targetElo } : {}),
      ...(typeof pData.startDate === 'string' ? { startDate: pData.startDate } : {}),
      ...(typeof pData.targetDate === 'string' ? { targetDate: pData.targetDate } : {}),
      ...(pData.selectedMode === 'auto' ||
      pData.selectedMode === 'bullet' ||
      pData.selectedMode === 'blitz' ||
      pData.selectedMode === 'rapid'
        ? { selectedMode: pData.selectedMode }
        : {}),
      ...(validTrajectories.includes(pData.trajectoryModel)
        ? { trajectoryModel: pData.trajectoryModel }
        : {}),
      ...(typeof pData.autoSyncMinutes === 'number'
        ? { autoSyncMinutes: pData.autoSyncMinutes }
        : {}),
      ...(validThemes.includes(pData.theme) ? { theme: pData.theme } : {}),
      ...(typeof pData.siteVersion === 'string' && pData.siteVersion.trim()
        ? { siteVersion: pData.siteVersion.trim() }
        : {}),
      ...(typeof pData.siteVersionNote === 'string'
        ? { siteVersionNote: pData.siteVersionNote }
        : {}),
      ...(typeof pData.siteVersionUpdatedAt === 'string'
        ? { siteVersionUpdatedAt: pData.siteVersionUpdatedAt }
        : {}),
    };

    const updatedAt = formatFirestoreTimestamp(pData.updatedAt);

    updateMirrorStatus({
      status: 'synced',
      lastMirroredAt: updatedAt ? new Date(updatedAt).getTime() : Date.now(),
      recordsMirrored: history.length,
      lastError: null,
      lastPlayerId: playerId,
    });

    updateFirebaseDiagnostics({
      connection: 'online',
      activeReadSource: 'firebase',
      lastReadAt: Date.now(),
      recordsCount: history.length,
      lastFallbackReason: null,
      lastError: null,
    });
    resolveSyncIssuesByKeyPrefix('firebase_');

    return {
      available: true,
      history,
      settingsPatch,
      updatedAt,
    };
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.GET, `${playerPath} | ${recordsPath}`);
    } catch (wrapped) {
      updateMirrorStatus({
        status: 'error',
        lastError: wrapped instanceof Error ? wrapped.message : String(wrapped),
        lastPlayerId: playerId,
      });
    }
    return { available: false, history: [], reason: 'error' };
  }
}

function mapFirestoreSiteActivityDoc(d: Record<string, any>): SiteActivityConfig {
  return {
    enabled: Boolean(d.enabled),
    mode:
      d.mode === 'arret' ||
      d.mode === 'maintenance' ||
      d.mode === 'administration' ||
      d.mode === 'moderation' ||
      d.mode === 'mise_a_jour'
        ? d.mode
        : 'maintenance',
    customTitle: typeof d.customTitle === 'string' ? d.customTitle : 'Maintenance technique en cours',
    customMessage:
      typeof d.customMessage === 'string'
        ? d.customMessage
        : 'Une opération de maintenance est en cours.',
    scheduleType:
      d.scheduleType === 'countdown' || d.scheduleType === 'exact_date'
        ? d.scheduleType
        : 'immediate',
    countdownMinutes: typeof d.countdownMinutes === 'number' ? d.countdownMinutes : 5,
    pauseAtTimestamp: typeof d.pauseAtTimestamp === 'number' ? d.pauseAtTimestamp : null,
    resumeType:
      d.resumeType === 'duration' || d.resumeType === 'exact_date' ? d.resumeType : 'manual',
    resumeDurationMinutes: typeof d.resumeDurationMinutes === 'number' ? d.resumeDurationMinutes : 30,
    resumeAtTimestamp: typeof d.resumeAtTimestamp === 'number' ? d.resumeAtTimestamp : null,
    autoResume: Boolean(d.autoResume),
    showCountdownBanner: d.showCountdownBanner !== false,
    devices: {
      all: d.devicesAll !== undefined ? Boolean(d.devicesAll) : true,
      desktop: d.devicesDesktop !== undefined ? Boolean(d.devicesDesktop) : true,
      mobile: d.devicesMobile !== undefined ? Boolean(d.devicesMobile) : true,
      tablet: d.devicesTablet !== undefined ? Boolean(d.devicesTablet) : true,
    },
    iframePolicy:
      d.iframePolicy === 'block_only_iframes' || d.iframePolicy === 'allow_iframes'
        ? d.iframePolicy
        : 'block_all',
    ipPolicy: {
      mode:
        d.ipPolicyMode === 'except_list' || d.ipPolicyMode === 'only_list'
          ? d.ipPolicyMode
          : 'all',
      ips: Array.isArray(d.ipPolicyIps) ? d.ipPolicyIps.map((x: any) => String(x)) : [],
      exemptTrustedAdminIps: d.ipPolicyExemptTrustedAdminIps !== false,
    },
    allowAdminBypass: d.allowAdminBypass !== false,
    revision: typeof d.revision === 'number' ? d.revision : 0,
    updatedAt: typeof d.updatedAtMs === 'number' ? d.updatedAtMs : 0,
    updatedBy: typeof d.updatedBy === 'string' ? d.updatedBy : 'alpharomeo1500',
  };
}

/**
 * Saves SiteActivityConfig to Firestore (/siteActivity/global) for instant (<100ms) propagation
 * to every connected PC, Mobile, Tablet, and Iframe via onSnapshot.
 */
export async function saveSiteActivityToFirestore(
  config: SiteActivityConfig
): Promise<{ ok: boolean; error?: string }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return { ok: false, error: 'Connexion Google Firebase requise pour le push instantané Firestore' };
  }

  const docPath = 'siteActivity/global';
  const docRef = doc(db, 'siteActivity', 'global');

  try {
    let existingCreatedAt: any = null;
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        existingCreatedAt = snap.data().createdAt ?? null;
      }
    } catch {
      // proceed with serverTimestamp if not yet created
    }

    const sanitizedIps = (Array.isArray(config.ipPolicy?.ips) ? config.ipPolicy.ips : [])
      .map((ip) => String(ip).trim().slice(0, 64))
      .filter((ip) => ip.length >= 3)
      .slice(0, 50);

    const payload: Record<string, any> = {
      configId: 'global',
      enabled: Boolean(config.enabled),
      mode: config.mode,
      customTitle: (config.customTitle || 'Site en pause').trim().slice(0, 120),
      customMessage: (config.customMessage || 'Pause administrative en cours.').trim().slice(0, 500),
      scheduleType: config.scheduleType,
      countdownMinutes: Math.max(1, Math.min(10080, Math.round(config.countdownMinutes || 5))),
      resumeType: config.resumeType,
      resumeDurationMinutes: Math.max(
        1,
        Math.min(43200, Math.round(config.resumeDurationMinutes || 30))
      ),
      autoResume: Boolean(config.autoResume),
      showCountdownBanner: Boolean(config.showCountdownBanner),
      devicesAll: Boolean(config.devices?.all),
      devicesDesktop: Boolean(config.devices?.desktop),
      devicesMobile: Boolean(config.devices?.mobile),
      devicesTablet: Boolean(config.devices?.tablet),
      iframePolicy: config.iframePolicy,
      ipPolicyMode: config.ipPolicy?.mode || 'all',
      ipPolicyIps: sanitizedIps,
      ipPolicyExemptTrustedAdminIps: Boolean(config.ipPolicy?.exemptTrustedAdminIps),
      allowAdminBypass: Boolean(config.allowAdminBypass),
      revision: Math.max(0, Math.round(config.revision || 0)),
      updatedAtMs: Math.max(0, Math.round(config.updatedAt || Date.now())),
      updatedBy: (config.updatedBy || 'alpharomeo1500').trim().slice(0, 80) || 'alpharomeo1500',
      updatedByUid: user.uid,
      createdAt: existingCreatedAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (typeof config.pauseAtTimestamp === 'number' && config.pauseAtTimestamp >= 0) {
      payload.pauseAtTimestamp = Math.round(config.pauseAtTimestamp);
    }
    if (typeof config.resumeAtTimestamp === 'number' && config.resumeAtTimestamp >= 0) {
      payload.resumeAtTimestamp = Math.round(config.resumeAtTimestamp);
    }

    await setDoc(docRef, payload);
    updateFirebaseDiagnostics({
      connection: 'online',
      lastWriteAt: Date.now(),
      lastError: null,
    });
    resolveSyncIssuesByKeyPrefix('firebase_');
    return { ok: true };
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, docPath);
    } catch (wrapped) {
      return {
        ok: false,
        error: wrapped instanceof Error ? wrapped.message : String(wrapped),
      };
    }
  }
}

export async function fetchSiteActivityFromFirestore(
  forceServer = false
): Promise<SiteActivityConfig | null> {
  try {
    const ref = doc(db, 'siteActivity', 'global');
    const snap = forceServer ? await getDocFromServer(ref) : await getDoc(ref);
    if (!snap.exists()) return null;
    updateFirebaseDiagnostics({ connection: 'online' });
    return mapFirestoreSiteActivityDoc(snap.data());
  } catch (err: any) {
    const raw = err instanceof Error ? err.message : String(err);
    const parsed = interpretFirebaseError(raw);
    if (parsed.isBlockedClient) {
      updateFirebaseDiagnostics({ connection: 'blocked', lastError: parsed.title });
    }
    reportSyncIssue({
      key: `${parsed.key}_site_activity_read`,
      source: 'firebase',
      severity: parsed.severity,
      title: parsed.title,
      message: parsed.message,
      technicalDetail: raw.slice(0, 220),
      suggestion: parsed.suggestion,
    });
    return null;
  }
}

export function subscribeSiteActivityFirestore(
  onUpdate: (config: SiteActivityConfig) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const ref = doc(db, 'siteActivity', 'global');
  updateFirebaseDiagnostics({ realtimeListener: 'connecting' });
  return onSnapshot(
    ref,
    (snap) => {
      updateFirebaseDiagnostics({
        connection: 'online',
        realtimeListener: 'connected',
        lastRealtimeEventAt: Date.now(),
      });
      resolveSyncIssuesByKeyPrefix('firebase_realtime');
      resolveSyncIssuesByKeyPrefix('firebase_blocked');
      if (!snap.exists()) return;
      onUpdate(mapFirestoreSiteActivityDoc(snap.data()));
    },
    (error) => {
      const raw = error instanceof Error ? error.message : String(error);
      const parsed = interpretFirebaseError(raw);
      updateFirebaseDiagnostics({
        realtimeListener: 'error',
        ...(parsed.isBlockedClient ? { connection: 'blocked' as const } : {}),
        lastError: parsed.title,
      });
      reportSyncIssue({
        key: `firebase_realtime_${parsed.key}`,
        source: 'firebase',
        severity: parsed.severity,
        title: parsed.title,
        message: parsed.message,
        technicalDetail: raw.slice(0, 220),
        suggestion: parsed.suggestion,
      });
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  );
}
