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
  getStoredSettings,
  importSyncHistory,
} from '../utils/storage';
import { SecurePurgeModal } from './SecurePurgeModal';

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
  const [secureModalOpen, setSecureModalOpen] = useState(false);
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
    setSecureModalOpen(true);
  };

  const handleTriggerClear = () => {
    if (isIframe) return;
    setSecureModalOpen(true);
  };

  const handleExecuteSecureConfirm = () => {
    if (onPurgeAccountData) {
      onPurgeAccountData();
    } else {
      clearSyncHistory(username);
      onHistoryUpdate([]);
    }
    onShowMessage(`Historique vidé et purgé avec succès après sauvegarde et double validation A2F.`, 'success');
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
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <History className="h-5 w-5 text-[#facc15]" />
            <span>Historique Des Synchronisations</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Relevés officiels horodatés pour <strong className="text-[#facc15]">@{username}</strong>
            {isIframe && ' (Mode consultation en lecture seule)'}.
          </p>
        </div>

        {/* Action buttons (Noir/Blanc, Vert, Rouge, Jaune) */}
        <div className="flex flex-wrap items-center gap-2">
          {!isIframe && onPurgeAccountData && (
            <button
              onClick={handleTriggerPurge}
              title={isAdmin ? "Purger le cache et forcer un relevé neuf" : "Action protégée par 2FA"}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-neutral-800 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Purger l'ancien compte</span>
              {!isAdmin && <Lock className="h-2.5 w-2.5 text-[#facc15]" />}
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-[#10b981]/40 bg-[#10b981]/15 px-3 py-1.5 text-xs font-bold text-[#10b981] hover:bg-[#10b981]/25 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 rounded-xl border border-[#facc15]/40 bg-[#facc15]/10 px-3 py-1.5 text-xs font-bold text-[#facc15] hover:bg-[#facc15]/20 transition-colors"
          >
            <FileJson className="h-3.5 w-3.5" />
            <span>Export JSON</span>
          </button>

          {!isIframe && (
            <button
              onClick={handleTriggerImport}
              title={isAdmin ? "Importer un fichier d'historique" : "Import protégé par 2FA"}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-neutral-800 transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Importer</span>
              {!isAdmin && <Lock className="h-2.5 w-2.5 text-[#facc15]" />}
            </button>
          )}

          {!isIframe && history.length > 0 && (
            <button
              onClick={handleTriggerClear}
              title={isAdmin ? "Vider l'historique" : "Action protégée par 2FA"}
              className="flex items-center gap-1.5 rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/15 px-3 py-1.5 text-xs font-bold text-[#ef4444] hover:bg-[#ef4444]/25 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Vider</span>
              {!isAdmin && <Lock className="h-2.5 w-2.5 text-[#ef4444]" />}
            </button>
          )}
        </div>
      </div>

      {/* Secure Purge / Clear Modal with Mandatory Backup & Double 2FA */}
      <SecurePurgeModal
        isOpen={secureModalOpen}
        onClose={() => setSecureModalOpen(false)}
        onConfirm={handleExecuteSecureConfirm}
        actionType="purge"
        username={username}
        settings={getStoredSettings()}
        syncHistory={history}
      />

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
                          <span className={record.bestMode === 'bullet' ? 'text-[#facc15] font-bold' : 'text-neutral-300'}>
                            {record.bullet}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right tabular-nums">
                        {record.blitz ? (
                          <span className={record.bestMode === 'blitz' ? 'text-[#facc15] font-bold' : 'text-neutral-300'}>
                            {record.blitz}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right tabular-nums">
                        {record.rapid ? (
                          <span className={record.bestMode === 'rapid' ? 'text-[#facc15] font-bold' : 'text-neutral-300'}>
                            {record.rapid}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#facc15]/10 px-2.5 py-0.5 text-xs font-bold text-[#facc15] border border-[#facc15]/30">
                          <span>{record.bestRating}</span>
                          <span className="text-[10px] uppercase font-sans text-neutral-400">({record.bestMode})</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 font-sans text-[11px] text-neutral-400 whitespace-nowrap">
                        <div>{record.source}</div>
                        {record.username && (
                          <div className="text-[10px] text-neutral-300 font-mono">@{record.username}</div>
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
