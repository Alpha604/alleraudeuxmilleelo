/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  FileJson,
  FileSpreadsheet,
  History,
  Lock,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { SyncRecord } from '../types/chess';
import {
  clearSyncHistory,
  exportSyncHistoryCSV,
  exportSyncHistoryJSON,
  importSyncHistory,
} from '../utils/storage';

interface SyncLogProps {
  history: SyncRecord[];
  onHistoryUpdate: (updated: SyncRecord[]) => void;
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning') => void;
  username: string;
  onPurgeAccountData?: () => void;
  isAdmin?: boolean;
  isIframe?: boolean;
  onOpenSecurityModal?: (title?: string) => void;
}

export const SyncLog: React.FC<SyncLogProps> = ({
  history,
  onHistoryUpdate,
  onShowMessage,
  username,
  onPurgeAccountData,
  isAdmin = false,
  isIframe = false,
  onOpenSecurityModal,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = () => {
    const jsonStr = exportSyncHistoryJSON(username);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `road2000_chess_history_${username}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowMessage('Historique JSON exporté avec succès !', 'success');
  };

  const handleExportCSV = () => {
    const csvStr = exportSyncHistoryCSV(username);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `road2000_chess_history_${username}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onShowMessage('Historique CSV exporté avec succès !', 'success');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isIframe) return;
    if (!isAdmin) {
      if (onOpenSecurityModal) onOpenSecurityModal("Import de données d'historique");
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const isJson = file.name.endsWith('.json');
    const isCsv = file.name.endsWith('.csv');

    if (!isJson && !isCsv) {
      onShowMessage('Format de fichier non supporté. Veuillez importer un .json ou .csv', 'warning');
      return;
    }

    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = importSyncHistory(content, isJson ? 'json' : 'csv', username);
      if (res.success) {
        onHistoryUpdate(res.history);
        onShowMessage(`${res.importedCount} relevés importés avec succès sans doublons pour @${username} !`, 'success');
      } else {
        onShowMessage(`Erreur d'importation : ${res.errors.join(' ')}`, 'warning');
      }
    };

    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTriggerImport = () => {
    if (isIframe) return;
    if (!isAdmin) {
      if (onOpenSecurityModal) onOpenSecurityModal("Import de relevés d'historique");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleTriggerPurge = () => {
    if (isIframe) return;
    if (!isAdmin) {
      if (onOpenSecurityModal) onOpenSecurityModal("Purge des données d'historique");
      return;
    }
    if (onPurgeAccountData) {
      onPurgeAccountData();
    }
  };

  const handleTriggerClear = () => {
    if (isIframe) return;
    if (!isAdmin) {
      if (onOpenSecurityModal) onOpenSecurityModal("Suppression de l'historique complet");
      return;
    }
    setShowClearConfirm(true);
  };

  const handleClearHistory = () => {
    if (isIframe || !isAdmin) return;
    clearSyncHistory(username);
    onHistoryUpdate([]);
    setShowClearConfirm(false);
    onShowMessage(`Historique des synchronisations vidé pour @${username}.`, 'info');
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      {!isIframe && (
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".json,.csv"
          className="hidden"
        />
      )}

      {/* Header and Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-100 dark:text-neutral-100 light:text-neutral-900 flex items-center gap-2">
            <History className="h-5 w-5 text-amber-400" />
            <span>Historique Des Synchronisations</span>
          </h2>
          <p className="text-xs text-neutral-400">
            Relevés officiels horodatés pour <strong className="text-amber-300">@{username}</strong>
            {isIframe && ' (Mode consultation en lecture seule)'}.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Purge Button (Hidden in iframe, locked when not admin) */}
          {!isIframe && onPurgeAccountData && (
            <button
              onClick={handleTriggerPurge}
              title={isAdmin ? "Purger le cache et forcer un relevé neuf" : "Action protégée par 2FA"}
              className="flex items-center gap-1.5 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-900/30 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Purger l'ancien compte</span>
              {!isAdmin && <Lock className="h-2.5 w-2.5 text-amber-400" />}
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <FileJson className="h-3.5 w-3.5 text-amber-400" />
            <span>Export JSON</span>
          </button>

          {/* Import Button (Hidden in iframe) */}
          {!isIframe && (
            <button
              onClick={handleTriggerImport}
              title={isAdmin ? "Importer un fichier d'historique" : "Import protégé par 2FA"}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <Upload className="h-3.5 w-3.5 text-cyan-400" />
              <span>Importer</span>
              {!isAdmin && <Lock className="h-2.5 w-2.5 text-amber-400" />}
            </button>
          )}

          {/* Clear Button (Hidden in iframe) */}
          {!isIframe && history.length > 0 && (
            <button
              onClick={handleTriggerClear}
              title={isAdmin ? "Vider l'historique" : "Action protégée par 2FA"}
              className="flex items-center gap-1.5 rounded-lg border border-rose-900/40 bg-rose-950/20 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/30 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Vider</span>
              {!isAdmin && <Lock className="h-2.5 w-2.5 text-rose-400" />}
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Clearing History */}
      {!isIframe && showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-base font-bold text-white">Confirmer la suppression</h3>
            </div>
            <p className="mt-3 text-xs text-neutral-300">
              Êtes-vous certain de vouloir vider l'historique complet ({history.length} entrées) pour @{username} ? Cette action est irréversible.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white"
              >
                Annuler
              </button>
              <button
                onClick={handleClearHistory}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c1019]/90 shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl">
        {history.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-400">
            <Clock className="mx-auto h-8 w-8 text-neutral-600 mb-2" />
            <p className="font-semibold text-white">Aucune synchronisation enregistrée pour @{username}.</p>
            <p className="mt-1">
              Les statistiques sont synchronisées périodiquement depuis l'API officielle Chess.com.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] bg-neutral-950/80 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  <th className="py-4 px-5">Date & Heure (Paris)</th>
                  <th className="py-4 px-5 text-right">Bullet</th>
                  <th className="py-4 px-5 text-right">Blitz</th>
                  <th className="py-4 px-5 text-right">Rapide</th>
                  <th className="py-4 px-5 text-center">Meilleur Relevé</th>
                  <th className="py-4 px-5">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 font-mono">
                {history.map((record) => {
                  const dateFormatted = new Date(record.timestamp).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZone: 'Europe/Paris',
                  });

                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-neutral-800/40 transition-colors text-neutral-300"
                    >
                      <td className="py-3 px-4 font-sans text-neutral-400 text-[11px] whitespace-nowrap">
                        {dateFormatted}
                      </td>

                      <td className="py-3 px-4 text-right tabular-nums">
                        {record.bullet ? (
                          <span className={record.bestMode === 'bullet' ? 'text-amber-400 font-bold' : ''}>
                            {record.bullet}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right tabular-nums">
                        {record.blitz ? (
                          <span className={record.bestMode === 'blitz' ? 'text-amber-400 font-bold' : ''}>
                            {record.blitz}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right tabular-nums">
                        {record.rapid ? (
                          <span className={record.bestMode === 'rapid' ? 'text-amber-400 font-bold' : ''}>
                            {record.rapid}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1.5 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-300 border border-amber-500/20">
                          <span>{record.bestRating}</span>
                          <span className="text-[10px] uppercase font-sans text-amber-400/80">({record.bestMode})</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 font-sans text-[11px] text-neutral-500 whitespace-nowrap">
                        <div>{record.source}</div>
                        {record.username && (
                          <div className="text-[10px] text-neutral-400 font-mono">@{record.username}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
