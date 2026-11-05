/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Calendar,
  CheckCircle2,
  Compass,
  Milestone,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import { SyncRecord } from '../types/chess';
import { calculateLinearElo, DEFAULT_START_DATE, DEFAULT_TARGET_DATE } from '../utils/eloEngine';

interface HistoryChartProps {
  syncHistory: SyncRecord[];
  startElo?: number;
  targetElo?: number;
  startDateStr?: string;
  targetDateStr?: string;
}

type TimeframePreset = 'progress' | 'full' | '30days' | '6months' | '1year';

interface ChartPoint {
  dayKey: string; // YYYY-MM-DD (unique identifier for Recharts)
  dateLabel: string;
  timestamp: number;
  realElo: number | null;
  targetElo: number;
  mode?: string;
  isRealPoint: boolean;
}

function formatDateToKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const HistoryChart: React.FC<HistoryChartProps> = ({
  syncHistory,
  startElo = 1500,
  targetElo = 2000,
  startDateStr = DEFAULT_START_DATE,
  targetDateStr = DEFAULT_TARGET_DATE,
}) => {
  const [timeframe, setTimeframe] = useState<TimeframePreset>('progress');

  const projectStartTime = useMemo(
    () => new Date(startDateStr || DEFAULT_START_DATE).getTime(),
    [startDateStr]
  );
  const projectEndTime = useMemo(
    () => new Date(targetDateStr || DEFAULT_TARGET_DATE).getTime(),
    [targetDateStr]
  );

  // Chronologically sorted records (oldest to newest)
  const sortedRecords = useMemo(() => {
    return [...syncHistory].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [syncHistory]);

  const latestRecord = sortedRecords.length > 0 ? sortedRecords[sortedRecords.length - 1] : null;
  const currentRealElo = latestRecord ? latestRecord.bestRating : startElo;

  // Today key
  const todayObj = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const todayKey = useMemo(() => formatDateToKey(todayObj), [todayObj]);

  // Target Elo for today
  const targetToday = Math.round(
    calculateLinearElo(todayObj.getTime(), startDateStr, targetDateStr, startElo, targetElo)
  );
  const diffVsTarget = currentRealElo - targetToday;

  // Build the uniform daily timeline (Strict mathematical proportionality: 1 point per day)
  const { chartData, tickKeys, yMin, yMax, yTicks } = useMemo(() => {
    // 1. Group syncs by calendar day (YYYY-MM-DD): maximum 1 point per day
    const dailyMap = new Map<string, { rating: number; mode: string; timestamp: number }>();

    // Initial base point on project start date
    const startObj = new Date(projectStartTime);
    startObj.setHours(0, 0, 0, 0);
    const startKey = formatDateToKey(startObj);
    dailyMap.set(startKey, {
      rating: startElo,
      mode: 'Départ',
      timestamp: startObj.getTime(),
    });

    // Populate daily records (latest sync of each day wins)
    sortedRecords.forEach((record) => {
      const d = new Date(record.timestamp);
      const key = formatDateToKey(d);
      dailyMap.set(key, {
        rating: record.bestRating,
        mode: record.bestMode,
        timestamp: d.getTime(),
      });
    });

    // 2. Determine window boundaries depending on timeframe
    let windowStart = new Date(projectStartTime);
    let windowEnd = new Date(projectEndTime);
    windowStart.setHours(0, 0, 0, 0);
    windowEnd.setHours(0, 0, 0, 0);

    const nowMs = todayObj.getTime();

    if (timeframe === 'progress') {
      // Zoom from project start to today + 14 days margin to inspect current daily action clearly
      windowStart = new Date(projectStartTime);
      windowStart.setHours(0, 0, 0, 0);
      const prospectiveEnd = new Date(nowMs + 14 * 86400000);
      prospectiveEnd.setHours(0, 0, 0, 0);
      // Ensure at least 30 days window from start
      const minEnd = new Date(projectStartTime + 30 * 86400000);
      windowEnd = prospectiveEnd.getTime() > minEnd.getTime() ? prospectiveEnd : minEnd;
      if (windowEnd.getTime() > projectEndTime) {
        windowEnd = new Date(projectEndTime);
      }
    } else if (timeframe === '30days') {
      windowStart = new Date(nowMs - 30 * 86400000);
      windowStart.setHours(0, 0, 0, 0);
      windowEnd = new Date(nowMs + 5 * 86400000);
      windowEnd.setHours(0, 0, 0, 0);
      if (windowStart.getTime() < projectStartTime) {
        windowStart = new Date(projectStartTime);
        windowStart.setHours(0, 0, 0, 0);
      }
    } else if (timeframe === '6months') {
      windowStart = new Date(projectStartTime);
      windowStart.setHours(0, 0, 0, 0);
      windowEnd = new Date(projectStartTime + 182 * 86400000);
      windowEnd.setHours(0, 0, 0, 0);
    } else if (timeframe === '1year') {
      windowStart = new Date(projectStartTime);
      windowStart.setHours(0, 0, 0, 0);
      windowEnd = new Date(projectStartTime + 365 * 86400000);
      windowEnd.setHours(0, 0, 0, 0);
    } else {
      // 'full' -> entire project from start to target date
      windowStart = new Date(projectStartTime);
      windowEnd = new Date(projectEndTime);
      windowStart.setHours(0, 0, 0, 0);
      windowEnd.setHours(0, 0, 0, 0);
    }

    const totalDays = Math.max(1, Math.round((windowEnd.getTime() - windowStart.getTime()) / 86400000));

    // 3. Step day-by-day: exactly 1 entry per calendar day
    const points: ChartPoint[] = [];
    const ticks: string[] = [];

    // Determine clean tick spacing
    let tickIntervalDays = 1;
    if (totalDays > 300) tickIntervalDays = 60; // every 2 months
    else if (totalDays > 120) tickIntervalDays = 30; // every month
    else if (totalDays > 45) tickIntervalDays = 14; // every 2 weeks
    else if (totalDays > 15) tickIntervalDays = 5; // every 5 days
    else tickIntervalDays = 2; // every 2 days

    const curr = new Date(windowStart);
    let dayIndex = 0;

    // Track latest synced day timestamp
    let latestSyncTimestamp = projectStartTime;
    dailyMap.forEach((val) => {
      if (val.timestamp > latestSyncTimestamp) {
        latestSyncTimestamp = val.timestamp;
      }
    });

    while (curr.getTime() <= windowEnd.getTime()) {
      const key = formatDateToKey(curr);
      const timestamp = curr.getTime();

      // Theoretical Elo on this specific day (perfect straight line)
      const targetVal = calculateLinearElo(
        timestamp,
        startDateStr,
        targetDateStr,
        startElo,
        targetElo
      );

      // Real Elo: exists ONLY if synced, or if it is the start base point
      const syncEntry = dailyMap.get(key);
      const isPastOrToday = timestamp <= todayObj.getTime() || key === todayKey;
      const isReal = syncEntry !== undefined && (isPastOrToday || key === startKey);

      // Only plot realElo up to the latest known sync (do not predict into future)
      const realVal = isReal ? syncEntry.rating : null;

      const dateLabel = curr.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: totalDays > 45 ? 'short' : 'numeric',
      });

      points.push({
        dayKey: key,
        dateLabel,
        timestamp,
        realElo: realVal,
        targetElo: Math.round(targetVal * 10) / 10,
        mode: syncEntry?.mode,
        isRealPoint: isReal,
      });

      // Equidistant tick collection
      if (dayIndex % tickIntervalDays === 0 || dayIndex === totalDays) {
        ticks.push(key);
      }

      curr.setDate(curr.getDate() + 1);
      dayIndex++;
    }

    // 4. Calculate uniform Y-axis range with exact 100 Elo steps
    const recordedElos = sortedRecords.map((r) => r.bestRating);
    const minRating = Math.min(startElo, ...recordedElos);
    const maxRating = Math.max(targetElo, ...recordedElos);

    const calcYMin = Math.floor(Math.min(1400, minRating - 50) / 100) * 100;
    const calcYMax = Math.ceil(Math.max(2050, maxRating + 50) / 100) * 100;

    const computedYTicks: number[] = [];
    for (let y = calcYMin; y <= calcYMax; y += 100) {
      computedYTicks.push(y);
    }

    return {
      chartData: points,
      tickKeys: ticks,
      yMin: calcYMin,
      yMax: calcYMax,
      yTicks: computedYTicks,
    };
  }, [
    sortedRecords,
    projectStartTime,
    projectEndTime,
    startElo,
    targetElo,
    startDateStr,
    targetDateStr,
    timeframe,
    todayObj,
    todayKey,
  ]);

  // Check if today falls in visible chart range
  const isTodayVisible = useMemo(() => {
    return chartData.some((p) => p.dayKey === todayKey);
  }, [chartData, todayKey]);

  // Tooltip formatter
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;

    const pt = payload[0]?.payload as ChartPoint;
    const realItem = payload.find((p: any) => p.dataKey === 'realElo');
    const targetItem = payload.find((p: any) => p.dataKey === 'targetElo');

    const realVal = realItem?.value;
    const targetVal = targetItem?.value;
    const diff = realVal !== undefined && realVal !== null ? Math.round(realVal - targetVal) : null;

    const fullDate = new Date(pt.timestamp).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    return (
      <div className="rounded-2xl border border-neutral-800 bg-[#0c0f14]/95 p-4 text-xs shadow-2xl space-y-2.5 backdrop-blur-md">
        <div className="font-bold text-white capitalize border-b border-neutral-800/80 pb-2 flex items-center justify-between gap-4">
          <span>{fullDate}</span>
          {pt.mode && (
            <span className="text-[10px] font-mono font-bold text-[#facc15] uppercase bg-[#facc15]/10 border border-[#facc15]/30 px-2 py-0.5 rounded">
              {pt.mode}
            </span>
          )}
        </div>

        <div className="space-y-2 font-mono">
          {/* Target Elo */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-neutral-400 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-white" />
              <span>Cible Théorique :</span>
            </span>
            <span className="font-bold text-white">{targetVal} Elo</span>
          </div>

          {/* Real Elo */}
          {realVal !== undefined && realVal !== null ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className="text-neutral-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#facc15]" />
                  <span>Votre Classement :</span>
                </span>
                <span className="font-bold text-[#facc15]">{realVal} Elo</span>
              </div>

              <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-neutral-800/80">
                <span className="text-neutral-400">Écart à la cible :</span>
                <span
                  className={`font-bold flex items-center gap-1 ${
                    diff !== null && diff >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'
                  }`}
                >
                  {diff !== null && diff >= 0 ? (
                    <>
                      <TrendingUp className="h-3 w-3" />
                      <span>+{diff} pts (En Avance)</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-3 w-3" />
                      <span>{diff} pts (En Retard)</span>
                    </>
                  )}
                </span>
              </div>
            </>
          ) : (
            <div className="pt-1 border-t border-neutral-800/80 text-[11px] text-neutral-400 italic">
              {pt.timestamp > todayObj.getTime()
                ? 'Projection future vers 2000 Elo'
                : 'Pas de partie enregistrée ce jour'}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Header with Status & Linear Calibration Badge */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-[#0d1117] border border-neutral-800 p-5 rounded-3xl shadow-xl">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Compass className="h-5 w-5 text-[#facc15]" />
              <span>Trajectoire Échiquéenne Proportionnelle</span>
            </h2>
            <span className="text-[10px] font-mono bg-neutral-900 text-[#facc15] font-bold px-2.5 py-0.5 rounded-full border border-neutral-800">
              1 point / jour maximum
            </span>
            <span className="text-[10px] font-mono bg-neutral-900 text-neutral-400 px-2.5 py-0.5 rounded-full border border-neutral-800">
              Échelle temporelle 100% linéaire
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Chaque jour occupe la même largeur horizontale. La cible théorique progresse de manière strictement continue et proportionnelle.
          </p>
        </div>

        {/* Tactical Quick Status Chips (Blanc, Noir, Vert, Rouge, Jaune) */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0c0f14] border border-neutral-800 text-xs font-mono">
            <span className="text-neutral-400">Actuel :</span>
            <span className="font-bold text-[#facc15]">{currentRealElo} Elo</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0c0f14] border border-neutral-800 text-xs font-mono">
            <span className="text-neutral-400">Cible aujourd&apos;hui :</span>
            <span className="font-bold text-white">{targetToday} Elo</span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${
              diffVsTarget >= 0
                ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
                : 'bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/30'
            }`}
          >
            {diffVsTarget >= 0 ? (
              <>
                <TrendingUp className="h-3.5 w-3.5" />
                <span>+{diffVsTarget} pts (En Avance)</span>
              </>
            ) : (
              <>
                <TrendingDown className="h-3.5 w-3.5" />
                <span>{diffVsTarget} pts (Retard)</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Interactive Period Toolbar (1 Clic, Zéro Molette) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0d1117] border border-neutral-800 p-3 rounded-2xl">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-neutral-400 mr-2 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-[#facc15]" />
            <span>Période :</span>
          </span>
          {[
            { id: 'progress', label: 'Progression Active' },
            { id: 'full', label: 'Tout le Projet (2026-2027)' },
            { id: '30days', label: '30 Jours' },
            { id: '6months', label: '6 Mois' },
            { id: '1year', label: '1 An' },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setTimeframe(btn.id as TimeframePreset)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                timeframe === btn.id
                  ? 'bg-[#facc15] text-black shadow-md'
                  : 'bg-[#0c0f14] text-neutral-300 hover:text-white border border-neutral-800'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Legend pills (Noir, Blanc, Jaune, Vert) */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#facc15] ring-2 ring-[#0c0f14]" />
            <span className="text-[#facc15] font-bold">Votre Elo Réel (1 pt / jour)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-5 border-b-2 border-dashed border-white" />
            <span className="text-white">Cible Linéaire 1500 → 2000</span>
          </div>
        </div>
      </div>

      {/* 3. Recharts LineChart Component (Mathematically uniform X & Y scales) */}
      <div className="rounded-3xl border border-neutral-800 bg-[#0c0f14] p-4 sm:p-6 shadow-2xl">
        <div className="h-[430px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 10, bottom: 25 }}
            >
              {/* Subtle Cartesian Grid strictly aligned with 100-Elo steps */}
              <CartesianGrid stroke="#1c2430" strokeDasharray="3 3" vertical={false} />

              {/* X Axis with unique dayKey and evenly distributed ticks */}
              <XAxis
                dataKey="dayKey"
                ticks={tickKeys}
                tickFormatter={(key: string) => {
                  const [y, m, d] = key.split('-').map(Number);
                  const dt = new Date(y, m - 1, d);
                  return dt.toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  });
                }}
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={{ stroke: '#334155' }}
                dy={10}
              />

              {/* Y Axis with proportional 100-Elo ticks */}
              <YAxis
                domain={[yMin, yMax]}
                ticks={yTicks}
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={{ stroke: '#334155' }}
                dx={-5}
              />

              {/* Reference line for Today (vertical indicator) */}
              {isTodayVisible && (
                <ReferenceLine
                  x={todayKey}
                  stroke="#facc15"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: "Aujourd'hui",
                    fill: '#facc15',
                    fontSize: 10,
                    position: 'insideTopRight',
                    fontWeight: 'bold',
                  }}
                />
              )}

              {/* Departure 1500 Reference Line */}
              <ReferenceLine
                y={startElo}
                stroke="#ffffff"
                strokeDasharray="4 4"
                strokeOpacity={0.4}
                label={{
                  value: `Départ ${startElo} Elo`,
                  fill: '#ffffff',
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />

              {/* Target 2000 Reference Line */}
              <ReferenceLine
                y={targetElo}
                stroke="#facc15"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{
                  value: `Objectif ${targetElo} Elo 🏆`,
                  fill: '#facc15',
                  fontSize: 11,
                  fontWeight: 'bold',
                  position: 'insideTopLeft',
                }}
              />

              {/* Custom Tooltip */}
              <Tooltip content={<CustomTooltip />} />

              {/* Target Linear Line (Strictly straight, dashed white) */}
              <Line
                type="linear"
                dataKey="targetElo"
                name="Cible Théorique"
                stroke="#ffffff"
                strokeWidth={1.8}
                strokeDasharray="6 6"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />

              {/* Real Elo Line (Pure Yellow, max 1 point per day, small dots r=3) */}
              <Line
                type="monotone"
                dataKey="realElo"
                name="Votre Elo Réel"
                stroke="#facc15"
                strokeWidth={3}
                connectNulls={true}
                /* Only render circle when it's a real synced point */
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (!payload?.isRealPoint || payload?.realElo === null || cx === undefined || cy === undefined) {
                    return null;
                  }
                  return (
                    <circle
                      key={`dot-${cx}-${cy}`}
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill="#facc15"
                      stroke="#0c0f14"
                      strokeWidth={1.5}
                    />
                  );
                }}
                activeDot={{
                  r: 5,
                  fill: '#facc15',
                  stroke: '#ffffff',
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 4. Bottom Stepper Paliers (Noir/Blanc, Vert, Jaune) */}
        <div className="mt-6 pt-5 border-t border-neutral-800">
          <div className="flex items-center justify-between text-xs text-neutral-400 mb-3">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Milestone className="h-4 w-4 text-[#facc15]" />
              <span>Paliers Du Projet Échiquéen (Tranches de 100 Elo)</span>
            </span>
            <span className="font-mono text-neutral-400 text-[11px]">
              Échéance : 31/12/2027
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { elo: 1600, label: 'Club', pct: '20%' },
              { elo: 1700, label: 'Intermédiaire', pct: '40%' },
              { elo: 1800, label: 'Avancé', pct: '60%' },
              { elo: 1900, label: 'Expert', pct: '80%' },
              { elo: 2000, label: 'Candidat Maître', pct: '100%' },
            ].map((m) => {
              const isPassed = currentRealElo >= m.elo;
              const isCurrentTarget = !isPassed && currentRealElo >= m.elo - 100;

              return (
                <div
                  key={m.elo}
                  className={`rounded-2xl p-3.5 border transition-all ${
                    isPassed
                      ? 'bg-[#10b981]/15 border-[#10b981]/40 text-[#10b981]'
                      : isCurrentTarget
                      ? 'bg-[#facc15]/10 border-[#facc15]/40 text-[#facc15] ring-1 ring-[#facc15]/30'
                      : 'bg-neutral-900/60 border-neutral-800 text-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold font-mono text-white">{m.elo} Elo</span>
                    {isPassed ? (
                      <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
                    ) : (
                      <span className="font-mono text-[10px] text-neutral-400">{m.pct}</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs font-bold">{m.label}</div>
                  <div className="mt-0.5 text-[10px] text-neutral-400">
                    {isPassed ? (
                      <span className="text-[#10b981] font-bold">Validé ✓</span>
                    ) : (
                      <span>{m.elo - currentRealElo} pts restants</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
