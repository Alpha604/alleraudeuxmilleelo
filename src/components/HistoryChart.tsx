/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useMemo, useRef, useState } from 'react';
import { Target, Trophy } from 'lucide-react';
import { SyncRecord } from '../types/chess';
import { calculateLinearElo, DEFAULT_START_DATE, DEFAULT_TARGET_DATE } from '../utils/eloEngine';

interface HistoryChartProps {
  syncHistory: SyncRecord[];
  startElo: number;
  targetElo: number;
  startDateStr: string;
  targetDateStr: string;
}

export const HistoryChart: React.FC<HistoryChartProps> = ({
  syncHistory,
  startElo = 1500,
  targetElo = 2000,
  startDateStr = DEFAULT_START_DATE,
  targetDateStr = DEFAULT_TARGET_DATE,
}) => {
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverData, setHoverData] = useState<{
    x: number;
    yReal: number;
    yTarget: number;
    dateFormatted: string;
    targetElo: number;
    realElo: number | null;
    diff: number | null;
  } | null>(null);

  // Time boundaries: fixed across the entire project duration (31 Oct 2026 → 31 Dec 2027)
  const startTime = useMemo(() => new Date(startDateStr || DEFAULT_START_DATE).getTime(), [startDateStr]);
  const endTime = useMemo(() => new Date(targetDateStr || DEFAULT_TARGET_DATE).getTime(), [targetDateStr]);

  // Chronologically sorted real sync records
  const sortedRecords = useMemo(() => {
    return [...syncHistory].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [syncHistory]);

  // Current real rating (latest sync, or startElo if no sync yet)
  const latestSync = sortedRecords.length > 0 ? sortedRecords[sortedRecords.length - 1] : null;
  const currentRealElo = latestSync ? latestSync.bestRating : startElo;
  const currentBestMode = latestSync ? latestSync.bestMode : 'blitz';

  // Build the continuous progression points starting at project baseline (31 Oct 2026 : 1500)
  const realPointsData = useMemo(() => {
    const list: { t: number; elo: number; label: string }[] = [
      {
        t: startTime,
        elo: startElo,
        label: 'Départ officiel (1500 Elo)',
      },
    ];

    sortedRecords.forEach((record) => {
      const t = new Date(record.timestamp).getTime();
      // Ensure points fall within project bounds
      if (t > startTime && t <= endTime) {
        list.push({
          t,
          elo: record.bestRating,
          label: `${record.bestRating} Elo (${record.bestMode})`,
        });
      }
    });

    // If currently after start date and no recent point today, connect to latest known
    const now = Date.now();
    if (list.length === 1 && now > startTime) {
      list.push({
        t: Math.min(now, endTime),
        elo: currentRealElo,
        label: `${currentRealElo} Elo (${currentBestMode})`,
      });
    }

    return list;
  }, [startTime, endTime, startElo, sortedRecords, currentRealElo, currentBestMode]);

  // Chart Dimensions & Scales
  const width = 900;
  const height = 380;
  const padding = { top: 30, right: 40, bottom: 45, left: 55 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Fixed Elo axis from 1450 to 2050 for clear perspective
  const minElo = 1450;
  const maxElo = 2050;

  const getX = (t: number) => {
    const ratio = Math.max(0, Math.min(1, (t - startTime) / (endTime - startTime || 1)));
    return padding.left + ratio * innerWidth;
  };

  const getY = (elo: number) => {
    const ratio = Math.max(0, Math.min(1, (elo - minElo) / (maxElo - minElo || 1)));
    return padding.top + innerHeight - ratio * innerHeight;
  };

  // 1. Line 1: Target Objective Line across time (Start to Finish)
  const targetLine = useMemo(() => {
    const x1 = getX(startTime);
    const y1 = getY(startElo);
    const x2 = getX(endTime);
    const y2 = getY(targetElo);
    return { x1, y1, x2, y2 };
  }, [startTime, endTime, startElo, targetElo]);

  // 2. Line 2: Real Progress Line (Clean polyline with rounded joints)
  const realLinePoints = useMemo(() => {
    return realPointsData.map((pt) => ({
      x: getX(pt.t),
      y: getY(pt.elo),
      t: pt.t,
      elo: pt.elo,
    }));
  }, [realPointsData]);

  const realLinePath = useMemo(() => {
    if (realLinePoints.length < 2) return '';
    return realLinePoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
  }, [realLinePoints]);

  // Subtle gold area fill under the real curve
  const realAreaPath = useMemo(() => {
    if (realLinePoints.length < 2) return '';
    const first = realLinePoints[0];
    const last = realLinePoints[realLinePoints.length - 1];
    const baseY = getY(minElo);
    const line = realLinePoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
    return `${line} L ${last.x.toFixed(1)},${baseY} L ${first.x.toFixed(1)},${baseY} Z`;
  }, [realLinePoints, minElo]);

  // Horizontal Grid Levels (1500, 1600, 1700, 1800, 1900, 2000)
  const yTicks = [1500, 1600, 1700, 1800, 1900, 2000];

  // X Axis Date Ticks across the 14 months
  const xTicks = useMemo(() => {
    return [
      { t: new Date('2026-10-31').getTime(), label: '31 oct. 2026' },
      { t: new Date('2027-01-31').getTime(), label: 'Janv. 2027' },
      { t: new Date('2027-04-30').getTime(), label: 'Avr. 2027' },
      { t: new Date('2027-07-31').getTime(), label: 'Juil. 2027' },
      { t: new Date('2027-10-31').getTime(), label: 'Oct. 2027' },
      { t: new Date('2027-12-31').getTime(), label: '31 déc. 2027' },
    ];
  }, []);

  // Pointer hover calculation
  const handlePointer = (clientX: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = (clientX - rect.left) * (width / rect.width);
    const boundedX = Math.max(padding.left, Math.min(width - padding.right, svgX));

    const ratio = (boundedX - padding.left) / innerWidth;
    const t = startTime + ratio * (endTime - startTime);

    // Theoretical Elo on this date
    const targetAtDate = Math.round(calculateLinearElo(t, startDateStr, targetDateStr, startElo, targetElo));
    const yTarget = getY(targetAtDate);

    // Nearest real record if close
    let realAtDate: number | null = null;
    let yReal = yTarget;

    // Find if within real recorded range
    const lastRealT = realLinePoints[realLinePoints.length - 1].t;
    if (t <= lastRealT + 86400000 * 2) {
      // Find interpolation or closest real point
      for (let i = 0; i < realLinePoints.length - 1; i++) {
        const p1 = realLinePoints[i];
        const p2 = realLinePoints[i + 1];
        if (t >= p1.t && t <= p2.t) {
          const r = (t - p1.t) / (p2.t - p1.t || 1);
          realAtDate = Math.round(p1.elo + r * (p2.elo - p1.elo));
          yReal = getY(realAtDate);
          break;
        }
      }
      if (realAtDate === null && realLinePoints.length > 0) {
        realAtDate = currentRealElo;
        yReal = getY(currentRealElo);
      }
    }

    const diff = realAtDate !== null ? realAtDate - targetAtDate : null;

    setHoverData({
      x: boundedX,
      yReal,
      yTarget,
      dateFormatted: new Date(t).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      targetElo: targetAtDate,
      realElo: realAtDate,
      diff,
    });
  };

  // Theoretical Elo today for quick reference
  const todayTarget = Math.round(calculateLinearElo(Date.now(), startDateStr, targetDateStr, startElo, targetElo));
  const diffToday = currentRealElo - todayTarget;
  const daysRemaining = Math.max(0, Math.ceil((endTime - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="space-y-6">
      {/* Quiet, Luxury Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-neutral-800/80 pb-5">
        <div>
          <span className="text-xs uppercase tracking-widest font-semibold text-neutral-400">
            Trajectoire Vers 2000 Elo
          </span>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-mono text-4xl sm:text-5xl font-extrabold text-neutral-100 tracking-tight tabular-nums">
              {currentRealElo}
            </span>
            <span className="text-sm font-semibold uppercase tracking-wider text-amber-400">
              {currentBestMode}
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              ({diffToday >= 0 ? `+${diffToday}` : diffToday} pts par rapport à la cible)
            </span>
          </div>
        </div>

        {/* Legend: Exactly the two lines requested */}
        <div className="flex items-center gap-6 text-xs text-neutral-400 font-medium">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 border-b-2 border-dashed border-neutral-400" />
            <span className="text-neutral-400">Objectif (1500 → 2000 Elo)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 bg-amber-400" />
            <span className="text-amber-300 font-semibold">Progression réelle</span>
          </div>
        </div>
      </div>

      {/* Pure, Minimalist Chart Canvas */}
      <div className="rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4 sm:p-6 shadow-xl backdrop-blur-sm">
        <div className="relative select-none">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto overflow-visible cursor-crosshair touch-none"
            onMouseMove={(e) => handlePointer(e.clientX)}
            onMouseLeave={() => setHoverData(null)}
            onTouchMove={(e) => {
              if (e.touches.length > 0) handlePointer(e.touches[0].clientX);
            }}
            onTouchEnd={() => setHoverData(null)}
          >
            <defs>
              <linearGradient id={`goldGrad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines */}
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
                        ? 'rgba(245, 158, 11, 0.35)'
                        : isStart
                        ? 'rgba(255, 255, 255, 0.15)'
                        : 'rgba(255, 255, 255, 0.05)'
                    }
                    strokeDasharray={isTarget || isStart ? '4 3' : undefined}
                    strokeWidth={isTarget ? 1.5 : 1}
                  />

                  {/* Left Elo Label */}
                  <text
                    x={padding.left - 12}
                    y={y + 4}
                    textAnchor="end"
                    className={`font-mono text-[11px] ${
                      isTarget
                        ? 'fill-amber-400 font-bold'
                        : isStart
                        ? 'fill-neutral-300 font-semibold'
                        : 'fill-neutral-500'
                    }`}
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Vertical Time Lines */}
            {xTicks.map((tick, i) => {
              const x = getX(tick.t);
              return (
                <g key={i}>
                  <line
                    x1={x}
                    y1={padding.top}
                    x2={x}
                    y2={height - padding.bottom}
                    stroke="rgba(255, 255, 255, 0.04)"
                  />
                  <text
                    x={x}
                    y={height - padding.bottom + 20}
                    textAnchor="middle"
                    className="font-mono text-[10px] fill-neutral-400"
                  >
                    {tick.label}
                  </text>
                </g>
              );
            })}

            {/* Subtle Area under Real Curve */}
            {realAreaPath && (
              <path d={realAreaPath} fill={`url(#goldGrad-${gradientId})`} />
            )}

            {/* 1. Target Objective Line (Start 1500 to End 2000) */}
            <line
              x1={targetLine.x1}
              y1={targetLine.y1}
              x2={targetLine.x2}
              y2={targetLine.y2}
              stroke="#a1a1aa"
              strokeWidth="2"
              strokeDasharray="6 5"
              opacity="0.65"
            />

            {/* 2. Real Progress Line */}
            {realLinePath && (
              <path
                d={realLinePath}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Real Points Dots */}
            {realLinePoints.map((pt, i) => {
              const isLast = i === realLinePoints.length - 1;
              return (
                <g key={i}>
                  {isLast && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="7"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                      opacity="0.5"
                    />
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isLast ? 4.5 : 3.5}
                    fill="#0e1015"
                    stroke="#f59e0b"
                    strokeWidth="2"
                  />
                </g>
              );
            })}

            {/* Native SVG Tooltip (Snaps smoothly on hover, zero bug, zero jump) */}
            {hoverData && (
              <g pointerEvents="none">
                {/* Hairline Crosshair */}
                <line
                  x1={hoverData.x}
                  y1={padding.top}
                  x2={hoverData.x}
                  y2={height - padding.bottom}
                  stroke="rgba(245, 158, 11, 0.45)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />

                {/* Target Point Indicator */}
                <circle
                  cx={hoverData.x}
                  cy={hoverData.yTarget}
                  r="4"
                  fill="#0e1015"
                  stroke="#a1a1aa"
                  strokeWidth="2"
                />

                {/* Real Point Indicator */}
                {hoverData.realElo !== null && (
                  <circle
                    cx={hoverData.x}
                    cy={hoverData.yReal}
                    r="4.5"
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                )}

                {/* Clean Floating Box */}
                <g
                  transform={`translate(${Math.max(
                    padding.left + 5,
                    Math.min(width - padding.right - 190, hoverData.x - 95)
                  )}, ${Math.max(padding.top + 5, Math.min(height - 120, hoverData.yTarget - 85))})`}
                >
                  <rect
                    x="0"
                    y="0"
                    width="190"
                    height="75"
                    rx="8"
                    fill="#14171d"
                    stroke="rgba(245, 158, 11, 0.35)"
                    strokeWidth="1"
                  />

                  {/* Date */}
                  <text x="12" y="18" fill="#e4e4e7" fontSize="10" fontWeight="bold">
                    {hoverData.dateFormatted}
                  </text>

                  {/* Objective Line */}
                  <text x="12" y="38" fill="#a1a1aa" fontSize="10">
                    Cible théorique :
                  </text>
                  <text x="178" y="38" fill="#e4e4e7" fontSize="11" fontWeight="bold" textAnchor="end" fontFamily="monospace">
                    {hoverData.targetElo} Elo
                  </text>

                  {/* Real Line if available */}
                  {hoverData.realElo !== null ? (
                    <>
                      <text x="12" y="54" fill="#a1a1aa" fontSize="10">
                        Votre classement :
                      </text>
                      <text x="178" y="54" fill="#f59e0b" fontSize="11" fontWeight="bold" textAnchor="end" fontFamily="monospace">
                        {hoverData.realElo} Elo
                      </text>

                      <text x="12" y="68" fill="#a1a1aa" fontSize="9">
                        Écart :
                      </text>
                      <text
                        x="178"
                        y="68"
                        fill={hoverData.diff !== null && hoverData.diff >= 0 ? '#34d399' : '#f87171'}
                        fontSize="9"
                        fontWeight="bold"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        {hoverData.diff !== null && hoverData.diff > 0 ? `+${hoverData.diff}` : hoverData.diff} pts
                      </text>
                    </>
                  ) : (
                    <text x="12" y="56" fill="#71717a" fontSize="10" fontStyle="italic">
                      Progression future
                    </text>
                  )}
                </g>
              </g>
            )}
          </svg>
        </div>

        {/* Quiet Subtitle Details */}
        <div className="mt-4 pt-3 border-t border-neutral-800/60 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-300">Base du projet :</span>
            <span className="font-mono">1500 Elo le 31/10/2026</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-300">Objectif final :</span>
            <span className="font-mono text-amber-400 font-semibold">2000 Elo le 31/12/2027</span>
            <span className="text-neutral-500 font-mono">({daysRemaining} jours restants)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
