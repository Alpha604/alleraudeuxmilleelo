/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  Trophy,
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
}

export const MilestoneCalendar: React.FC<MilestoneCalendarProps> = ({
  currentElo,
  syncHistory,
  milestones,
  startElo = DEFAULT_START_ELO,
  targetElo = DEFAULT_TARGET_ELO,
  startDateStr = DEFAULT_START_DATE,
  targetDateStr = DEFAULT_TARGET_DATE,
}) => {
  // Calendar view month state (start at October 2026 or current date)
  const [viewDate, setViewDate] = useState<Date>(() => new Date(2026, 9, 31)); // Oct 2026
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date(2026, 9, 31));

  const monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ];

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const currentMonthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  // Find monthly milestone for current viewed month
  const currentMonthMilestone = useMemo(() => {
    return milestones.find((m) => m.monthKey === currentMonthKey) || {
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
    };
  }, [milestones, currentMonthKey, month, year, startDateStr, targetDateStr, startElo, targetElo]);

  // Days in current month grid
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
  // Convert to Monday = 0
  const mondayOffset = (firstDayIndex + 6) % 7;

  // Real data by day map
  const realEloByDateMap = useMemo(() => {
    const map = new Map<string, number>();
    syncHistory.forEach((record) => {
      const d = new Date(record.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const existing = map.get(key);
      if (!existing || record.bestRating > existing) {
        map.set(key, record.bestRating);
      }
    });
    return map;
  }, [syncHistory]);

  // Selected date statistics
  const selectedDateMetrics = useMemo(() => {
    const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    const theoretical = calculateLinearElo(selectedDate, startDateStr, targetDateStr, startElo, targetElo);
    const realOnDate = realEloByDateMap.get(dateKey) ?? null;
    const effectiveReal = realOnDate ?? currentElo;
    const diff = Math.round((effectiveReal - theoretical) * 10) / 10;

    let status: 'ahead' | 'on_track' | 'behind' | 'goal_reached' = 'on_track';
    if (effectiveReal >= targetElo) status = 'goal_reached';
    else if (diff > 5) status = 'ahead';
    else if (diff < -5) status = 'behind';

    return {
      dateKey,
      dateFormatted: selectedDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      theoretical,
      realOnDate,
      effectiveReal,
      diff,
      status,
    };
  }, [selectedDate, startDateStr, targetDateStr, startElo, targetElo, realEloByDateMap, currentElo]);

  // Navigation handlers
  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-100 dark:text-neutral-100 light:text-neutral-900 flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-amber-400" />
            <span>Calendrier Des Paliers & Trajectoire Temporelle</span>
          </h2>
          <p className="text-xs text-neutral-400">
            Sélectionnez une date pour consulter l'Elo théorique requis et vérifier votre avancement.
          </p>
        </div>

        {/* Milestone reached celebration badge */}
        {currentElo >= currentMonthMilestone.targetElo && (
          <div className="inline-flex items-center gap-2 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-300">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span>Palier de {monthNames[month]} validé ({currentElo} ≥ {currentMonthMilestone.targetElo}) !</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Calendar Grid */}
        <div className="lg:col-span-7 rounded-2xl border border-neutral-800 bg-neutral-900/90 p-5 shadow-xl backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/90 light:border-neutral-200 light:bg-white">
          {/* Calendar Month Navigation */}
          <div className="flex items-center justify-between pb-4 border-b border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200">
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-bold text-neutral-100 dark:text-neutral-100 light:text-neutral-900 capitalize">
                {monthNames[month]} {year}
              </span>
              <span className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                Cible : {currentMonthMilestone.targetElo} Elo
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={prevMonth}
                className="h-8 w-8 rounded-lg border border-neutral-800 bg-neutral-950 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                title="Mois précédent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={nextMonth}
                className="h-8 w-8 rounded-lg border border-neutral-800 bg-neutral-950 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                title="Mois suivant"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Day of Week Headers */}
          <div className="mt-4 grid grid-cols-7 text-center text-xs font-medium text-neutral-400">
            <div>Lun</div>
            <div>Mar</div>
            <div>Mer</div>
            <div>Jeu</div>
            <div>Ven</div>
            <div>Sam</div>
            <div>Dim</div>
          </div>

          {/* Calendar Days */}
          <div className="mt-2 grid grid-cols-7 gap-1">
            {/* Blank leading days */}
            {Array.from({ length: mondayOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="h-16 rounded-lg opacity-10 bg-neutral-950" />
            ))}

            {/* Days in Month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateObj = new Date(year, month, day);
              const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected =
                selectedDate.getFullYear() === year &&
                selectedDate.getMonth() === month &&
                selectedDate.getDate() === day;

              const theoreticalElo = Math.round(
                calculateLinearElo(dateObj, startDateStr, targetDateStr, startElo, targetElo)
              );
              const realElo = realEloByDateMap.get(dateKey);

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(dateObj)}
                  className={`h-16 flex flex-col justify-between p-1.5 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/15 ring-1 ring-amber-500'
                      : 'border-neutral-800/60 bg-neutral-950/60 hover:border-neutral-700 hover:bg-neutral-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`font-mono text-xs font-bold ${
                        isSelected ? 'text-amber-300' : 'text-neutral-300'
                      }`}
                    >
                      {day}
                    </span>
                    {realElo && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title={`Sync: ${realElo}`} />
                    )}
                  </div>

                  <div className="font-mono text-[10px] text-neutral-400 flex flex-col">
                    <span className="text-neutral-400">{theoreticalElo}</span>
                    {realElo ? (
                      <span className="text-amber-400 font-bold">{realElo}</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Selected Date Detail Panel */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-5 shadow-xl backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/90 light:border-neutral-200 light:bg-white">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400 border-b border-neutral-800 pb-3">
              <Clock className="h-4 w-4 text-amber-400" />
              <span>Détails De La Date Sélectionnée</span>
            </div>

            <h3 className="mt-3 font-display text-base font-bold text-neutral-100 capitalize">
              {selectedDateMetrics.dateFormatted}
            </h3>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-neutral-950 p-3 border border-neutral-800/80">
                <span className="text-xs text-neutral-400">Elo théorique cible :</span>
                <span className="font-mono text-lg font-bold text-neutral-100">
                  {selectedDateMetrics.theoretical}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-neutral-950 p-3 border border-neutral-800/80">
                <span className="text-xs text-neutral-400">Elo réel enregistré ce jour :</span>
                <span className="font-mono text-lg font-bold text-amber-400">
                  {selectedDateMetrics.realOnDate !== null
                    ? selectedDateMetrics.realOnDate
                    : 'Aucun (Elo actuel: ' + currentElo + ')'}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-neutral-950 p-3 border border-neutral-800/80">
                <span className="text-xs text-neutral-400">Écart à la cible :</span>
                <span
                  className={`font-mono text-base font-bold ${
                    selectedDateMetrics.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {selectedDateMetrics.diff > 0 ? `+${selectedDateMetrics.diff}` : selectedDateMetrics.diff} pts
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-neutral-950 p-3 border border-neutral-800/80">
                <span className="text-xs text-neutral-400">Cible de fin de mois :</span>
                <span className="font-mono text-base font-bold text-neutral-300">
                  {currentMonthMilestone.targetElo} Elo
                </span>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 text-xs text-neutral-400">
              {selectedDateMetrics.status === 'ahead' && (
                <div className="text-emerald-400 flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>En avance de {selectedDateMetrics.diff} pts par rapport à la courbe idéale !</span>
                </div>
              )}
              {selectedDateMetrics.status === 'on_track' && (
                <div className="text-amber-300 flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Dans le rythme théorique prévu pour cette date.</span>
                </div>
              )}
              {selectedDateMetrics.status === 'behind' && (
                <div className="text-rose-400 flex items-center gap-1.5 font-medium">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>Retard de {Math.abs(selectedDateMetrics.diff)} pts à combler pour cette échéance.</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick list of Project Milestones */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-5 shadow-xl backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/90 light:border-neutral-200 light:bg-white">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800 pb-2">
              Paliers Clés Du Projet
            </h4>

            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
              {milestones.map((m) => {
                const isPassed = currentElo >= m.targetElo;
                return (
                  <div
                    key={m.monthKey}
                    className={`flex items-center justify-between text-xs p-2 rounded-lg border ${
                      isPassed
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-neutral-800 bg-neutral-950/40 text-neutral-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isPassed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
                      )}
                      <span>{m.label}</span>
                    </div>
                    <span className="font-mono font-bold">{m.targetElo} Elo</span>
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
