/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCcw,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import { MonthlyMilestone, SyncRecord } from '../types/chess';
import {
  calculateLinearElo,
  DEFAULT_START_DATE,
  DEFAULT_START_ELO,
  DEFAULT_TARGET_DATE,
  DEFAULT_TARGET_ELO,
} from '../utils/eloEngine';

interface MilestoneCalendarProps {
  currentElo: number;
  syncHistory: SyncRecord[];
  milestones: MonthlyMilestone[];
  startElo?: number;
  targetElo?: number;
  startDateStr?: string;
  targetDateStr?: string;
  onNavigateToSyncLog?: () => void;
}

export const MilestoneCalendar: React.FC<MilestoneCalendarProps> = ({
  currentElo,
  syncHistory,
  milestones,
  startElo = DEFAULT_START_ELO,
  targetElo = DEFAULT_TARGET_ELO,
  startDateStr = DEFAULT_START_DATE,
  targetDateStr = DEFAULT_TARGET_DATE,
  onNavigateToSyncLog,
}) => {
  const [viewDate, setViewDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  const monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ];

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const currentMonthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const currentMonthMilestone = useMemo(() => {
    return (
      milestones.find((m) => m.monthKey === currentMonthKey) || {
        monthKey: currentMonthKey,
        label: `${monthNames[month]} ${year}`,
        targetElo: Math.round(
          calculateLinearElo(
            new Date(year, month + 1, 0, 23, 59, 59),
            startDateStr,
            targetDateStr,
            startElo,
            targetElo
          )
        ),
      }
    );
  }, [milestones, currentMonthKey, month, year, startDateStr, targetDateStr, startElo, targetElo]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const mondayOffset = (firstDayIndex + 6) % 7;

  // Map of full SyncRecord by YYYY-MM-DD
  const recordByDateMap = useMemo(() => {
    const map = new Map<string, SyncRecord>();
    syncHistory.forEach((record) => {
      const d = new Date(record.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const existing = map.get(key);
      if (!existing || record.bestRating > existing.bestRating) {
        map.set(key, record);
      }
    });
    return map;
  }, [syncHistory]);

  // Today key
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, [today]);

  // Monthly stats (Synced vs Missed)
  const monthStats = useMemo(() => {
    let synced = 0;
    let missed = 0;
    let peak = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const hasRecord = recordByDateMap.has(key);
      const isPastDay = key < todayKey;
      const isTodayDay = key === todayKey;

      if (hasRecord) {
        synced++;
        const r = recordByDateMap.get(key)!;
        if (r.bestRating > peak) peak = r.bestRating;
      } else if (isPastDay) {
        missed++;
      } else if (isTodayDay) {
        // Today not yet synced counts as pending
      }
    }

    const elapsedDays = synced + missed;
    const rate = elapsedDays > 0 ? Math.round((synced / elapsedDays) * 100) : 100;

    return {
      synced,
      missed,
      rate,
      peak,
    };
  }, [daysInMonth, year, month, todayKey, recordByDateMap]);

  // Selected date details
  const selectedDateMetrics = useMemo(() => {
    const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    const theoretical = calculateLinearElo(selectedDate, startDateStr, targetDateStr, startElo, targetElo);
    const record = recordByDateMap.get(dateKey) || null;
    const realOnDate = record ? record.bestRating : null;
    const effectiveReal = realOnDate ?? currentElo;
    const diff = Math.round((effectiveReal - theoretical) * 10) / 10;

    const isTodaySelected = dateKey === todayKey;
    const isPastSelected = dateKey < todayKey;
    const isFutureSelected = dateKey > todayKey;

    let dayStatus: 'synced' | 'missed' | 'today_pending' | 'future' = 'future';
    if (record) {
      dayStatus = 'synced';
    } else if (isTodaySelected) {
      dayStatus = 'today_pending';
    } else if (isPastSelected) {
      dayStatus = 'missed';
    } else {
      dayStatus = 'future';
    }

    let trajectoryStatus: 'ahead' | 'on_track' | 'behind' = 'on_track';
    if (diff > 5) trajectoryStatus = 'ahead';
    else if (diff < -5) trajectoryStatus = 'behind';

    return {
      dateKey,
      dateFormatted: selectedDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      theoretical,
      record,
      realOnDate,
      effectiveReal,
      diff,
      dayStatus,
      trajectoryStatus,
      isTodaySelected,
      isPastSelected,
      isFutureSelected,
    };
  }, [selectedDate, startDateStr, targetDateStr, startElo, targetElo, recordByDateMap, currentElo, todayKey]);

  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };
  const resetToToday = () => {
    setViewDate(new Date());
    setSelectedDate(new Date());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <CalendarIcon className="h-5 w-5 text-[#facc15]" />
            <span>Calendrier Des Paliers & Trajectoire</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Suivi quotidien : pastilles <span className="text-[#10b981] font-bold">vertes</span> pour les jours synchronisés, et <span className="text-[#ef4444] font-bold">rouges</span> pour les jours sans sauvegarde.
          </p>
        </div>

        {currentElo >= currentMonthMilestone.targetElo && (
          <div className="inline-flex items-center gap-2 rounded-xl bg-[#10b981]/15 border border-[#10b981]/30 px-3.5 py-1.5 text-xs font-bold text-[#10b981]">
            <Sparkles className="h-4 w-4 text-[#10b981]" />
            <span>Palier de {monthNames[month]} validé ({currentElo} ≥ {currentMonthMilestone.targetElo}) !</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Calendar Grid */}
        <div className="lg:col-span-7 rounded-2xl sm:rounded-3xl border border-neutral-800 bg-[#0c0f14] p-3.5 sm:p-6 shadow-xl">
          {/* Calendar Month Navigation */}
          <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-neutral-800">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="font-display text-base sm:text-lg font-bold text-white capitalize">
                {monthNames[month]} {year}
              </span>
              <span className="text-[11px] sm:text-xs font-mono font-bold text-[#facc15] bg-[#facc15]/10 border border-[#facc15]/30 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg">
                Cible : {currentMonthMilestone.targetElo} Elo
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5">
              <button
                onClick={resetToToday}
                className="h-8 px-2 rounded-lg border border-neutral-800 bg-neutral-900 text-[11px] font-bold text-neutral-300 hover:text-[#facc15] hover:border-[#facc15]/40 transition-colors flex items-center gap-1"
                title="Revenir à aujourd'hui"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Aujourd'hui</span>
              </button>
              <button
                onClick={prevMonth}
                className="h-8 w-8 rounded-lg border border-neutral-800 bg-neutral-900 flex items-center justify-center text-neutral-300 hover:text-white transition-colors"
                title="Mois précédent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={nextMonth}
                className="h-8 w-8 rounded-lg border border-neutral-800 bg-neutral-900 flex items-center justify-center text-neutral-300 hover:text-white transition-colors"
                title="Mois suivant"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Monthly Performance KPI Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 pb-3 mb-2 border-b border-neutral-800/70">
            <div className="bg-neutral-900/60 p-2.5 rounded-xl border border-neutral-800">
              <span className="text-[10px] text-neutral-400 uppercase font-semibold">Jours Synchronisés</span>
              <div className="text-base sm:text-lg font-black font-mono text-[#10b981] flex items-center gap-1.5 mt-0.5">
                <span className="h-2 w-2 rounded-full bg-[#10b981] shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                <span>{monthStats.synced} j</span>
              </div>
            </div>

            <div className="bg-neutral-900/60 p-2.5 rounded-xl border border-neutral-800">
              <span className="text-[10px] text-neutral-400 uppercase font-semibold">Jours Manqués</span>
              <div className="text-base sm:text-lg font-black font-mono text-[#ef4444] flex items-center gap-1.5 mt-0.5">
                <span className="h-2 w-2 rounded-full bg-[#ef4444] shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                <span>{monthStats.missed} j</span>
              </div>
            </div>

            <div className="bg-neutral-900/60 p-2.5 rounded-xl border border-neutral-800">
              <span className="text-[10px] text-neutral-400 uppercase font-semibold">Régularité</span>
              <div className="text-base sm:text-lg font-black font-mono text-[#facc15] mt-0.5">
                {monthStats.rate}%
              </div>
            </div>

            <div className="bg-neutral-900/60 p-2.5 rounded-xl border border-neutral-800">
              <span className="text-[10px] text-neutral-400 uppercase font-semibold">Pic du Mois</span>
              <div className="text-base sm:text-lg font-black font-mono text-white mt-0.5">
                {monthStats.peak > 0 ? `${monthStats.peak} Elo` : '—'}
              </div>
            </div>
          </div>

          {/* Day of Week Headers */}
          <div className="mt-2 grid grid-cols-7 text-center text-[11px] sm:text-xs font-semibold text-neutral-400">
            <div>Lun</div>
            <div>Mar</div>
            <div>Mer</div>
            <div>Jeu</div>
            <div>Ven</div>
            <div>Sam</div>
            <div>Dim</div>
          </div>

          {/* Calendar Days */}
          <div className="mt-2 sm:mt-2.5 grid grid-cols-7 gap-1 sm:gap-1.5">
            {Array.from({ length: mondayOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="h-12 sm:h-16 rounded-lg sm:rounded-xl opacity-10 bg-neutral-950" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateObj = new Date(year, month, day);
              const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected =
                selectedDate.getFullYear() === year &&
                selectedDate.getMonth() === month &&
                selectedDate.getDate() === day;

              const isCurrentDay = dateKey === todayKey;
              const isPastDay = dateKey < todayKey;
              const isFutureDay = dateKey > todayKey;

              const theoreticalElo = Math.round(
                calculateLinearElo(dateObj, startDateStr, targetDateStr, startElo, targetElo)
              );
              const record = recordByDateMap.get(dateKey);
              const realElo = record ? record.bestRating : undefined;

              // Pastille: Verte si sauvegardé, Rouge si pas de sauvegarde (jour passé)
              const showGreenDot = Boolean(realElo);
              const showRedDot = !realElo && isPastDay;
              const showTodayPendingDot = !realElo && isCurrentDay;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDate(dateObj)}
                  className={`h-12 sm:h-16 flex flex-col justify-between p-1 sm:p-2 rounded-lg sm:rounded-xl border text-left transition-all relative ${
                    isSelected
                      ? 'border-[#facc15] bg-[#facc15]/15 ring-2 ring-[#facc15]/50 shadow-md z-10'
                      : showRedDot
                      ? 'border-neutral-800/80 bg-neutral-900/40 hover:border-[#ef4444]/60'
                      : showGreenDot
                      ? 'border-neutral-800/80 bg-neutral-900/60 hover:border-[#10b981]/60'
                      : 'border-neutral-800/80 bg-neutral-900/40 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`font-mono text-[11px] sm:text-xs font-bold ${
                        isSelected
                          ? 'text-[#facc15]'
                          : isCurrentDay
                          ? 'text-white underline underline-offset-2'
                          : 'text-neutral-300'
                      }`}
                    >
                      {day}
                    </span>

                    {/* Pastille de synchronisation : VERTE si sauvegardé, ROUGE si manqué */}
                    {showGreenDot && (
                      <span
                        className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#10b981] shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                        title={`Sauvegardé : ${realElo} Elo`}
                      />
                    )}
                    {showRedDot && (
                      <span
                        className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#ef4444] shadow-[0_0_6px_rgba(239,68,68,0.8)]"
                        title="Aucune sauvegarde ce jour-là (Jour manqué)"
                      />
                    )}
                    {showTodayPendingDot && (
                      <span
                        className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#facc15] animate-ping"
                        title="À synchroniser aujourd'hui"
                      />
                    )}
                  </div>

                  <div className="font-mono text-[9px] sm:text-[10px] text-neutral-400 flex flex-col leading-none sm:leading-tight">
                    <span className="text-neutral-400 hidden sm:inline">{theoreticalElo}</span>
                    {realElo ? (
                      <span className="text-[#facc15] font-bold">{realElo}</span>
                    ) : showRedDot ? (
                      <span className="text-[#ef4444] font-semibold text-[9px]">Manqué</span>
                    ) : (
                      <span className="text-neutral-500 sm:hidden">{theoreticalElo}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Selected Date Detail Panel */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-3xl border border-neutral-800 bg-[#0c0f14] p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15]">
                <Clock className="h-4 w-4 text-[#facc15]" />
                <span>Détails De La Date</span>
              </div>

              {/* Status Badge */}
              {selectedDateMetrics.dayStatus === 'synced' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#10b981]/20 border border-[#10b981]/40 text-[#10b981] text-[11px] font-bold">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                  Synchronisé
                </span>
              )}
              {selectedDateMetrics.dayStatus === 'missed' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ef4444]/20 border border-[#ef4444]/40 text-[#ef4444] text-[11px] font-bold">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444]" />
                  Jour Manqué
                </span>
              )}
              {selectedDateMetrics.dayStatus === 'today_pending' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#facc15]/20 border border-[#facc15]/40 text-[#facc15] text-[11px] font-bold">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#facc15]" />
                  Aujourd'hui (En attente)
                </span>
              )}
              {selectedDateMetrics.dayStatus === 'future' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-[11px] font-medium">
                  Étape Planifiée
                </span>
              )}
            </div>

            <h3 className="mt-4 font-display text-base font-bold text-white capitalize">
              {selectedDateMetrics.dateFormatted}
            </h3>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-neutral-900 p-3.5 border border-neutral-800">
                <span className="text-xs text-neutral-400">Elo théorique cible :</span>
                <span className="font-mono text-lg font-bold text-white">
                  {selectedDateMetrics.theoretical}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-neutral-900 p-3.5 border border-neutral-800">
                <span className="text-xs text-neutral-400">Elo réel enregistré ce jour :</span>
                <span
                  className={`font-mono text-lg font-bold ${
                    selectedDateMetrics.realOnDate !== null
                      ? 'text-[#facc15]'
                      : selectedDateMetrics.dayStatus === 'missed'
                      ? 'text-[#ef4444]'
                      : 'text-neutral-400'
                  }`}
                >
                  {selectedDateMetrics.realOnDate !== null
                    ? `${selectedDateMetrics.realOnDate} Elo`
                    : selectedDateMetrics.dayStatus === 'missed'
                    ? 'Aucune sauvegarde (Manqué)'
                    : 'Non joué'}
                </span>
              </div>

              {/* Breakdown by game mode if synced */}
              {selectedDateMetrics.record && (
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-neutral-900/80 p-3 border border-neutral-800 text-center">
                  <div>
                    <span className="text-[10px] text-neutral-400 uppercase font-mono">Bullet</span>
                    <div className="text-xs font-mono font-bold text-white mt-0.5">
                      {selectedDateMetrics.record.bullet ?? '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 uppercase font-mono">Blitz</span>
                    <div className="text-xs font-mono font-bold text-white mt-0.5">
                      {selectedDateMetrics.record.blitz ?? '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 uppercase font-mono">Rapide</span>
                    <div className="text-xs font-mono font-bold text-white mt-0.5">
                      {selectedDateMetrics.record.rapid ?? '—'}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl bg-neutral-900 p-3.5 border border-neutral-800">
                <span className="text-xs text-neutral-400">Écart à la cible :</span>
                <span
                  className={`font-mono text-base font-bold ${
                    selectedDateMetrics.diff >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'
                  }`}
                >
                  {selectedDateMetrics.diff > 0 ? `+${selectedDateMetrics.diff}` : selectedDateMetrics.diff} pts
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-neutral-900 p-3.5 border border-neutral-800">
                <span className="text-xs text-neutral-400">Cible de fin de mois :</span>
                <span className="font-mono text-base font-bold text-neutral-300">
                  {currentMonthMilestone.targetElo} Elo
                </span>
              </div>
            </div>

            {/* Status explanation */}
            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3.5 text-xs text-neutral-300">
              {selectedDateMetrics.dayStatus === 'missed' ? (
                <div className="space-y-1.5">
                  <div className="text-[#ef4444] flex items-center gap-1.5 font-bold">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Journée non synchronisée !</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Aucune sauvegarde automatique n'a été trouvée pour ce jour. Vous pouvez la compléter manuellement dans l'onglet Journal si vous êtes administrateur.
                  </p>
                </div>
              ) : selectedDateMetrics.dayStatus === 'synced' ? (
                <div className="text-[#10b981] flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Synchronisation validée (Meilleur : {selectedDateMetrics.record?.bestRating} en {selectedDateMetrics.record?.bestMode}).
                  </span>
                </div>
              ) : selectedDateMetrics.dayStatus === 'today_pending' ? (
                <div className="text-[#facc15] flex items-center gap-1.5 font-bold">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>Journée en cours. Cliquez sur Synchroniser pour actualiser le relevé du jour.</span>
                </div>
              ) : (
                <div className="text-neutral-400 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 shrink-0 text-neutral-500" />
                  <span>Journée future. Palier attendu : {selectedDateMetrics.theoretical} Elo.</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick list of Project Milestones */}
          <div className="rounded-3xl border border-neutral-800 bg-[#0c0f14] p-6 shadow-xl">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800 pb-3">
              Paliers Clés Du Projet
            </h4>

            <div className="mt-3.5 space-y-2 max-h-52 overflow-y-auto pr-1">
              {milestones.map((m) => {
                const isPassed = currentElo >= m.targetElo;
                return (
                  <div
                    key={m.monthKey}
                    className={`flex items-center justify-between text-xs p-2.5 rounded-xl border transition-all ${
                      isPassed
                        ? 'border-[#10b981]/30 bg-[#10b981]/10 text-[#10b981]'
                        : 'border-neutral-800 bg-neutral-900/40 text-neutral-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isPassed ? (
                        <CheckCircle2 className="h-4 w-4 text-[#10b981] shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-neutral-500 shrink-0" />
                      )}
                      <span>{m.label}</span>
                    </div>
                    <span className="font-mono font-bold text-white">{m.targetElo} Elo</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
