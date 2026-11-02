/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Compass,
  Info,
  Maximize2,
  MousePointer,
  Move,
  RotateCcw,
  Sparkles,
  Target,
  ZoomIn,
  ZoomOut,
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

export const HistoryChart: React.FC<HistoryChartProps> = ({
  syncHistory,
  startElo = 1500,
  targetElo = 2000,
  startDateStr = DEFAULT_START_DATE,
  targetDateStr = DEFAULT_TARGET_DATE,
}) => {
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Absolute Project Boundaries
  const defaultStartTime = useMemo(() => new Date(startDateStr || DEFAULT_START_DATE).getTime(), [startDateStr]);
  const defaultEndTime = useMemo(() => new Date(targetDateStr || DEFAULT_TARGET_DATE).getTime(), [targetDateStr]);
  const defaultMinElo = 1450;
  const defaultMaxElo = 2050;

  // Viewport Zoom & Pan State
  const [viewTime, setViewTime] = useState<{ start: number; end: number }>({
    start: defaultStartTime,
    end: defaultEndTime,
  });

  const [viewElo, setViewElo] = useState<{ min: number; max: number }>({
    min: defaultMinElo,
    max: defaultMaxElo,
  });

  // Drag / Pan State (Supports Right Click drag OR Left Click drag)
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startTime: number;
    endTime: number;
    minElo: number;
    maxElo: number;
  } | null>(null);

  // Active hover data for tooltip
  const [hoverData, setHoverData] = useState<{
    x: number;
    yReal: number;
    yTarget: number;
    dateFormatted: string;
    targetElo: number;
    realElo: number | null;
    diff: number | null;
    daysRemaining: number;
    projectPercent: number;
  } | null>(null);

  // Reset to default boundaries when dates change
  useEffect(() => {
    setViewTime({ start: defaultStartTime, end: defaultEndTime });
    setViewElo({ min: defaultMinElo, max: defaultMaxElo });
  }, [defaultStartTime, defaultEndTime]);

  // Chronologically sorted real sync records
  const sortedRecords = useMemo(() => {
    return [...syncHistory].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [syncHistory]);

  const latestSync = sortedRecords.length > 0 ? sortedRecords[sortedRecords.length - 1] : null;
  const currentRealElo = latestSync ? latestSync.bestRating : startElo;
  const currentBestMode = latestSync ? latestSync.bestMode : 'blitz';

  // Build continuous real progression points
  const realPointsData = useMemo(() => {
    const list: { t: number; elo: number; mode: string }[] = [
      {
        t: defaultStartTime,
        elo: startElo,
        mode: 'Base 1500',
      },
    ];

    sortedRecords.forEach((record) => {
      const t = new Date(record.timestamp).getTime();
      if (t > defaultStartTime) {
        list.push({
          t,
          elo: record.bestRating,
          mode: record.bestMode,
        });
      }
    });

    const now = Date.now();
    if (list.length === 1 && now > defaultStartTime) {
      list.push({
        t: Math.min(now, defaultEndTime),
        elo: currentRealElo,
        mode: currentBestMode,
      });
    }

    return list;
  }, [defaultStartTime, defaultEndTime, startElo, sortedRecords, currentRealElo, currentBestMode]);

  // Canvas Geometry
  const width = 960;
  const height = 420;
  const padding = { top: 35, right: 130, bottom: 55, left: 60 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Coordinate conversion
  const getX = useCallback(
    (t: number) => {
      const ratio = (t - viewTime.start) / (viewTime.end - viewTime.start || 1);
      return padding.left + ratio * innerWidth;
    },
    [viewTime, innerWidth, padding.left]
  );

  const getY = useCallback(
    (elo: number) => {
      const ratio = (elo - viewElo.min) / (viewElo.max - viewElo.min || 1);
      return padding.top + innerHeight - ratio * innerHeight;
    },
    [viewElo, innerHeight, padding.top]
  );

  // Convert SVG coordinates back to Time & Elo
  const getTimeFromX = useCallback(
    (svgX: number) => {
      const ratio = (svgX - padding.left) / innerWidth;
      return viewTime.start + ratio * (viewTime.end - viewTime.start);
    },
    [viewTime, innerWidth, padding.left]
  );

  const getEloFromY = useCallback(
    (svgY: number) => {
      const ratio = (padding.top + innerHeight - svgY) / innerHeight;
      return viewElo.min + ratio * (viewElo.max - viewElo.min);
    },
    [viewElo, innerHeight, padding.top]
  );

  // Line 1: Target Objective Line across all time (Start 1500 -> End 2000)
  const targetLine = useMemo(() => {
    return {
      x1: getX(defaultStartTime),
      y1: getY(startElo),
      x2: getX(defaultEndTime),
      y2: getY(targetElo),
    };
  }, [defaultStartTime, defaultEndTime, startElo, targetElo, getX, getY]);

  // Line 2: Real Progress Points projected
  const realLinePoints = useMemo(() => {
    return realPointsData.map((pt) => ({
      x: getX(pt.t),
      y: getY(pt.elo),
      t: pt.t,
      elo: pt.elo,
      mode: pt.mode,
    }));
  }, [realPointsData, getX, getY]);

  const realLinePath = useMemo(() => {
    if (realLinePoints.length < 2) return '';
    return realLinePoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
  }, [realLinePoints]);

  const realAreaPath = useMemo(() => {
    if (realLinePoints.length < 2) return '';
    const first = realLinePoints[0];
    const last = realLinePoints[realLinePoints.length - 1];
    const baseY = getY(viewElo.min);
    const line = realLinePoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
    return `${line} L ${last.x.toFixed(1)},${baseY} L ${first.x.toFixed(1)},${baseY} Z`;
  }, [realLinePoints, getY, viewElo.min]);

  // Dynamic X-Axis Dates Generation based on zoom level
  const xTicks = useMemo(() => {
    const durationDays = (viewTime.end - viewTime.start) / 86400000;
    const ticks: { t: number; label: string; sub?: string }[] = [];

    if (durationDays > 180) {
      // Monthly / Bi-monthly ticks
      const start = new Date(viewTime.start);
      start.setDate(1);
      const end = new Date(viewTime.end);

      const cur = new Date(start);
      const stepMonths = durationDays > 360 ? 2 : 1;

      while (cur.getTime() <= end.getTime() + 86400000 * 20) {
        if (cur.getTime() >= viewTime.start - 86400000 * 5) {
          const monthName = cur.toLocaleDateString('fr-FR', { month: 'short' });
          const year = cur.getFullYear();
          ticks.push({
            t: cur.getTime(),
            label: `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`,
            sub: String(year),
          });
        }
        cur.setMonth(cur.getMonth() + stepMonths);
      }
    } else if (durationDays > 30) {
      // Weekly / Bi-weekly ticks
      const cur = new Date(viewTime.start);
      cur.setHours(0, 0, 0, 0);
      const stepDays = durationDays > 75 ? 14 : 7;
      while (cur.getTime() <= viewTime.end + 86400000 * 3) {
        ticks.push({
          t: cur.getTime(),
          label: cur.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
          sub: String(cur.getFullYear()),
        });
        cur.setDate(cur.getDate() + stepDays);
      }
    } else {
      // Daily ticks for high zoom
      const cur = new Date(viewTime.start);
      cur.setHours(0, 0, 0, 0);
      const stepDays = durationDays > 14 ? 3 : 1;
      while (cur.getTime() <= viewTime.end + 86400000) {
        ticks.push({
          t: cur.getTime(),
          label: cur.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
          sub: cur.toLocaleDateString('fr-FR', { weekday: 'short' }),
        });
        cur.setDate(cur.getDate() + stepDays);
      }
    }

    return ticks;
  }, [viewTime]);

  // Dynamic Y-Axis Levels & Milestones
  const yTicks = useMemo(() => {
    const eloRange = viewElo.max - viewElo.min;
    const step = eloRange > 500 ? 100 : eloRange > 250 ? 50 : 25;
    const ticks: { elo: number; label: string; badge?: string }[] = [];

    const first = Math.ceil(viewElo.min / step) * step;
    for (let e = first; e <= viewElo.max; e += step) {
      let badge: string | undefined;
      if (e === 2000) badge = 'Cible 2000 Elo';
      else if (e === 1900) badge = 'Palier 1900 (Expert)';
      else if (e === 1800) badge = 'Palier 1800 (Avancé)';
      else if (e === 1700) badge = 'Palier 1700 (Intermédiaire)';
      else if (e === 1600) badge = 'Palier 1600 (Club)';
      else if (e === 1500) badge = 'Départ 1500 Elo';

      ticks.push({
        elo: e,
        label: String(e),
        badge,
      });
    }

    return ticks;
  }, [viewElo]);

  // Today marker
  const todayMs = Date.now();
  const todayX = getX(todayMs);
  const showTodayMarker = todayMs >= viewTime.start && todayMs <= viewTime.end;

  // Zoom Handler (Mouse Wheel)
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (width / rect.width);
    const svgY = (e.clientY - rect.top) * (height / rect.height);

    // Zoom factor: inward (<0) -> 0.85, outward (>0) -> 1.18
    const factor = e.deltaY < 0 ? 0.82 : 1.22;

    const cursorTime = getTimeFromX(svgX);
    const cursorElo = getEloFromY(svgY);

    const currentTimeRange = viewTime.end - viewTime.start;
    const newTimeRange = Math.max(86400000 * 3, Math.min(86400000 * 365 * 3, currentTimeRange * factor));

    const ratioX = (svgX - padding.left) / innerWidth;
    const newStartTime = cursorTime - ratioX * newTimeRange;
    const newEndTime = cursorTime + (1 - ratioX) * newTimeRange;

    // Slight Elo Y zoom
    const currentEloRange = viewElo.max - viewElo.min;
    const newEloRange = Math.max(120, Math.min(1200, currentEloRange * factor));
    const ratioY = (padding.top + innerHeight - svgY) / innerHeight;
    const newMinElo = Math.max(1000, Math.round(cursorElo - ratioY * newEloRange));
    const newMaxElo = Math.min(2600, Math.round(cursorElo + (1 - ratioY) * newEloRange));

    setViewTime({ start: newStartTime, end: newEndTime });
    setViewElo({ min: newMinElo, max: newMaxElo });
  };

  // Pan / Drag Handlers (Supports Right Click drag OR Left Click drag)
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Button 2 is Right Click, Button 0 is Left Click
    if (e.button === 2 || e.button === 0) {
      setIsDragging(true);
      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        startTime: viewTime.start,
        endTime: viewTime.end,
        minElo: viewElo.min,
        maxElo: viewElo.max,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    // If dragging, pan the viewport
    if (isDragging && dragStartRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const deltaScreenX = e.clientX - dragStartRef.current.clientX;
      const deltaScreenY = e.clientY - dragStartRef.current.clientY;

      const timeSpan = dragStartRef.current.endTime - dragStartRef.current.startTime;
      const deltaTime = (deltaScreenX / rect.width) * (timeSpan * (width / innerWidth));

      const eloSpan = dragStartRef.current.maxElo - dragStartRef.current.minElo;
      const deltaElo = (deltaScreenY / rect.height) * (eloSpan * (height / innerHeight));

      setViewTime({
        start: dragStartRef.current.startTime - deltaTime,
        end: dragStartRef.current.endTime - deltaTime,
      });

      setViewElo({
        min: Math.round(dragStartRef.current.minElo + deltaElo),
        max: Math.round(dragStartRef.current.maxElo + deltaElo),
      });

      return;
    }

    // Otherwise, compute tooltip hover data
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (width / rect.width);
    if (svgX < padding.left || svgX > width - padding.right) {
      setHoverData(null);
      return;
    }

    const t = getTimeFromX(svgX);
    const targetAtDate = Math.round(calculateLinearElo(t, startDateStr, targetDateStr, startElo, targetElo));
    const yTarget = getY(targetAtDate);

    // Find nearest real Elo point
    let realAtDate: number | null = null;
    let yReal = yTarget;

    const lastRealT = realLinePoints[realLinePoints.length - 1].t;
    if (t <= lastRealT + 86400000 * 3) {
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
    const daysRemaining = Math.max(0, Math.ceil((defaultEndTime - t) / 86400000));
    const projectPercent = Math.max(0, Math.min(100, Math.round(((t - defaultStartTime) / (defaultEndTime - defaultStartTime)) * 100)));

    setHoverData({
      x: svgX,
      yReal,
      yTarget,
      dateFormatted: new Date(t).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      targetElo: targetAtDate,
      realElo: realAtDate,
      diff,
      daysRemaining,
      projectPercent,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Zoom control buttons
  const zoomIn = () => {
    const curTime = (viewTime.start + viewTime.end) / 2;
    const newSpan = (viewTime.end - viewTime.start) * 0.75;
    setViewTime({ start: curTime - newSpan / 2, end: curTime + newSpan / 2 });
  };

  const zoomOut = () => {
    const curTime = (viewTime.start + viewTime.end) / 2;
    const newSpan = (viewTime.end - viewTime.start) * 1.35;
    setViewTime({ start: curTime - newSpan / 2, end: curTime + newSpan / 2 });
  };

  const resetView = () => {
    setViewTime({ start: defaultStartTime, end: defaultEndTime });
    setViewElo({ min: defaultMinElo, max: defaultMaxElo });
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-neutral-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest font-semibold text-neutral-400">
              Trajectoire Vers 2000 Elo
            </span>
            <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded font-mono font-semibold">
              Zoom Molette & Drag Clic Droit
            </span>
          </div>

          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-mono text-4xl sm:text-5xl font-extrabold text-neutral-100 tracking-tight tabular-nums">
              {currentRealElo}
            </span>
            <span className="text-sm font-semibold uppercase tracking-wider text-amber-400">
              {currentBestMode}
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              ({currentRealElo - startElo >= 0 ? `+${currentRealElo - startElo}` : currentRealElo - startElo} pts depuis la base de 1500)
            </span>
          </div>
        </div>

        {/* Legend & Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-4 text-xs font-medium mr-2">
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-5 border-b-2 border-dashed border-neutral-400" />
              <span className="text-neutral-400">Objectif (1500 → 2000)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-5 bg-amber-400" />
              <span className="text-amber-300 font-semibold">Votre niveau réel</span>
            </div>
          </div>

          {/* Zoom Buttons Toolbar */}
          <div className="flex items-center rounded-lg bg-neutral-950 p-1 border border-neutral-800 text-xs font-mono">
            <button
              onClick={zoomIn}
              className="p-1.5 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded transition-colors"
              title="Zoom avant (+)"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={zoomOut}
              className="p-1.5 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded transition-colors"
              title="Zoom arrière (-)"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              onClick={resetView}
              className="flex items-center gap-1 px-2.5 py-1 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded transition-colors"
              title="Réinitialiser la vue complète"
            >
              <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
              <span>Réinitialiser</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Chart Surface */}
      <div
        ref={containerRef}
        className="relative rounded-2xl border border-neutral-800/80 bg-[#0c0e12] p-4 sm:p-6 shadow-2xl overflow-hidden select-none"
      >
        {/* Helper Badge Banner */}
        <div className="flex items-center justify-between text-xs text-neutral-400 pb-3 mb-2 border-b border-neutral-800/60 font-mono">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-amber-400" />
            <span>
              <strong>Astuce :</strong> Molette pour zoomer · Maintenez le <strong>clic droit</strong> (ou glissez) pour vous déplacer dans le temps.
            </span>
          </div>

          <div className="text-[11px] text-neutral-500 hidden sm:block">
            Fenêtre visible : {Math.round((viewTime.end - viewTime.start) / 86400000)} jours
          </div>
        </div>

        {/* SVG Viewport */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className={`w-full h-auto overflow-visible ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <defs>
            <linearGradient id={`goldGrad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
            </linearGradient>

            {/* Clip path for real curve inside chart area */}
            <clipPath id={`chartArea-${gradientId}`}>
              <rect x={padding.left} y={padding.top} width={innerWidth} height={innerHeight} />
            </clipPath>
          </defs>

          {/* Horizontal Grid lines & Elo Ticks */}
          {yTicks.map((tick) => {
            const y = getY(tick.elo);
            const isTarget = tick.elo === targetElo;
            const isStart = tick.elo === startElo;

            return (
              <g key={tick.elo}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke={
                    isTarget
                      ? 'rgba(245, 158, 11, 0.40)'
                      : isStart
                      ? 'rgba(255, 255, 255, 0.20)'
                      : 'rgba(255, 255, 255, 0.05)'
                  }
                  strokeDasharray={isTarget || isStart ? '5 3' : undefined}
                  strokeWidth={isTarget ? 1.5 : 1}
                />

                {/* Left Elo Value */}
                <text
                  x={padding.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  className={`font-mono text-[11px] ${
                    isTarget
                      ? 'fill-amber-400 font-bold'
                      : isStart
                      ? 'fill-neutral-200 font-semibold'
                      : 'fill-neutral-500'
                  }`}
                >
                  {tick.label}
                </text>

                {/* Right Milestone Badge Label */}
                {tick.badge && (
                  <text
                    x={width - padding.right + 10}
                    y={y + 3.5}
                    className={`font-mono text-[10px] ${
                      isTarget
                        ? 'fill-amber-400 font-bold'
                        : isStart
                        ? 'fill-neutral-300 font-medium'
                        : 'fill-neutral-400'
                    }`}
                  >
                    {tick.badge}
                  </text>
                )}
              </g>
            );
          })}

          {/* Vertical Time Grid lines & Clean Abscissa Labels */}
          {xTicks.map((tick, i) => {
            const x = getX(tick.t);
            // Hide ticks out of bounds
            if (x < padding.left - 10 || x > width - padding.right + 10) return null;

            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={height - padding.bottom}
                  stroke="rgba(255, 255, 255, 0.04)"
                />

                {/* Tick mark under the horizontal axis */}
                <line
                  x1={x}
                  y1={height - padding.bottom}
                  x2={x}
                  y2={height - padding.bottom + 6}
                  stroke="rgba(255, 255, 255, 0.20)"
                  strokeWidth="1"
                />

                {/* Clean Abscissa Text */}
                <text
                  x={x}
                  y={height - padding.bottom + 20}
                  textAnchor="middle"
                  className="font-mono text-[11px] fill-neutral-300 font-medium"
                >
                  {tick.label}
                </text>
                {tick.sub && (
                  <text
                    x={x}
                    y={height - padding.bottom + 33}
                    textAnchor="middle"
                    className="font-mono text-[9px] fill-neutral-400"
                  >
                    {tick.sub}
                  </text>
                )}
              </g>
            );
          })}

          {/* Abscissa baseline axis */}
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="1.2"
          />

          {/* Today vertical marker line if visible */}
          {showTodayMarker && (
            <g pointerEvents="none">
              <line
                x1={todayX}
                y1={padding.top}
                x2={todayX}
                y2={height - padding.bottom}
                stroke="#d97706"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                opacity="0.8"
              />
              <rect
                x={todayX - 35}
                y={padding.top - 20}
                width="70"
                height="18"
                rx="4"
                fill="#d97706"
              />
              <text
                x={todayX}
                y={padding.top - 7}
                textAnchor="middle"
                className="font-mono text-[9px] fill-neutral-950 font-bold uppercase tracking-wider"
              >
                Aujourd'hui
              </text>
            </g>
          )}

          {/* Clipped content inside chart boundaries */}
          <g clipPath={`url(#chartArea-${gradientId})`}>
            {/* Area fill under real progress curve */}
            {realAreaPath && (
              <path d={realAreaPath} fill={`url(#goldGrad-${gradientId})`} />
            )}

            {/* 1. Target Objective Line (1500 on 31 Oct 2026 to 2000 on 31 Dec 2027) */}
            <line
              x1={targetLine.x1}
              y1={targetLine.y1}
              x2={targetLine.x2}
              y2={targetLine.y2}
              stroke="#a1a1aa"
              strokeWidth="2.2"
              strokeDasharray="6 5"
              opacity="0.75"
            />

            {/* 2. Real Progress Polyline */}
            {realLinePath && (
              <path
                d={realLinePath}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Real Recorded Data Dots */}
            {realLinePoints.map((pt, i) => {
              const isLast = i === realLinePoints.length - 1;
              return (
                <g key={i}>
                  {isLast && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="8"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                      opacity="0.5"
                    />
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isLast ? 5 : 4}
                    fill="#0c0e12"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                  />
                </g>
              );
            })}
          </g>

          {/* Interactive Hover Crosshair & Tooltip */}
          {hoverData && !isDragging && (
            <g pointerEvents="none">
              <line
                x1={hoverData.x}
                y1={padding.top}
                x2={hoverData.x}
                y2={height - padding.bottom}
                stroke="rgba(245, 158, 11, 0.45)"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />

              <circle
                cx={hoverData.x}
                cy={hoverData.yTarget}
                r="4.5"
                fill="#0c0e12"
                stroke="#a1a1aa"
                strokeWidth="2"
              />

              {hoverData.realElo !== null && (
                <circle
                  cx={hoverData.x}
                  cy={hoverData.yReal}
                  r="5"
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              )}

              {/* Native Floating Box */}
              <g
                transform={`translate(${Math.max(
                  padding.left + 5,
                  Math.min(width - padding.right - 215, hoverData.x - 105)
                )}, ${Math.max(padding.top + 5, Math.min(height - 150, hoverData.yTarget - 100))})`}
              >
                <rect
                  x="0"
                  y="0"
                  width="210"
                  height="90"
                  rx="8"
                  fill="#13161c"
                  stroke="rgba(245, 158, 11, 0.35)"
                  strokeWidth="1"
                />

                <text x="12" y="18" fill="#e4e4e7" fontSize="10" fontWeight="bold" className="capitalize">
                  {hoverData.dateFormatted}
                </text>

                <text x="12" y="38" fill="#a1a1aa" fontSize="10">
                  Cible théorique :
                </text>
                <text x="198" y="38" fill="#e4e4e7" fontSize="11" fontWeight="bold" textAnchor="end" fontFamily="monospace">
                  {hoverData.targetElo} Elo
                </text>

                {hoverData.realElo !== null ? (
                  <>
                    <text x="12" y="55" fill="#a1a1aa" fontSize="10">
                      Votre classement :
                    </text>
                    <text x="198" y="55" fill="#f59e0b" fontSize="11" fontWeight="bold" textAnchor="end" fontFamily="monospace">
                      {hoverData.realElo} Elo
                    </text>

                    <text x="12" y="70" fill="#a1a1aa" fontSize="9">
                      Écart à l'objectif :
                    </text>
                    <text
                      x="198"
                      y="70"
                      fill={hoverData.diff !== null && hoverData.diff >= 0 ? '#34d399' : '#f87171'}
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="end"
                      fontFamily="monospace"
                    >
                      {hoverData.diff !== null && hoverData.diff > 0 ? `+${hoverData.diff}` : hoverData.diff} pts
                    </text>
                  </>
                ) : (
                  <text x="12" y="58" fill="#71717a" fontSize="10" fontStyle="italic">
                    Projection future vers 2000 Elo
                  </text>
                )}

                <text x="12" y="83" fill="#71717a" fontSize="8" fontFamily="monospace">
                  {hoverData.daysRemaining} j restants · {hoverData.projectPercent}% du projet
                </text>
              </g>
            </g>
          )}
        </svg>

        {/* Footer info bar */}
        <div className="mt-4 pt-3 border-t border-neutral-800/60 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-300">Base officielle :</span>
            <span className="font-mono text-neutral-400">1500 Elo le 31 octobre 2026</span>
          </div>

          <div className="flex items-center gap-3 font-mono">
            <span>
              Cible : <strong className="text-amber-400">2000 Elo</strong> au 31/12/2027
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Rythme moyen requis : <strong className="text-neutral-200">+1.17 pt / jour</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
