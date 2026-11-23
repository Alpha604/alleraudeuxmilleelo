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
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
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
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
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

onAuthStateChanged(auth, (user) => {
  updateFirebaseDiagnostics({
    authState: !user
      ? 'unauthenticated'
      : user.emailVerified
      ? 'authenticated'
      : 'unverified',
    authEmail: user?.email ?? null,
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
        suggestion: 'Désactivez Brave Shields / uBlock / AdGuard pour ce site afin d’activer le temps réel.',
      });
      return 'blocked';
    }

    if (lower.includes('the client is offline') || (typeof navigator !== 'undefined' && !navigator.onLine)) {
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
    resolveSyncIssuesByKeyPrefix('firebase_auth');
    return credential.user;
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
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
    throw err;
  }
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}
