/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Download,
  FileJson,
  FileSpreadsheet,
  History,
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
}

export const SyncLog: React.FC<SyncLogProps> = ({
  history,
  onHistoryUpdate,
  onShowMessage,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = () => {
    const jsonStr = exportSyncHistoryJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `road2000_chess_history_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowMessage('Historique JSON exporté avec succès !', 'success');
  };

  const handleExportCSV = () => {
    const csvStr = exportSyncHistoryCSV();
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `road2000_chess_history_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onShowMessage('Historique CSV exporté avec succès !', 'success');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const res = importSyncHistory(content, isJson ? 'json' : 'csv');
      if (res.success) {
        onHistoryUpdate(res.history);
        onShowMessage(`${res.importedCount} relevés importés avec succès sans doublons !`, 'success');
      } else {
        onShowMessage(`Erreur d'importation : ${res.errors.join(' ')}`, 'warning');
      }
    };

    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearHistory = () => {
    clearSyncHistory();
    onHistoryUpdate([]);
    setShowClearConfirm(false);
    onShowMessage('Historique des synchronisations vidé.', 'info');
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".json,.csv"
        className="hidden"
      />

      {/* Header and Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-100 dark:text-neutral-100 light:text-neutral-900 flex items-center gap-2">
            <History className="h-5 w-5 text-amber-400" />
            <span>Historique Des Synchronisations</span>
          </h2>
          <p className="text-xs text-neutral-400">
            Relevés officiels horodatés conservés localement avec support d'export et d'import sécurisé.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
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

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <Upload className="h-3.5 w-3.5 text-cyan-400" />
            <span>Importer</span>
          </button>

          {history.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 rounded-lg border border-rose-900/40 bg-rose-950/20 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/30 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Vider</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Clearing History */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-base font-bold text-white">Confirmer la suppression</h3>
            </div>
            <p className="mt-3 text-xs text-neutral-300">
              Êtes-vous certain de vouloir vider l'historique complet ({history.length} entrées) ? Cette action est irréversible. Nous vous conseillons d'effectuer un export au préalable.
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
      <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/90 shadow-xl backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/90 light:border-neutral-200 light:bg-white">
        {history.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-400">
            <Clock className="mx-auto h-8 w-8 text-neutral-600 mb-2" />
            <p className="font-semibold text-neutral-300">Aucune synchronisation enregistrée pour le moment.</p>
            <p className="mt-1">
              Cliquez sur le bouton "Synchroniser" en haut à droite pour relever vos statistiques Chess.com.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-950/80 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  <th className="py-3.5 px-4">Date & Heure (Paris)</th>
                  <th className="py-3.5 px-4 text-right">Bullet</th>
                  <th className="py-3.5 px-4 text-right">Blitz</th>
                  <th className="py-3.5 px-4 text-right">Rapide</th>
                  <th className="py-3.5 px-4 text-center">Meilleur Relevé</th>
                  <th className="py-3.5 px-4">Source</th>
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
                        {record.source}
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
