/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  Eye,
  EyeOff,
  Filter,
  Flame,
  Layers,
  Milestone,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { GameMode, SyncRecord } from '../types/chess';
import {
  calculateAdvanceMetrics,
  calculateLinearElo,
  DEFAULT_START_DATE,
  DEFAULT_TARGET_DATE,
} from '../utils/eloEngine';

interface HistoryChartProps {
  syncHistory: SyncRecord[];
  startElo?: number;
  targetElo?: number;
  startDateStr?: string;
  targetDateStr?: string;
}

type ModeFilter = 'auto' | 'blitz' | 'rapid' | 'bullet';
type QuickPreset = 'progress' | 'full' | '30days' | '3months' | '6months' | '1year' | '14days' | '7days';
type TableStatusFilter = 'all' | 'played' | 'carryover' | 'ahead' | 'behind';

interface ChartPoint {
  dayKey: string; // YYYY-MM-DD
  dateLabel: string;
  timestamp: number;
  realElo: number | null;
  targetElo: number;
  diff: number | null;
  dailyDelta: number | null;
  mode?: string;
  isDirectSync: boolean;
  isCarryOver: boolean;
  hasRealData: boolean;
}

function formatDateToKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const MODE_START_ELOS: Record<string, number> = {
  blitz: 1458,
  rapid: 1289,
  bullet: 1500,
};

export const HistoryChart: React.FC<HistoryChartProps> = ({
  syncHistory,
  startElo = 1500,
  targetElo = 2000,
  startDateStr = DEFAULT_START_DATE,
  targetDateStr = DEFAULT_TARGET_DATE,
}) => {
  // 1. Controls & Filter States
  const [selectedMode, setSelectedMode] = useState<ModeFilter>('auto');
  const [activePreset, setActivePreset] = useState<QuickPreset>('progress');
  
  // Visual layer toggles
  const [showTargetLine, setShowTargetLine] = useState<boolean>(true);
  const [showAdvanceMarker, setShowAdvanceMarker] = useState<boolean>(true);
  const [showAreaGlow, setShowAreaGlow] = useState<boolean>(true);
  const [showAllDots, setShowAllDots] = useState<boolean>(true);
  const [showTodayMarker, setShowTodayMarker] = useState<boolean>(true);
  const [showMilestonesLines, setShowMilestonesLines] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showBrush, setShowBrush] = useState<boolean>(true);

  // Table filter & search state
  const [tableFilter, setTableFilter] = useState<TableStatusFilter>('all');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tablePage, setTablePage] = useState<number>(1);
  const pageSize = 10;

  // Timestamps
  const projectStartTime = useMemo(
    () => new Date(startDateStr || DEFAULT_START_DATE).getTime(),
    [startDateStr]
  );
  const projectEndTime = useMemo(
    () => new Date(targetDateStr || DEFAULT_TARGET_DATE).getTime(),
    [targetDateStr]
  );

  const todayObj = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const todayKey = useMemo(() => formatDateToKey(todayObj), [todayObj]);

  // Chronologically sorted records
  const sortedRecords = useMemo(() => {
    return [...syncHistory].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [syncHistory]);

  // Helper to determine the best mode from a record (highest absolute rating)
  const getBestModeFromRecord = (record?: SyncRecord | null): 'blitz' | 'rapid' | 'bullet' => {
    if (!record) return 'bullet';
    const candidates: { mode: 'blitz' | 'rapid' | 'bullet'; rating: number; priority: number }[] = [];
    if (typeof record.bullet === 'number') candidates.push({ mode: 'bullet', rating: record.bullet, priority: 1 });
    if (typeof record.blitz === 'number') candidates.push({ mode: 'blitz', rating: record.blitz, priority: 2 });
    if (typeof record.rapid === 'number') candidates.push({ mode: 'rapid', rating: record.rapid, priority: 3 });
    if (candidates.length === 0) {
      if (record.bestMode && ['bullet', 'blitz', 'rapid'].includes(record.bestMode)) {
        return record.bestMode as 'blitz' | 'rapid' | 'bullet';
      }
      return 'bullet';
    }
    candidates.sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return b.priority - a.priority;
    });
    return candidates[0].mode;
  };

  // Determine active cadence for Auto mode (mode with the highest rating on latest sync)
  const autoBestMode: 'blitz' | 'rapid' | 'bullet' = useMemo(() => {
    if (sortedRecords.length === 0) return 'bullet';
    return getBestModeFromRecord(sortedRecords[sortedRecords.length - 1]);
  }, [sortedRecords]);

  // Mode-specific starting Elo requested by user:
  // - Blitz starts at 1458
  // - Rapid starts at 1289
  // - Bullet starts at 1500
  // - Auto dynamically starts at the start Elo of the cadence that has the highest rating (e.g. Bullet -> 1500)!
  const effectiveStartElo = useMemo(() => {
    const activeKey = selectedMode === 'auto' ? autoBestMode : selectedMode;
    return MODE_START_ELOS[activeKey] ?? startElo;
  }, [selectedMode, autoBestMode, startElo]);

  // Helper to extract rating based on mode filter
  // For 'auto' mode, it strictly picks the game mode with the HIGHEST absolute rating (not points gained)
  const getRatingForMode = (record: SyncRecord, mode: ModeFilter): { rating: number; modeName: string } => {
    if (mode === 'blitz') {
      return { rating: record.blitz ?? MODE_START_ELOS.blitz, modeName: 'BLITZ' };
    }
    if (mode === 'rapid') {
      return { rating: record.rapid ?? MODE_START_ELOS.rapid, modeName: 'RAPIDE' };
    }
    if (mode === 'bullet') {
      return { rating: record.bullet ?? MODE_START_ELOS.bullet, modeName: 'BULLET' };
    }

    // AUTO MODE: strictly choose the cadence with the HIGHEST absolute rating
    const candidates: { modeName: string; rating: number; priority: number }[] = [];
    if (typeof record.bullet === 'number') {
      candidates.push({ modeName: 'BULLET', rating: record.bullet, priority: 1 });
    }
    if (typeof record.blitz === 'number') {
      candidates.push({ modeName: 'BLITZ', rating: record.blitz, priority: 2 });
    }
    if (typeof record.rapid === 'number') {
      candidates.push({ modeName: 'RAPIDE', rating: record.rapid, priority: 3 });
    }

    if (candidates.length > 0) {
      // Sort strictly descending by highest rating
      candidates.sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.priority - a.priority;
      });
      return { rating: candidates[0].rating, modeName: candidates[0].modeName };
    }

    return {
      rating: record.bestRating ?? effectiveStartElo,
      modeName: (record.bestMode || autoBestMode).toUpperCase(),
    };
  };

  // 2. Full Unified Daily Timeline with CARRY-FORWARD (Plateau)
  const allChartData = useMemo(() => {
    // Map of days with direct syncs
    const dailySyncMap = new Map<string, { rating: number; mode: string; timestamp: number }>();

    // Initial base point on project start date with mode-specific start Elo
    const startObj = new Date(projectStartTime);
    startObj.setHours(0, 0, 0, 0);
    const startKey = formatDateToKey(startObj);
    dailySyncMap.set(startKey, {
      rating: effectiveStartElo,
      mode: selectedMode === 'auto' ? `Base (${autoBestMode.toUpperCase()})` : selectedMode.toUpperCase(),
      timestamp: startObj.getTime(),
    });

    sortedRecords.forEach((record) => {
      const d = new Date(record.timestamp);
      const key = formatDateToKey(d);
      const { rating, modeName } = getRatingForMode(record, selectedMode);
      dailySyncMap.set(key, {
        rating,
        mode: modeName,
        timestamp: d.getTime(),
      });
    });

    // Generate day-by-day continuous array from projectStart to projectEnd
    const points: ChartPoint[] = [];
    const startCurr = new Date(projectStartTime);
    startCurr.setHours(0, 0, 0, 0);

    const endBoundary = new Date(projectEndTime);
    endBoundary.setHours(0, 0, 0, 0);

    let lastKnownElo = effectiveStartElo;
    let lastKnownMode = selectedMode === 'auto' ? `Départ (${autoBestMode.toUpperCase()})` : selectedMode.toUpperCase();
    let prevElo: number | null = null;

    const curr = new Date(startCurr);

    while (curr.getTime() <= endBoundary.getTime()) {
      const key = formatDateToKey(curr);
      const timestamp = curr.getTime();
      const isPastOrToday = timestamp <= todayObj.getTime() || key === todayKey;

      const syncInfo = dailySyncMap.get(key);

      let realElo: number | null = null;
      let isDirectSync = false;
      let isCarryOver = false;

      if (syncInfo) {
        lastKnownElo = syncInfo.rating;
        lastKnownMode = syncInfo.mode;
        if (isPastOrToday) {
          realElo = lastKnownElo;
          isDirectSync = true;
        }
      } else if (isPastOrToday) {
        // Carry forward previous known Elo if no sync on this day
        realElo = lastKnownElo;
        isCarryOver = true;
      } else {
        // Future days: no realElo to avoid predicting future
        realElo = null;
      }

      const targetVal = Math.round(
        calculateLinearElo(timestamp, startDateStr, targetDateStr, effectiveStartElo, targetElo) * 10
      ) / 10;

      const diff = realElo !== null ? Math.round(realElo - targetVal) : null;
      const dailyDelta = realElo !== null && prevElo !== null ? realElo - prevElo : null;
      if (realElo !== null) {
        prevElo = realElo;
      }

      const dateLabel = curr.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
      });

      points.push({
        dayKey: key,
        dateLabel,
        timestamp,
        realElo,
        targetElo: targetVal,
        diff,
        dailyDelta,
        mode: isDirectSync ? syncInfo?.mode : lastKnownMode,
        isDirectSync,
        isCarryOver,
        hasRealData: isPastOrToday,
      });

      curr.setDate(curr.getDate() + 1);
    }

    return points;
  }, [
    sortedRecords,
    selectedMode,
    autoBestMode,
    effectiveStartElo,
    projectStartTime,
    projectEndTime,
    startElo,
    targetElo,
    startDateStr,
    targetDateStr,
    todayObj,
    todayKey,
  ]);

  // Today index in full timeline
  const todayIndex = useMemo(() => {
    const idx = allChartData.findIndex((p) => p.dayKey === todayKey);
    return idx >= 0 ? idx : 0;
  }, [allChartData, todayKey]);

  // Current real Elo
  const currentRealElo = useMemo(() => {
    const played = allChartData.filter((p) => p.realElo !== null);
    return played.length > 0 ? played[played.length - 1].realElo! : effectiveStartElo;
  }, [allChartData, effectiveStartElo]);

  const targetToday = Math.round(
    calculateLinearElo(todayObj.getTime(), startDateStr, targetDateStr, effectiveStartElo, targetElo)
  );
  const diffVsTarget = currentRealElo - targetToday;

  // Advance calendar calculation (Vertical line on target date where targetElo = currentRealElo)
  const advanceMetric = useMemo(() => {
    return calculateAdvanceMetrics(
      currentRealElo,
      todayObj,
      startDateStr,
      targetDateStr,
      effectiveStartElo,
      targetElo
    );
  }, [currentRealElo, todayObj, startDateStr, targetDateStr, effectiveStartElo, targetElo]);

  // Index of equivalent marker date in full timeline (works for both advance and delay)
  const markerIndex = useMemo(() => {
    return allChartData.findIndex((p) => p.dayKey === advanceMetric.equivalentDateKey);
  }, [allChartData, advanceMetric.equivalentDateKey]);

  // 3. Zoom Range Management (Controlled brush/slider)
  const [zoomRange, setZoomRange] = useState<{ startIndex: number; endIndex: number }>(() => {
    const minIdx = Math.min(todayIndex, markerIndex >= 0 ? markerIndex : todayIndex);
    const maxIdx = Math.max(todayIndex, markerIndex >= 0 ? markerIndex : todayIndex);
    const start = Math.max(0, minIdx - 7);
    const prospectiveEnd = Math.max(maxIdx + 10, todayIndex + 14);
    const end = Math.min(allChartData.length - 1, prospectiveEnd);
    return { startIndex: start, endIndex: Math.max(start + 30, end) };
  });

  // Center chart view on the advance / retard marker line
  const handleFocusMarker = () => {
    if (markerIndex < 0) return;
    const minIdx = Math.min(todayIndex, markerIndex);
    const maxIdx = Math.max(todayIndex, markerIndex);
    const start = Math.max(0, minIdx - 7);
    const end = Math.min(allChartData.length - 1, maxIdx + 7);
    setZoomRange({ startIndex: start, endIndex: Math.max(start + 14, end) });
    setActivePreset('progress');
  };

  // Automatically keep the marker in view when switching cadences if in progress preset
  React.useEffect(() => {
    if (activePreset === 'progress') {
      const minIdx = Math.min(todayIndex, markerIndex >= 0 ? markerIndex : todayIndex);
      const maxIdx = Math.max(todayIndex, markerIndex >= 0 ? markerIndex : todayIndex);
      const start = Math.max(0, minIdx - 7);
      const prospectiveEnd = Math.max(maxIdx + 10, todayIndex + 14);
      const end = Math.min(allChartData.length - 1, prospectiveEnd);
      setZoomRange({ startIndex: start, endIndex: Math.max(start + 30, end) });
    }
  }, [selectedMode, activePreset, todayIndex, markerIndex, allChartData.length]);

  // Apply quick presets
  const applyPreset = (preset: QuickPreset) => {
    setActivePreset(preset);
    const total = allChartData.length;
    if (preset === 'full') {
      setZoomRange({ startIndex: 0, endIndex: total - 1 });
    } else if (preset === 'progress') {
      const minIdx = Math.min(todayIndex, markerIndex >= 0 ? markerIndex : todayIndex);
      const maxIdx = Math.max(todayIndex, markerIndex >= 0 ? markerIndex : todayIndex);
      const start = Math.max(0, minIdx - 7);
      const prospectiveEnd = Math.max(maxIdx + 10, todayIndex + 14);
      const end = Math.min(total - 1, prospectiveEnd);
      setZoomRange({ startIndex: start, endIndex: Math.max(start + 30, end) });
    } else if (preset === '1year') {
      setZoomRange({ startIndex: 0, endIndex: Math.min(total - 1, 365) });
    } else if (preset === '6months') {
      setZoomRange({ startIndex: 0, endIndex: Math.min(total - 1, 182) });
    } else if (preset === '3months') {
      const start = Math.max(0, todayIndex - 90);
      const end = Math.min(total - 1, todayIndex + 7);
      setZoomRange({ startIndex: start, endIndex: end });
    } else if (preset === '30days') {
      const start = Math.max(0, todayIndex - 30);
      const end = Math.min(total - 1, todayIndex + 5);
      setZoomRange({ startIndex: start, endIndex: end });
    } else if (preset === '14days') {
      const start = Math.max(0, todayIndex - 14);
      const end = Math.min(total - 1, todayIndex + 3);
      setZoomRange({ startIndex: start, endIndex: end });
    } else if (preset === '7days') {
      const start = Math.max(0, todayIndex - 7);
      const end = Math.min(total - 1, todayIndex + 2);
      setZoomRange({ startIndex: start, endIndex: end });
    }
  };

  // Zoom In / Zoom Out controls
  const handleZoomIn = () => {
    const { startIndex, endIndex } = zoomRange;
    const span = endIndex - startIndex;
    if (span <= 5) return;
    const delta = Math.max(1, Math.floor(span * 0.15));
    setZoomRange({
      startIndex: Math.min(endIndex - 4, startIndex + delta),
      endIndex: Math.max(startIndex + 4, endIndex - delta),
    });
  };

  const handleZoomOut = () => {
    const { startIndex, endIndex } = zoomRange;
    const total = allChartData.length;
    const span = endIndex - startIndex;
    const delta = Math.max(1, Math.floor(span * 0.2));
    setZoomRange({
      startIndex: Math.max(0, startIndex - delta),
      endIndex: Math.min(total - 1, endIndex + delta),
    });
  };

  const handlePan = (direction: 'left' | 'right') => {
    const { startIndex, endIndex } = zoomRange;
    const total = allChartData.length;
    const span = endIndex - startIndex;
    const shift = Math.max(1, Math.floor(span * 0.25));

    if (direction === 'left') {
      const newStart = Math.max(0, startIndex - shift);
      const newEnd = newStart + span;
      setZoomRange({ startIndex: newStart, endIndex: Math.min(total - 1, newEnd) });
    } else {
      const newEnd = Math.min(total - 1, endIndex + shift);
      const newStart = Math.max(0, newEnd - span);
      setZoomRange({ startIndex: newStart, endIndex: newEnd });
    }
  };

  // Currently visible points slice
  const visiblePoints = useMemo(() => {
    const start = Math.max(0, Math.min(zoomRange.startIndex, allChartData.length - 1));
    const end = Math.min(allChartData.length - 1, Math.max(zoomRange.endIndex, start));
    return allChartData.slice(start, end + 1);
  }, [allChartData, zoomRange]);

  // Real data points within visible range
  const visibleRealPoints = useMemo(() => {
    return visiblePoints.filter((p) => p.realElo !== null);
  }, [visiblePoints]);

  // Dynamic Y-axis scale based on data
  const { yMin, yMax, yTicks } = useMemo(() => {
    const elos = visibleRealPoints.map((p) => p.realElo!);
    const minRating = Math.min(effectiveStartElo, ...elos);
    const maxRating = Math.max(targetElo, ...elos);

    // Rapid mode started at 1289 Elo: scale starts at 1200 Elo
    const isRapid = selectedMode === 'rapid' || (selectedMode === 'auto' && autoBestMode === 'rapid');
    const minThreshold = isRapid ? 1200 : 1400;
    const calcYMin = Math.floor(Math.min(minThreshold, minRating - 50) / 100) * 100;
    const calcYMax = Math.ceil(Math.max(2050, maxRating + 50) / 100) * 100;

    const ticks: number[] = [];
    for (let y = calcYMin; y <= calcYMax; y += 100) {
      ticks.push(y);
    }
    return { yMin: calcYMin, yMax: calcYMax, yTicks: ticks };
  }, [visibleRealPoints, effectiveStartElo, targetElo, selectedMode, autoBestMode]);

  // Visible XAxis ticks
  const visibleTickKeys = useMemo(() => {
    const count = visiblePoints.length;
    let step = 1;
    if (count > 300) step = 60;
    else if (count > 120) step = 30;
    else if (count > 50) step = 14;
    else if (count > 20) step = 5;
    else if (count > 10) step = 2;
    else step = 1;

    const ticks: string[] = [];
    visiblePoints.forEach((p, idx) => {
      if (idx % step === 0 || idx === visiblePoints.length - 1) {
        ticks.push(p.dayKey);
      }
    });
    return ticks;
  }, [visiblePoints]);

  // 4. Analytics KPIs for visible range
  const rangeKpis = useMemo(() => {
    if (visibleRealPoints.length === 0) {
      return {
        netDelta: 0,
        dailyRate: 0,
        peak: currentRealElo,
        trough: currentRealElo,
        playedDays: 0,
        carryoverDays: 0,
        avgDiff: 0,
      };
    }

    const first = visibleRealPoints[0].realElo!;
    const last = visibleRealPoints[visibleRealPoints.length - 1].realElo!;
    const netDelta = last - first;

    const daysCount = Math.max(1, visibleRealPoints.length);
    const dailyRate = Math.round((netDelta / daysCount) * 100) / 100;

    const eloValues = visibleRealPoints.map((p) => p.realElo!);
    const peak = Math.max(...eloValues);
    const trough = Math.min(...eloValues);

    const playedDays = visibleRealPoints.filter((p) => p.isDirectSync).length;
    const carryoverDays = visibleRealPoints.filter((p) => p.isCarryOver).length;

    const diffSum = visibleRealPoints.reduce((acc, p) => acc + (p.diff ?? 0), 0);
    const avgDiff = Math.round((diffSum / daysCount) * 10) / 10;

    return {
      netDelta,
      dailyRate,
      peak,
      trough,
      playedDays,
      carryoverDays,
      avgDiff,
    };
  }, [visibleRealPoints, currentRealElo]);

  // Projected Finish based on rate
  const projectionInfo = useMemo(() => {
    const pointsRemaining = Math.max(0, targetElo - currentRealElo);
    const msRemaining = Math.max(0, projectEndTime - todayObj.getTime());
    const daysRemaining = Math.max(1, Math.ceil(msRemaining / 86400000));

    const requiredRatePerDay = Math.round((pointsRemaining / daysRemaining) * 100) / 100;
    const requiredRatePerWeek = Math.round(requiredRatePerDay * 7 * 10) / 10;

    // Projected date if current pace continues (using 30-day pace or min positive pace)
    const effectivePace = rangeKpis.dailyRate > 0.05 ? rangeKpis.dailyRate : 0.8;
    const projectedDaysToGoal = Math.ceil(pointsRemaining / effectivePace);
    const projectedDate = new Date(todayObj.getTime() + projectedDaysToGoal * 86400000);

    return {
      pointsRemaining,
      daysRemaining,
      requiredRatePerDay,
      requiredRatePerWeek,
      projectedDateStr: projectedDate.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    };
  }, [targetElo, currentRealElo, projectEndTime, todayObj, rangeKpis.dailyRate]);

  // 5. Table rows for the Daily Log Table
  const tableRows = useMemo(() => {
    let rows = [...visibleRealPoints].reverse(); // newest first

    if (tableFilter === 'played') {
      rows = rows.filter((r) => r.isDirectSync);
    } else if (tableFilter === 'carryover') {
      rows = rows.filter((r) => r.isCarryOver);
    } else if (tableFilter === 'ahead') {
      rows = rows.filter((r) => r.diff !== null && r.diff >= 0);
    } else if (tableFilter === 'behind') {
      rows = rows.filter((r) => r.diff !== null && r.diff < 0);
    }

    if (tableSearch.trim()) {
      const q = tableSearch.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.dayKey.toLowerCase().includes(q) ||
          r.dateLabel.toLowerCase().includes(q) ||
          (r.mode && r.mode.toLowerCase().includes(q))
      );
    }

    return rows;
  }, [visibleRealPoints, tableFilter, tableSearch]);

  const totalPages = Math.max(1, Math.ceil(tableRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (tablePage - 1) * pageSize;
    return tableRows.slice(start, start + pageSize);
  }, [tableRows, tablePage]);

  // CSV Export handler
  const handleExportCsv = () => {
    const headers = ['Date', 'Elo', 'Variation_Jour', 'Type', 'Cible_Theorique', 'Ecart_Cible', 'Cadence'];
    const lines = visibleRealPoints.map((p) => [
      p.dayKey,
      p.realElo,
      p.dailyDelta !== null ? p.dailyDelta : 0,
      p.isDirectSync ? 'Synchronisation réelle' : 'Report plateau (maintien)',
      p.targetElo,
      p.diff,
      p.mode || 'N/A',
    ]);
    const csvContent = [headers.join(','), ...lines.map((l) => l.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `roadto2000_historique_${formatDateToKey(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Custom Recharts Tooltip
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
      <div className="rounded-2xl border border-neutral-800 bg-[#0c0f14]/95 p-4 text-xs shadow-2xl space-y-3 backdrop-blur-md min-w-[260px]">
        {/* Header with date and status badge */}
        <div className="font-bold text-white capitalize border-b border-neutral-800/80 pb-2 flex items-center justify-between gap-3">
          <span>{fullDate}</span>
          <span
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
              pt.isDirectSync
                ? 'bg-[#facc15]/15 text-[#facc15] border-[#facc15]/30'
                : 'bg-neutral-800 text-neutral-400 border-neutral-700'
            }`}
          >
            {pt.isDirectSync ? `🎯 Partie ${pt.mode || ''}` : '⏸️ Elo Maintenu'}
          </span>
        </div>

        {/* Ratings details */}
        <div className="space-y-2 font-mono">
          <div className="flex items-center justify-between gap-4">
            <span className="text-neutral-400 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-white" />
              <span>Cible Théorique :</span>
            </span>
            <span className="font-bold text-white">{targetVal} Elo</span>
          </div>

          {realVal !== undefined && realVal !== null ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className="text-neutral-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#facc15]" />
                  <span>Votre Classement :</span>
                </span>
                <span className="font-bold text-[#facc15]">{realVal} Elo</span>
              </div>

              {pt.dailyDelta !== null && pt.dailyDelta !== 0 && (
                <div className="flex items-center justify-between gap-4 text-[11px]">
                  <span className="text-neutral-400">Évolution du jour :</span>
                  <span
                    className={`font-bold ${
                      pt.dailyDelta > 0 ? 'text-[#10b981]' : 'text-[#ef4444]'
                    }`}
                  >
                    {pt.dailyDelta > 0 ? `+${pt.dailyDelta} pts` : `${pt.dailyDelta} pts`}
                  </span>
                </div>
              )}

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
              Projection future vers l&apos;objectif 2000 Elo
            </div>
          )}

          {/* Special advance or delay milestone callout on tooltip */}
          {pt.dayKey === advanceMetric.equivalentDateKey && (
            <div className="pt-2 border-t border-neutral-800/80">
              {advanceMetric.isAhead ? (
                <div className="rounded-xl bg-[#10b981]/15 border border-[#10b981]/40 p-2 text-[10px] text-[#10b981] font-bold flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>🚀 Objectif théorique atteint en avance (+{advanceMetric.advanceDays} j)</span>
                </div>
              ) : advanceMetric.isBehind ? (
                <div className="rounded-xl bg-[#ef4444]/15 border border-[#ef4444]/40 p-2 text-[10px] text-[#ef4444] font-bold flex items-center gap-1.5">
                  <TrendingDown className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>⚠️ Niveau théorique équivalent en retard ({advanceMetric.advanceDays} j)</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & MAIN STATUS ROW */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-[#0d1117] border border-neutral-800 p-5 rounded-3xl shadow-xl">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Compass className="h-5 w-5 text-[#facc15]" />
              <span>Trajectoire Échiquéenne Complète & Analytique</span>
            </h2>
            <span className="text-[10px] font-mono bg-neutral-900 text-[#facc15] font-bold px-2.5 py-0.5 rounded-full border border-neutral-800">
              1 point / jour + report plateau
            </span>
            <span className="text-[10px] font-mono bg-neutral-900 text-neutral-300 px-2.5 py-0.5 rounded-full border border-neutral-800">
              Zoom & filtres dynamiques
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Chaque jour sans partie conserve automatiquement votre classement précédent. Explorez, zoomez et filtrez l&apos;ensemble de votre parcours.
          </p>
        </div>

        {/* Primary Status Chips (Blanc, Noir, Vert, Rouge, Jaune) */}
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

          {advanceMetric.isAhead && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 text-xs font-bold font-mono">
              <Zap className="h-3.5 w-3.5 text-[#10b981]" />
              <span>Avance jusqu&apos;au {advanceMetric.equivalentDateLabel} (+{advanceMetric.advanceDays} j)</span>
            </div>
          )}
          {advanceMetric.isBehind && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/30 text-xs font-bold font-mono">
              <TrendingDown className="h-3.5 w-3.5 text-[#ef4444]" />
              <span>Retard : niveau du {advanceMetric.equivalentDateLabel} ({advanceMetric.advanceDays} j)</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. ANALYTICS RIBBON (6 KPI Cards calculated on current zoom window) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Delta on period */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0d1117] p-3.5 space-y-1">
          <div className="text-[10px] uppercase font-bold text-neutral-400 flex items-center justify-between">
            <span>Évolution Période</span>
            <Activity className="h-3.5 w-3.5 text-[#facc15]" />
          </div>
          <div className="text-lg font-black font-mono">
            <span
              className={
                rangeKpis.netDelta > 0
                  ? 'text-[#10b981]'
                  : rangeKpis.netDelta < 0
                  ? 'text-[#ef4444]'
                  : 'text-white'
              }
            >
              {rangeKpis.netDelta > 0 ? `+${rangeKpis.netDelta}` : rangeKpis.netDelta} pts
            </span>
          </div>
          <div className="text-[10px] text-neutral-400">
            {rangeKpis.dailyRate > 0 ? `+${rangeKpis.dailyRate}` : rangeKpis.dailyRate} Elo/jour moy.
          </div>
        </div>

        {/* Period Peak */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0d1117] p-3.5 space-y-1">
          <div className="text-[10px] uppercase font-bold text-neutral-400 flex items-center justify-between">
            <span>Sommet Période</span>
            <Trophy className="h-3.5 w-3.5 text-[#facc15]" />
          </div>
          <div className="text-lg font-black font-mono text-[#facc15]">
            {rangeKpis.peak} Elo
          </div>
          <div className="text-[10px] text-neutral-400">
            Plancher : {rangeKpis.trough} Elo
          </div>
        </div>

        {/* Activity & Regularity */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0d1117] p-3.5 space-y-1">
          <div className="text-[10px] uppercase font-bold text-neutral-400 flex items-center justify-between">
            <span>Activité Jouée</span>
            <Flame className="h-3.5 w-3.5 text-[#facc15]" />
          </div>
          <div className="text-lg font-black font-mono text-white">
            {rangeKpis.playedDays} j.
          </div>
          <div className="text-[10px] text-neutral-400">
            {rangeKpis.carryoverDays} j. de maintien
          </div>
        </div>

        {/* Average difference vs Target */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0d1117] p-3.5 space-y-1">
          <div className="text-[10px] uppercase font-bold text-neutral-400 flex items-center justify-between">
            <span>Écart Moyen</span>
            <Target className="h-3.5 w-3.5 text-[#facc15]" />
          </div>
          <div
            className={`text-lg font-black font-mono ${
              rangeKpis.avgDiff >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'
            }`}
          >
            {rangeKpis.avgDiff >= 0 ? `+${rangeKpis.avgDiff}` : rangeKpis.avgDiff} pts
          </div>
          <div className="text-[10px] text-neutral-400">
            Face à la droite théorique
          </div>
        </div>

        {/* Required Pace for 2000 */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0d1117] p-3.5 space-y-1">
          <div className="text-[10px] uppercase font-bold text-neutral-400 flex items-center justify-between">
            <span>Rythme Requis</span>
            <Zap className="h-3.5 w-3.5 text-[#facc15]" />
          </div>
          <div className="text-lg font-black font-mono text-[#facc15]">
            +{projectionInfo.requiredRatePerWeek} pts/sem.
          </div>
          <div className="text-[10px] text-neutral-400">
            {projectionInfo.pointsRemaining} pts restants
          </div>
        </div>

        {/* Projected Completion Date */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0d1117] p-3.5 space-y-1">
          <div className="text-[10px] uppercase font-bold text-neutral-400 flex items-center justify-between">
            <span>Projection 2000</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-[#10b981]" />
          </div>
          <div className="text-sm font-bold font-mono text-white truncate pt-0.5">
            {projectionInfo.projectedDateStr}
          </div>
          <div className="text-[10px] text-neutral-400">
            Au rythme observé
          </div>
        </div>
      </div>

      {/* Advance / Retard Calendar Alert Banner */}
      {advanceMetric.isAhead && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#10b981]/10 border border-[#10b981]/30 p-4 rounded-3xl shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#10b981]/20 text-[#10b981] flex-shrink-0">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Avance Calendrier Validée</span>
                <span className="text-[10px] font-mono bg-[#10b981]/20 text-[#10b981] px-2 py-0.5 rounded-full border border-[#10b981]/40 font-bold">
                  +{advanceMetric.advanceDays} jours d&apos;avance
                </span>
              </div>
              <p className="text-xs text-neutral-300 mt-0.5">
                Votre classement actuel de <span className="font-bold text-[#facc15]">{currentRealElo} Elo</span> correspond au niveau théorique prévu le <span className="font-bold text-[#10b981]">{advanceMetric.equivalentDateLabel}</span>. La barre verticale verte en pointillés sur le graphique indique cette borne d&apos;avance.
              </p>
            </div>
          </div>
          {markerIndex >= 0 && (
            <button
              onClick={handleFocusMarker}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-[#10b981] text-black font-black text-xs hover:bg-[#10b981]/90 transition-all flex items-center gap-1.5 shadow-md flex-shrink-0"
              title="Centrer le graphique sur la barre d'avance"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Centrer sur la barre</span>
            </button>
          )}
        </div>
      )}

      {advanceMetric.isBehind && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#ef4444]/10 border border-[#ef4444]/30 p-4 rounded-3xl shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#ef4444]/20 text-[#ef4444] flex-shrink-0">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Retard Calendrier Constaté</span>
                <span className="text-[10px] font-mono bg-[#ef4444]/20 text-[#ef4444] px-2 py-0.5 rounded-full border border-[#ef4444]/40 font-bold">
                  {advanceMetric.advanceDays} jours de retard
                </span>
              </div>
              <p className="text-xs text-neutral-300 mt-0.5">
                Votre classement actuel de <span className="font-bold text-[#facc15]">{currentRealElo} Elo</span> correspond au niveau théorique du <span className="font-bold text-[#ef4444]">{advanceMetric.equivalentDateLabel}</span>. La barre verticale rouge en pointillés indique la date équivalente.
              </p>
            </div>
          </div>
          {markerIndex >= 0 && (
            <button
              onClick={handleFocusMarker}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-[#ef4444] text-white font-black text-xs hover:bg-[#ef4444]/90 transition-all flex items-center gap-1.5 shadow-md flex-shrink-0"
              title="Centrer le graphique sur la barre de retard"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Centrer sur le retard</span>
            </button>
          )}
        </div>
      )}

      {/* 3. MULTI-LEVEL FILTER & ZOOM TOOLBAR */}
      <div className="bg-[#0d1117] border border-neutral-800 p-4 rounded-3xl space-y-3.5">
        {/* Row 1: Mode selector + Timeframe presets */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Mode Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-neutral-400 mr-1 flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#facc15]" />
              <span>Cadence :</span>
            </span>
            {[
              { id: 'auto', label: `Meilleur Elo (Auto: ${autoBestMode.toUpperCase()})` },
              { id: 'blitz', label: 'Blitz' },
              { id: 'rapid', label: 'Rapide' },
              { id: 'bullet', label: 'Bullet' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMode(m.id as ModeFilter)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedMode === m.id
                    ? 'bg-[#facc15] text-black shadow-md'
                    : 'bg-[#0c0f14] text-neutral-300 hover:text-white border border-neutral-800'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-neutral-400 mr-1 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-[#facc15]" />
              <span>Période :</span>
            </span>
            {[
              { id: 'progress', label: 'Progression Active' },
              { id: 'full', label: 'Tout le Projet' },
              { id: '1year', label: '1 An' },
              { id: '6months', label: '6 Mois' },
              { id: '3months', label: '3 Mois' },
              { id: '30days', label: '30 Jours' },
              { id: '14days', label: '14 Jours' },
              { id: '7days', label: '7 Jours' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id as QuickPreset)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activePreset === p.id
                    ? 'bg-neutral-800 text-[#facc15] border border-[#facc15]/40 font-bold'
                    : 'bg-[#0c0f14] text-neutral-400 hover:text-white border border-neutral-800/80'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Zoom controls (+, -, Pan, Reset) + Visual Layers Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-800/80">
          {/* Zoom Buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-400 mr-1 flex items-center gap-1.5">
              <ZoomIn className="h-3.5 w-3.5 text-[#facc15]" />
              <span>Zoom :</span>
            </span>

            <button
              onClick={() => handlePan('left')}
              className="px-2.5 py-1 rounded-lg bg-[#0c0f14] border border-neutral-800 text-neutral-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1"
              title="Décaler vers le passé"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Passé</span>
            </button>

            <button
              onClick={handleZoomIn}
              className="px-2.5 py-1 rounded-lg bg-[#0c0f14] border border-neutral-800 text-neutral-200 hover:text-white hover:border-[#facc15]/50 text-xs font-bold transition-all flex items-center gap-1"
              title="Zoomer (+)"
            >
              <ZoomIn className="h-3.5 w-3.5 text-[#facc15]" />
              <span>Zoom +</span>
            </button>

            <button
              onClick={handleZoomOut}
              className="px-2.5 py-1 rounded-lg bg-[#0c0f14] border border-neutral-800 text-neutral-200 hover:text-white hover:border-[#facc15]/50 text-xs font-bold transition-all flex items-center gap-1"
              title="Dézoomer (-)"
            >
              <ZoomOut className="h-3.5 w-3.5 text-[#facc15]" />
              <span>Zoom -</span>
            </button>

            <button
              onClick={() => handlePan('right')}
              className="px-2.5 py-1 rounded-lg bg-[#0c0f14] border border-neutral-800 text-neutral-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1"
              title="Décaler vers le futur"
            >
              <span>Futur</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => applyPreset('full')}
              className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-400 hover:text-white text-xs font-medium transition-all"
              title="Réinitialiser le zoom"
            >
              Réinitialiser
            </button>

            {markerIndex >= 0 && (
              advanceMetric.isAhead ? (
                <button
                  onClick={handleFocusMarker}
                  className="px-2.5 py-1 rounded-lg bg-[#10b981]/15 border border-[#10b981]/40 text-[#10b981] hover:bg-[#10b981]/25 text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                  title="Centrer la vue sur votre date d'avance"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Voir Avance (+{advanceMetric.advanceDays} j)</span>
                </button>
              ) : advanceMetric.isBehind ? (
                <button
                  onClick={handleFocusMarker}
                  className="px-2.5 py-1 rounded-lg bg-[#ef4444]/15 border border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/25 text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                  title="Centrer la vue sur votre date équivalente de retard"
                >
                  <TrendingDown className="h-3.5 w-3.5" />
                  <span>Voir Retard ({advanceMetric.advanceDays} j)</span>
                </button>
              ) : null
            )}

            <span className="text-[11px] font-mono text-neutral-400 ml-2">
              Affichage : {visiblePoints.length} jours ({visiblePoints[0]?.dateLabel} → {visiblePoints[visiblePoints.length - 1]?.dateLabel})
            </span>
          </div>

          {/* Visual Layer Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-neutral-400 mr-1 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-[#facc15]" />
              <span>Couches :</span>
            </span>

            <button
              onClick={() => setShowAdvanceMarker(!showAdvanceMarker)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                showAdvanceMarker
                  ? advanceMetric.isAhead
                    ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/40 font-bold'
                    : 'bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/40 font-bold'
                  : 'bg-[#0c0f14] text-neutral-500 border-neutral-800 line-through'
              }`}
              title="Afficher/masquer la barre verticale d'avance ou de retard calendrier"
            >
              {advanceMetric.isAhead ? '🚀 Barre Avance' : '⚠️ Barre Retard'}
            </button>

            <button
              onClick={() => setShowTargetLine(!showTargetLine)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                showTargetLine
                  ? 'bg-white/10 text-white border-white/30'
                  : 'bg-[#0c0f14] text-neutral-500 border-neutral-800 line-through'
              }`}
            >
              Cible
            </button>

            <button
              onClick={() => setShowAreaGlow(!showAreaGlow)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                showAreaGlow
                  ? 'bg-[#facc15]/10 text-[#facc15] border-[#facc15]/30'
                  : 'bg-[#0c0f14] text-neutral-500 border-neutral-800 line-through'
              }`}
            >
              Lueur Dégradé
            </button>

            <button
              onClick={() => setShowAllDots(!showAllDots)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                showAllDots
                  ? 'bg-neutral-800 text-[#facc15] border-neutral-700'
                  : 'bg-[#0c0f14] text-neutral-500 border-neutral-800'
              }`}
            >
              {showAllDots ? 'Tous les points' : 'Points syncs'}
            </button>

            <button
              onClick={() => setShowBrush(!showBrush)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                showBrush
                  ? 'bg-neutral-800 text-white border-neutral-700'
                  : 'bg-[#0c0f14] text-neutral-500 border-neutral-800'
              }`}
            >
              Navigateur Slider
            </button>

            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                showGrid
                  ? 'bg-neutral-800 text-white border-neutral-700'
                  : 'bg-[#0c0f14] text-neutral-500 border-neutral-800'
              }`}
            >
              Grille
            </button>
          </div>
        </div>
      </div>

      {/* 4. MAIN RECHARTS COMPOSED CHART WITH BRUSH ZOOM */}
      <div className="rounded-3xl border border-neutral-800 bg-[#0c0f14] p-4 sm:p-6 shadow-2xl space-y-4">
        {/* Chart Title & Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-neutral-800/80">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#facc15] animate-ping" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Graphique Interactif Dynamique Recharts
            </span>
            <span className="text-[10px] font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
              Glissez le curseur en bas pour naviguer et zoomer
            </span>
          </div>

          {/* Color Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#facc15]" />
              <span className="text-[#facc15] font-bold">Votre Elo Réel (Plateau journalier)</span>
            </div>
            {showTargetLine && (
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-5 border-b-2 border-dashed border-white" />
                <span className="text-white">Cible Linéaire 1500 → 2000</span>
              </div>
            )}
            {showAdvanceMarker && (
              advanceMetric.isAhead ? (
                <div className="flex items-center gap-2">
                  <span className="h-2 w-4 border-b-2 border-dashed border-[#10b981]" />
                  <span className="text-[#10b981] font-bold">
                    Avance jusqu&apos;au {advanceMetric.equivalentDateLabel} (+{advanceMetric.advanceDays} j)
                  </span>
                </div>
              ) : advanceMetric.isBehind ? (
                <div className="flex items-center gap-2">
                  <span className="h-2 w-4 border-b-2 border-dashed border-[#ef4444]" />
                  <span className="text-[#ef4444] font-bold">
                    Retard : niveau du {advanceMetric.equivalentDateLabel} ({advanceMetric.advanceDays} j)
                  </span>
                </div>
              ) : null
            )}
          </div>
        </div>

        {/* Recharts Canvas */}
        <div className="h-[460px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={visiblePoints}
              margin={{ top: 20, right: 30, left: 10, bottom: showBrush ? 10 : 25 }}
            >
              <defs>
                {/* Yellow glow gradient under real Elo */}
                <linearGradient id="eloGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#facc15" stopOpacity={0.25} />
                  <stop offset="60%" stopColor="#facc15" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="#facc15" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              {/* Grid */}
              {showGrid && (
                <CartesianGrid stroke="#1c2430" strokeDasharray="3 3" vertical={false} />
              )}

              {/* X Axis */}
              <XAxis
                dataKey="dayKey"
                ticks={visibleTickKeys}
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
                dy={8}
              />

              {/* Y Axis */}
              <YAxis
                domain={[yMin, yMax]}
                ticks={yTicks}
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={{ stroke: '#334155' }}
                dx={-5}
              />

              {/* Reference line for Today */}
              {showTodayMarker && visiblePoints.some((p) => p.dayKey === todayKey) && (
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

              {/* Vertical Reference Line: Ahead (Green) or Behind (Red) target date - No shaded area */}
              {showAdvanceMarker && visiblePoints.some((p) => p.dayKey === advanceMetric.equivalentDateKey) && (
                advanceMetric.isAhead ? (
                  <ReferenceLine
                    x={advanceMetric.equivalentDateKey}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    strokeWidth={2.5}
                    label={{
                      value: `🚀 En avance jusqu'au ${advanceMetric.equivalentDateLabel} (+${advanceMetric.advanceDays} j)`,
                      fill: '#10b981',
                      fontSize: 11,
                      fontWeight: 'bold',
                      position: 'insideTopLeft',
                    }}
                  />
                ) : advanceMetric.isBehind ? (
                  <ReferenceLine
                    x={advanceMetric.equivalentDateKey}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    strokeWidth={2.5}
                    label={{
                      value: `⚠️ En retard : niveau du ${advanceMetric.equivalentDateLabel} (${advanceMetric.advanceDays} j)`,
                      fill: '#ef4444',
                      fontSize: 11,
                      fontWeight: 'bold',
                      position: 'insideTopRight',
                    }}
                  />
                ) : null
              )}

              {/* Departure Line (Mode specific: Blitz 1458, Rapid 1289, Bullet 1500) */}
              <ReferenceLine
                y={effectiveStartElo}
                stroke="#ffffff"
                strokeDasharray="4 4"
                strokeOpacity={0.4}
                label={{
                  value: `Départ ${effectiveStartElo} Elo (${selectedMode === 'auto' ? `Auto: ${autoBestMode.toUpperCase()}` : selectedMode.toUpperCase()})`,
                  fill: '#ffffff',
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />

              {/* Target 2000 Line */}
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

              {/* Intermediate Milestones (1600, 1700, 1800, 1900) */}
              {showMilestonesLines &&
                [1600, 1700, 1800, 1900].map((m) => (
                  <ReferenceLine
                    key={m}
                    y={m}
                    stroke="#334155"
                    strokeDasharray="2 4"
                    label={{
                      value: `${m}`,
                      fill: '#64748b',
                      fontSize: 9,
                      position: 'insideBottomRight',
                    }}
                  />
                ))}

              <Tooltip content={<CustomTooltip />} />

              {/* Subtle Gradient Glow under the real line */}
              {showAreaGlow && (
                <Area
                  type="monotone"
                  dataKey="realElo"
                  fill="url(#eloGlow)"
                  stroke="none"
                  isAnimationActive={false}
                />
              )}

              {/* Target Theoretical Line (Straight diagonal line) */}
              {showTargetLine && (
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
              )}

              {/* Real Elo Line (With carry-over for inactive days, max 1 point per day) */}
              <Line
                type="monotone"
                dataKey="realElo"
                name="Votre Elo Réel"
                stroke="#facc15"
                strokeWidth={3}
                connectNulls={true}
                /* Custom dot renderer: distinct style for direct sync vs carryover */
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (payload?.realElo === null || cx === undefined || cy === undefined) {
                    return null;
                  }

                  // If user toggled off non-sync dots
                  if (!showAllDots && !payload.isDirectSync) {
                    return null;
                  }

                  // Direct sync day: larger prominent dot
                  if (payload.isDirectSync) {
                    return (
                      <circle
                        key={`dot-sync-${cx}-${cy}`}
                        cx={cx}
                        cy={cy}
                        r={3.5}
                        fill="#facc15"
                        stroke="#0c0f14"
                        strokeWidth={1.5}
                      />
                    );
                  }

                  // Carry-over day (plateau point): subtle smaller dot
                  return (
                    <circle
                      key={`dot-carry-${cx}-${cy}`}
                      cx={cx}
                      cy={cy}
                      r={2}
                      fill="#facc15"
                      fillOpacity={0.7}
                      stroke="#0c0f14"
                      strokeWidth={1}
                    />
                  );
                }}
                activeDot={{
                  r: 6,
                  fill: '#facc15',
                  stroke: '#ffffff',
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />

              {/* Recharts Brush component for fluid sliding and zooming */}
              {showBrush && (
                <Brush
                  dataKey="dayKey"
                  height={34}
                  stroke="#facc15"
                  fill="#0c0f14"
                  tickFormatter={(key: string) => {
                    const [y, m, d] = key.split('-').map(Number);
                    const dt = new Date(y, m - 1, d);
                    return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' });
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* 5. STEPPER PALIERS (1600 to 2000 Elo) */}
        <div className="pt-5 border-t border-neutral-800">
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

      {/* 6. DAILY LOG INSPECTOR (Tableau détaillé et filtrable de chaque jour) */}
      <div className="rounded-3xl border border-neutral-800 bg-[#0d1117] p-5 shadow-2xl space-y-4">
        {/* Table header with filters and search */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#facc15]" />
              <span>Journal de Bord Journalier ({tableRows.length} entrées sur la période)</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Audit précis de chaque journée : parties synchronisées et reports de maintien au même niveau.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setTablePage(1);
                }}
                placeholder="Rechercher une date..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-neutral-800 bg-[#0c0f14] text-xs text-white placeholder-neutral-500 focus:border-[#facc15] focus:outline-none w-44"
              />
            </div>

            {/* CSV Export Button */}
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-300 hover:text-white hover:border-neutral-700 font-bold transition-all"
              title="Télécharger l'historique complet en CSV"
            >
              <Download className="h-3.5 w-3.5 text-[#facc15]" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-800 pb-3">
          <span className="text-xs font-bold text-neutral-400 mr-1 flex items-center gap-1">
            <Filter className="h-3.5 w-3.5 text-[#facc15]" />
            <span>Filtre d&apos;état :</span>
          </span>
          {[
            { id: 'all', label: `Tous (${visibleRealPoints.length})` },
            { id: 'played', label: `🎯 Parties jouées (${rangeKpis.playedDays})` },
            { id: 'carryover', label: `⏸️ Maintien reporté (${rangeKpis.carryoverDays})` },
            { id: 'ahead', label: '🟢 En Avance' },
            { id: 'behind', label: '🔴 En Retard' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setTableFilter(tab.id as TableStatusFilter);
                setTablePage(1);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                tableFilter === tab.id
                  ? 'bg-[#facc15] text-black font-bold shadow-sm'
                  : 'bg-[#0c0f14] text-neutral-400 hover:text-white border border-neutral-800/80'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table content */}
        <div className="overflow-x-auto rounded-2xl border border-neutral-800">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#0c0f14] text-neutral-400 border-b border-neutral-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Classement Réel</th>
                <th className="py-2.5 px-4">Variation Jour</th>
                <th className="py-2.5 px-4">Nature</th>
                <th className="py-2.5 px-4">Cible Théorique</th>
                <th className="py-2.5 px-4">Écart Cible</th>
                <th className="py-2.5 px-4">Cadence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 bg-[#0d1117]">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-500 font-sans italic">
                    Aucune journée ne correspond aux filtres sélectionnés.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => (
                  <tr key={row.dayKey} className="hover:bg-neutral-900/60 transition-colors">
                    <td className="py-2.5 px-4 font-bold text-white whitespace-nowrap">
                      {row.dayKey} ({row.dateLabel})
                    </td>
                    <td className="py-2.5 px-4 font-bold text-[#facc15] whitespace-nowrap">
                      {row.realElo} Elo
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {row.dailyDelta !== null && row.dailyDelta !== 0 ? (
                        <span
                          className={`font-bold ${
                            row.dailyDelta > 0 ? 'text-[#10b981]' : 'text-[#ef4444]'
                          }`}
                        >
                          {row.dailyDelta > 0 ? `+${row.dailyDelta}` : row.dailyDelta}
                        </span>
                      ) : (
                        <span className="text-neutral-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {row.isDirectSync ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#facc15]/15 text-[#facc15] border border-[#facc15]/30">
                          🎯 Partie synchronisée
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-800/80 text-neutral-400 border border-neutral-700/60">
                          ⏸️ Report (maintien)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-white whitespace-nowrap">
                      {row.targetElo} Elo
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-bold">
                      {row.diff !== null ? (
                        <span
                          className={
                            row.diff >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'
                          }
                        >
                          {row.diff >= 0 ? `+${row.diff} pts` : `${row.diff} pts`}
                        </span>
                      ) : (
                        <span className="text-neutral-500">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 uppercase text-[11px] text-neutral-400 whitespace-nowrap">
                      {row.mode || 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-neutral-400 pt-2">
            <span>
              Page {tablePage} sur {totalPages} ({tableRows.length} journées)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={tablePage <= 1}
                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded-lg bg-[#0c0f14] border border-neutral-800 text-neutral-300 disabled:opacity-40 hover:text-white transition-all"
              >
                Précédent
              </button>
              <button
                disabled={tablePage >= totalPages}
                onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded-lg bg-[#0c0f14] border border-neutral-800 text-neutral-300 disabled:opacity-40 hover:text-white transition-all"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
