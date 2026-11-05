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
import { SecurityModal } from './components/SecurityModal';
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
  isAdminSessionActive,
  isRunningInIframe,
  revokeAdminSession,
} from './utils/security';
import {
  addSyncRecord,
  getStoredSettings,
  getStoredSyncHistory,
  handleAccountSwitch,
  purgeAllUserData,
  purgeLegacyAndStaleData,
  saveStoredSettings,
} from './utils/storage';

export default function App() {
  // Strict Iframe & Embed Mode Detection
  const isIframe = useMemo(() => isRunningInIframe(), []);

  // Admin 2FA Session state
  const [isAdmin, setIsAdmin] = useState<boolean>(() => isAdminSessionActive());
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [securityModalTitle, setSecurityModalTitle] = useState('Accès Protégé');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Load settings from local persistent storage
  const [settings, setSettings] = useState<AppSettings>(() => {
    const s = getStoredSettings();
    purgeLegacyAndStaleData(s.username);
    return s;
  });

  // Sync history strictly bound to active username
  const [syncHistory, setSyncHistory] = useState<SyncRecord[]>(() => {
    const s = getStoredSettings();
    return getStoredSyncHistory(s.username);
  });

  // Navigation tab
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');

  // Live state
  const [stats, setStats] = useState<ChessComStatsResponse | null>(null);
  const [profile, setProfile] = useState<ChessComProfileResponse | undefined>(undefined);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    const s = getStoredSettings();
    const history = getStoredSyncHistory(s.username);
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

  // Periodic check for admin session validity & BroadcastChannel synchronization
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const active = isAdminSessionActive();
      setIsAdmin(active);
    }, 15000);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('roadto2000_auth_channel');
        bc.onmessage = (event) => {
          if (event.data?.type === 'AUTH_UNLOCKED' || event.data?.type === 'MOBILE_UNLOCKED') {
            setIsAdmin(true);
            setSecurityModalOpen(false);
          } else if (event.data?.type === 'AUTH_LOCKED') {
            setIsAdmin(false);
          }
        };
      }
    } catch {}

    return () => {
      clearInterval(checkInterval);
      if (bc) bc.close();
    };
  }, []);

  // In iframe mode, ensure user cannot remain on settings or tests tab
  useEffect(() => {
    if (isIframe && (currentTab === 'settings' || currentTab === 'tests')) {
      setCurrentTab('dashboard');
    }
  }, [isIframe, currentTab]);

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

  // Open Security Modal with custom title and optional callback upon unlock
  const handleOpenSecurityModal = useCallback((title: string = 'Accès Protégé', onGranted?: () => void) => {
    if (isIframe) {
      showToast('Cette action est désactivée en mode Iframe consultation.', 'warning');
      return;
    }
    if (isAdmin) {
      if (onGranted) onGranted();
      return;
    }
    setSecurityModalTitle(title);
    setPendingAction(() => onGranted || null);
    setSecurityModalOpen(true);
  }, [isAdmin, isIframe, showToast]);

  const handleSecuritySuccess = useCallback(() => {
    setIsAdmin(true);
    setSecurityModalOpen(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const handleLockAdmin = useCallback(() => {
    revokeAdminSession();
    setIsAdmin(false);
    if (currentTab === 'settings' || currentTab === 'tests') {
      setCurrentTab('dashboard');
    }
    showToast('Session administrateur verrouillée avec succès.', 'info');
  }, [currentTab, showToast]);

  // Perform Chess.com synchronization
  const performSync = useCallback(
    async (manual = false, overrideUsername?: string) => {
      const activeUser = (overrideUsername || settings.username).trim().toLowerCase();
      setIsSyncing(true);
      try {
        const result = await fetchChessComData(activeUser);

        if (!result.success || !result.stats) {
          if (manual || settings.notifications.syncErrors) {
            showToast(
              result.error || `Erreur lors de la synchronisation avec Chess.com (@${activeUser}).`,
              'warning',
              'Alerte Synchronisation'
            );
          }
          return;
        }

        setStats(result.stats);
        if (result.profile) {
          setProfile(result.profile);
        } else {
          setProfile(undefined);
        }
        setLastSyncTime(result.timestamp);

        // Determine best rating strictly among bullet, blitz, rapid
        const bestInfo = getBestGameMode(result.stats);

        // Check for personal record or goal reached
        const previousRecords = getStoredSyncHistory(activeUser);
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

        // Add to persistent sync history strictly isolated to activeUser
        const { isDuplicate, history } = addSyncRecord(
          {
            timestamp: result.timestamp,
            username: activeUser,
            bullet: result.stats.chess_bullet?.last?.rating ?? null,
            blitz: result.stats.chess_blitz?.last?.rating ?? null,
            rapid: result.stats.chess_rapid?.last?.rating ?? null,
            bestRating: bestInfo.rating,
            bestMode: bestInfo.mode,
            source: result.source,
          },
          false,
          activeUser
        );

        setSyncHistory(history);

        if (manual) {
          if (isDuplicate) {
            showToast(
              `Statistiques à jour pour @${activeUser} (${bestInfo.rating} Elo en ${bestInfo.mode}). Aucun changement depuis le dernier relevé.`,
              'info',
              'Synchronisé'
            );
          } else {
            showToast(
              `Données de @${activeUser} actualisées : ${bestInfo.rating} Elo (${bestInfo.mode}).`,
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

  // Periodic auto-sync (Runs in background even in iframe so visitors see current data)
  useEffect(() => {
    if (settings.autoSyncMinutes <= 0) return;
    const intervalMs = settings.autoSyncMinutes * 60 * 1000;
    const timer = setInterval(() => {
      performSync(false);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [settings.autoSyncMinutes, performSync]);

  // Handle settings update: clean switch between accounts
  const handleSettingsUpdate = (updated: AppSettings) => {
    if (isIframe) {
      showToast('Modification des paramètres interdite en mode Iframe.', 'warning');
      return;
    }
    if (!isAdmin) {
      handleOpenSecurityModal('Modification des paramètres', () => handleSettingsUpdate(updated));
      return;
    }

    const oldUser = settings.username.trim().toLowerCase();
    const newUser = updated.username.trim().toLowerCase();
    const isNewUser = oldUser !== newUser;

    setSettings(updated);
    saveStoredSettings(updated);

    if (isNewUser) {
      // 1. Immediately wipe previous player's stats, profile and timestamps completely
      setStats(null);
      setProfile(undefined);
      setLastSyncTime(null);

      // 2. Switch account context and load this new user's isolated history
      handleAccountSwitch(newUser);
      const newUserHistory = getStoredSyncHistory(newUser);
      setSyncHistory(newUserHistory);

      showToast(
        `Compte Chess.com basculé sur @${newUser}. Les données du profil précédent ont été écartées. Synchronisation en cours...`,
        'info',
        'Changement de compte'
      );

      // 3. Immediately launch sync with the new username
      performSync(true, newUser);
    }
  };

  // Dedicated Hard Purge of all cached data for current account
  const handlePurgeAccountData = () => {
    if (isIframe) {
      showToast('Action non autorisée en mode Iframe.', 'warning');
      return;
    }
    if (!isAdmin) {
      handleOpenSecurityModal('Purge des données du compte', handlePurgeAccountData);
      return;
    }

    const activeUser = settings.username.trim().toLowerCase();
    purgeAllUserData(activeUser);
    setStats(null);
    setProfile(undefined);
    setLastSyncTime(null);
    setSyncHistory([]);

    showToast(
      `Toutes les données en cache pour @${activeUser} ont été purgées. Synchronisation fraîche en cours...`,
      'info',
      'Purge effectuée'
    );

    performSync(true, activeUser);
  };

  // Toggle Theme
  const handleToggleTheme = () => {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    const updated: AppSettings = { ...settings, theme: nextTheme };
    setSettings(updated);
    saveStoredSettings(updated);
  };

  // Compute active ratings and best mode
  const { currentElo, activeBestMode } = useMemo(() => {
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

    // Fallback strictly from current user's latest sync history
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

    // Default project initial rating (1500)
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
    <div className="min-h-screen bg-[#07090e] text-neutral-100 flex flex-col font-sans transition-colors relative selection:bg-amber-500/25 selection:text-amber-200">
      {/* Subtle Ambient Radial Lighting for deep tournament presence */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-indigo-900/15 via-amber-500/[0.04] to-transparent blur-3xl opacity-70" />
        <div className="absolute top-[600px] right-0 w-[500px] h-[500px] bg-emerald-500/[0.03] blur-3xl rounded-full" />
      </div>
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
        isAdmin={isAdmin}
        isIframe={isIframe}
        onOpenSecurityModal={handleOpenSecurityModal}
        onLockAdmin={handleLockAdmin}
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
            username={settings.username}
            onPurgeAccountData={handlePurgeAccountData}
            isAdmin={isAdmin}
            isIframe={isIframe}
            onOpenSecurityModal={handleOpenSecurityModal}
          />
        )}

        {/* TAB 5: TESTS (Protected by 2FA, hidden in iframe) */}
        {currentTab === 'tests' && !isIframe && (
          <TestRunner
            isAdmin={isAdmin}
            isIframe={isIframe}
            onOpenSecurityModal={handleOpenSecurityModal}
          />
        )}

        {/* TAB 6: IFRAME GUIDE */}
        {currentTab === 'iframe' && <IframeEmbedGuide />}

        {/* TAB 7: SETTINGS (Protected by 2FA, hidden in iframe) */}
        {currentTab === 'settings' && !isIframe && (
          <SettingsView
            settings={settings}
            onSettingsUpdate={handleSettingsUpdate}
            onShowMessage={showToast}
            onPurgeAccountData={handlePurgeAccountData}
            isAdmin={isAdmin}
            isIframe={isIframe}
            onOpenSecurityModal={handleOpenSecurityModal}
            onLockAdmin={handleLockAdmin}
          />
        )}
      </main>

      {/* Discrete Notification Toasts */}
      <NotificationToast toasts={toasts} onDismiss={dismissToast} />

      {/* 2FA Security Modal with Smartphone QR Code Scan */}
      {securityModalOpen && (
        <SecurityModal
          isOpen={securityModalOpen}
          onClose={() => setSecurityModalOpen(false)}
          onSuccess={handleSecuritySuccess}
          actionTitle={securityModalTitle}
          onShowMessage={showToast}
        />
      )}

      {/* Editorial Clean Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-[#070a10]/90 py-6 text-center text-xs text-neutral-400 transition-colors backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white tracking-wide">ROAD TO 2000 ELO</span>
            <span aria-hidden="true" className="text-neutral-600">·</span>
            <span>Programme Officiel de Performance Échiquéenne</span>
            {isIframe && (
              <>
                <span aria-hidden="true" className="text-neutral-600">·</span>
                <span className="text-amber-400 font-semibold">[Mode Iframe Consultation Seule]</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-400">
            <span>Joueur : @{settings.username}</span>
            <span aria-hidden="true" className="text-neutral-600">·</span>
            <span>Échéance : 31/12/2027</span>
            <span aria-hidden="true" className="text-neutral-600">·</span>
            <span>Europe/Paris</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
