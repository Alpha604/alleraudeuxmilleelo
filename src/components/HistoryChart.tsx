/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
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
  Clock,
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
  startElo: number;
  targetElo: number;
  startDateStr: string;
  targetDateStr: string;
}

type TimeframePreset = 'full' | '1year' | '6months' | '30days';

interface ChartPoint {
  dayKey: string;
  dateLabel: string;
  timestamp: number;
  realElo: number | null;
  targetElo: number;
  mode?: string;
  isRealPoint: boolean;
}

export const HistoryChart: React.FC<HistoryChartProps> = ({
  syncHistory,
  startElo = 1500,
  targetElo = 2000,
  startDateStr = DEFAULT_START_DATE,
  targetDateStr = DEFAULT_TARGET_DATE,
}) => {
  const [timeframe, setTimeframe] = useState<TimeframePreset>('full');

  const projectStartTime = useMemo(
    () => new Date(startDateStr || DEFAULT_START_DATE).getTime(),
    [startDateStr]
  );
  const projectEndTime = useMemo(
    () => new Date(targetDateStr || DEFAULT_TARGET_DATE).getTime(),
    [targetDateStr]
  );

  // Chronologically sorted records
  const sortedRecords = useMemo(() => {
    return [...syncHistory].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [syncHistory]);

  const latestRecord = sortedRecords.length > 0 ? sortedRecords[sortedRecords.length - 1] : null;
  const currentRealElo = latestRecord ? latestRecord.bestRating : startElo;
  const currentBestMode = latestRecord ? latestRecord.bestMode : 'blitz';

  // Strict 1 point per day aggregation (Latest sync of each calendar day)
  const chartData = useMemo(() => {
    const dailyMap = new Map<string, { timestamp: number; realElo: number; mode: string }>();

    // Initial base point on project start date
    const startD = new Date(projectStartTime);
    const startKey = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-${String(startD.getDate()).padStart(2, '0')}`;
    dailyMap.set(startKey, {
      timestamp: projectStartTime,
      realElo: startElo,
      mode: 'Base départ',
    });

    // Populate daily records (last sync of each day wins)
    sortedRecords.forEach((record) => {
      const d = new Date(record.timestamp);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dailyMap.set(dayKey, {
        timestamp: d.getTime(),
        realElo: record.bestRating,
        mode: record.bestMode,
      });
    });

    // Determine window start and end depending on timeframe
    const now = Date.now();
    let windowStart = projectStartTime;
    let windowEnd = projectEndTime;

    if (timeframe === '30days') {
      windowStart = Math.max(projectStartTime, now - 30 * 86400000);
      windowEnd = Math.min(projectEndTime, now + 5 * 86400000);
    } else if (timeframe === '6months') {
      windowStart = Math.max(projectStartTime, now - 180 * 86400000);
      windowEnd = Math.min(projectEndTime, now + 15 * 86400000);
    } else if (timeframe === '1year') {
      windowStart = Math.max(projectStartTime, now - 365 * 86400000);
      windowEnd = Math.min(projectEndTime, now + 30 * 86400000);
    }

    // Build timeline points: include real daily points + regular trajectory checkpoints
    const points: ChartPoint[] = [];
    const stepDays = timeframe === '30days' ? 1 : timeframe === '6months' ? 5 : 14;
    const stepMs = stepDays * 86400000;

    // Collect all real points inside or near window
    const realDatesList = Array.from(dailyMap.entries()).map(([dayKey, val]) => ({
      dayKey,
      ...val,
    }));

    // Merge real points and trajectory samples
    const timestampsSet = new Set<number>();

    // 1. Add all real points within range
    realDatesList.forEach((rp) => {
      if (rp.timestamp >= windowStart - 86400000 && rp.timestamp <= windowEnd + 86400000) {
        timestampsSet.add(rp.timestamp);
      }
    });

    // 2. Add regular checkpoint timestamps for the linear target curve
    for (let t = windowStart; t <= windowEnd; t += stepMs) {
      timestampsSet.add(t);
    }
    timestampsSet.add(windowEnd);

    // Sort all timestamps
    const sortedTimestamps = Array.from(timestampsSet).sort((a, b) => a - b);

    // Build final points array
    sortedTimestamps.forEach((t) => {
      const d = new Date(t);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const targetAtDate = Math.round(
        calculateLinearElo(t, startDateStr, targetDateStr, startElo, targetElo)
      );

      const realInfo = dailyMap.get(dayKey);
      const isReal = realInfo !== undefined;

      const dateLabel = d.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: timeframe === '30days' ? 'numeric' : 'short',
      });

      points.push({
        dayKey,
        dateLabel,
        timestamp: t,
        realElo: isReal ? realInfo.realElo : null,
        targetElo: targetAtDate,
        mode: realInfo?.mode,
        isRealPoint: isReal,
      });
    });

    return points;
  }, [
    sortedRecords,
    projectStartTime,
    projectEndTime,
    startElo,
    targetElo,
    startDateStr,
    targetDateStr,
    timeframe,
  ]);

  // Target for today
  const targetToday = Math.round(
    calculateLinearElo(Date.now(), startDateStr, targetDateStr, startElo, targetElo)
  );
  const diffVsTarget = currentRealElo - targetToday;
  const deltaFromStart = currentRealElo - startElo;

  // Custom Tooltip component for Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const pt = payload[0]?.payload as ChartPoint;
    const realVal = payload.find((p: any) => p.dataKey === 'realElo')?.value;
    const targetVal = payload.find((p: any) => p.dataKey === 'targetElo')?.value;
    const diff = realVal !== undefined && realVal !== null ? realVal - targetVal : null;

    const fullDate = new Date(pt.timestamp).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    return (
      <div className="rounded-2xl border border-neutral-700 bg-[#0d1117] p-4 text-xs shadow-2xl space-y-2 backdrop-blur-md">
        <div className="font-bold text-white capitalize border-b border-neutral-800 pb-1.5 flex items-center justify-between gap-4">
          <span>{fullDate}</span>
          {pt.mode && (
            <span className="text-[10px] font-mono text-amber-400 uppercase bg-amber-500/10 px-2 py-0.5 rounded">
              {pt.mode}
            </span>
          )}
        </div>

        <div className="space-y-1.5 font-mono">
          <div className="flex items-center justify-between gap-4">
            <span className="text-neutral-400 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-white" />
              <span>Cible Théorique :</span>
            </span>
            <span className="font-bold text-white">{targetVal} Elo</span>
          </div>

          {realVal !== undefined && realVal !== null && (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className="text-neutral-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#facc15]" />
                  <span>Votre Classement :</span>
                </span>
                <span className="font-bold text-[#facc15]">{realVal} Elo</span>
              </div>

              <div className="flex items-center justify-between gap-4 pt-1 border-t border-neutral-800">
                <span className="text-neutral-400">Écart à la cible :</span>
                <span
                  className={`font-bold ${
                    diff !== null && diff >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'
                  }`}
                >
                  {diff !== null && diff >= 0 ? `+${diff} pts (En Avance)` : `${diff} pts (Retard)`}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Header with Recharts / Open-Source Badge & Color Indicator */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-[#0d1117] border border-neutral-800 p-5 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Compass className="h-5 w-5 text-[#facc15]" />
              <span>Graphique Officiel Recharts (GitHub Open-Source)</span>
            </h2>
            <span className="text-[10px] font-mono bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full border border-neutral-700">
              1 point / jour max
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Visualisation précise du classement réel face à la courbe théorique vers 2000 Elo.
          </p>
        </div>

        {/* Tactical Quick Status Chips (Noir/Blanc, Vert, Rouge, Jaune) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-mono">
            <span className="text-neutral-400">Actuel :</span>
            <span className="font-bold text-[#facc15]">{currentRealElo} Elo</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-mono">
            <span className="text-neutral-400">Cible :</span>
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
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-neutral-400 mr-2 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-[#facc15]" />
            <span>Échelle :</span>
          </span>
          {[
            { id: 'full', label: 'Tout le projet' },
            { id: '1year', label: '1 An' },
            { id: '6months', label: '6 Mois' },
            { id: '30days', label: '30 Jours' },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setTimeframe(btn.id as TimeframePreset)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                timeframe === btn.id
                  ? 'bg-[#facc15] text-black shadow-md'
                  : 'bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Legend pills (Noir, Blanc, Jaune, Vert) */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#facc15]" />
            <span className="text-[#facc15] font-bold">Réel (1 pt / jour)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-4 border-b-2 border-dashed border-white" />
            <span className="text-white">Cible 1500 → 2000</span>
          </div>
        </div>
      </div>

      {/* 3. Recharts LineChart Component (Installed from GitHub, responsive, no wheel scroll capture) */}
      <div className="rounded-3xl border border-neutral-800 bg-[#0c0f14] p-4 sm:p-6 shadow-2xl">
        <div className="h-[420px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 10, bottom: 25 }}
            >
              {/* Subtle dark Cartesian Grid */}
              <CartesianGrid stroke="#1e2633" strokeDasharray="3 3" vertical={false} />

              {/* X Axis (Dates) */}
              <XAxis
                dataKey="dateLabel"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={{ stroke: '#334155' }}
                dy={10}
              />

              {/* Y Axis (Elo Ratings: 1400 to 2100) */}
              <YAxis
                domain={[1400, 2100]}
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={{ stroke: '#334155' }}
                ticks={[1500, 1600, 1700, 1800, 1900, 2000]}
                dx={-5}
              />

              {/* Reference Lines for Departure 1500 and Target 2000 */}
              <ReferenceLine
                y={1500}
                stroke="#ffffff"
                strokeDasharray="4 4"
                strokeOpacity={0.4}
                label={{
                  value: 'Départ 1500',
                  fill: '#ffffff',
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />
              <ReferenceLine
                y={2000}
                stroke="#facc15"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{
                  value: 'Objectif 2000 Elo 🏆',
                  fill: '#facc15',
                  fontSize: 11,
                  fontWeight: 'bold',
                  position: 'insideTopLeft',
                }}
              />

              {/* Recharts Custom Tooltip */}
              <Tooltip content={<CustomTooltip />} />

              {/* Target Elo Line (Dashed White) */}
              <Line
                type="monotone"
                dataKey="targetElo"
                name="Cible Théorique"
                stroke="#e2e8f0"
                strokeWidth={1.8}
                strokeDasharray="5 5"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />

              {/* Real Elo Line (Vivid Yellow #facc15, connectNulls for continuity between synced days) */}
              <Line
                type="monotone"
                dataKey="realElo"
                name="Votre Elo Réel"
                stroke="#facc15"
                strokeWidth={3}
                connectNulls={true}
                /* Points pas trop gros: radius 3px discret et élégant */
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (!payload.isRealPoint || cx === undefined || cy === undefined) return null;
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
                      <span className="font-mono text-[10px] text-neutral-500">{m.pct}</span>
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
