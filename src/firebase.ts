/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  initializeFirestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  interpretFirebaseError,
  reportSyncIssue,
  resolveSyncIssuesByKeyPrefix,
  updateFirebaseDiagnostics,
} from './utils/syncDiagnostics';

// SHA-256 hex digest of the single authorized Google account (email never stored in plaintext in client code or UI)
const OWNER_EMAIL_SHA256 = '83852361fc1ce81efdc55ecbbca5aba4f12b1d1716950663fed1003583980f8a';

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function pureSha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const withOneLen = bytes.length + 1;
  const padLen = (64 - ((withOneLen + 8) % 64)) % 64;
  const totalLen = withOneLen + padLen + 8;
  const padded = new Uint8Array(totalLen);
  padded.set(bytes, 0);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(totalLen - 4, bitLen >>> 0, false);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const W = new Uint32Array(64);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, W[i - 15]) ^ rotr(18, W[i - 15]) ^ (W[i - 15] >>> 3);
      const s1 = rotr(17, W[i - 2]) ^ rotr(19, W[i - 2]) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + W[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  return Array.from(H)
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
}

async function sha256Hex(input: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {}
  return pureSha256Hex(input);
}

export async function isAuthorizedOwnerEmail(email: string | null | undefined): Promise<boolean> {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return false;
  const digest = await sha256Hex(normalized);
  return digest === OWNER_EMAIL_SHA256;
}

export async function isAuthorizedOwnerUser(user: User | null | undefined): Promise<boolean> {
  if (!user || !user.emailVerified || !user.email) return false;
  return isAuthorizedOwnerEmail(user.email);
}

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(
  app,
  { experimentalAutoDetectLongPolling: true },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const FIREBASE_META = {
  projectId: firebaseConfig.projectId,
  firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
  authDomain: firebaseConfig.authDomain,
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    emailConfigured?: boolean;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: rawMessage,
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      emailConfigured: Boolean(auth.currentUser?.email),
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
        })) || [],
    },
    operationType,
    path,
  };

  const interpreted = interpretFirebaseError(rawMessage);
  if (interpreted.isBlockedClient) {
    connectionState = 'blocked';
    updateFirebaseDiagnostics({ connection: 'blocked', lastError: interpreted.title });
  } else if (interpreted.key === 'firebase_offline') {
    connectionState = 'offline';
    updateFirebaseDiagnostics({ connection: 'offline', lastError: interpreted.title });
  }

  reportSyncIssue({
    key: `${interpreted.key}_${operationType}`,
    source: 'firebase',
    severity: interpreted.severity,
    title: interpreted.title,
    message: interpreted.message,
    technicalDetail: `${operationType.toUpperCase()} ${path || ''} — ${rawMessage}`.slice(0, 240),
    suggestion: interpreted.suggestion,
  });

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export type FirebaseConnectionState = 'checking' | 'online' | 'offline' | 'blocked';
let connectionState: FirebaseConnectionState = 'checking';

export function getFirebaseConnectionState(): FirebaseConnectionState {
  return connectionState;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    updateFirebaseDiagnostics({
      authState: 'unauthenticated',
      authEmail: null,
    });
    return;
  }

  const authorized = await isAuthorizedOwnerUser(user);
  if (!authorized) {
    await signOut(auth).catch(() => {});
    updateFirebaseDiagnostics({
      authState: 'unauthenticated',
      authEmail: null,
      lastError: 'Compte Google non autorisé',
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('roadto2000:firebase-auth-rejected', {
          detail: {
            reason:
              "Accès refusé : ce compte Google n'est pas autorisé à accéder à cet espace.",
          },
        })
      );
    }
    return;
  }

  updateFirebaseDiagnostics({
    authState: 'authenticated',
    authEmail: 'Compte Google autorisé',
    lastError: null,
  });
});

export async function testConnection(): Promise<FirebaseConnectionState> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  updateFirebaseDiagnostics({ connection: 'checking' });

  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    const latencyMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
    );
    connectionState = 'online';
    updateFirebaseDiagnostics({ connection: 'online', latencyMs, lastError: null });
    resolveSyncIssuesByKeyPrefix('firebase_offline');
    resolveSyncIssuesByKeyPrefix('firebase_blocked');
    return 'online';
  } catch (error) {
    const latencyMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
    );
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();

    if (lower.includes('err_blocked_by_client') || lower.includes('blocked')) {
      connectionState = 'blocked';
      updateFirebaseDiagnostics({
        connection: 'blocked',
        latencyMs: null,
        lastError: 'Canal Firestore bloqué par le client',
      });
      reportSyncIssue({
        key: 'firebase_blocked_by_client_probe',
        source: 'firebase',
        severity: 'warning',
        title: 'Firestore bloqué par le navigateur / extension',
        message: 'Le test vers firestore.googleapis.com a été bloqué côté client.',
        technicalDetail: msg.slice(0, 200),
        suggestion:
          'Désactivez Brave Shields / uBlock / AdGuard pour ce site afin d’activer le temps réel.',
      });
      return 'blocked';
    }

    if (
      lower.includes('the client is offline') ||
      (typeof navigator !== 'undefined' && !navigator.onLine)
    ) {
      console.error('Please check your Firebase configuration.');
      connectionState = 'offline';
      updateFirebaseDiagnostics({
        connection: 'offline',
        latencyMs: null,
        lastError: 'Client hors ligne ou Firestore inaccessible',
      });
      reportSyncIssue({
        key: 'firebase_offline_probe',
        source: 'firebase',
        severity: 'warning',
        title: 'Firestore hors ligne',
        message: 'La base Firestore n’a pas répondu au test de connectivité.',
        technicalDetail: msg.slice(0, 200),
        suggestion: 'Vérifiez votre connexion Internet ; le repli JSONBin prend le relais.',
      });
      return 'offline';
    }

    // Permission denied or missing test doc still confirms live network reachability to Firestore
    connectionState = 'online';
    updateFirebaseDiagnostics({ connection: 'online', latencyMs, lastError: null });
    resolveSyncIssuesByKeyPrefix('firebase_offline');
    resolveSyncIssuesByKeyPrefix('firebase_blocked');
    return 'online';
  }
}

testConnection();

export function waitForFirebaseAuthReady(timeoutMs = 1500): Promise<User | null> {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(user);
    };
    const timer = setTimeout(() => finish(auth.currentUser), timeoutMs);
    const unsub = onAuthStateChanged(auth, (user) => finish(user));
  });
}

export async function signInWithGoogleFirebase(): Promise<User> {
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    const authorized = await isAuthorizedOwnerUser(credential.user);
    if (!authorized) {
      await signOut(auth).catch(() => {});
      const unauthorizedErr = new Error(
        "Accès refusé : ce compte Google n'est pas autorisé à accéder à cet espace."
      );
      reportSyncIssue({
        key: 'firebase_auth_unauthorized_account',
        source: 'firebase',
        severity: 'error',
        title: 'Compte Google refusé',
        message: unauthorizedErr.message,
        suggestion: 'Connectez-vous uniquement avec le compte Google administrateur autorisé.',
      });
      throw unauthorizedErr;
    }

    resolveSyncIssuesByKeyPrefix('firebase_auth');
    updateFirebaseDiagnostics({
      authState: 'authenticated',
      authEmail: 'Compte Google autorisé',
      lastError: null,
    });
    return credential.user;
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("n'est pas autorisé")) {
      const interpreted = interpretFirebaseError(msg);
      reportSyncIssue({
        key: `firebase_auth_signin_${err?.code || 'error'}`,
        source: 'firebase',
        severity: 'error',
        title: interpreted.title,
        message: interpreted.message,
        technicalDetail: msg.slice(0, 220),
        suggestion: interpreted.suggestion,
      });
    }
    throw err;
  }
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
  updateFirebaseDiagnostics({
    authState: 'unauthenticated',
    authEmail: null,
  });
}
