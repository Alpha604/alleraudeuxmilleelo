/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  CheckCircle2,
  Code2,
  Database,
  Flame,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import {
  auth,
  FIREBASE_META,
  FirebaseConnectionState,
  getFirebaseConnectionState,
  signInWithGoogleFirebase,
  signOutFirebase,
  testConnection,
} from '../firebase';
import { AppSettings, SyncRecord } from '../types/chess';
import { formatJsonBinTimestamp } from '../utils/cloudSync';
import {
  FirebaseMirrorStatus,
  FirestoreDailyRecordDoc,
  FirestorePlayerDoc,
  getFirebaseMirrorStatus,
  mirrorDataToFirestore,
  subscribePlayerFirestoreExplorer,
} from '../utils/firebaseMirror';

interface FirebaseSettingsPanelProps {
  username: string;
  settings: AppSettings;
  jsonBinHistory: SyncRecord[];
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning') => void;
}

export const FirebaseSettingsPanel: React.FC<FirebaseSettingsPanelProps> = ({
  username,
  settings,
  jsonBinHistory,
  onShowMessage,
}) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(() => auth.currentUser);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [connState, setConnState] = useState<FirebaseConnectionState>(() =>
    getFirebaseConnectionState()
  );
  const [mirrorStatus, setMirrorStatus] = useState<FirebaseMirrorStatus>(() =>
    getFirebaseMirrorStatus()
  );

  const [playerDoc, setPlayerDoc] = useState<FirestorePlayerDoc | null>(null);
  const [dailyDocs, setDailyDocs] = useState<FirestoreDailyRecordDoc[]>([]);
  const [explorerError, setExplorerError] = useState<string | null>(null);

  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [isMirroring, setIsMirroring] = useState<boolean>(false);
  const [isCheckingConn, setIsCheckingConn] = useState<boolean>(false);
  const [showRawPlayerJson, setShowRawPlayerJson] = useState<boolean>(false);
  const [selectedRecordJson, setSelectedRecordJson] = useState<FirestoreDailyRecordDoc | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Listen to background mirror status events
  useEffect(() => {
    const handleMirrorEvent = (e: Event) => {
      const detail = (e as CustomEvent<FirebaseMirrorStatus>).detail;
      if (detail) setMirrorStatus(detail);
    };
    window.addEventListener('roadto2000:firebase-mirror-updated', handleMirrorEvent);
    return () => {
      window.removeEventListener('roadto2000:firebase-mirror-updated', handleMirrorEvent);
    };
  }, []);

  // Attach live Firestore onSnapshot listeners ONLY when authenticated & verified
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified) {
      setPlayerDoc(null);
      setDailyDocs([]);
      return;
    }

    setExplorerError(null);
    const unsubscribe = subscribePlayerFirestoreExplorer(username, {
      onPlayerData: (docData) => {
        setPlayerDoc(docData);
      },
      onRecordsData: (records) => {
        setDailyDocs(records);
      },
      onError: (err) => {
        setExplorerError(err.message);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [authReady, firebaseUser, username]);

  const handleConnectGoogle = async () => {
    setIsSigningIn(true);
    setExplorerError(null);
    try {
      const user = await signInWithGoogleFirebase();
      onShowMessage(`Connecté à Firebase (${user.email || 'Google'})`, 'success');
      // Immediately mirror JSONBin-backed data to populate Firestore
      setIsMirroring(true);
      const res = await mirrorDataToFirestore({
        username,
        history: jsonBinHistory,
        settings,
        jsonBinSyncedAt: new Date().toISOString(),
        replaceExact: true,
      });
      setIsMirroring(false);
      if (res.ok) {
        onShowMessage(
          `Miroir Firebase initialisé : ${res.recordsMirrored} relevé(s) stocké(s) dans Firestore.`,
          'success'
        );
      } else if (res.error) {
        setExplorerError(res.error);
      }
    } catch (err: any) {
      const msg = err?.message || 'Échec de la connexion Google Firebase';
      setExplorerError(msg);
      onShowMessage(msg, 'warning');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      await signOutFirebase();
      setPlayerDoc(null);
      setDailyDocs([]);
      setSelectedRecordJson(null);
      onShowMessage('Session Google Firebase déconnectée.', 'info');
    } catch (err: any) {
      onShowMessage(err?.message || 'Erreur de déconnexion Firebase', 'warning');
    }
  };

  const handleMirrorNow = async () => {
    if (!firebaseUser) {
      onShowMessage('Connectez d’abord votre compte Google Firebase ci-dessus.', 'warning');
      return;
    }
    setIsMirroring(true);
    setExplorerError(null);
    try {
      const res = await mirrorDataToFirestore({
        username,
        history: jsonBinHistory,
        settings,
        jsonBinSyncedAt: new Date().toISOString(),
        replaceExact: true,
        throwOnError: true,
      });
      onShowMessage(
        `${res.recordsMirrored} relevé(s) et paramètres miroités depuis JSONBin vers Firestore !`,
        'success'
      );
    } catch (err: any) {
      const msg = err?.message || 'Erreur lors du miroir vers Firestore';
      setExplorerError(msg);
      onShowMessage(msg, 'warning');
    } finally {
      setIsMirroring(false);
    }
  };

  const handleCheckConnection = async () => {
    setIsCheckingConn(true);
    const nextState = await testConnection();
    setConnState(nextState);
    setIsCheckingConn(false);
    onShowMessage(
      nextState === 'online'
        ? 'Connexion Firestore active et joignable.'
        : 'Client hors ligne : Firestore inaccessible.',
      nextState === 'online' ? 'success' : 'warning'
    );
  };

  const filteredDailyDocs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return dailyDocs;
    return dailyDocs.filter(
      (d) =>
        d.dayKey.toLowerCase().includes(q) ||
        d.recordId.toLowerCase().includes(q) ||
        d.source.toLowerCase().includes(q) ||
        (d.note || '').toLowerCase().includes(q)
    );
  }, [dailyDocs, searchTerm]);

  const jsonBinLatestElo = jsonBinHistory[0]?.bestRating ?? settings.startElo;
  const isParityAligned =
    Boolean(playerDoc) &&
    dailyDocs.length === jsonBinHistory.length &&
    playerDoc?.bestRating === jsonBinLatestElo;

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Architecture Banner: JSONBin active read source + Firebase mirror */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-neutral-900/90 to-sky-500/10 p-5 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span>Paramètre Firebase Firestore (Vue PC)</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 border border-sky-500/30 px-2.5 py-0.5 text-[10px] font-bold text-sky-300">
                  Source Prioritaire : Firebase · Repli JSONBin
                </span>
              </h3>
              <p className="text-xs text-neutral-300 mt-0.5">
                L&apos;application lit désormais en priorité depuis <strong>Firebase Firestore</strong> (y compris
                le blocage du site en temps réel) et bascule automatiquement sur <strong>JSONBin</strong> en secours.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCheckConnection}
            disabled={isCheckingConn}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900/90 hover:bg-neutral-800 px-3 py-1.5 text-xs font-bold text-neutral-200 transition-colors"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                connState === 'online'
                  ? 'bg-emerald-400'
                  : connState === 'offline'
                  ? 'bg-rose-400'
                  : 'bg-amber-400 animate-pulse'
              }`}
            />
            <RefreshCw className={`h-3.5 w-3.5 ${isCheckingConn ? 'animate-spin' : ''}`} />
            <span>{connState === 'online' ? 'Firestore En Ligne' : 'Tester Firestore'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px] font-mono">
          <div className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2">
            <span className="text-neutral-400 block">Projet Firebase</span>
            <span className="text-white font-bold">{FIREBASE_META.projectId}</span>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2">
            <span className="text-neutral-400 block">Base Firestore</span>
            <span className="text-sky-300 font-bold truncate block" title={FIREBASE_META.firestoreDatabaseId}>
              {FIREBASE_META.firestoreDatabaseId}
            </span>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2">
            <span className="text-neutral-400 block">Chemin principal</span>
            <span className="text-[#facc15] font-bold">/players/{username.toLowerCase()}</span>
          </div>
        </div>
      </div>

      {/* Firebase Authentication & Mirror Sync Controls */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15]">
            <ShieldCheck className="h-4 w-4" />
            <span>Accès Sécurisé & Miroir Temps Réel</span>
          </div>

          {firebaseUser ? (
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{firebaseUser.email || firebaseUser.uid}</span>
              </span>
              <button
                type="button"
                onClick={handleDisconnectGoogle}
                className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-xs font-bold text-neutral-200 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Déconnecter</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnectGoogle}
              disabled={isSigningIn}
              className="inline-flex items-center gap-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black px-4 py-2 text-xs font-black transition-all shadow-[0_0_18px_rgba(250,204,21,0.25)] disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              <span>{isSigningIn ? 'Connexion Google...' : 'Connecter Google pour voir & miroiter Firebase'}</span>
            </button>
          )}
        </div>

        {!firebaseUser ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 leading-relaxed">
            Votre base Firestore est protégée par des règles strictes : cliquez sur{' '}
            <strong>« Connecter Google pour voir &amp; miroiter Firebase »</strong> avec votre compte{' '}
            <span className="font-mono text-white">romeo.brawlstars59@gmail.com</span> pour activer le miroir
            automatique et afficher le contenu en direct sur PC.
          </div>
        ) : (
          <>
            {/* Parity Comparison Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-neutral-800 bg-black/40 p-3.5 space-y-1">
                <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                  Relevés JSONBin (Secours)
                </span>
                <div className="text-xl font-black text-white font-mono">
                  {jsonBinHistory.length} <span className="text-xs font-normal text-neutral-400">jours</span>
                </div>
                <div className="text-[11px] text-neutral-400">
                  Dernier Elo : <strong className="text-[#facc15] font-mono">{jsonBinLatestElo}</strong>
                </div>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-black/40 p-3.5 space-y-1">
                <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                  Relevés Firestore (Principal)
                </span>
                <div className="text-xl font-black text-sky-300 font-mono">
                  {dailyDocs.length} <span className="text-xs font-normal text-neutral-400">docs</span>
                </div>
                <div className="text-[11px] text-neutral-400">
                  Dernier Elo :{' '}
                  <strong className="text-sky-300 font-mono">{playerDoc?.bestRating ?? '—'}</strong>
                </div>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-black/40 p-3.5 space-y-1.5">
                <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                  Parité &amp; Dernier Miroir
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      isParityAligned
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isParityAligned ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    <span>{isParityAligned ? '100% aligné avec JSONBin' : 'Mise à jour requise'}</span>
                  </span>
                </div>
                <div className="text-[11px] font-mono text-neutral-400">
                  {mirrorStatus.lastMirroredAt
                    ? formatJsonBinTimestamp(mirrorStatus.lastMirroredAt)
                    : 'Aucun miroir local récent'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-neutral-400">
                Chaque synchronisation JSONBin met aussi à jour Firestore automatiquement en arrière-plan.
              </p>
              <button
                type="button"
                onClick={handleMirrorNow}
                disabled={isMirroring}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black px-4 py-2 text-xs font-black transition-all shadow-md disabled:opacity-50"
              >
                {isMirroring ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="h-3.5 w-3.5" />
                )}
                <span>Synchroniser JSONBin → Firebase maintenant</span>
              </button>
            </div>
          </>
        )}

        {explorerError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs font-mono text-rose-300 break-all">
            {explorerError}
          </div>
        )}
      </div>

      {/* Live Firestore Content Explorer (PC) */}
      {firebaseUser && (
        <div className="space-y-6">
          {/* 1. Player Document Summary */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400">
                <Database className="h-4 w-4" />
                <span>Document Firestore : /players/{username.toLowerCase()}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowRawPlayerJson((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-950 hover:bg-neutral-800 px-3 py-1.5 text-[11px] font-bold text-neutral-200 transition-colors"
              >
                <Code2 className="h-3.5 w-3.5 text-[#facc15]" />
                <span>{showRawPlayerJson ? 'Masquer JSON brut' : 'Voir JSON brut'}</span>
              </button>
            </div>

            {!playerDoc ? (
              <div className="rounded-xl border border-neutral-800 bg-black/40 p-6 text-center text-xs text-neutral-400">
                Aucun document trouvé dans Firestore pour ce joueur. Cliquez sur{' '}
                <strong>« Synchroniser JSONBin → Firebase maintenant »</strong> pour créer le miroir.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-xl border border-neutral-800 bg-black/40 p-3">
                    <span className="text-[11px] text-neutral-400 block">Meilleur Elo / Mode</span>
                    <strong className="text-white font-mono">
                      {playerDoc.bestRating} ({playerDoc.bestMode})
                    </strong>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-black/40 p-3">
                    <span className="text-[11px] text-neutral-400 block">Objectif &amp; Départ</span>
                    <strong className="text-white font-mono">
                      {playerDoc.startElo} → {playerDoc.targetElo}
                    </strong>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-black/40 p-3">
                    <span className="text-[11px] text-neutral-400 block">Thème &amp; Modèle</span>
                    <strong className="text-white">
                      {playerDoc.theme} · {playerDoc.trajectoryModel}
                    </strong>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-black/40 p-3">
                    <span className="text-[11px] text-neutral-400 block">MàJ Firestore</span>
                    <strong className="text-sky-300 font-mono text-[11px]">
                      {formatJsonBinTimestamp(playerDoc.updatedAt)}
                    </strong>
                  </div>
                </div>

                {showRawPlayerJson && (
                  <pre className="max-h-64 overflow-y-auto rounded-xl border border-neutral-800 bg-black/80 p-3.5 font-mono text-[11px] text-emerald-300 leading-relaxed">
                    {JSON.stringify(playerDoc, null, 2)}
                  </pre>
                )}
              </>
            )}
          </div>

          {/* 2. DailyRecords Subcollection Explorer */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400">
                <Sparkles className="h-4 w-4" />
                <span>
                  Collection Firestore : /players/{username.toLowerCase()}/dailyRecords ({dailyDocs.length})
                </span>
              </div>

              <div className="relative w-64">
                <Search className="h-3.5 w-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrer par date, source, note..."
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>

            {filteredDailyDocs.length === 0 ? (
              <div className="rounded-xl border border-neutral-800 bg-black/40 p-6 text-center text-xs text-neutral-400">
                Aucun document quotidien dans Firestore ne correspond à ce filtre.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-neutral-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-black/60 border-b border-neutral-800 text-[11px] uppercase tracking-wider text-neutral-400">
                      <th className="py-2.5 px-3 font-bold">Doc ID (Jour)</th>
                      <th className="py-2.5 px-3 font-bold">Bullet</th>
                      <th className="py-2.5 px-3 font-bold">Blitz</th>
                      <th className="py-2.5 px-3 font-bold">Rapide</th>
                      <th className="py-2.5 px-3 font-bold">Problèmes</th>
                      <th className="py-2.5 px-3 font-bold">Meilleur</th>
                      <th className="py-2.5 px-3 font-bold">Source</th>
                      <th className="py-2.5 px-3 font-bold">MàJ Firestore</th>
                      <th className="py-2.5 px-3 font-bold text-right">JSON</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/70">
                    {filteredDailyDocs.map((rec) => {
                      const isSelected = selectedRecordJson?.id === rec.id;
                      return (
                        <tr
                          key={rec.id}
                          className={`transition-colors ${
                            isSelected ? 'bg-sky-500/10' : 'hover:bg-white/[0.03]'
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-white">{rec.dayKey}</td>
                          <td className="py-2.5 px-3 font-mono text-neutral-200">{rec.bullet ?? '—'}</td>
                          <td className="py-2.5 px-3 font-mono text-neutral-200">{rec.blitz ?? '—'}</td>
                          <td className="py-2.5 px-3 font-mono text-neutral-200">{rec.rapid ?? '—'}</td>
                          <td className="py-2.5 px-3 font-mono text-sky-300">{rec.puzzles ?? '—'}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-[#facc15]">
                            {rec.bestRating}{' '}
                            <span className="text-[10px] font-normal text-neutral-400 uppercase">
                              {rec.bestMode}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-neutral-300">{rec.source}</td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-400">
                            {formatJsonBinTimestamp(rec.updatedAt)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedRecordJson(isSelected ? null : rec)}
                              className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 hover:border-sky-400 px-2.5 py-1 text-[11px] font-bold text-neutral-200 transition-colors"
                            >
                              <Code2 className="h-3 w-3 text-sky-400" />
                              <span>{isSelected ? 'Fermer' : 'Voir'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {selectedRecordJson && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-sky-300">
                  <span>
                    Document : /players/{username.toLowerCase()}/dailyRecords/{selectedRecordJson.id}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedRecordJson(null)}
                    className="text-neutral-400 hover:text-white underline"
                  >
                    Fermer l&apos;aperçu
                  </button>
                </div>
                <pre className="max-h-60 overflow-y-auto rounded-xl border border-sky-500/30 bg-black/85 p-3.5 font-mono text-[11px] text-sky-200 leading-relaxed">
                  {JSON.stringify(selectedRecordJson, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
