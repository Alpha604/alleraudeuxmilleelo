/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Layers,
  Milestone,
  RotateCcw,
  Sparkles,
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

type TimeframePreset = 'full' | '1year' | '6months' | '3months' | '30days';
type CadenceViewMode = 'best' | 'multi';

export const HistoryChart: React.FC<HistoryChartProps> = ({
  syncHistory,
  startElo = 1500,
  targetElo = 2000,
  startDateStr = DEFAULT_START_DATE,
  targetDateStr = DEFAULT_TARGET_DATE,
}) => {
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);

  // Timeframe & Display Controls (NO WHEEL)
  const [timeframe, setTimeframe] = useState<TimeframePreset>('full');
  const [cadenceMode, setCadenceMode] = useState<CadenceViewMode>('best');
  const [showLevelBands, setShowLevelBands] = useState<boolean>(true);

  // Absolute Project Boundaries
  const projectStartTime = useMemo(
    () => new Date(startDateStr || DEFAULT_START_DATE).getTime(),
    [startDateStr]
  );
  const projectEndTime = useMemo(
    () => new Date(targetDateStr || DEFAULT_TARGET_DATE).getTime(),
    [targetDateStr]
  );

  // Chronologically sorted real sync records
  const sortedRecords = useMemo(() => {
    return [...syncHistory].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [syncHistory]);

  const latestSync = sortedRecords.length > 0 ? sortedRecords[sortedRecords.length - 1] : null;
  const currentRealElo = latestSync ? latestSync.bestRating : startElo;
  const currentBestMode = latestSync ? latestSync.bestMode : 'blitz';

  // Compute active visible time range based on selected preset button
  const visibleTimeRange = useMemo(() => {
    const now = Date.now();

    switch (timeframe) {
      case '30days': {
        const span = 30 * 86400000;
        const start = Math.max(projectStartTime, now - 15 * 86400000);
        return { start, end: start + span };
      }
      case '3months': {
        const span = 90 * 86400000;
        const start = Math.max(projectStartTime, now - 30 * 86400000);
        return { start, end: start + span };
      }
      case '6months': {
        const span = 180 * 86400000;
        const start = Math.max(projectStartTime, now - 45 * 86400000);
        return { start, end: start + span };
      }
      case '1year': {
        const span = 365 * 86400000;
        return { start: projectStartTime, end: Math.min(projectEndTime, projectStartTime + span) };
      }
      case 'full':
      default:
        return { start: projectStartTime, end: projectEndTime };
    }
  }, [timeframe, projectStartTime, projectEndTime]);

  // Real progression data series (Best Mode)
  const realPointsData = useMemo(() => {
    const list: { t: number; elo: number; mode: string }[] = [
      {
        t: projectStartTime,
        elo: startElo,
        mode: 'Base 1500',
      },
    ];

    sortedRecords.forEach((record) => {
      const t = new Date(record.timestamp).getTime();
      if (t >= projectStartTime) {
        list.push({
          t,
          elo: record.bestRating,
          mode: record.bestMode,
        });
      }
    });

    const now = Date.now();
    if (list.length === 1 && now > projectStartTime) {
      list.push({
        t: Math.min(now, projectEndTime),
        elo: currentRealElo,
        mode: currentBestMode,
      });
    }

    return list;
  }, [projectStartTime, projectEndTime, startElo, sortedRecords, currentRealElo, currentBestMode]);

  // Multi-cadence data series
  const rapidPointsData = useMemo(() => {
    if (cadenceMode !== 'multi') return [];
    const list: { t: number; elo: number }[] = [];
    sortedRecords.forEach((record) => {
      if (record.rapid !== null && record.rapid !== undefined) {
        list.push({
          t: new Date(record.timestamp).getTime(),
          elo: record.rapid,
        });
      }
    });
    return list;
  }, [cadenceMode, sortedRecords]);

  const bulletPointsData = useMemo(() => {
    if (cadenceMode !== 'multi') return [];
    const list: { t: number; elo: number }[] = [];
    sortedRecords.forEach((record) => {
      if (record.bullet !== null && record.bullet !== undefined) {
        list.push({
          t: new Date(record.timestamp).getTime(),
          elo: record.bullet,
        });
      }
    });
    return list;
  }, [cadenceMode, sortedRecords]);

  // Dynamic Elo bounds
  const visibleEloBounds = useMemo(() => {
    const relevantReal = realPointsData.map((p) => p.elo);
    const minVal = Math.min(startElo - 20, ...relevantReal);
    const maxVal = Math.max(targetElo + 30, ...relevantReal);
    const min = Math.max(1300, Math.floor(minVal / 50) * 50 - 50);
    const max = Math.min(2500, Math.ceil(maxVal / 50) * 50 + 50);
    return { min, max };
  }, [realPointsData, startElo, targetElo]);

  // Canvas Geometry
  const width = 1000;
  const height = 460;
  const padding = { top: 35, right: 145, bottom: 50, left: 65 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Coordinate conversion
  const getX = useCallback(
    (t: number) => {
      const ratio = (t - visibleTimeRange.start) / (visibleTimeRange.end - visibleTimeRange.start || 1);
      return padding.left + ratio * innerWidth;
    },
    [visibleTimeRange, innerWidth, padding.left]
  );

  const getY = useCallback(
    (elo: number) => {
      const ratio = (elo - visibleEloBounds.min) / (visibleEloBounds.max - visibleEloBounds.min || 1);
      return padding.top + innerHeight - ratio * innerHeight;
    },
    [visibleEloBounds, innerHeight, padding.top]
  );

  const getTimeFromX = useCallback(
    (svgX: number) => {
      const ratio = (svgX - padding.left) / innerWidth;
      return visibleTimeRange.start + ratio * (visibleTimeRange.end - visibleTimeRange.start);
    },
    [visibleTimeRange, innerWidth, padding.left]
  );

  // Target Linear Trajectory Line
  const targetLine = useMemo(() => {
    return {
      x1: getX(projectStartTime),
      y1: getY(startElo),
      x2: getX(projectEndTime),
      y2: getY(targetElo),
    };
  }, [projectStartTime, projectEndTime, startElo, targetElo, getX, getY]);

  // Real Line Coordinates
  const realLinePoints = useMemo(() => {
    return realPointsData.map((pt) => ({
      x: getX(pt.t),
      y: getY(pt.elo),
      t: pt.t,
      elo: pt.elo,
      mode: pt.mode,
    }));
  }, [realPointsData, getX, getY]);

  // Smooth SVG Path using cubic spline
  const realLinePath = useMemo(() => {
    if (realLinePoints.length < 2) return '';
    let d = `M ${realLinePoints[0].x.toFixed(1)},${realLinePoints[0].y.toFixed(1)}`;
    for (let i = 0; i < realLinePoints.length - 1; i++) {
      const p0 = realLinePoints[i === 0 ? 0 : i - 1];
      const p1 = realLinePoints[i];
      const p2 = realLinePoints[i + 1];
      const p3 = realLinePoints[i + 2 < realLinePoints.length ? i + 2 : i + 1];

      const tension = 0.25;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }, [realLinePoints]);

  const realAreaPath = useMemo(() => {
    if (realLinePoints.length < 2 || !realLinePath) return '';
    const first = realLinePoints[0];
    const last = realLinePoints[realLinePoints.length - 1];
    const baseY = getY(visibleEloBounds.min);
    return `${realLinePath} L ${last.x.toFixed(1)},${baseY} L ${first.x.toFixed(1)},${baseY} Z`;
  }, [realLinePoints, realLinePath, getY, visibleEloBounds.min]);

  const rapidLinePath = useMemo(() => {
    if (rapidPointsData.length < 2) return '';
    return rapidPointsData
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.t).toFixed(1)},${getY(p.elo).toFixed(1)}`)
      .join(' ');
  }, [rapidPointsData, getX, getY]);

  const bulletLinePath = useMemo(() => {
    if (bulletPointsData.length < 2) return '';
    return bulletPointsData
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.t).toFixed(1)},${getY(p.elo).toFixed(1)}`)
      .join(' ');
  }, [bulletPointsData, getX, getY]);

  // Abscissa (X-Axis) Ticks
  const xTicks = useMemo(() => {
    const ticksCount = 7;
    const ticks: { t: number; label: string; sub?: string }[] = [];
    const span = visibleTimeRange.end - visibleTimeRange.start;
    const step = span / (ticksCount - 1);

    for (let i = 0; i < ticksCount; i++) {
      const t = visibleTimeRange.start + i * step;
      const d = new Date(t);

      if (span > 180 * 86400000) {
        const monthName = d.toLocaleDateString('fr-FR', { month: 'short' });
        ticks.push({
          t,
          label: monthName.charAt(0).toUpperCase() + monthName.slice(1),
          sub: String(d.getFullYear()),
        });
      } else {
        ticks.push({
          t,
          label: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
          sub: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
        });
      }
    }
    return ticks;
  }, [visibleTimeRange]);

  // Ordinate (Y-Axis) Ticks
  const yTicks = useMemo(() => {
    const ticks: { elo: number; label: string; badge?: string }[] = [];
    const step = 100;
    const first = Math.ceil(visibleEloBounds.min / step) * step;

    for (let e = first; e <= visibleEloBounds.max; e += step) {
      let badge: string | undefined;
      if (e === 2000) badge = 'Cible 2000 Elo 🏆';
      else if (e === 1900) badge = 'Palier 1900 (Expert)';
      else if (e === 1800) badge = 'Palier 1800 (Avancé)';
      else if (e === 1700) badge = 'Palier 1700 (Intermédiaire)';
      else if (e === 1600) badge = 'Palier 1600 (Club)';
      else if (e === 1500) badge = 'Base 1500 Elo (Départ)';

      ticks.push({
        elo: e,
        label: String(e),
        badge,
      });
    }
    return ticks;
  }, [visibleEloBounds]);

  // Level bands definition (1500-1600, 1600-1700, 1700-1800, 1800-1900, 1900-2000)
  const levelBands = useMemo(() => {
    return [
      { from: 1900, to: 2000, color: 'rgba(245, 158, 11, 0.07)', label: 'Zone Candidat Maître' },
      { from: 1800, to: 1900, color: 'rgba(168, 85, 247, 0.05)', label: 'Zone Expert' },
      { from: 1700, to: 1800, color: 'rgba(59, 130, 246, 0.05)', label: 'Zone Avancé' },
      { from: 1600, to: 1700, color: 'rgba(20, 184, 166, 0.05)', label: 'Zone Intermédiaire' },
      { from: 1500, to: 1600, color: 'rgba(16, 185, 129, 0.05)', label: 'Zone Joueur de Club' },
    ];
  }, []);

  // Today marker
  const todayMs = Date.now();
  const todayX = getX(todayMs);
  const showTodayMarker = todayMs >= visibleTimeRange.start && todayMs <= visibleTimeRange.end;

  // Hover Scrubbing State
  const [hoverData, setHoverData] = useState<{
    x: number;
    yReal: number;
    yTarget: number;
    t: number;
    dateFormatted: string;
    targetElo: number;
    realElo: number | null;
    diff: number | null;
    daysRemaining: number;
    projectPercent: number;
  } | null>(null);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (width / rect.width);

    if (svgX < padding.left || svgX > width - padding.right) {
      setHoverData(null);
      return;
    }

    const t = getTimeFromX(svgX);
    const targetAtDate = Math.round(
      calculateLinearElo(t, startDateStr, targetDateStr, startElo, targetElo)
    );
    const yTarget = getY(targetAtDate);

    let realAtDate: number | null = null;
    let yReal = yTarget;

    const lastRealT = realLinePoints.length > 0 ? realLinePoints[realLinePoints.length - 1].t : projectStartTime;
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
    const daysRemaining = Math.max(0, Math.ceil((projectEndTime - t) / 86400000));
    const projectPercent = Math.max(
      0,
      Math.min(100, Math.round(((t - projectStartTime) / (projectEndTime - projectStartTime)) * 100))
    );

    setHoverData({
      x: svgX,
      yReal,
      yTarget,
      t,
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

  const handleMouseLeave = () => {
    setHoverData(null);
  };

  // Trajectory Delta calculation
  const trajectoryDelta = currentRealElo - startElo;
  const targetToday = Math.round(
    calculateLinearElo(Date.now(), startDateStr, targetDateStr, startElo, targetElo)
  );
  const currentDiffVsTarget = currentRealElo - targetToday;

  // Monthly required velocity
  const daysLeft = Math.max(1, Math.ceil((projectEndTime - Date.now()) / 86400000));
  const pointsRemaining = Math.max(0, targetElo - currentRealElo);
  const requiredPtsPerMonth = Math.round((pointsRemaining / (daysLeft / 30.4375)) * 10) / 10;

  return (
    <div className="space-y-6">
      {/* 1. Executive Performance Dashboard Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Current Rating */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0e1117] p-5 shadow-lg">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-semibold uppercase tracking-wider">Classement Réel</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              {currentBestMode}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-4xl font-black text-white tabular-nums">
              {currentRealElo}
            </span>
            <span className="text-xs font-mono text-neutral-400">Elo</span>
          </div>
          <div className="mt-1 text-xs text-neutral-400 font-mono">
            {trajectoryDelta >= 0 ? `+${trajectoryDelta}` : trajectoryDelta} pts depuis le départ (1500)
          </div>
        </div>

        {/* Card 2: Today's Target */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0e1117] p-5 shadow-lg">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-semibold uppercase tracking-wider">Cible Aujourd'hui</span>
            <Target className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-4xl font-black text-neutral-200 tabular-nums">
              {targetToday}
            </span>
            <span className="text-xs font-mono text-neutral-400">Elo</span>
          </div>
          <div className="mt-1 text-xs text-neutral-400 font-mono">
            Trajectoire idéale 1500 → 2000
          </div>
        </div>

        {/* Card 3: Trajectory Pace (Advance/Delay) */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0e1117] p-5 shadow-lg">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-semibold uppercase tracking-wider">Statut Rythme</span>
            {currentDiffVsTarget >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-400" />
            )}
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`font-mono text-4xl font-black tabular-nums ${
                currentDiffVsTarget >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {currentDiffVsTarget >= 0 ? `+${currentDiffVsTarget}` : currentDiffVsTarget}
            </span>
            <span className="text-xs font-mono text-neutral-400">pts</span>
          </div>
          <div className="mt-1 text-xs font-semibold">
            {currentDiffVsTarget >= 0 ? (
              <span className="text-emerald-400">En avance sur le planning ✓</span>
            ) : (
              <span className="text-rose-400">Léger retard à combler</span>
            )}
          </div>
        </div>

        {/* Card 4: Required Velocity */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0e1117] p-5 shadow-lg">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-semibold uppercase tracking-wider">Vitesse Requise</span>
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-4xl font-black text-amber-400 tabular-nums">
              +{requiredPtsPerMonth}
            </span>
            <span className="text-xs font-mono text-neutral-400">pts/mois</span>
          </div>
          <div className="mt-1 text-xs text-neutral-400 font-mono">
            {pointsRemaining} pts restants sur {daysLeft} jours
          </div>
        </div>
      </div>

      {/* 2. Interactive Controls Strip (Presets + Cadences + Bands Toggle) - ABSOLUTELY NO MOUSE WHEEL */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-neutral-950 p-3 rounded-2xl border border-neutral-800/80">
        {/* Preset Timeframes */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-neutral-400 mr-2 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-amber-400" />
            <span>Période :</span>
          </span>
          <button
            type="button"
            onClick={() => setTimeframe('full')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              timeframe === 'full'
                ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                : 'text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800'
            }`}
          >
            Tout le projet (2026-2027)
          </button>
          <button
            type="button"
            onClick={() => setTimeframe('1year')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              timeframe === '1year'
                ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                : 'text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800'
            }`}
          >
            1 An
          </button>
          <button
            type="button"
            onClick={() => setTimeframe('6months')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              timeframe === '6months'
                ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                : 'text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800'
            }`}
          >
            6 Mois
          </button>
          <button
            type="button"
            onClick={() => setTimeframe('3months')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              timeframe === '3months'
                ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                : 'text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800'
            }`}
          >
            3 Mois
          </button>
          <button
            type="button"
            onClick={() => setTimeframe('30days')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              timeframe === '30days'
                ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                : 'text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800'
            }`}
          >
            30 Jours
          </button>
        </div>

        {/* Mode Selector & Bands Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Cadence Mode */}
          <div className="inline-flex rounded-lg bg-neutral-900 p-0.5 border border-neutral-800 text-xs">
            <button
              type="button"
              onClick={() => setCadenceMode('best')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                cadenceMode === 'best'
                  ? 'bg-neutral-800 text-amber-300 font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Mode Principal
            </button>
            <button
              type="button"
              onClick={() => setCadenceMode('multi')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                cadenceMode === 'multi'
                  ? 'bg-neutral-800 text-amber-300 font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Multi-Cadences
            </button>
          </div>

          {/* Zones Bands Toggle */}
          <button
            type="button"
            onClick={() => setShowLevelBands((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors ${
              showLevelBands
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 font-medium'
                : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
            title="Activer/désactiver les bandes colorées de niveaux FIDE"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Paliers FIDE</span>
          </button>
        </div>
      </div>

      {/* 3. Main Chart Viewport Card */}
      <div className="relative rounded-3xl border border-neutral-800 bg-[#090b10] p-4 sm:p-6 shadow-2xl overflow-hidden">
        {/* Subtle Legend Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-400 pb-3 mb-2 border-b border-neutral-800/60 font-mono">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-4 bg-amber-400 rounded-full" />
              <span className="text-amber-300 font-semibold">Classement Réel ({currentBestMode})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-4 border-b-2 border-dashed border-neutral-400" />
              <span className="text-neutral-400">Objectif Linéaire (1500 → 2000)</span>
            </div>
            {cadenceMode === 'multi' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="h-0.5 w-4 bg-sky-400 rounded-full" />
                  <span className="text-sky-300">Rapide</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-0.5 w-4 bg-amber-200 rounded-full" />
                  <span className="text-amber-200">Bullet</span>
                </div>
              </>
            )}
          </div>

          <div className="text-[11px] text-neutral-500 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>Glissez le curseur pour explorer les dates et points clés</span>
          </div>
        </div>

        {/* SVG Canvas - NO onWheel handler (Page scrolling works naturally) */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible cursor-crosshair select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id={`goldGrad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
              <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.00" />
            </linearGradient>

            <clipPath id={`chartArea-${gradientId}`}>
              <rect x={padding.left} y={padding.top} width={innerWidth} height={innerHeight} />
            </clipPath>
          </defs>

          {/* Optional Level Bands (Shaded Horizontal Background Zones) */}
          {showLevelBands && (
            <g clipPath={`url(#chartArea-${gradientId})`}>
              {levelBands.map((band) => {
                const yTop = getY(band.to);
                const yBottom = getY(band.from);
                const h = Math.max(0, yBottom - yTop);

                return (
                  <rect
                    key={band.from}
                    x={padding.left}
                    y={yTop}
                    width={innerWidth}
                    height={h}
                    fill={band.color}
                  />
                );
              })}
            </g>
          )}

          {/* Horizontal Level Guidelines & Left Y-Axis Values */}
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
                      ? 'rgba(245, 158, 11, 0.45)'
                      : isStart
                      ? 'rgba(255, 255, 255, 0.22)'
                      : 'rgba(255, 255, 255, 0.06)'
                  }
                  strokeDasharray={isTarget || isStart ? '5 4' : undefined}
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
                    x={width - padding.right + 12}
                    y={y + 4}
                    className={`font-mono text-[10px] ${
                      isTarget
                        ? 'fill-amber-400 font-bold'
                        : isStart
                        ? 'fill-neutral-300 font-medium'
                        : 'fill-neutral-500'
                    }`}
                  >
                    {tick.badge}
                  </text>
                )}
              </g>
            );
          })}

          {/* Vertical Date Grid Lines & Abscissa Labels */}
          {xTicks.map((tick, i) => {
            const x = getX(tick.t);
            if (x < padding.left - 5 || x > width - padding.right + 5) return null;

            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={height - padding.bottom}
                  stroke="rgba(255, 255, 255, 0.04)"
                />

                {/* Axis Tick Mark */}
                <line
                  x1={x}
                  y1={height - padding.bottom}
                  x2={x}
                  y2={height - padding.bottom + 6}
                  stroke="rgba(255, 255, 255, 0.20)"
                  strokeWidth="1.2"
                />

                {/* Abscissa Date Label */}
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
                    className="font-mono text-[9px] fill-neutral-500"
                  >
                    {tick.sub}
                  </text>
                )}
              </g>
            );
          })}

          {/* Abscissa baseline */}
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="1.5"
          />

          {/* Today vertical marker line */}
          {showTodayMarker && (
            <g pointerEvents="none">
              <line
                x1={todayX}
                y1={padding.top}
                x2={todayX}
                y2={height - padding.bottom}
                stroke="#d97706"
                strokeWidth="1.5"
                strokeDasharray="4 4"
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
            {/* Area gradient under real curve */}
            {realAreaPath && (
              <path d={realAreaPath} fill={`url(#goldGrad-${gradientId})`} />
            )}

            {/* Target Trajectory Line (1500 to 2000 Elo) */}
            <line
              x1={targetLine.x1}
              y1={targetLine.y1}
              x2={targetLine.x2}
              y2={targetLine.y2}
              stroke="#a1a1aa"
              strokeWidth="2"
              strokeDasharray="6 5"
              opacity="0.75"
            />

            {/* Multi-Cadence: Bullet Path */}
            {bulletLinePath && (
              <path
                d={bulletLinePath}
                fill="none"
                stroke="#fef08a"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity="0.75"
              />
            )}

            {/* Multi-Cadence: Rapid Path */}
            {rapidLinePath && (
              <path
                d={rapidLinePath}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.8"
              />
            )}

            {/* Real Progress Smooth Curve (Best Mode) */}
            {realLinePath && (
              <path
                d={realLinePath}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Real Data Points */}
            {realLinePoints.map((pt, i) => {
              const isLast = i === realLinePoints.length - 1;
              return (
                <g key={i}>
                  {isLast && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="9"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                      opacity="0.6"
                      className="animate-ping"
                    />
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isLast ? 5.5 : 4}
                    fill="#090b10"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                  />
                </g>
              );
            })}
          </g>

          {/* Destination Milestone Beacon (Target Pin at 2000 Elo) */}
          {targetLine.x2 <= width - padding.right + 10 && (
            <g transform={`translate(${targetLine.x2}, ${targetLine.y2})`}>
              <circle r="6" fill="#f59e0b" opacity="0.3" className="animate-ping" />
              <circle r="4.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
            </g>
          )}

          {/* Interactive Hover Crosshair & Glass Tooltip */}
          {hoverData && (
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
                fill="#090b10"
                stroke="#a1a1aa"
                strokeWidth="2"
              />

              {hoverData.realElo !== null && (
                <circle
                  cx={hoverData.x}
                  cy={hoverData.yReal}
                  r="5.5"
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              )}

              {/* Floating Tooltip Box */}
              <g
                transform={`translate(${Math.max(
                  padding.left + 5,
                  Math.min(width - padding.right - 235, hoverData.x - 117)
                )}, ${Math.max(padding.top + 5, Math.min(height - 165, hoverData.yReal - 120))})`}
              >
                <rect
                  x="0"
                  y="0"
                  width="235"
                  height="105"
                  rx="10"
                  fill="#12151c"
                  stroke="rgba(245, 158, 11, 0.4)"
                  strokeWidth="1.2"
                  filter="drop-shadow(0 10px 20px rgba(0,0,0,0.6))"
                />

                <text x="14" y="20" fill="#f4f4f5" fontSize="11" fontWeight="bold" className="capitalize">
                  {hoverData.dateFormatted}
                </text>

                <line x1="14" y1="28" x2="221" y2="28" stroke="rgba(255,255,255,0.08)" />

                <text x="14" y="47" fill="#a1a1aa" fontSize="10">
                  Cible théorique :
                </text>
                <text x="221" y="47" fill="#e4e4e7" fontSize="11" fontWeight="bold" textAnchor="end" fontFamily="monospace">
                  {hoverData.targetElo} Elo
                </text>

                {hoverData.realElo !== null ? (
                  <>
                    <text x="14" y="66" fill="#a1a1aa" fontSize="10">
                      Votre classement :
                    </text>
                    <text x="221" y="66" fill="#f59e0b" fontSize="12" fontWeight="bold" textAnchor="end" fontFamily="monospace">
                      {hoverData.realElo} Elo
                    </text>

                    <text x="14" y="83" fill="#a1a1aa" fontSize="10">
                      Écart à l'objectif :
                    </text>
                    <text
                      x="221"
                      y="83"
                      fill={hoverData.diff !== null && hoverData.diff >= 0 ? '#34d399' : '#f87171'}
                      fontSize="11"
                      fontWeight="bold"
                      textAnchor="end"
                      fontFamily="monospace"
                    >
                      {hoverData.diff !== null && hoverData.diff >= 0
                        ? `+${hoverData.diff} pts (Avance)`
                        : `${hoverData.diff} pts (Retard)`}
                    </text>
                  </>
                ) : (
                  <text x="14" y="68" fill="#71717a" fontSize="10" fontStyle="italic">
                    Trajectoire prévisionnelle vers 2000 Elo
                  </text>
                )}

                <text x="14" y="97" fill="#71717a" fontSize="9" fontFamily="monospace">
                  {hoverData.daysRemaining} j restants · {hoverData.projectPercent}% du projet
                </text>
              </g>
            </g>
          )}
        </svg>

        {/* 4. Bottom Milestone Plateau Stepper */}
        <div className="mt-5 pt-4 border-t border-neutral-800/80">
          <div className="flex items-center justify-between text-xs text-neutral-400 mb-3">
            <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
              <Milestone className="h-4 w-4 text-amber-400" />
              <span>Plateaux De Progression Vers 2000 Elo</span>
            </span>
            <span className="font-mono text-neutral-400 text-[11px]">
              Échéance officielle : 31/12/2027
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {[
              { elo: 1600, label: 'Club', pct: '20%' },
              { elo: 1700, label: 'Intermédiaire', pct: '40%' },
              { elo: 1800, label: 'Avancé', pct: '60%' },
              { elo: 1900, label: 'Expert', pct: '80%' },
              { elo: 2000, label: 'Maître C.', pct: '100%' },
            ].map((m) => {
              const isPassed = currentRealElo >= m.elo;
              const isCurrentTarget = !isPassed && currentRealElo >= m.elo - 100;

              return (
                <div
                  key={m.elo}
                  className={`rounded-xl p-3 border transition-all ${
                    isPassed
                      ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-300'
                      : isCurrentTarget
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 ring-1 ring-amber-500/30'
                      : 'bg-neutral-950/60 border-neutral-800 text-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold font-mono">{m.elo} Elo</span>
                    {isPassed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <span className="font-mono text-[10px] text-neutral-500">{m.pct}</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs font-semibold">{m.label}</div>
                  <div className="mt-0.5 text-[10px] text-neutral-500">
                    {isPassed ? (
                      <span className="text-emerald-400 font-medium">Validé ✓</span>
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
