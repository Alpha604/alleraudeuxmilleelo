/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { AppSettings, GameMode, SyncRecord } from '../types/chess';
import { normalizeParisDayKey } from './storage';

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
    const next = updateMirrorStatus({
      status: 'auth_required',
      lastPlayerId: playerId,
      lastError: user ? 'Adresse email Google non vérifiée' : 'Connexion Google Firebase requise pour activer le miroir',
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
          displayName: (user.displayName || user.email || playerId).slice(0, 80),
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
