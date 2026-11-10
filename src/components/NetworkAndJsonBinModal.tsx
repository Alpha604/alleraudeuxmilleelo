/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cloud,
  CloudOff,
  Copy,
  Database,
  ExternalLink,
  Globe,
  Key,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import {
  fetchJsonBinStatus,
  JsonBinStatusInfo,
  pullFromJsonBin,
  saveJsonBinConfig,
  syncNowToJsonBin,
} from '../utils/cloudSync';
import { SyncRecord } from '../types/chess';

interface NetworkAndJsonBinModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  onHistoryUpdate?: (history: SyncRecord[]) => void;
  onShowMessage?: (msg: string, type?: 'info' | 'success' | 'warning') => void;
  onOpenSettings?: () => void;
}

export const NetworkAndJsonBinModal: React.FC<NetworkAndJsonBinModalProps> = ({
  isOpen,
  onClose,
  username,
  onHistoryUpdate,
  onShowMessage,
  onOpenSettings,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [latency, setLatency] = useState<number | null>(null);
  const [statusInfo, setStatusInfo] = useState<JsonBinStatusInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Form state for configuring JSONBin
  const [binId, setBinId] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);

  // Measure latency and check online status
  const checkNetworkAndStatus = async () => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const start = performance.now();
    try {
      const res = await fetch('/api/auth/client-ip', { cache: 'no-store' });
      if (res.ok) {
        setLatency(Math.round(performance.now() - start));
      } else {
        setLatency(null);
      }
    } catch {
      setLatency(null);
    }

    try {
      setLoading(true);
      const data = await fetchJsonBinStatus(username);
      if (data) {
        setStatusInfo(data);
        if (data.binId) setBinId(data.binId);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    checkNetworkAndStatus();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOpen, username]);

  if (!isOpen) return null;

  const handleCopyTemplate = async () => {
    const templateContent = statusInfo?.template
      ? JSON.stringify(statusInfo.template, null, 2)
      : JSON.stringify(
          {
            _info: {
              project: 'Road to 2000 Elo',
              description: 'Cache en ligne JSONBin pour synchronisation',
              version: '2.0.0',
              updatedAt: new Date().toISOString(),
            },
            player: {
              username,
              targetElo: 2000,
              targetDate: '2027-12-31T23:59:59.000Z',
              startDate: '2026-11-06',
              startRatings: { bullet: 1500, blitz: 1458, rapid: 1289 },
              bestMode: 'bullet',
              bestRating: 1500,
            },
            history: [
              {
                id: 'sync_initial_20261106',
                timestamp: '2026-11-06T12:00:00.000Z',
                username,
                bullet: 1500,
                blitz: 1458,
                rapid: 1289,
                bestRating: 1500,
                bestMode: 'bullet',
                source: 'Initialisation du projet',
              },
            ],
          },
          null,
          2
        );

    try {
      await navigator.clipboard.writeText(templateContent);
      setCopied(true);
      if (onShowMessage) onShowMessage('Contenu JSON copié dans le presse-papier !', 'success');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = templateContent;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigFeedback(null);

    const res = await saveJsonBinConfig({
      binId: binId.trim(),
      apiKey: apiKey.trim(),
      enabled: true,
    });

    setSavingConfig(false);
    if (res.success) {
      setConfigFeedback('Configuration JSONBin enregistrée et validée avec succès !');
      checkNetworkAndStatus();
      if (onShowMessage) onShowMessage('Configuration JSONBin enregistrée !', 'success');
    } else {
      setConfigFeedback(res.lastError || 'Erreur lors de la configuration');
      if (onShowMessage) onShowMessage(res.lastError || 'Échec de connexion', 'warning');
    }
  };

  const handleManualSyncNow = async () => {
    setSyncing(true);
    const res = await syncNowToJsonBin(username, true);
    setSyncing(false);
    if (res.success) {
      if (res.skipped) {
        if (onShowMessage) {
          onShowMessage('Quota préservé : Vos données sont déjà à jour sur JSONBin !', 'info');
        }
      } else {
        if (onShowMessage) onShowMessage('Données sauvegardées en ligne sur JSONBin !', 'success');
      }
      checkNetworkAndStatus();
    } else {
      if (onShowMessage) onShowMessage(res.error || 'Erreur de synchronisation JSONBin', 'warning');
    }
  };

  const handlePullFromBin = async () => {
    setSyncing(true);
    const res = await pullFromJsonBin();
    setSyncing(false);
    if (res.success && res.history) {
      if (onHistoryUpdate) onHistoryUpdate(res.history);
      if (onShowMessage) onShowMessage(`${res.history.length} relevés restaurés depuis JSONBin !`, 'success');
      checkNetworkAndStatus();
    } else {
      if (onShowMessage) onShowMessage(res.error || 'Échec de lecture depuis JSONBin', 'warning');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="network-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl border border-neutral-800 bg-[#0a0d14] text-neutral-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800/80 px-5 sm:px-6 py-4 bg-[#0d111a]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 border border-neutral-700 text-[#facc15]">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 id="network-modal-title" className="text-base sm:text-lg font-black text-white">
                Statut Réseau & Cache JSONBin
              </h3>
              <p className="text-[11px] text-neutral-400">
                Surveillance de la connectivité et persistance en ligne
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content with smooth vertical scroll */}
        <div className="overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* 1. Network Connectivity Card */}
          <div className="rounded-2xl border border-neutral-800 bg-[#0c1019] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-300">
                {isOnline ? (
                  <Wifi className="h-4 w-4 text-[#10b981]" />
                ) : (
                  <WifiOff className="h-4 w-4 text-[#ef4444]" />
                )}
                <span>Connectivité Internet</span>
              </div>
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  isOnline
                    ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/40'
                    : 'bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/40'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-[#10b981] animate-pulse' : 'bg-[#ef4444]'}`} />
                <span>{isOnline ? 'En Ligne' : 'Déconnecté'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-800/80 font-mono text-xs">
              <div>
                <span className="text-neutral-400 text-[10px] uppercase font-sans">Latence serveur :</span>
                <div className="font-bold text-white mt-0.5">
                  {latency !== null ? (
                    <span className={latency < 120 ? 'text-[#10b981]' : 'text-[#facc15]'}>
                      {latency} ms
                    </span>
                  ) : (
                    <span className="text-neutral-500">—</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-neutral-400 text-[10px] uppercase font-sans">Compte actif :</span>
                <div className="font-bold text-[#facc15] truncate mt-0.5">@{username}</div>
              </div>
            </div>
          </div>

          {/* 2. JSONBin Cache Status Card */}
          <div className="rounded-2xl border border-neutral-800 bg-[#0c1019] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-300">
                <Cloud className="h-4 w-4 text-[#facc15]" />
                <span>Statut du Cache JSONBin</span>
              </div>

              {/* Status Pill */}
              {statusInfo?.configured ? (
                statusInfo.lastStatus === 'synced' ? (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                    <span>Synchronisé</span>
                  </div>
                ) : statusInfo.lastStatus === 'syncing' ? (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#facc15]/15 text-[#facc15] border border-[#facc15]/40">
                    <RefreshCw className="h-3 w-3 animate-spin text-[#facc15]" />
                    <span>En cours...</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444]" />
                    <span>Erreur de clé</span>
                  </div>
                )
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#facc15]/15 text-[#facc15] border border-[#facc15]/40">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#facc15]" />
                  <span>En attente de codes</span>
                </div>
              )}
            </div>

            <p className="text-xs text-neutral-400">
              {statusInfo?.configured ? (
                <>
                  Connecté au Bin <strong className="text-white font-mono">{statusInfo.binId}</strong>. Sauvegarde automatique active à chaque synchronisation.
                </>
              ) : (
                <>
                  Créez votre bin sur <a href="https://jsonbin.io" target="_blank" rel="noreferrer" className="text-[#facc15] hover:underline font-bold inline-flex items-center gap-1">jsonbin.io <ExternalLink className="h-3 w-3" /></a> et renseignez vos identifiants ci-dessous pour activer la sauvegarde cloud automatique.
                </>
              )}
            </p>

            {statusInfo?.lastError && (
              <div className="p-2.5 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-xs text-[#ef4444] flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{statusInfo.lastError}</span>
              </div>
            )}

            {/* Action buttons if configured */}
            {statusInfo?.configured && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-800">
                <button
                  onClick={handleManualSyncNow}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#10b981]/40 bg-[#10b981]/15 text-xs font-bold text-[#10b981] hover:bg-[#10b981]/25 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  <span>Sauvegarder vers JSONBin</span>
                </button>

                <button
                  onClick={handlePullFromBin}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-900 text-xs font-bold text-white hover:bg-neutral-800 transition-all disabled:opacity-50"
                >
                  <Server className="h-3.5 w-3.5" />
                  <span>Restaurer depuis JSONBin</span>
                </button>
              </div>
            )}
          </div>

          {/* 3. Anti-Overconsumption Quota Saver Card */}
          <div className="rounded-2xl border border-neutral-800 bg-[#0c1019] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-300">
                <ShieldCheck className="h-4 w-4 text-[#10b981]" />
                <span>Protection Anti-Surconsommation (Quota Saver)</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/40">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                <span>Actif</span>
              </div>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed">
              Pour préserver votre quota gratuit JSONBin, les requêtes externes sont intelligemment filtrées : aucune requête n'est émise si vos classements n'ont pas changé (dédoublonnage par signature MD5 et temporisation intelligente).
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-neutral-800/80 font-mono text-xs">
              <div className="rounded-xl bg-black/40 border border-neutral-800/80 p-2.5">
                <span className="text-neutral-400 text-[10px] uppercase font-sans flex items-center gap-1">
                  <Zap className="h-3 w-3 text-[#facc15]" />
                  Requêtes JSONBin aujourd'hui
                </span>
                <div className="font-bold text-white text-base mt-1">
                  {statusInfo?.quotaInfo?.requestsToday ?? 0}
                  <span className="text-neutral-500 text-xs font-normal ml-1">/ jour</span>
                </div>
              </div>

              <div className="rounded-xl bg-black/40 border border-[#10b981]/30 p-2.5">
                <span className="text-[#10b981] text-[10px] uppercase font-sans flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-[#10b981]" />
                  Requêtes économisées
                </span>
                <div className="font-bold text-[#10b981] text-base mt-1">
                  +{statusInfo?.quotaInfo?.savedRequests ?? 0}
                  <span className="text-neutral-400 text-xs font-normal ml-1">évitées</span>
                </div>
              </div>
            </div>

            {statusInfo?.quotaInfo?.lastSkippedReason && (
              <div className="text-[11px] text-neutral-300 bg-neutral-900/60 border border-neutral-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] shrink-0" />
                <span className="truncate">
                  Dernière économie : {statusInfo.quotaInfo.lastSkippedReason}
                </span>
              </div>
            )}
          </div>

          {/* 4. Base JSON Content Template */}
          <div className="rounded-2xl border border-neutral-800 bg-[#0c1019] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Contenu JSON De Base</span>
              <button
                onClick={handleCopyTemplate}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-neutral-900 border border-neutral-700 text-xs font-bold text-neutral-200 hover:text-white hover:border-[#facc15]/50 transition-all"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-[#10b981]" /> : <Copy className="h-3.5 w-3.5 text-[#facc15]" />}
                <span>{copied ? 'Copié !' : 'Copier le JSON'}</span>
              </button>
            </div>
            <p className="text-[11px] text-neutral-400">
              Copiez ce contenu dans votre nouveau Bin sur jsonbin.io. Il contient le point de départ exact (Bullet 1500, Blitz 1458, Rapide 1289, Objectif 2000).
            </p>

            <pre className="max-h-36 overflow-y-auto p-3 rounded-xl bg-black/60 border border-neutral-800 font-mono text-[10px] text-neutral-300 leading-relaxed scrollbar-thin">
              {JSON.stringify(statusInfo?.template || { username, targetElo: 2000, startElo: 1500 }, null, 2)}
            </pre>
          </div>

          {/* 5. Protected Credentials Notice */}
          <div className="rounded-2xl border border-neutral-800 bg-[#0c1019] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-[#facc15]" />
                <span>Configuration des Clés JSONBin</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="h-3 w-3" />
                <span>Protégé par 2FA</span>
              </span>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed">
              Pour des raisons strictes de sécurité, la modification des identifiants (Bin ID et Clé API Master) est <strong>réservée à l'Espace Paramètres protégé par 2FA</strong>. En revanche, la synchronisation (1 relevé quotidien) s'exécute librement sans aucun blocage.
            </p>

            <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] font-mono text-neutral-400 truncate">
                {statusInfo?.binId ? `Bin actuel : ${statusInfo.binId}` : 'Aucun bin configuré'}
              </span>

              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black font-extrabold text-xs transition-all shadow-md active:scale-95"
                >
                  <Key className="h-3.5 w-3.5" />
                  <span>Ouvrir les Paramètres Cloud (2FA)</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-800/80 px-6 py-3 bg-[#0d111a] flex items-center justify-between text-xs text-neutral-400">
          <span className="font-mono text-[10px]">Road To 2000 Elo · Cloud Sync</span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-neutral-700 bg-neutral-900 text-white font-bold hover:bg-neutral-800 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
