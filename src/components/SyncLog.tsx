/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  normalizeParisDayKey,
  saveStoredSyncHistory,
} from '../utils/storage';
import {
  computeRecordVerificationHash,
  formatJsonBinTimestamp,
  JSONBIN_TEMPORARILY_DISABLED,
  JsonBinSyncState,
} from '../utils/cloudSync';
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
  lastJsonBinSyncTime?: number | null;
  jsonBinStatus?: JsonBinSyncState;
  confirmedDayHashes?: Record<string, string>;
  onVerifyJsonBinSync?: () => Promise<void> | void;
  isVerifyingJsonBin?: boolean;
  onOpenNetworkModal?: () => void;
}

interface DayEntry {
  dateKey: string;
  dateObj: Date;
  dateFormatted: string;
  isToday: boolean;
  isPast: boolean;
  status: 'synced' | 'missing';
  syncState: 'missing' | 'verifying' | 'verified' | 'pending';
  hasPuzzles: boolean;
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
  lastJsonBinSyncTime,
  jsonBinStatus = 'synced',
  confirmedDayHashes = {},
  onVerifyJsonBinSync,
  isVerifyingJsonBin = false,
  onOpenNetworkModal,
}) => {
  const [secureModalOpen, setSecureModalOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'missing' | 'synced' | 'puzzles_pending'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const puzzlesInputRef = useRef<HTMLInputElement>(null);

  // Manual Add / Edit Modal state (Admin only)
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [manualDateKey, setManualDateKey] = useState<string>('');
  const [manualBullet, setManualBullet] = useState<string>('1533');
  const [manualBlitz, setManualBlitz] = useState<string>('1504');
  const [manualRapid, setManualRapid] = useState<string>('1289');
  const [manualPuzzles, setManualPuzzles] = useState<string>('');

  useEffect(() => {
    if (!manualModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setManualModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [manualModalOpen]);

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
      const hasPuzzles = Boolean(record && typeof record.puzzles === 'number' && record.puzzles > 0);

      let syncState: 'missing' | 'verifying' | 'verified' | 'pending' = 'missing';
      if (record) {
        if (jsonBinStatus === 'syncing' || isVerifyingJsonBin) {
          syncState = 'verifying';
        } else {
          const parisKey = normalizeParisDayKey(record.timestamp) || key;
          const expectedHash = computeRecordVerificationHash(record, username);
          if (jsonBinStatus === 'synced' && confirmedDayHashes?.[parisKey] === expectedHash) {
            syncState = 'verified';
          } else {
            syncState = 'pending';
          }
        }
      }

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
        syncState,
        hasPuzzles,
        record,
      });

      // Next day
      current.setDate(current.getDate() + 1);
    }

    return days;
  }, [effectiveStartDate, today, todayKey, recordsByDateKey, jsonBinStatus, isVerifyingJsonBin, confirmedDayHashes, username]);

  // Filter and sort days
  const filteredDays = useMemo(() => {
    let list = [...allDays];

    if (filterMode === 'missing') {
      list = list.filter((d) => d.status === 'missing');
    } else if (filterMode === 'synced') {
      list = list.filter((d) => d.status === 'synced');
    } else if (filterMode === 'puzzles_pending') {
      list = list.filter(
        (d) =>
          d.record &&
          (!d.hasPuzzles || (!d.isToday && d.record.puzzlesConfirmed !== true))
      );
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
  const verifiedCloudCount = allDays.filter((d) => d.syncState === 'verified').length;
  const pendingCloudCount = allDays.filter((d) => d.syncState === 'pending').length;
  const missingDaysCount = allDays.filter((d) => d.status === 'missing').length;
  const puzzlesPendingCount = allDays.filter(
    (d) =>
      d.record &&
      (!d.hasPuzzles || (!d.isToday && d.record.puzzlesConfirmed !== true))
  ).length;

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
      setManualPuzzles(referenceRecord.puzzles ? String(referenceRecord.puzzles) : '');
    } else {
      setManualBullet('1533');
      setManualBlitz('1504');
      setManualRapid('1289');
      setManualPuzzles('');
    }
    setManualModalOpen(true);
  };

  // Trigger modification of an existing sync (Admin only)
  const handleOpenEditModal = (day: DayEntry, focusPuzzles = false) => {
    if (isIframe) return;
    if (!isAdmin) {
      if (onOpenSecurityModal) {
        onOpenSecurityModal(
          focusPuzzles
            ? 'Saisir le score Problèmes du lendemain (2FA requis)'
            : 'Modifier une synchronisation existante (2FA requis)'
        );
      }
      return;
    }

    setIsEditMode(true);
    setManualDateKey(day.dateKey);
    setManualBullet(String(day.record?.bullet ?? ''));
    setManualBlitz(String(day.record?.blitz ?? ''));
    setManualRapid(String(day.record?.rapid ?? ''));
    setManualPuzzles(day.record?.puzzles ? String(day.record.puzzles) : '');
    setManualModalOpen(true);
    if (focusPuzzles) {
      setTimeout(() => {
        puzzlesInputRef.current?.focus();
      }, 120);
    }
  };

  // Save manual record (Create or Update)
  const handleSaveManualRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDateKey) return;

    const bullet = parseInt(manualBullet, 10) || 0;
    const blitz = parseInt(manualBlitz, 10) || 0;
    const rapid = parseInt(manualRapid, 10) || 0;
    const parsedPuzzles = parseInt(manualPuzzles, 10);
    const puzzles = !isNaN(parsedPuzzles) && parsedPuzzles > 0 ? parsedPuzzles : null;

    // Best rating strictly among official cadences (Bullet, Blitz, Rapid) — NEVER Problèmes
    let bestRating = Math.max(bullet, blitz, rapid);
    let bestMode: GameMode = 'bullet';
    if (bestRating === blitz) bestMode = 'blitz';
    else if (bestRating === rapid) bestMode = 'rapid';

    // Preserve existing record's original timestamp or use noon on that date
    const existingRecord = recordsByDateKey.get(manualDateKey);
    const timestamp = existingRecord?.timestamp || `${manualDateKey}T12:00:00.000Z`;
    const isTodayEntry = manualDateKey === todayKey;

    const newRecord: SyncRecord = {
      id: existingRecord?.id || `sync_manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp,
      username,
      bullet,
      blitz,
      rapid,
      puzzles,
      puzzlesConfirmed: puzzles ? !isTodayEntry : false,
      puzzlesUpdatedAt: puzzles ? new Date().toISOString() : null,
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

  // Next-day 1-click confirmation for Puzzle Elo entered the day before
  const handleConfirmPuzzles = (day: DayEntry) => {
    if (isIframe || !day.record) return;
    if (!isAdmin) {
      if (onOpenSecurityModal) {
        onOpenSecurityModal('Confirmer le ELO Problèmes du lendemain (2FA requis)');
      }
      return;
    }

    const updatedRecord: SyncRecord = {
      ...day.record,
      puzzlesConfirmed: true,
      puzzlesUpdatedAt: new Date().toISOString(),
    };

    const updated = [
      updatedRecord,
      ...history.filter((r) => {
        const rd = new Date(r.timestamp);
        const k = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}`;
        return k !== day.dateKey;
      }),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    saveStoredSyncHistory(updated, username);
    onHistoryUpdate(updated);
    onShowMessage(`Score Problèmes du ${day.dateKey} confirmé (${updatedRecord.puzzles} Elo).`, 'success');
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
          {isAdmin && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {JSONBIN_TEMPORARILY_DISABLED || jsonBinStatus === 'disabled' ? (
                <button
                  type="button"
                  onClick={onOpenNetworkModal}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-sky-500/35 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 text-[11px] font-mono transition-colors"
                >
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>JSONBin en pause (Test Firebase en direct actif)</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onOpenNetworkModal}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-mono transition-colors ${
                      jsonBinStatus === 'error'
                        ? 'border-[#ef4444]/40 bg-[#ef4444]/10 text-[#ef4444]'
                        : jsonBinStatus === 'syncing' || isVerifyingJsonBin
                        ? 'border-[#facc15]/40 bg-[#facc15]/10 text-[#facc15]'
                        : pendingCloudCount > 0
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                        : 'border-[#10b981]/30 bg-[#10b981]/10 text-[#10b981] hover:bg-[#10b981]/20'
                    }`}
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>
                      {jsonBinStatus === 'syncing' || isVerifyingJsonBin
                        ? 'Vérification JSONBin en cours...'
                        : jsonBinStatus === 'error'
                        ? 'Erreur JSONBin (cliquez pour vérifier)'
                        : pendingCloudCount > 0
                        ? `${pendingCloudCount} relevé(s) en attente de confirmation · MàJ : ${formatJsonBinTimestamp(lastJsonBinSyncTime)}`
                        : `Confirmé JSONBin (${verifiedCloudCount}/${syncedDaysCount}) · ${formatJsonBinTimestamp(lastJsonBinSyncTime)}`}
                    </span>
                  </button>

                  {onVerifyJsonBinSync && !isIframe && (
                    <button
                      type="button"
                      onClick={() => onVerifyJsonBinSync()}
                      disabled={isVerifyingJsonBin || jsonBinStatus === 'syncing'}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-neutral-700 bg-neutral-900 hover:border-[#facc15] text-[11px] font-bold text-neutral-200 hover:text-white transition-colors disabled:opacity-50"
                      title="Contrôler en direct sur JSONBin que chaque relevé correspond exactement"
                    >
                      <Zap className={`h-3 w-3 text-[#facc15] ${isVerifyingJsonBin ? 'animate-pulse' : ''}`} />
                      <span>{isVerifyingJsonBin ? 'Vérification...' : 'Vérifier JSONBin'}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Action buttons — single line on mobile */}
        <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none pb-0.5">
          {!isIframe && onPurgeAccountData && (
            <button
              onClick={handleTriggerPurge}
              title={isAdmin ? "Purger le cache et forcer un relevé neuf" : "Action protégée par 2FA"}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-white hover:bg-neutral-800 transition-colors shrink-0 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Purger</span>
              {!isAdmin && <Lock className="h-2.5 w-2.5 text-[#facc15]" />}
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-[#10b981]/40 bg-[#10b981]/15 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-[#10b981] hover:bg-[#10b981]/25 transition-colors shrink-0 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>CSV</span>
          </button>

          <button
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 rounded-xl border border-[#facc15]/40 bg-[#facc15]/10 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-[#facc15] hover:bg-[#facc15]/20 transition-colors shrink-0 whitespace-nowrap"
          >
            <FileJson className="h-3.5 w-3.5" />
            <span>JSON</span>
          </button>

          {!isIframe && (
            <button
              onClick={handleTriggerImport}
              title={isAdmin ? "Importer un fichier d'historique" : "Import protégé par 2FA"}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-white hover:bg-neutral-800 transition-colors shrink-0 whitespace-nowrap"
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
              className="flex items-center gap-1.5 rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/15 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-[#ef4444] hover:bg-[#ef4444]/25 transition-colors shrink-0 whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Vider</span>
              {!isAdmin && <Lock className="h-2.5 w-2.5 text-[#ef4444]" />}
            </button>
          )}
        </div>
      </div>

      {/* KPI & Filter / Sort Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-4 items-center rounded-2xl border border-neutral-800 bg-[#0c0f14] p-2.5 sm:p-4">
        {/* KPI stats (compact dot pills on mobile, full text on sm+) */}
        <div className="md:col-span-6 flex flex-nowrap sm:flex-wrap items-center gap-1.5 sm:gap-2.5 overflow-x-auto scrollbar-none">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full sm:rounded-xl bg-neutral-900 border border-neutral-800 text-[11px] sm:text-xs shrink-0"
            title={`Total : ${totalDaysCount} jours`}
          >
            <Calendar className="h-3.5 w-3.5 text-neutral-400" />
            <span className="hidden sm:inline text-neutral-400">Total :</span>
            <span className="font-mono font-bold text-white">{totalDaysCount}<span className="hidden sm:inline"> jours</span></span>
          </div>

          <div
            className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full sm:rounded-xl bg-[#10b981]/10 border border-[#10b981]/30 text-[11px] sm:text-xs shrink-0"
            title={`${verifiedCloudCount} synchronisés`}
          >
            <span className="h-2.5 w-2.5 sm:h-2 sm:w-2 rounded-full bg-[#10b981] shrink-0" />
            <span className="text-[#10b981] font-mono sm:font-sans font-bold">
              {verifiedCloudCount}<span className="hidden sm:inline"> synchronisés</span>
            </span>
          </div>

          {pendingCloudCount > 0 && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full sm:rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] sm:text-xs shrink-0"
              title={`${pendingCloudCount} en attente`}
            >
              <span className="h-2.5 w-2.5 sm:h-2 sm:w-2 rounded-full bg-amber-400 shrink-0" />
              <span className="text-amber-400 font-mono sm:font-sans font-bold">
                {pendingCloudCount}<span className="hidden sm:inline"> en attente</span>
              </span>
            </div>
          )}

          {puzzlesPendingCount > 0 && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full sm:rounded-xl bg-orange-500/15 border border-orange-500/40 text-[11px] sm:text-xs shrink-0"
              title={`${puzzlesPendingCount} problèmes à compléter`}
            >
              <span className="h-2.5 w-2.5 sm:h-2 sm:w-2 rounded-full bg-orange-400 shrink-0" />
              <span className="text-orange-400 font-mono sm:font-sans font-bold">
                {puzzlesPendingCount}<span className="hidden sm:inline"> problèmes à compléter</span>
              </span>
            </div>
          )}

          <div
            className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full sm:rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-[11px] sm:text-xs shrink-0"
            title={`${missingDaysCount} manqués`}
          >
            <span className="h-2.5 w-2.5 sm:h-2 sm:w-2 rounded-full bg-[#ef4444] shrink-0" />
            <span className="text-[#ef4444] font-mono sm:font-sans font-bold">
              {missingDaysCount}<span className="hidden sm:inline"> manqués</span>
            </span>
          </div>
        </div>

        {/* Filter buttons & sort toggle — strictly one single horizontal line */}
        <div className="md:col-span-6 flex flex-nowrap items-center justify-between md:justify-end gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none">
          {/* Filter segment: Dots on mobile, full text on sm+ */}
          <div className="flex flex-nowrap items-center p-1 rounded-full sm:rounded-xl bg-neutral-900 border border-neutral-800 text-xs gap-1 shrink-0">
            <button
              onClick={() => setFilterMode('all')}
              title={`Tous (${totalDaysCount})`}
              aria-label={`Tous (${totalDaysCount})`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full sm:rounded-lg font-bold transition-all whitespace-nowrap shrink-0 ${
                filterMode === 'all'
                  ? 'bg-[#facc15] text-black shadow-sm'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full sm:hidden ${
                  filterMode === 'all' ? 'bg-black' : 'bg-white'
                }`}
              />
              <span className="sm:hidden font-mono text-[11px]">{totalDaysCount}</span>
              <span className="hidden sm:inline">Tous ({totalDaysCount})</span>
            </button>

            <button
              onClick={() => setFilterMode('synced')}
              title={`Synchronisés / Faits (${syncedDaysCount})`}
              aria-label={`Synchronisés (${syncedDaysCount})`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full sm:rounded-lg font-bold transition-all whitespace-nowrap shrink-0 ${
                filterMode === 'synced'
                  ? 'bg-[#10b981] text-black shadow-sm'
                  : 'text-neutral-300 hover:text-[#10b981]'
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full sm:hidden ${
                  filterMode === 'synced' ? 'bg-black' : 'bg-[#10b981]'
                }`}
              />
              <span className="sm:hidden font-mono text-[11px]">{syncedDaysCount}</span>
              <span className="hidden sm:inline">Faits ({syncedDaysCount})</span>
            </button>

            {puzzlesPendingCount > 0 && (
              <button
                onClick={() => setFilterMode('puzzles_pending')}
                title={`À compléter (${puzzlesPendingCount})`}
                aria-label={`À compléter (${puzzlesPendingCount})`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full sm:rounded-lg font-bold transition-all whitespace-nowrap shrink-0 ${
                  filterMode === 'puzzles_pending'
                    ? 'bg-orange-500 text-black shadow-sm'
                    : 'text-orange-400 hover:bg-orange-500/15'
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full sm:hidden ${
                    filterMode === 'puzzles_pending' ? 'bg-black' : 'bg-orange-400'
                  }`}
                />
                <span className="sm:hidden font-mono text-[11px]">{puzzlesPendingCount}</span>
                <span className="hidden sm:inline">À compléter ({puzzlesPendingCount})</span>
              </button>
            )}

            <button
              onClick={() => setFilterMode('missing')}
              title={`Manqués (${missingDaysCount})`}
              aria-label={`Manqués (${missingDaysCount})`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full sm:rounded-lg font-bold transition-all whitespace-nowrap shrink-0 ${
                filterMode === 'missing'
                  ? 'bg-[#ef4444] text-white shadow-sm'
                  : 'text-neutral-300 hover:text-[#ef4444]'
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full sm:hidden ${
                  filterMode === 'missing' ? 'bg-white' : 'bg-[#ef4444]'
                }`}
              />
              <span className="sm:hidden font-mono text-[11px]">{missingDaysCount}</span>
              <span className="hidden sm:inline">Manqués ({missingDaysCount})</span>
            </button>
          </div>

          {/* Sort toggle */}
          <button
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-full sm:rounded-xl border border-neutral-800 bg-neutral-900 text-xs font-bold text-neutral-300 hover:text-white transition-all shrink-0 whitespace-nowrap"
            title={sortOrder === 'desc' ? 'Ordre : Plus récents (cliquez pour inverser)' : 'Ordre : Plus anciens (cliquez pour inverser)'}
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-[#facc15]" />
            <span className="hidden sm:inline">{sortOrder === 'desc' ? 'Plus récents' : 'Plus anciens'}</span>
          </button>
        </div>
      </div>

      {/* Main Table: Shows EVERY Day with Green (Done) and Red (Missing) Rows */}
      <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c1019] shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] bg-neutral-950/80 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                <th className="py-3.5 px-4">Date (Paris)</th>
                <th className="py-3.5 px-4 text-center">Statut</th>
                <th className="py-3.5 px-4 text-right">Bullet</th>
                <th className="py-3.5 px-4 text-right">Blitz</th>
                <th className="py-3.5 px-4 text-right">Rapide</th>
                <th className="py-3.5 px-4 text-right text-sky-400">Problèmes</th>
                <th className="py-3.5 px-4 text-center">Meilleur Relevé</th>
                <th className="py-3.5 px-4 text-right">Action / Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono">
              {filteredDays.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-neutral-400">
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

                      {/* Status — compact pastille dot on mobile, text badge on sm+ */}
                      <td className="py-3 px-2.5 sm:px-4 text-center whitespace-nowrap">
                        {day.syncState === 'missing' ? (
                          <span
                            className="inline-flex items-center justify-center gap-1 p-1.5 sm:px-2.5 sm:py-0.5 rounded-full bg-[#ef4444]/20 border border-[#ef4444]/40 text-[#ef4444] text-[10px] font-bold uppercase tracking-wider"
                            title="Manqué"
                          >
                            <span className="h-2.5 w-2.5 sm:h-1.5 sm:w-1.5 rounded-full bg-[#ef4444] shrink-0" />
                            <span className="hidden sm:inline">Manqué</span>
                          </span>
                        ) : day.syncState === 'verifying' ? (
                          <span
                            className="inline-flex items-center justify-center gap-1.5 p-1.5 sm:px-2.5 sm:py-0.5 rounded-full bg-[#facc15]/15 border border-[#facc15]/40 text-[#facc15] text-[10px] font-bold uppercase tracking-wider"
                            title="Vérification JSONBin en cours"
                          >
                            <span className="h-2.5 w-2.5 sm:h-1.5 sm:w-1.5 rounded-full bg-[#facc15] animate-ping shrink-0" />
                            <span className="hidden sm:inline">Vérification</span>
                          </span>
                        ) : day.syncState === 'verified' ? (
                          <span
                            className="inline-flex items-center justify-center gap-1 p-1.5 sm:px-2.5 sm:py-0.5 rounded-full bg-[#10b981]/20 border border-[#10b981]/40 text-[#10b981] text-[10px] font-bold uppercase tracking-wider"
                            title="Synchronisé — Empreinte confirmée identique sur JSONBin"
                          >
                            <span className="h-2.5 w-2.5 sm:h-1.5 sm:w-1.5 rounded-full bg-[#10b981] shrink-0" />
                            <span className="hidden sm:inline">Synchronisé</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center justify-center gap-1 p-1.5 sm:px-2.5 sm:py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-bold uppercase tracking-wider"
                            title="En attente — Relevé enregistré localement, en attente de confirmation distante JSONBin"
                          >
                            <span className="h-2.5 w-2.5 sm:h-1.5 sm:w-1.5 rounded-full bg-amber-400 shrink-0" />
                            <span className="hidden sm:inline">En attente</span>
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

                      {/* Problèmes (saisie le jour même ou lendemain, confirmation le lendemain) */}
                      <td className="py-3 px-4 text-right tabular-nums">
                        {!rec ? (
                          <span className="text-neutral-600">—</span>
                        ) : typeof rec.puzzles === 'number' && rec.puzzles > 0 ? (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => !isIframe && handleOpenEditModal(day, true)}
                              className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-semibold transition-colors"
                              title="Modifier le score Problèmes"
                            >
                              <span>{rec.puzzles}</span>
                              {rec.puzzlesConfirmed === true && (
                                <CheckCircle2
                                  className="h-3.5 w-3.5 text-[#10b981]"
                                  aria-label="Confirmé"
                                />
                              )}
                            </button>

                            {day.isToday && rec.puzzlesConfirmed !== true && (
                              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-[9px] font-sans font-bold text-amber-400">
                                À confirmer demain
                              </span>
                            )}

                            {!day.isToday && rec.puzzlesConfirmed !== true && !isIframe && (
                              <button
                                type="button"
                                onClick={() => handleConfirmPuzzles(day)}
                                title={
                                  isAdmin
                                    ? 'Confirmer ce score Problèmes du lendemain en 1 clic'
                                    : 'Confirmer (2FA requis)'
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#10b981]/20 border border-[#10b981]/45 text-[#10b981] hover:bg-[#10b981]/30 text-[10px] font-sans font-extrabold transition-colors active:scale-95"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Confirmer</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => !isIframe && handleOpenEditModal(day, true)}
                            title={
                              isAdmin
                                ? 'À compléter — Saisir le ELO Problèmes (jour même ou lendemain)'
                                : 'À compléter — Cliquez pour saisir le ELO Problèmes (2FA requis)'
                            }
                            className="inline-flex items-center justify-center gap-1.5 p-1.5 sm:px-2.5 sm:py-0.5 rounded-full bg-orange-500/20 border border-orange-500/50 text-orange-400 hover:bg-orange-500/30 text-[10px] font-sans font-bold uppercase tracking-wider transition-all active:scale-95"
                          >
                            <span className="h-2.5 w-2.5 sm:h-1.5 sm:w-1.5 rounded-full bg-orange-400 shrink-0" />
                            <span className="hidden sm:inline">À compléter</span>
                          </button>
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
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setManualModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl border border-neutral-800 bg-[#0c0f14] p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200"
          >
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
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setManualModalOpen(false);
                }}
                aria-label="Fermer"
                className="relative z-20 flex h-9 w-9 items-center justify-center text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors"
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

                <div>
                  <label className="block text-xs font-bold text-orange-400 font-sans mb-1">
                    Problèmes / Tactique (saisie le jour même ou lendemain — confirmation le lendemain)
                  </label>
                  <input
                    ref={puzzlesInputRef}
                    type="number"
                    min="100"
                    max="4500"
                    placeholder="Ex: 2021 (laisser vide si à compléter plus tard)"
                    value={manualPuzzles}
                    onChange={(e) => setManualPuzzles(e.target.value)}
                    className="w-full rounded-xl border border-orange-500/40 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-orange-400 focus:outline-none"
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
