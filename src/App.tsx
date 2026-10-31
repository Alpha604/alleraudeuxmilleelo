/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DailyObjectiveCard } from './components/DailyObjectiveCard';
import { GameModesBreakdown } from './components/GameModesBreakdown';
import { HeroEloCard } from './components/HeroEloCard';
import { HistoryChart } from './components/HistoryChart';
import { IframeEmbedGuide } from './components/IframeEmbedGuide';
import { KpiSummaryRow } from './components/KpiSummaryRow';
import { MilestoneCalendar } from './components/MilestoneCalendar';
import { Navbar, NavTab } from './components/Navbar';
import { NotificationToast, ToastMessage } from './components/NotificationToast';
import { MonthlyObjectiveCard } from './components/MonthlyObjectiveCard';
import { SettingsView } from './components/SettingsView';
import { SyncLog } from './components/SyncLog';
import { TestRunner } from './components/TestRunner';
import {
  AppSettings,
  ChessComProfileResponse,
  ChessComStatsResponse,
  GameMode,
  SyncRecord,
} from './types/chess';
import { fetchChessComData } from './utils/chessApi';
import {
  calculateDailyObjective,
  calculateMonthlyObjective,
  DEFAULT_START_ELO,
  DEFAULT_TARGET_ELO,
  getBestGameMode,
  getProjectTimeMetrics,
} from './utils/eloEngine';
import {
  addSyncRecord,
  getStoredSettings,
  getStoredSyncHistory,
  saveStoredSettings,
} from './utils/storage';

export default function App() {
  // Load settings & sync history from local persistent storage
  const [settings, setSettings] = useState<AppSettings>(() => getStoredSettings());
  const [syncHistory, setSyncHistory] = useState<SyncRecord[]>(() => getStoredSyncHistory());

  // Navigation tab
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');

  // Live state
  const [stats, setStats] = useState<ChessComStatsResponse | null>(null);
  const [profile, setProfile] = useState<ChessComProfileResponse | undefined>(undefined);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    const history = getStoredSyncHistory();
    return history.length > 0 ? history[0].timestamp : null;
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Apply theme to document element
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  // Toast notification helper
  const showToast = useCallback((message: string, type: 'info' | 'success' | 'warning' = 'info', title = 'Road to 2000') => {
    const newToast: ToastMessage = {
      id: `toast_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      title,
      message,
      type,
    };
    setToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
    }, 5000);
  }, []);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Perform Chess.com synchronization
  const performSync = useCallback(
    async (manual = false) => {
      setIsSyncing(true);
      try {
        const result = await fetchChessComData(settings.username);

        if (!result.success || !result.stats) {
          if (manual || settings.notifications.syncErrors) {
            showToast(
              result.error || 'Erreur lors de la synchronisation avec Chess.com. Vos données précédentes sont conservées.',
              'warning',
              'Alerte Synchronisation'
            );
          }
          return;
        }

        setStats(result.stats);
        if (result.profile) {
          setProfile(result.profile);
        }
        setLastSyncTime(result.timestamp);

        // Determine best rating
        const bestInfo = getBestGameMode(result.stats);

        // Check for personal record or goal reached
        const previousRecords = getStoredSyncHistory();
        const previousPeak = previousRecords.length > 0
          ? Math.max(...previousRecords.map((r) => r.bestRating))
          : settings.startElo;

        if (settings.notifications.newPeak && bestInfo.rating > previousPeak && previousRecords.length > 0) {
          showToast(
            `Nouveau record personnel enregistré : ${bestInfo.rating} Elo en ${bestInfo.mode.toUpperCase()} !`,
            'success',
            'Nouveau Sommet !'
          );
        }

        if (settings.notifications.goalReached && bestInfo.rating >= settings.targetElo) {
          showToast(
            `FÉLICITATIONS ! Objectif ultime de ${settings.targetElo} Elo atteint !`,
            'success',
            'Objectif Accompli !'
          );
        }

        // Add to persistent sync history with duplicate detection
        const { record, isDuplicate, history } = addSyncRecord({
          timestamp: result.timestamp,
          bullet: result.stats.chess_bullet?.last?.rating ?? null,
          blitz: result.stats.chess_blitz?.last?.rating ?? null,
          rapid: result.stats.chess_rapid?.last?.rating ?? null,
          bestRating: bestInfo.rating,
          bestMode: bestInfo.mode,
          source: result.source,
        });

        setSyncHistory(history);

        if (manual) {
          if (isDuplicate) {
            showToast(
              `Statistiques à jour (${bestInfo.rating} Elo en ${bestInfo.mode}). Aucun changement depuis le dernier relevé.`,
              'info',
              'Synchronisé'
            );
          } else {
            showToast(
              `Données Chess.com actualisées avec succès : ${bestInfo.rating} Elo (${bestInfo.mode}).`,
              'success',
              'Synchronisation réussie'
            );
          }
        }
      } catch (err) {
        console.error('Sync failed:', err);
        if (manual) {
          showToast('Échec de connexion réseau vers Chess.com.', 'warning');
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [settings, showToast]
  );

  // Sync on mount
  useEffect(() => {
    performSync(false);
  }, []);

  // Periodic auto-sync
  useEffect(() => {
    if (settings.autoSyncMinutes <= 0) return;
    const intervalMs = settings.autoSyncMinutes * 60 * 1000;
    const timer = setInterval(() => {
      performSync(false);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [settings.autoSyncMinutes, performSync]);

  // Handle settings update
  const handleSettingsUpdate = (updated: AppSettings) => {
    setSettings(updated);
    saveStoredSettings(updated);
  };

  // Toggle Theme
  const handleToggleTheme = () => {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    const updated: AppSettings = { ...settings, theme: nextTheme };
    setSettings(updated);
    saveStoredSettings(updated);
  };

  // Compute active ratings and best mode
  const { currentElo, activeBestMode, allRatings } = useMemo(() => {
    if (stats) {
      const best = getBestGameMode(stats);
      if (settings.selectedMode !== 'auto') {
        const modeRating = best.allRatings[settings.selectedMode];
        return {
          currentElo: modeRating ?? best.rating,
          activeBestMode: settings.selectedMode as GameMode,
          allRatings: best.allRatings,
        };
      }
      return {
        currentElo: best.rating,
        activeBestMode: best.mode,
        allRatings: best.allRatings,
      };
    }

    // Fallback from latest sync history
    if (syncHistory.length > 0) {
      const latest = syncHistory[0];
      return {
        currentElo: latest.bestRating,
        activeBestMode: latest.bestMode,
        allRatings: {
          bullet: latest.bullet,
          blitz: latest.blitz,
          rapid: latest.rapid,
        },
      };
    }

    // Default project initial rating
    return {
      currentElo: settings.startElo,
      activeBestMode: 'blitz' as GameMode,
      allRatings: { bullet: null, blitz: null, rapid: null },
    };
  }, [stats, syncHistory, settings.selectedMode, settings.startElo]);

  // Time metrics
  const timeMetrics = useMemo(() => {
    return getProjectTimeMetrics(new Date(), settings.startDate, settings.targetDate);
  }, [settings.startDate, settings.targetDate]);

  // Daily objective calculation
  const dailyObjective = useMemo(() => {
    return calculateDailyObjective(
      currentElo,
      new Date(),
      settings.startDate,
      settings.targetDate,
      settings.startElo,
      settings.targetElo,
      settings.trajectoryModel,
      settings.customMilestones
    );
  }, [currentElo, settings]);

  // Monthly objective calculation
  const monthlyObjective = useMemo(() => {
    return calculateMonthlyObjective(
      currentElo,
      new Date(),
      settings.startDate,
      settings.targetDate,
      settings.startElo,
      settings.targetElo
    );
  }, [currentElo, settings]);

  // Complementary KPI summary metrics
  const kpiData = useMemo(() => {
    const recordedElos = syncHistory.map((s) => s.bestRating);
    const peakHistorical = recordedElos.length > 0 ? Math.max(...recordedElos) : currentElo;
    const progressionSinceStart = currentElo - settings.startElo;

    let recentDelta: number | null = null;
    if (syncHistory.length >= 2) {
      recentDelta = syncHistory[0].bestRating - syncHistory[1].bestRating;
    }

    // Next intermediate milestone (steps of 50 Elo)
    const nextMilestone = Math.min(settings.targetElo, Math.floor(currentElo / 50) * 50 + 50);
    const pointsToNextMilestone = Math.max(0, nextMilestone - currentElo);

    return {
      peakElo: peakHistorical,
      peakMode: activeBestMode,
      progressionSinceStart,
      recentDelta,
      nextMilestone,
      pointsToNextMilestone,
    };
  }, [syncHistory, currentElo, settings.startElo, settings.targetElo, activeBestMode]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans transition-colors dark:bg-neutral-950 dark:text-neutral-100 light:bg-neutral-100 light:text-neutral-900">
      {/* Top Bar Navigation */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onSync={() => performSync(true)}
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        theme={settings.theme}
        onToggleTheme={handleToggleTheme}
        profile={profile}
        username={settings.username}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* TAB 1: DASHBOARD */}
        {currentTab === 'dashboard' && (
          <div className="space-y-8">
            {/* 1. Main Hero Elo Card with Master Progress Bar */}
            <HeroEloCard
              currentElo={currentElo}
              bestMode={activeBestMode}
              startElo={settings.startElo}
              targetElo={settings.targetElo}
              daysRemaining={timeMetrics.remainingDays}
              lastSyncTime={lastSyncTime}
              targetDateStr={settings.targetDate}
              isGoalReached={currentElo >= settings.targetElo}
            />

            {/* 2. Today's Objective & Month's Objective Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DailyObjectiveCard objective={dailyObjective} />
              <MonthlyObjectiveCard objective={monthlyObjective} />
            </div>

            {/* 3. Quick KPI Summary */}
            <KpiSummaryRow
              peakElo={kpiData.peakElo}
              peakMode={kpiData.peakMode}
              progressionSinceStart={kpiData.progressionSinceStart}
              recentDelta={kpiData.recentDelta}
              nextMilestone={kpiData.nextMilestone}
              pointsToNextMilestone={kpiData.pointsToNextMilestone}
            />

            {/* 4. Three Game Modes Breakdown (Blitz, Rapid, Bullet) */}
            <GameModesBreakdown stats={stats} bestMode={activeBestMode} />
          </div>
        )}

        {/* TAB 2: CHARTS */}
        {currentTab === 'charts' && (
          <HistoryChart
            syncHistory={syncHistory}
            startElo={settings.startElo}
            targetElo={settings.targetElo}
            startDateStr={settings.startDate}
            targetDateStr={settings.targetDate}
          />
        )}

        {/* TAB 3: CALENDAR */}
        {currentTab === 'calendar' && (
          <MilestoneCalendar
            currentElo={currentElo}
            syncHistory={syncHistory}
            milestones={settings.customMilestones}
            startElo={settings.startElo}
            targetElo={settings.targetElo}
            startDateStr={settings.startDate}
            targetDateStr={settings.targetDate}
          />
        )}

        {/* TAB 4: HISTORY */}
        {currentTab === 'history' && (
          <SyncLog
            history={syncHistory}
            onHistoryUpdate={setSyncHistory}
            onShowMessage={showToast}
          />
        )}

        {/* TAB 5: TESTS */}
        {currentTab === 'tests' && <TestRunner />}

        {/* TAB 6: IFRAME GUIDE */}
        {currentTab === 'iframe' && <IframeEmbedGuide />}

        {/* TAB 7: SETTINGS */}
        {currentTab === 'settings' && (
          <SettingsView
            settings={settings}
            onSettingsUpdate={handleSettingsUpdate}
            onShowMessage={showToast}
          />
        )}
      </main>

      {/* Discrete Notification Toasts */}
      <NotificationToast toasts={toasts} onDismiss={dismissToast} />

      {/* Editorial Clean Footer */}
      <footer className="border-t border-neutral-800/80 bg-neutral-950/90 py-6 text-center text-xs text-neutral-500 transition-colors dark:border-neutral-800/80 dark:bg-neutral-950/90 light:border-neutral-200 light:bg-neutral-50">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-400">Road to 2000 Elo</span>
            <span aria-hidden="true">·</span>
            <span>Programme officiel de performance sportive</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-400">
            <span>Joueur : @{settings.username}</span>
            <span aria-hidden="true">·</span>
            <span>Échéance : 31/12/2027</span>
            <span aria-hidden="true">·</span>
            <span>Fuseau : Europe/Paris</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
