/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { BarChart2, Calendar, Filter, Info, Shield, Target } from 'lucide-react';
import { GameMode, SyncRecord } from '../types/chess';
import { calculateLinearElo, DEFAULT_START_DATE, DEFAULT_TARGET_DATE } from '../utils/eloEngine';

type TimeFilter = '7d' | '30d' | '90d' | '180d' | 'all';
type MetricFilter = 'best' | 'bullet' | 'blitz' | 'rapid' | 'all_modes';

interface HistoryChartProps {
  syncHistory: SyncRecord[];
  startElo: number;
  targetElo: number;
  startDateStr: string;
  targetDateStr: string;
}

export const HistoryChart: React.FC<HistoryChartProps> = ({
  syncHistory,
  startElo,
  targetElo,
  startDateStr,
  targetDateStr,
}) => {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [metricFilter, setMetricFilter] = useState<MetricFilter>('best');
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    date: string;
    elo: number;
    theoretical: number;
    diff: number;
    mode: string;
  } | null>(null);

  // Filter history records based on selected timeframe
  const filteredHistory = useMemo(() => {
    if (syncHistory.length === 0) return [];

    const now = new Date().getTime();
    let cutoff = 0;
    if (timeFilter === '7d') cutoff = now - 7 * 24 * 3600 * 1000;
    else if (timeFilter === '30d') cutoff = now - 30 * 24 * 3600 * 1000;
    else if (timeFilter === '90d') cutoff = now - 90 * 24 * 3600 * 1000;
    else if (timeFilter === '180d') cutoff = now - 180 * 24 * 3600 * 1000;

    // Sort ascending for chronological chart
    return syncHistory
      .filter((r) => new Date(r.timestamp).getTime() >= cutoff)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [syncHistory, timeFilter]);

  // Compute gain/loss stats
  const performanceStats = useMemo(() => {
    if (filteredHistory.length < 1) {
      return { delta: 0, min: startElo, max: startElo, count: 0 };
    }
    const firstElo = filteredHistory[0].bestRating;
    const lastElo = filteredHistory[filteredHistory.length - 1].bestRating;
    const elos = filteredHistory.map((h) => h.bestRating);
    return {
      delta: lastElo - firstElo,
      min: Math.min(...elos),
      max: Math.max(...elos),
      count: filteredHistory.length,
    };
  }, [filteredHistory, startElo]);

  // Chart Dimensions & Scales
  const width = 860;
  const height = 360;
  const padding = { top: 30, right: 30, bottom: 45, left: 55 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Determine time domain and Elo domain
  const { startTime, endTime, minElo, maxElo } = useMemo(() => {
    const startProj = new Date(startDateStr || DEFAULT_START_DATE).getTime();
    const endProj = new Date(targetDateStr || DEFAULT_TARGET_DATE).getTime();

    let sTime = startProj;
    let eTime = endProj;

    if (timeFilter !== 'all' && filteredHistory.length > 0) {
      sTime = Math.min(new Date(filteredHistory[0].timestamp).getTime(), startProj);
      eTime = Math.max(new Date(filteredHistory[filteredHistory.length - 1].timestamp).getTime(), sTime + 7 * 86400000);
    }

    const recordedElos: number[] = [];
    filteredHistory.forEach((r) => {
      if (r.bestRating) recordedElos.push(r.bestRating);
      if (r.bullet) recordedElos.push(r.bullet);
      if (r.blitz) recordedElos.push(r.blitz);
      if (r.rapid) recordedElos.push(r.rapid);
    });

    const lowest = recordedElos.length ? Math.min(startElo, ...recordedElos) : startElo;
    const highest = recordedElos.length ? Math.max(targetElo, ...recordedElos) : targetElo;

    return {
      startTime: sTime,
      endTime: eTime,
      minElo: Math.floor((lowest - 50) / 50) * 50,
      maxElo: Math.ceil((highest + 50) / 50) * 50,
    };
  }, [startDateStr, targetDateStr, timeFilter, filteredHistory, startElo, targetElo]);

  const getX = (timestamp: number) => {
    const ratio = Math.max(0, Math.min(1, (timestamp - startTime) / (endTime - startTime || 1)));
    return padding.left + ratio * innerWidth;
  };

  const getY = (elo: number) => {
    const ratio = (elo - minElo) / (maxElo - minElo || 1);
    return padding.top + innerHeight - ratio * innerHeight;
  };

  // Theoretical trajectory points (20 sampled points across timeline)
  const trajectoryPath = useMemo(() => {
    const steps = 30;
    const points: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = startTime + (i / steps) * (endTime - startTime);
      const theoretical = calculateLinearElo(t, startDateStr, targetDateStr, startElo, targetElo);
      const x = getX(t);
      const y = getY(theoretical);
      points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return points.join(' ');
  }, [startTime, endTime, startDateStr, targetDateStr, startElo, targetElo, minElo, maxElo]);

  // Real data lines helper
  const getLineForProperty = (prop: 'bestRating' | 'bullet' | 'blitz' | 'rapid') => {
    const valid = filteredHistory.filter((r) => r[prop] !== null && typeof r[prop] === 'number');
    if (valid.length === 0) return '';
    return valid
      .map((r, i) => {
        const x = getX(new Date(r.timestamp).getTime());
        const y = getY(r[prop] as number);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const bestLinePath = useMemo(() => getLineForProperty('bestRating'), [filteredHistory, startTime, endTime, minElo, maxElo]);
  const bulletLinePath = useMemo(() => getLineForProperty('bullet'), [filteredHistory, startTime, endTime, minElo, maxElo]);
  const blitzLinePath = useMemo(() => getLineForProperty('blitz'), [filteredHistory, startTime, endTime, minElo, maxElo]);
  const rapidLinePath = useMemo(() => getLineForProperty('rapid'), [filteredHistory, startTime, endTime, minElo, maxElo]);

  // Y-axis grid ticks
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = (maxElo - minElo) > 600 ? 100 : 50;
    for (let e = minElo; e <= maxElo; e += step) {
      ticks.push(e);
    }
    return ticks;
  }, [minElo, maxElo]);

  // X-axis date ticks
  const xTicks = useMemo(() => {
    const ticks: { time: number; label: string }[] = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      const t = startTime + (i / (count - 1)) * (endTime - startTime);
      const d = new Date(t);
      const label = d.toLocaleDateString('fr-FR', {
        month: 'short',
        year: '2-digit',
      });
      ticks.push({ time: t, label });
    }
    return ticks;
  }, [startTime, endTime]);

  return (
    <div className="space-y-6">
      {/* Header with Title and Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-100 dark:text-neutral-100 light:text-neutral-900 flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-amber-400" />
            <span>Évolution & Courbes De Progression Elo</span>
          </h2>
          <p className="text-xs text-neutral-400">
            Comparaison rigoureuse entre la trajectoire théorique et les relevés réels de l'API Chess.com
          </p>
        </div>

        {/* Filters Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Cadence filter */}
          <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-900 p-1 dark:border-neutral-800 dark:bg-neutral-900 light:border-neutral-300 light:bg-neutral-100">
            <button
              onClick={() => setMetricFilter('best')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors whitespace-nowrap ${
                metricFilter === 'best'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Meilleur
            </button>
            <button
              onClick={() => setMetricFilter('bullet')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors whitespace-nowrap ${
                metricFilter === 'bullet'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Bullet
            </button>
            <button
              onClick={() => setMetricFilter('blitz')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors whitespace-nowrap ${
                metricFilter === 'blitz'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Blitz
            </button>
            <button
              onClick={() => setMetricFilter('rapid')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors whitespace-nowrap ${
                metricFilter === 'rapid'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Rapide
            </button>
            <button
              onClick={() => setMetricFilter('all_modes')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors whitespace-nowrap ${
                metricFilter === 'all_modes'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Tous
            </button>
          </div>

          {/* Timeframe filter */}
          <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-900 p-1 dark:border-neutral-800 dark:bg-neutral-900 light:border-neutral-300 light:bg-neutral-100">
            <button
              onClick={() => setTimeFilter('7d')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors whitespace-nowrap ${
                timeFilter === '7d' ? 'bg-neutral-800 text-white font-semibold' : 'text-neutral-400 hover:text-white'
              }`}
            >
              7j
            </button>
            <button
              onClick={() => setTimeFilter('30d')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors whitespace-nowrap ${
                timeFilter === '30d' ? 'bg-neutral-800 text-white font-semibold' : 'text-neutral-400 hover:text-white'
              }`}
            >
              30j
            </button>
            <button
              onClick={() => setTimeFilter('90d')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors whitespace-nowrap ${
                timeFilter === '90d' ? 'bg-neutral-800 text-white font-semibold' : 'text-neutral-400 hover:text-white'
              }`}
            >
              3m
            </button>
            <button
              onClick={() => setTimeFilter('180d')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors whitespace-nowrap ${
                timeFilter === '180d' ? 'bg-neutral-800 text-white font-semibold' : 'text-neutral-400 hover:text-white'
              }`}
            >
              6m
            </button>
            <button
              onClick={() => setTimeFilter('all')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors whitespace-nowrap ${
                timeFilter === 'all' ? 'bg-neutral-800 text-white font-semibold' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Tout
            </button>
          </div>
        </div>
      </div>

      {/* Main Chart Container */}
      <div className="relative rounded-2xl border border-neutral-800 bg-neutral-900/90 p-5 shadow-xl backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/90 light:border-neutral-200 light:bg-white">
        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800/80 pb-4 text-xs dark:border-neutral-800/80 light:border-neutral-200">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-5 bg-neutral-400 border-b border-dashed border-neutral-400" />
              <span className="text-neutral-400">Trajectoire théorique (2000 Elo)</span>
            </div>

            {(metricFilter === 'best' || metricFilter === 'all_modes') && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                <span className="font-semibold text-amber-300">Meilleur Elo Réel</span>
              </div>
            )}

            {(metricFilter === 'bullet' || metricFilter === 'all_modes') && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                <span className="text-cyan-300">Bullet</span>
              </div>
            )}

            {(metricFilter === 'blitz' || metricFilter === 'all_modes') && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange-400" />
                <span className="text-orange-300">Blitz</span>
              </div>
            )}

            {(metricFilter === 'rapid' || metricFilter === 'all_modes') && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-emerald-300">Rapide</span>
              </div>
            )}
          </div>

          <div className="text-neutral-400 font-mono text-[11px]">
            {filteredHistory.length} synchronisation{filteredHistory.length > 1 ? 's' : ''} enregistrée{filteredHistory.length > 1 ? 's' : ''}
          </div>
        </div>

        {/* SVG Viewport */}
        <div className="relative mt-4 w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto select-none overflow-visible"
          >
            {/* Horizontal Grid lines */}
            {yTicks.map((tick) => {
              const y = getY(tick);
              const isTarget = tick === targetElo;
              const isStart = tick === startElo;
              return (
                <g key={tick}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={width - padding.right}
                    y2={y}
                    stroke={
                      isTarget
                        ? 'rgba(245, 158, 11, 0.4)'
                        : isStart
                        ? 'rgba(255, 255, 255, 0.2)'
                        : 'rgba(255, 255, 255, 0.06)'
                    }
                    strokeDasharray={isTarget || isStart ? '4 3' : undefined}
                    strokeWidth={isTarget ? 1.5 : 1}
                  />
                  <text
                    x={padding.left - 10}
                    y={y + 4}
                    textAnchor="end"
                    className={`font-mono text-[10px] ${
                      isTarget
                        ? 'fill-amber-400 font-bold'
                        : isStart
                        ? 'fill-neutral-300'
                        : 'fill-neutral-500'
                    }`}
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Vertical Time Grid lines */}
            {xTicks.map((tick, i) => {
              const x = getX(tick.time);
              return (
                <g key={i}>
                  <line
                    x1={x}
                    y1={padding.top}
                    x2={x}
                    y2={height - padding.bottom}
                    stroke="rgba(255, 255, 255, 0.05)"
                  />
                  <text
                    x={x}
                    y={height - padding.bottom + 20}
                    textAnchor="middle"
                    className="font-mono text-[10px] fill-neutral-400 capitalize"
                  >
                    {tick.label}
                  </text>
                </g>
              );
            })}

            {/* Theoretical Trajectory Line */}
            <path
              d={trajectoryPath}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="2"
              strokeDasharray="6 4"
              opacity="0.45"
            />

            {/* Mode Lines */}
            {metricFilter === 'all_modes' && (
              <>
                {bulletLinePath && (
                  <path d={bulletLinePath} fill="none" stroke="#22d3ee" strokeWidth="2" opacity="0.8" />
                )}
                {blitzLinePath && (
                  <path d={blitzLinePath} fill="none" stroke="#fb923c" strokeWidth="2" opacity="0.8" />
                )}
                {rapidLinePath && (
                  <path d={rapidLinePath} fill="none" stroke="#34d399" strokeWidth="2" opacity="0.8" />
                )}
              </>
            )}

            {metricFilter === 'bullet' && bulletLinePath && (
              <path d={bulletLinePath} fill="none" stroke="#22d3ee" strokeWidth="2.5" />
            )}
            {metricFilter === 'blitz' && blitzLinePath && (
              <path d={blitzLinePath} fill="none" stroke="#fb923c" strokeWidth="2.5" />
            )}
            {metricFilter === 'rapid' && rapidLinePath && (
              <path d={rapidLinePath} fill="none" stroke="#34d399" strokeWidth="2.5" />
            )}

            {/* Best Elo Solid Curve */}
            {(metricFilter === 'best' || metricFilter === 'all_modes') && bestLinePath && (
              <path
                d={bestLinePath}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="3"
                className="drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
              />
            )}

            {/* Real Recorded Data Points (Circles with hover handlers) */}
            {filteredHistory.map((record) => {
              const t = new Date(record.timestamp).getTime();
              const x = getX(t);
              const theoretical = calculateLinearElo(t, startDateStr, targetDateStr, startElo, targetElo);

              let ratingToDisplay = record.bestRating;
              let modeName = record.bestMode;

              if (metricFilter === 'bullet' && record.bullet) {
                ratingToDisplay = record.bullet;
                modeName = 'bullet' as GameMode;
              } else if (metricFilter === 'blitz' && record.blitz) {
                ratingToDisplay = record.blitz;
                modeName = 'blitz' as GameMode;
              } else if (metricFilter === 'rapid' && record.rapid) {
                ratingToDisplay = record.rapid;
                modeName = 'rapid' as GameMode;
              }

              const y = getY(ratingToDisplay);
              const diff = ratingToDisplay - theoretical;

              return (
                <g key={record.id} className="cursor-pointer">
                  {/* Invisible hit circle for easy touch/mouse hover */}
                  <circle
                    cx={x}
                    cy={y}
                    r="12"
                    fill="transparent"
                    onMouseEnter={() =>
                      setHoveredPoint({
                        x,
                        y,
                        date: new Date(record.timestamp).toLocaleString('fr-FR'),
                        elo: ratingToDisplay,
                        theoretical,
                        diff: Math.round(diff * 10) / 10,
                        mode: modeName,
                      })
                    }
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                  {/* Visible point */}
                  <circle
                    cx={x}
                    cy={y}
                    r="4.5"
                    fill="#0a0a0a"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                  />
                </g>
              );
            })}

            {/* Tooltip on SVG hover */}
            {hoveredPoint && (
              <g pointerEvents="none">
                <line
                  x1={hoveredPoint.x}
                  y1={padding.top}
                  x2={hoveredPoint.x}
                  y2={height - padding.bottom}
                  stroke="rgba(245, 158, 11, 0.4)"
                  strokeDasharray="3 3"
                />
                <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="6" fill="#f59e0b" />
              </g>
            )}
          </svg>

          {/* HTML Overlay Tooltip */}
          {hoveredPoint && (
            <div
              className="absolute pointer-events-none rounded-lg border border-amber-500/40 bg-neutral-950/95 p-2.5 text-xs shadow-2xl backdrop-blur-md z-30 transition-all font-sans"
              style={{
                left: `${Math.min(hoveredPoint.x + 12, innerWidth - 80)}px`,
                top: `${Math.max(10, hoveredPoint.y - 65)}px`,
              }}
            >
              <div className="font-semibold text-neutral-200 border-b border-neutral-800 pb-1 mb-1">
                {hoveredPoint.date}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">Elo réel ({hoveredPoint.mode}):</span>
                <span className="font-mono font-bold text-amber-400">{hoveredPoint.elo}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">Cible théorique :</span>
                <span className="font-mono text-neutral-300">{hoveredPoint.theoretical}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">Écart :</span>
                <span
                  className={`font-mono font-semibold ${
                    hoveredPoint.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {hoveredPoint.diff > 0 ? `+${hoveredPoint.diff}` : hoveredPoint.diff} pts
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Empty state / Notice */}
        {filteredHistory.length === 0 && (
          <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-6 text-center text-xs text-neutral-400">
            <Info className="mx-auto h-6 w-6 text-amber-400 mb-2" />
            <p className="font-semibold text-neutral-200">Aucun point enregistré pour ce filtre temporel.</p>
            <p className="mt-1">
              Effectuez une synchronisation avec Chess.com pour enregistrer les points réels sur la courbe.
            </p>
          </div>
        )}
      </div>

      {/* Analytical Callout Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
          <span className="text-neutral-400 uppercase tracking-wider text-[11px] font-semibold">
            Point de départ
          </span>
          <div className="mt-1 font-mono text-xl font-bold text-neutral-200">
            1500 Elo
          </div>
          <p className="mt-1 text-neutral-500 text-[11px]">
            Fixé au 31 octobre 2026, indépendant des fluctuations
          </p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
          <span className="text-neutral-400 uppercase tracking-wider text-[11px] font-semibold">
            Objectif d'arrivée
          </span>
          <div className="mt-1 font-mono text-xl font-bold text-amber-400">
            2000 Elo
          </div>
          <p className="mt-1 text-neutral-500 text-[11px]">
            Au 31 décembre 2027 à 23h59 (Europe/Paris)
          </p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
          <span className="text-neutral-400 uppercase tracking-wider text-[11px] font-semibold">
            Total Points à Gagner
          </span>
          <div className="mt-1 font-mono text-xl font-bold text-neutral-100">
            +500 Elo
          </div>
          <p className="mt-1 text-neutral-500 text-[11px]">
            Trajectoire progressive sur 14 mois de compétition
          </p>
        </div>
      </div>
    </div>
  );
};
