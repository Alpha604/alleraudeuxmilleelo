/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  Clock,
  FileJson,
  FileSpreadsheet,
  Filter,
  History,
  Lock,
  Pencil,
  PlusCircle,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { GameMode, SyncRecord } from '../types/chess';
import {
  clearSyncHistory,
  exportSyncHistoryCSV,
  exportSyncHistoryJSON,
  getStoredSettings,
  importSyncHistory,
  saveStoredSyncHistory,
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
  startDateStr?: string;
}

interface DayEntry {
  dateKey: string;
  dateObj: Date;
  dateFormatted: string;
  isToday: boolean;
  isPast: boolean;
  status: 'synced' | 'missing';
  record?: SyncRecord;
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
  startDateStr = '2026-11-02',
}) => {
  const [secureModalOpen, setSecureModalOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'missing' | 'synced'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual Add / Edit Modal state (Admin only)
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [manualDateKey, setManualDateKey] = useState<string>('');
  const [manualBullet, setManualBullet] = useState<string>('1533');
  const [manualBlitz, setManualBlitz] = useState<string>('1504');
  const [manualRapid, setManualRapid] = useState<string>('1289');

  // Compute map of sync records by date key YYYY-MM-DD
  const recordsByDateKey = useMemo(() => {
    const map = new Map<string, SyncRecord>();
    history.forEach((record) => {
      const d = new Date(record.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const existing = map.get(key);
      if (!existing || record.bestRating > existing.bestRating) {
        map.set(key, record);
      }
    });
    return map;
  }, [history]);

  // Today key
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, [today]);

  // Determine starting date: earliest between startDateStr and earliest history record
  const effectiveStartDate = useMemo(() => {
    let start = new Date(startDateStr);
    if (isNaN(start.getTime())) {
      start = new Date('2026-11-02');
    }
    history.forEach((r) => {
      const rd = new Date(r.timestamp);
      if (!isNaN(rd.getTime()) && rd < start) {
        start = rd;
      }
    });
    return new Date(start.getFullYear(), start.getMonth(), start.getDate());
  }, [startDateStr, history]);

  // Generate continuous array of all calendar days from start up to today
  const allDays = useMemo(() => {
    const days: DayEntry[] = [];
    const current = new Date(effectiveStartDate);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    while (current <= end) {
      const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      const record = recordsByDateKey.get(key);
      const isToday = key === todayKey;
      const isPast = key < todayKey;
      const status: 'synced' | 'missing' = record ? 'synced' : 'missing';

      days.push({
        dateKey: key,
        dateObj: new Date(current),
        dateFormatted: current.toLocaleDateString('fr-FR', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'Europe/Paris',
        }),
        isToday,
        isPast,
        status,
        record,
      });

      // Next day
      current.setDate(current.getDate() + 1);
    }

    return days;
  }, [effectiveStartDate, today, todayKey, recordsByDateKey]);

  // Filter and sort days
  const filteredDays = useMemo(() => {
    let list = [...allDays];

    if (filterMode === 'missing') {
      list = list.filter((d) => d.status === 'missing');
    } else if (filterMode === 'synced') {
      list = list.filter((d) => d.status === 'synced');
    }

    if (sortOrder === 'desc') {
      list.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    } else {
      list.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    }

    return list;
  }, [allDays, filterMode, sortOrder]);

  // Summary counts
  const totalDaysCount = allDays.length;
  const syncedDaysCount = allDays.filter((d) => d.status === 'synced').length;
  const missingDaysCount = allDays.filter((d) => d.status === 'missing').length;

  // Trigger manual completion of a missing date with pre-fill from the sync right above (Admin only)
  const handleOpenAddModal = (dateKey: string, index: number) => {
    if (isIframe) return;
    if (!isAdmin) {
      if (onOpenSecurityModal) {
        onOpenSecurityModal('Ajouter une synchronisation manquée (2FA requis)');
      }
      return;
    }

    setIsEditMode(false);
    setManualDateKey(dateKey);

    // Look for the sync record directly above in the displayed list
    let referenceRecord: SyncRecord | null = null;
    for (let i = index - 1; i >= 0; i--) {
      if (filteredDays[i].record) {
        referenceRecord = filteredDays[i].record!;
        break;
      }
    }
    // If none found above (e.g. top of list), look at the closest one below
    if (!referenceRecord) {
      for (let i = index + 1; i < filteredDays.length; i++) {
        if (filteredDays[i].record) {
          referenceRecord = filteredDays[i].record!;
          break;
        }
      }
    }
    // Fallback to latest history record if any
    if (!referenceRecord && history.length > 0) {
      referenceRecord = history[0];
    }

    if (referenceRecord) {
      setManualBullet(String(referenceRecord.bullet ?? 1533));
      setManualBlitz(String(referenceRecord.blitz ?? 1504));
      setManualRapid(String(referenceRecord.rapid ?? 1289));
    } else {
      setManualBullet('1533');
      setManualBlitz('1504');
      setManualRapid('1289');
    }
    setManualModalOpen(true);
  };

  // Trigger modification of an existing sync (Admin only)
  const handleOpenEditModal = (day: DayEntry) => {
    if (isIframe) return;
    if (!isAdmin) {
      if (onOpenSecurityModal) {
        onOpenSecurityModal('Modifier une synchronisation existante (2FA requis)');
      }
      return;
    }

    setIsEditMode(true);
    setManualDateKey(day.dateKey);
    setManualBullet(String(day.record?.bullet ?? ''));
    setManualBlitz(String(day.record?.blitz ?? ''));
    setManualRapid(String(day.record?.rapid ?? ''));
    setManualModalOpen(true);
  };

  // Save manual record (Create or Update)
  const handleSaveManualRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDateKey) return;

    const bullet = parseInt(manualBullet, 10) || 0;
    const blitz = parseInt(manualBlitz, 10) || 0;
    const rapid = parseInt(manualRapid, 10) || 0;

    let bestRating = Math.max(bullet, blitz, rapid);
    let bestMode: GameMode = 'bullet';
    if (bestRating === blitz) bestMode = 'blitz';
    else if (bestRating === rapid) bestMode = 'rapid';

    // Preserve existing record's original timestamp or use noon on that date
    const existingRecord = recordsByDateKey.get(manualDateKey);
    const timestamp = existingRecord?.timestamp || `${manualDateKey}T12:00:00.000Z`;

    const newRecord: SyncRecord = {
      id: existingRecord?.id || `sync_manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp,
      username,
      bullet,
      blitz,
      rapid,
      bestRating,
      bestMode,
      source: existingRecord?.source || 'Saisie manuelle',
    };

    // Remove any previous record for this date and prepend new/updated one
    const updated = [newRecord, ...history.filter((r) => {
      const rd = new Date(r.timestamp);
      const k = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}`;
      return k !== manualDateKey;
    })].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    saveStoredSyncHistory(updated, username);
    onHistoryUpdate(updated);
    setManualModalOpen(false);
    onShowMessage(
      isEditMode
        ? `Synchronisation du ${manualDateKey} modifiée avec succès !`
        : `Synchronisation du ${manualDateKey} enregistrée avec succès !`,
      'success'
    );
  };

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
            <span>Journal Des Synchronisations Quotidiennes</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Suivi exhaustif (1 sync / jour). Les journées manquantes apparaissent en <span className="text-[#ef4444] font-bold">rouge</span> et peuvent être complétées par l'administrateur.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {!isIframe && onPurgeAccountData && (
            <button
              onClick={handleTriggerPurge}
              title={isAdmin ? "Purger le cache et forcer un relevé neuf" : "Action protégée par 2FA"}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-white hover:bg-neutral-800 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Purger</span>
              {!isAdmin && <Lock className="h-2.5 w-2.5 text-[#facc15]" />}
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-[#10b981]/40 bg-[#10b981]/15 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-[#10b981] hover:bg-[#10b981]/25 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>CSV</span>
          </button>

          <button
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 rounded-xl border border-[#facc15]/40 bg-[#facc15]/10 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-[#facc15] hover:bg-[#facc15]/20 transition-colors"
          >
            <FileJson className="h-3.5 w-3.5" />
            <span>JSON</span>
          </button>

          {!isIframe && (
            <button
              onClick={handleTriggerImport}
              title={isAdmin ? "Importer un fichier d'historique" : "Import protégé par 2FA"}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-white hover:bg-neutral-800 transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import</span>
              {!isAdmin && <Lock className="h-2.5 w-2.5 text-[#facc15]" />}
            </button>
          )}

          {!isIframe && history.length > 0 && (
            <button
              onClick={handleTriggerClear}
              title={isAdmin ? "Vider l'historique" : "Action protégée par 2FA"}
              className="flex items-center gap-1.5 rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/15 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-[#ef4444] hover:bg-[#ef4444]/25 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Vider</span>
              {!isAdmin && <Lock className="h-2.5 w-2.5 text-[#ef4444]" />}
            </button>
          )}
        </div>
      </div>

      {/* KPI & Filter / Sort Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-center rounded-2xl border border-neutral-800 bg-[#0c0f14] p-3 sm:p-4">
        {/* KPI stats */}
        <div className="md:col-span-6 flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs">
            <Calendar className="h-4 w-4 text-neutral-400" />
            <span className="text-neutral-400">Total :</span>
            <span className="font-mono font-bold text-white">{totalDaysCount} jours</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#10b981]/10 border border-[#10b981]/30 text-xs">
            <span className="h-2 w-2 rounded-full bg-[#10b981]" />
            <span className="text-[#10b981] font-bold">{syncedDaysCount} faits</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-xs">
            <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
            <span className="text-[#ef4444] font-bold">{missingDaysCount} manqués</span>
          </div>
        </div>

        {/* Filter buttons & sort dropdown */}
        <div className="md:col-span-6 flex flex-wrap items-center justify-start md:justify-end gap-2">
          {/* Filter segment */}
          <div className="flex items-center p-1 rounded-xl bg-neutral-900 border border-neutral-800 text-xs">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                filterMode === 'all'
                  ? 'bg-[#facc15] text-black shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Tous ({totalDaysCount})
            </button>
            <button
              onClick={() => setFilterMode('missing')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                filterMode === 'missing'
                  ? 'bg-[#ef4444] text-white shadow-sm'
                  : 'text-neutral-400 hover:text-[#ef4444]'
              }`}
            >
              Manqués ({missingDaysCount})
            </button>
            <button
              onClick={() => setFilterMode('synced')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                filterMode === 'synced'
                  ? 'bg-[#10b981] text-black shadow-sm'
                  : 'text-neutral-400 hover:text-[#10b981]'
              }`}
            >
              Faits ({syncedDaysCount})
            </button>
          </div>

          {/* Sort toggle */}
          <button
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-neutral-800 bg-neutral-900 text-xs font-bold text-neutral-300 hover:text-white transition-all"
            title="Inverser l'ordre chronologique"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-[#facc15]" />
            <span>{sortOrder === 'desc' ? 'Plus récents' : 'Plus anciens'}</span>
          </button>
        </div>
      </div>

      {/* Main Table: Shows EVERY Day with Green (Done) and Red (Missing) Rows */}
      <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c1019]/90 shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] bg-neutral-950/80 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                <th className="py-3.5 px-4">Date (Paris)</th>
                <th className="py-3.5 px-4 text-center">Statut</th>
                <th className="py-3.5 px-4 text-right">Bullet</th>
                <th className="py-3.5 px-4 text-right">Blitz</th>
                <th className="py-3.5 px-4 text-right">Rapide</th>
                <th className="py-3.5 px-4 text-center">Meilleur Relevé</th>
                <th className="py-3.5 px-4 text-right">Action / Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono">
              {filteredDays.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-neutral-400">
                    Aucun relevé ne correspond au filtre sélectionné.
                  </td>
                </tr>
              ) : (
                filteredDays.map((day, index) => {
                  const isMissing = day.status === 'missing';
                  const rec = day.record;

                  return (
                    <tr
                      key={day.dateKey}
                      className={`transition-colors ${
                        isMissing
                          ? 'bg-[#ef4444]/[0.06] hover:bg-[#ef4444]/[0.10] border-l-4 border-l-[#ef4444]'
                          : 'hover:bg-neutral-800/40 border-l-4 border-l-[#10b981]'
                      }`}
                    >
                      {/* Date */}
                      <td className="py-3 px-4 font-sans text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold ${isMissing ? 'text-[#ef4444]' : 'text-white'}`}>
                            {day.dateFormatted}
                          </span>
                          {day.isToday && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#facc15]/20 text-[#facc15] font-bold font-mono">
                              Aujourd'hui
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono">{day.dateKey}</div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isMissing ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#ef4444]/20 border border-[#ef4444]/40 text-[#ef4444] text-[10px] font-bold uppercase tracking-wider">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444] shrink-0" />
                            Manqué
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#10b981]/20 border border-[#10b981]/40 text-[#10b981] text-[10px] font-bold uppercase tracking-wider">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] shrink-0" />
                            Synchronisé
                          </span>
                        )}
                      </td>

                      {/* Bullet */}
                      <td className="py-3 px-4 text-right tabular-nums">
                        {rec?.bullet ? (
                          <span className={rec.bestMode === 'bullet' ? 'text-[#facc15] font-bold' : 'text-neutral-300'}>
                            {rec.bullet}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>

                      {/* Blitz */}
                      <td className="py-3 px-4 text-right tabular-nums">
                        {rec?.blitz ? (
                          <span className={rec.bestMode === 'blitz' ? 'text-[#facc15] font-bold' : 'text-neutral-300'}>
                            {rec.blitz}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>

                      {/* Rapid */}
                      <td className="py-3 px-4 text-right tabular-nums">
                        {rec?.rapid ? (
                          <span className={rec.bestMode === 'rapid' ? 'text-[#facc15] font-bold' : 'text-neutral-300'}>
                            {rec.rapid}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>

                      {/* Best Rating */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {rec ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#facc15]/10 px-2.5 py-0.5 text-xs font-bold text-[#facc15] border border-[#facc15]/30">
                            <span>{rec.bestRating}</span>
                            <span className="text-[10px] uppercase font-sans text-neutral-400">({rec.bestMode})</span>
                          </span>
                        ) : (
                          <span className="text-[#ef4444] text-[10px] font-semibold font-sans">Non enregistré</span>
                        )}
                      </td>

                      {/* Action / Source with Modifier button */}
                      <td className="py-3 px-4 text-right whitespace-nowrap font-sans">
                        {isMissing ? (
                          <button
                            type="button"
                            onClick={() => handleOpenAddModal(day.dateKey, index)}
                            title={isAdmin ? "Compléter et enregistrer cette synchronisation" : "Action réservée à l'administrateur (2FA requis)"}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#ef4444]/15 border border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/25 text-xs font-bold transition-all shadow-sm active:scale-95"
                          >
                            <PlusCircle className="h-3.5 w-3.5" />
                            <span>Compléter</span>
                            {!isAdmin && <Lock className="h-2.5 w-2.5" />}
                          </button>
                        ) : (
                          <div className="flex items-center justify-end gap-2.5">
                            <div className="text-[11px] text-neutral-400 text-right">
                              <span>{rec?.source || 'API Chess.com'}</span>
                              {rec?.username && (
                                <div className="text-[9px] text-neutral-500 font-mono">@{rec.username}</div>
                              )}
                            </div>
                            {!isIframe && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(day)}
                                title={isAdmin ? "Modifier les scores de cette synchronisation" : "Action réservée à l'administrateur (2FA requis)"}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-neutral-900 border border-neutral-700/80 hover:border-[#facc15] hover:text-[#facc15] text-neutral-300 text-xs font-bold transition-all shadow-sm active:scale-95"
                              >
                                <Pencil className="h-3 w-3 text-[#facc15]" />
                                <span>Modifier</span>
                                {!isAdmin && <Lock className="h-2.5 w-2.5 text-neutral-500" />}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Sync Modal (Add or Edit) */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-3xl border border-neutral-800 bg-[#0c0f14] p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                {isEditMode ? (
                  <Pencil className="h-5 w-5 text-[#facc15]" />
                ) : (
                  <PlusCircle className="h-5 w-5 text-[#facc15]" />
                )}
                <h3 className="text-base font-bold text-white">
                  {isEditMode ? 'Modifier la synchronisation' : 'Compléter la synchronisation'}
                </h3>
              </div>
              <button
                onClick={() => setManualModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Date ciblée : <strong className="text-[#facc15] font-mono">{manualDateKey}</strong>.{' '}
              {isEditMode
                ? 'Mettez à jour les classements Elo enregistrés pour cette journée.'
                : 'Pré-rempli automatiquement avec les scores de la synchronisation juste au-dessus pour aller plus vite.'}
            </p>

            <form onSubmit={handleSaveManualRecord} className="space-y-4">
              <div className="space-y-3 font-mono">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 font-sans mb-1">
                    Cadence Bullet (Elo)
                  </label>
                  <input
                    type="number"
                    min="100"
                    max="3500"
                    required
                    value={manualBullet}
                    onChange={(e) => setManualBullet(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-[#facc15] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 font-sans mb-1">
                    Cadence Blitz (Elo)
                  </label>
                  <input
                    type="number"
                    min="100"
                    max="3500"
                    required
                    value={manualBlitz}
                    onChange={(e) => setManualBlitz(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-[#facc15] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 font-sans mb-1">
                    Cadence Rapide (Elo)
                  </label>
                  <input
                    type="number"
                    min="100"
                    max="3500"
                    required
                    value={manualRapid}
                    onChange={(e) => setManualRapid(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-[#facc15] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-800 text-xs font-bold text-neutral-300 hover:text-white hover:bg-neutral-900 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#facc15] text-black text-xs font-extrabold hover:bg-[#eab308] transition-all shadow-md active:scale-95"
                >
                  {isEditMode ? 'Enregistrer les modifications' : 'Enregistrer ce jour'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
    </div>
  );
};
