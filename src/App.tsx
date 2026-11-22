/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, History, LayoutDashboard, LineChart, Settings as SettingsIcon, ShieldAlert } from 'lucide-react';
import { AdminPanelView } from './components/AdminPanelView';
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
import { NetworkAndJsonBinModal } from './components/NetworkAndJsonBinModal';
import { Sidebar } from './components/Sidebar';
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
import {
  fetchJsonBinStatus,
  formatJsonBinTimestamp,
  getLocalMetrics,
  JsonBinUpdateEventDetail,
  reconcileCloudSync,
  saveServerData,
  verifyJsonBinSync,
} from './utils/cloudSync';
import { fetchChessComData } from './utils/chessApi';
import {
  calculateDailyObjective,
  calculateMonthlyObjective,
  DEFAULT_START_ELO,
  DEFAULT_TARGET_ELO,
  getBestGameMode,
  getProjectTimeMetrics,
  MODE_START_ELOS,
} from './utils/eloEngine';
import { LoginPage } from './components/LoginPage';
import { ProfileView } from './components/ProfileView';
import { SitePauseOverlay } from './components/SitePauseOverlay';
import {
  detectDeviceCategory,
  evaluateSiteActivity,
  fetchSiteActivity,
  formatRemainingDuration,
  getLocalSiteActivityConfig,
  SITE_PAUSE_MODE_META,
  SiteActivityConfig,
} from './utils/siteActivity';
import {
  clearUserSession,
  getActiveUserSession,
  getTrustedIps,
  isAdminSessionActive,
  isRunningInIframe,
  revokeAdminSession,
  saveUserSession,
  UserSession,
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

function ensureDirectAlphaSession(): UserSession {
  const existing = getActiveUserSession();
  if (existing && existing.username === 'alpharomeo1500' && !existing.isSpectator) {
    return existing;
  }
  saveUserSession('alpharomeo1500', false);
  return (
    getActiveUserSession() || {
      username: 'alpharomeo1500',
      connectedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      isSpectator: false,
    }
  );
}

export default function App() {
  // Strict Iframe & Embed Mode Detection
  const isIframe = useMemo(() => isRunningInIframe(), []);

  // Direct single-account @alpharomeo1500 entry WITHOUT elevated permissions (2FA still required for admin actions)
  const [userSession, setUserSession] = useState<UserSession | null>(() => ensureDirectAlphaSession());

  // Admin 2FA Session state (strictly false on fresh load unless unlocked by 2FA)
  const [isAdmin, setIsAdmin] = useState<boolean>(() => isAdminSessionActive());
  const [hasAdminRole, setHasAdminRole] = useState<boolean>(() => true);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [securityModalTitle, setSecurityModalTitle] = useState('Accès Protégé');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Load settings bound strictly to @alpharomeo1500
  const [settings, setSettings] = useState<AppSettings>(() => {
    const s = getStoredSettings('alpharomeo1500');
    s.username = 'alpharomeo1500';
    purgeLegacyAndStaleData('alpharomeo1500');
    return s;
  });

  // Sync history strictly bound to @alpharomeo1500
  const [syncHistory, setSyncHistory] = useState<SyncRecord[]>(() => {
    return getStoredSyncHistory('alpharomeo1500');
  });

  // Navigation tab
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');

  // Live state
  const [stats, setStats] = useState<ChessComStatsResponse | null>(null);
  const [profile, setProfile] = useState<ChessComProfileResponse | undefined>(undefined);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    const history = getStoredSyncHistory('alpharomeo1500');
    return history.length > 0 ? history[0].timestamp : null;
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Network & JSONBin online status states
  const [networkModalOpen, setNetworkModalOpen] = useState(false);
  const [jsonBinStatus, setJsonBinStatus] = useState<'synced' | 'pending_keys' | 'error' | 'syncing'>('pending_keys');
  const [lastJsonBinSyncTime, setLastJsonBinSyncTime] = useState<number | null>(() => {
    return getLocalMetrics('alpharomeo1500').lastSyncTime;
  });
  const [confirmedDayHashes, setConfirmedDayHashes] = useState<Record<string, string>>(() => {
    return getLocalMetrics('alpharomeo1500').confirmedDayHashes || {};
  });
  const [isVerifyingJsonBin, setIsVerifyingJsonBin] = useState<boolean>(false);
  const manualSyncAfterReconcileRef = useRef<boolean>(false);
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Site Activity / Maintenance & Pause Control state
  const deviceType = useMemo(() => detectDeviceCategory(), []);
  const [siteActivityConfig, setSiteActivityConfig] = useState<SiteActivityConfig>(() => getLocalSiteActivityConfig());
  const [clientIp, setClientIp] = useState<string>('');
  const [activityNowTick, setActivityNowTick] = useState<number>(() => Date.now());

  // Desktop Right Sidebar collapse/expand state with persistence
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = localStorage.getItem('roadto2000_sidebar_expanded');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('roadto2000_sidebar_expanded', String(next));
      } catch {}
      return next;
    });
  }, []);

  // Apply theme to document element (supporting dark, light, and system auto-detection)
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (theme: 'dark' | 'light' | 'system') => {
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      } else if (theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme(settings.theme);

    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        if (e.matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      };
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [settings.theme]);

  // Monitor Network online/offline events & periodic JSONBin status + real-time event sync
  useEffect(() => {
    const handleOnline = () => setIsNetworkOnline(true);
    const handleOffline = () => setIsNetworkOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkJsonBin = async () => {
      try {
        const info = await fetchJsonBinStatus(settings.username);
        if (info) {
          setJsonBinStatus(info.lastStatus);
          if (info.lastSyncTime) {
            setLastJsonBinSyncTime(info.lastSyncTime);
          }
          if (info.confirmedDayHashes) {
            setConfirmedDayHashes(info.confirmedDayHashes);
          }
        }
      } catch {}
    };

    const handleJsonBinUpdated = (e: Event) => {
      const detail = (e as CustomEvent<JsonBinUpdateEventDetail>).detail;
      if (!detail) return;
      if (detail.username?.toLowerCase() === settings.username.trim().toLowerCase()) {
        setJsonBinStatus(detail.lastStatus);
        if (detail.lastSyncTime) {
          setLastJsonBinSyncTime(detail.lastSyncTime);
        }
        if (detail.confirmedDayHashes) {
          setConfirmedDayHashes(detail.confirmedDayHashes);
        }
      }
    };

    window.addEventListener('roadto2000:jsonbin-updated', handleJsonBinUpdated);
    checkJsonBin();
    const interval = setInterval(checkJsonBin, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('roadto2000:jsonbin-updated', handleJsonBinUpdated);
      clearInterval(interval);
    };
  }, [settings.username]);

  // Fetch & poll Site Activity / Pause configuration
  const refreshSiteActivity = useCallback(async () => {
    try {
      const res = await fetchSiteActivity();
      setSiteActivityConfig(res.config);
      if (res.clientIp) setClientIp(res.clientIp);
    } catch {}
  }, []);

  useEffect(() => {
    refreshSiteActivity();
    const handleUpdated = (e: Event) => {
      const custom = e as CustomEvent<SiteActivityConfig>;
      if (custom.detail) {
        setSiteActivityConfig(custom.detail);
      }
    };
    window.addEventListener('roadto2000:site-activity-updated', handleUpdated);
    const pollId = setInterval(refreshSiteActivity, 10000);
    return () => {
      window.removeEventListener('roadto2000:site-activity-updated', handleUpdated);
      clearInterval(pollId);
    };
  }, [refreshSiteActivity]);

  // Live 1-second tick for countdown & scheduled auto-resume timers
  useEffect(() => {
    const needsLiveTick =
      siteActivityConfig.enabled ||
      siteActivityConfig.scheduleType !== 'immediate' ||
      siteActivityConfig.autoResume;
    if (!needsLiveTick) return;

    const timer = setInterval(() => {
      setActivityNowTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [siteActivityConfig.enabled, siteActivityConfig.scheduleType, siteActivityConfig.autoResume]);

  const siteActivityEvaluation = useMemo(() => {
    return evaluateSiteActivity(siteActivityConfig, {
      isAdmin,
      isIframe,
      deviceType,
      clientIp,
      trustedIps: getTrustedIps(),
      now: activityNowTick,
    });
  }, [siteActivityConfig, isAdmin, isIframe, deviceType, clientIp, activityNowTick]);

  useEffect(() => {
    if (siteActivityEvaluation.autoResumedExpired) {
      refreshSiteActivity();
    }
  }, [siteActivityEvaluation.autoResumedExpired, refreshSiteActivity]);

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

  // Unified Cloud + JSONBin save helper that updates timestamps and always reports real save status
  const persistToCloudAndNotify = useCallback(
    async (
      targetUser: string,
      historyToSave: SyncRecord[],
      settingsToSave: AppSettings,
      options?: { force?: boolean; replaceExact?: boolean; notifySuccess?: boolean }
    ) => {
      if (userSession?.isSpectator) return null;
      setJsonBinStatus('syncing');
      const result = await saveServerData(targetUser, historyToSave, settingsToSave, {
        force: options?.force ?? true,
        replaceExact: options?.replaceExact ?? false,
      });

      setJsonBinStatus(result.status);
      if (result.lastSyncTime) {
        setLastJsonBinSyncTime(result.lastSyncTime);
      }
      if (result.confirmedDayHashes) {
        setConfirmedDayHashes(result.confirmedDayHashes);
      }

      if (result.history && result.history.length > 0 && !options?.replaceExact) {
        setSyncHistory(result.history);
      }

      if (result.status === 'error') {
        showToast(
          `Échec sauvegarde JSONBin : ${result.error || 'Vérifiez vos identifiants JSONBin.'}`,
          'warning',
          'Alerte Sauvegarde Cloud'
        );
      } else if (options?.notifySuccess) {
        if (result.jsonBinSynced && result.lastSyncTime) {
          showToast(
            `JSONBin vérifié et mis à jour le ${formatJsonBinTimestamp(result.lastSyncTime)}.`,
            'success',
            'Sauvegarde JSONBin Confirmée'
          );
        } else if (result.skipped && result.lastSyncTime) {
          showToast(
            `JSONBin déjà à jour (Dernière MàJ : ${formatJsonBinTimestamp(result.lastSyncTime)}).`,
            'info',
            'Cache Cloud à jour'
          );
        } else if (result.status === 'pending_keys') {
          showToast(
            `Bin ID JSONBin manquant pour @${targetUser}. Configurez-le dans Cache Cloud / Paramètres.`,
            'warning',
            'JSONBin non configuré'
          );
        }
      }

      return result;
    },
    [userSession?.isSpectator, showToast]
  );

  const handleVerifyJsonBinSync = useCallback(async () => {
    if (isVerifyingJsonBin) return;
    setIsVerifyingJsonBin(true);
    try {
      const check = await verifyJsonBinSync(settings.username, syncHistory);
      if (check.confirmedDayHashes) {
        setConfirmedDayHashes(check.confirmedDayHashes);
      }
      if (check.lastSyncTime) {
        setLastJsonBinSyncTime(check.lastSyncTime);
      }
      if (check.error) {
        showToast(`Vérification impossible : ${check.error}`, 'warning', 'Vérification JSONBin');
      } else if (check.verified) {
        showToast(
          `Vérification réussie : les ${check.matchingDays} relevé(s) correspondent exactement à JSONBin.`,
          'success',
          'JSONBin Synchronisé'
        );
      } else {
        showToast(
          `${check.pendingDays} relevé(s) local(aux) pas encore confirmé(s) sur JSONBin (${check.matchingDays}/${check.totalLocalDays} confirmés).`,
          'warning',
          'Synchronisation en attente'
        );
      }
    } finally {
      setIsVerifyingJsonBin(false);
    }
  }, [isVerifyingJsonBin, settings.username, syncHistory, showToast]);

  // In spectator or iframe mode, ensure user cannot access restricted tabs
  useEffect(() => {
    if (userSession?.isSpectator) {
      if (
        currentTab === 'history' ||
        currentTab === 'iframe' ||
        currentTab === 'settings' ||
        currentTab === 'tests' ||
        currentTab === 'admin'
      ) {
        setCurrentTab('dashboard');
        showToast(
          'Accès restreint : le Journal Syncs et les réglages sont réservés aux comptes connectés.',
          'warning',
          'Mode Spectateur'
        );
      }
    } else if (isIframe && (currentTab === 'settings' || currentTab === 'tests' || currentTab === 'admin')) {
      setCurrentTab('dashboard');
    }
  }, [userSession?.isSpectator, isIframe, currentTab, showToast]);

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
    setHasAdminRole(true);
    try {
      localStorage.setItem('roadto2000_admin_role_v1', 'true');
    } catch {}
    setSecurityModalOpen(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const handleLockAdmin = useCallback(() => {
    revokeAdminSession();
    setIsAdmin(false);
    if (currentTab === 'settings' || currentTab === 'tests' || currentTab === 'admin') {
      setCurrentTab('dashboard');
    }
    showToast('Session administrateur verrouillée avec succès.', 'info');
  }, [currentTab, showToast]);

  // Perform Chess.com synchronization
  const performSync = useCallback(
    async (manual = false, overrideUsername?: string) => {
      if (userSession?.isSpectator) {
        if (manual) {
          showToast(
            'Synchronisation désactivée en mode Spectateur pour préserver le quota JSONBin.',
            'warning',
            'Mode Spectateur'
          );
        }
        return;
      }
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
        // Problèmes (puzzles) is NOT auto-synced: it is entered manually the next day (remains null until entered)
        const { isDuplicate, history } = addSyncRecord(
          {
            timestamp: result.timestamp,
            username: activeUser,
            bullet: result.stats.chess_bullet?.last?.rating ?? null,
            blitz: result.stats.chess_blitz?.last?.rating ?? null,
            rapid: result.stats.chess_rapid?.last?.rating ?? null,
            puzzles: null,
            bestRating: bestInfo.rating,
            bestMode: bestInfo.mode,
            source: result.source,
          },
          false,
          activeUser
        );

        setSyncHistory(history);
        // Persist to server + JSONBin and update exact lastSyncTime + notify user on changes or manual sync
        const cloudRes = await persistToCloudAndNotify(activeUser, history, settings, {
          force: !isDuplicate,
          notifySuccess: manual || !isDuplicate,
        });

        if (manual) {
          const updatedLabel = cloudRes?.lastSyncTime
            ? ` · JSONBin MàJ : ${formatJsonBinTimestamp(cloudRes.lastSyncTime)}`
            : '';
          if (isDuplicate) {
            showToast(
              `Statistiques à jour pour @${activeUser} (${bestInfo.rating} Elo en ${bestInfo.mode})${updatedLabel}.`,
              'info',
              'Synchronisé'
            );
          } else {
            showToast(
              `Données de @${activeUser} actualisées : ${bestInfo.rating} Elo (${bestInfo.mode})${updatedLabel}.`,
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
    [settings, showToast, userSession?.isSpectator, persistToCloudAndNotify]
  );

  // Cloud Reconciliation: Pull remote JSONBin records & settings FIRST, then run initial Chess.com sync
  useEffect(() => {
    const activeUser = settings.username.trim().toLowerCase();
    let cancelled = false;

    const doReconciliation = async (isInitialMount = false) => {
      try {
        const local = getStoredSyncHistory(activeUser);
        const res = await reconcileCloudSync(activeUser, local, settings, {
          isSpectator: Boolean(userSession?.isSpectator),
          forcePull: isInitialMount,
        });
        if (cancelled) return;

        if (res.lastJsonBinSyncTime) {
          setLastJsonBinSyncTime(res.lastJsonBinSyncTime);
          setJsonBinStatus('synced');
        }
        if (res.confirmedDayHashes) {
          setConfirmedDayHashes(res.confirmedDayHashes);
        }
        if (res.didUpdate || (res.history.length > 0 && syncHistory.length === 0)) {
          setSyncHistory(res.history);
          if (res.history.length > 0) {
            setLastSyncTime(res.history[0].timestamp);
          }
        }
        if (res.settings && JSON.stringify(res.settings) !== JSON.stringify(settings)) {
          setSettings({ ...res.settings, username: 'alpharomeo1500' });
        }
      } catch (err) {
        console.warn('Reconciliation error:', err);
      } finally {
        const shouldManual = manualSyncAfterReconcileRef.current;
        manualSyncAfterReconcileRef.current = false;
        if (isInitialMount && !cancelled && !userSession?.isSpectator && userSession) {
          performSync(shouldManual, activeUser);
        }
      }
    };

    if (userSession) {
      doReconciliation(true);
    }

    const handleFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && userSession) {
        doReconciliation(false);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [settings.username, Boolean(userSession)]);

  // Periodic auto-sync (Disabled in spectator mode)
  useEffect(() => {
    if (settings.autoSyncMinutes <= 0 || userSession?.isSpectator || !userSession) return;
    const intervalMs = settings.autoSyncMinutes * 60 * 1000;
    const timer = setInterval(() => {
      performSync(false);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [settings.autoSyncMinutes, performSync, userSession]);

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

    const requestedUser = updated.username.trim().toLowerCase();
    const lockedUpdated: AppSettings = {
      ...updated,
      username: 'alpharomeo1500',
    };

    if (requestedUser && requestedUser !== 'alpharomeo1500') {
      showToast(
        'Le changement de compte est temporairement bloqué (Mode Mono-Compte @alpharomeo1500).',
        'warning',
        'Compte verrouillé'
      );
    }

    setSettings(lockedUpdated);
    saveStoredSettings(lockedUpdated);

    persistToCloudAndNotify('alpharomeo1500', syncHistory, lockedUpdated, {
      force: true,
      notifySuccess: true,
    });
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

    persistToCloudAndNotify(activeUser, [], settings, {
      force: true,
      replaceExact: true,
      notifySuccess: false,
    }).then(() => {
      performSync(true, activeUser);
    });
  };

  // Single-account login handler (@alpharomeo1500)
  const handleLoginSuccess = useCallback(
    (loggedUser: string, adminUnlocked: boolean, _isSpectator = false) => {
      const cleanUser = 'alpharomeo1500';
      saveUserSession(cleanUser, false);
      setUserSession(getActiveUserSession());
      if (adminUnlocked) {
        setIsAdmin(true);
        setHasAdminRole(true);
      } else {
        revokeAdminSession();
        setIsAdmin(false);
        setHasAdminRole(true);
      }

      setStats(null);
      setProfile(undefined);
      setLastSyncTime(null);

      const nextSettings = getStoredSettings(cleanUser);
      nextSettings.username = cleanUser;
      setSettings(nextSettings);
      saveStoredSettings(nextSettings);

      handleAccountSwitch(cleanUser);
      const newUserHistory = getStoredSyncHistory(cleanUser);
      setSyncHistory(newUserHistory);
      const metrics = getLocalMetrics(cleanUser);
      setLastJsonBinSyncTime(metrics.lastSyncTime);
      setConfirmedDayHashes(metrics.confirmedDayHashes || {});
      if (newUserHistory.length > 0) {
        setLastSyncTime(newUserHistory[0].timestamp);
      }

      showToast(
        adminUnlocked
          ? `Connecté sur @${cleanUser} avec permissions Admin (A2F).`
          : `Connecté sur @${cleanUser} sans permissions.`,
        'success',
        'Session active'
      );

      manualSyncAfterReconcileRef.current = true;
    },
    [showToast]
  );

  // Blocked multi-account switch
  const handleQuickSwitchAccount = useCallback(
    (_targetUsername: string) => {
      showToast('Le basculement multi-comptes est temporairement bloqué.', 'warning', 'Mode Mono-Compte');
    },
    [showToast]
  );

  // User logout / lock session
  const handleLogout = useCallback(() => {
    clearUserSession();
    revokeAdminSession();
    setIsAdmin(false);
    setHasAdminRole(true);
    setUserSession(null);
    setCurrentTab('dashboard');
    showToast('Session verrouillée. Reconnectez-vous en mode lecture ou avec l’A2F.', 'info', 'Session fermée');
  }, [showToast]);

  // Blocked Account Creation Wizard
  const handleOpenCreateAccount = useCallback(() => {
    showToast(
      'La création et la gestion des comptes sont temporairement bloquées.',
      'warning',
      'Fonctionnalité bloquée'
    );
  }, [showToast]);

  // Toggle Theme cycling (dark -> light -> system)
  const handleToggleTheme = () => {
    const cycleMap: Record<'dark' | 'light' | 'system', 'dark' | 'light' | 'system'> = {
      dark: 'light',
      light: 'system',
      system: 'dark',
    };
    const nextTheme = cycleMap[settings.theme] || 'dark';
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

  // Dynamic starting Elo based on selected/best game mode:
  // Blitz: 1458, Rapid: 1289, Bullet: 1500
  // When in Auto mode: uses the start rating of the best cadence (e.g. Bullet -> 1500)
  const effectiveStartElo = useMemo(() => {
    const modeKey = settings.selectedMode === 'auto' ? activeBestMode : settings.selectedMode;
    return MODE_START_ELOS[modeKey] ?? settings.startElo;
  }, [settings.selectedMode, activeBestMode, settings.startElo]);

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
      effectiveStartElo,
      settings.targetElo,
      settings.trajectoryModel,
      settings.customMilestones
    );
  }, [currentElo, settings, effectiveStartElo]);

  // Monthly objective calculation
  const monthlyObjective = useMemo(() => {
    return calculateMonthlyObjective(
      currentElo,
      new Date(),
      settings.startDate,
      settings.targetDate,
      effectiveStartElo,
      settings.targetElo
    );
  }, [currentElo, settings, effectiveStartElo]);

  // Complementary KPI summary metrics
  const kpiData = useMemo(() => {
    const recordedElos = syncHistory.map((s) => s.bestRating);
    const peakHistorical = recordedElos.length > 0 ? Math.max(...recordedElos) : currentElo;
    const progressionSinceStart = currentElo - effectiveStartElo;

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

  // Render pause overlay when Site Activity Manager blocks the current session (device / iframe / IP)
  if (siteActivityEvaluation.isBlocked) {
    return (
      <>
        <SitePauseOverlay
          config={siteActivityConfig}
          evaluation={siteActivityEvaluation}
          isIframe={isIframe}
          clientIp={clientIp}
          deviceType={deviceType}
          onOpenAdminUnlock={() => handleOpenSecurityModal('Déverrouillage Administrateur (Site en pause)')}
          onRefreshStatus={refreshSiteActivity}
        />
        <NotificationToast toasts={toasts} onDismiss={dismissToast} />
        {securityModalOpen && (
          <SecurityModal
            isOpen={securityModalOpen}
            onClose={() => setSecurityModalOpen(false)}
            onSuccess={handleSecuritySuccess}
            actionTitle={securityModalTitle}
            onShowMessage={showToast}
          />
        )}
      </>
    );
  }

  // When user manually locked/closed session, display the single-account @alpharomeo1500 portal
  if (!userSession) {
    return (
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
        defaultUsername="alpharomeo1500"
      />
    );
  }

  const isSpectator = false;
  const effectiveIsIframe = isIframe;
  const hasAdminAccess = true;

  return (
    <div
      className={`min-h-screen bg-[#07090e] text-neutral-100 flex flex-col font-sans transition-all duration-300 relative selection:bg-[#facc15]/30 selection:text-white ${
        isSidebarExpanded ? 'lg:pl-64' : 'lg:pl-20'
      }`}
    >
      {/* Subtle Ambient Lighting in deep carbon and yellow tones */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[450px] bg-gradient-to-b from-white/[0.04] via-[#facc15]/[0.03] to-transparent blur-3xl opacity-70" />
        <div className="absolute top-[600px] right-0 w-[500px] h-[500px] bg-[#10b981]/[0.02] blur-3xl rounded-full" />
      </div>

      {/* PC Web Left Sidebar (with Panel Admin & Quick Account Switcher) */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onSync={() => performSync(true)}
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        lastJsonBinSyncTime={lastJsonBinSyncTime}
        isAdmin={isAdmin}
        isIframe={effectiveIsIframe}
        isSpectator={isSpectator}
        onOpenSecurityModal={handleOpenSecurityModal}
        onLockAdmin={handleLockAdmin}
        onOpenNetworkModal={() => setNetworkModalOpen(true)}
        jsonBinStatus={jsonBinStatus}
        isNetworkOnline={isNetworkOnline}
        profile={profile}
        stats={stats}
        username={settings.username}
        isExpanded={isSidebarExpanded}
        onToggleExpanded={handleToggleSidebar}
        onLogout={handleLogout}
        sessionExpiresAt={userSession.expiresAt}
        hasAdminAccess={hasAdminAccess}
        onQuickSwitchAccount={handleQuickSwitchAccount}
      />

      {/* Top Bar Navigation (with Quick Switcher & Account Dropdown) */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onSync={() => performSync(true)}
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        lastJsonBinSyncTime={lastJsonBinSyncTime}
        profile={profile}
        stats={stats}
        username={settings.username}
        isAdmin={isAdmin}
        isIframe={effectiveIsIframe}
        isSpectator={isSpectator}
        onOpenSecurityModal={handleOpenSecurityModal}
        onLockAdmin={handleLockAdmin}
        onOpenNetworkModal={() => setNetworkModalOpen(true)}
        jsonBinStatus={jsonBinStatus}
        isNetworkOnline={isNetworkOnline}
        onLogout={handleLogout}
        sessionExpiresAt={userSession.expiresAt}
        hasAdminAccess={hasAdminAccess}
        onQuickSwitchAccount={handleQuickSwitchAccount}
      />

      {/* Main Content Viewport - Fully responsive for Mobile, Tablet & PC */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 sm:pb-8 space-y-5 sm:space-y-8">
        {/* Scheduled Countdown Warning Banner */}
        {siteActivityEvaluation.isCountdownActive && siteActivityConfig.showCountdownBanner && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs backdrop-blur-sm">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 font-black text-amber-300">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                <span>
                  Pause programmée ({SITE_PAUSE_MODE_META[siteActivityConfig.mode].label}) dans{' '}
                  <span className="font-mono text-white">
                    {formatRemainingDuration(siteActivityEvaluation.secondsUntilPause)}
                  </span>
                </span>
              </div>
              <p className="text-neutral-300">
                {siteActivityConfig.customTitle} — Pensez à enregistrer vos saisies avant l'interruption.
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setCurrentTab('admin')}
                className="px-3 py-1.5 rounded-xl bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 transition-colors shrink-0 self-start sm:self-center"
              >
                Gérer la programmation
              </button>
            )}
          </div>
        )}

        {/* Admin Bypass Active Banner while site is paused for visitors */}
        {siteActivityEvaluation.isBypassedByAdmin && (
          <div className="rounded-2xl border border-[#10b981]/35 bg-[#10b981]/10 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-[#10b981]" />
              <div>
                <strong className="text-[#10b981] font-bold">
                  Site en pause ({SITE_PAUSE_MODE_META[siteActivityConfig.mode].label})
                </strong>
                <span className="text-neutral-300 ml-2">
                  Accès maintenu via votre session Administrateur 2FA.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCurrentTab('admin')}
              className="px-3 py-1.5 rounded-xl bg-[#10b981] text-black font-bold text-xs hover:bg-emerald-400 transition-colors shrink-0 self-start sm:self-center"
            >
              Activité du site
            </button>
          </div>
        )}
        {/* TAB 1: DASHBOARD */}
        {currentTab === 'dashboard' && (
          <div className="space-y-5 sm:space-y-8">
            {/* 1. Main Hero Elo Card with Master Progress Bar */}
            <HeroEloCard
              currentElo={currentElo}
              bestMode={activeBestMode}
              startElo={effectiveStartElo}
              targetElo={settings.targetElo}
              daysRemaining={timeMetrics.remainingDays}
              lastSyncTime={lastSyncTime}
              targetDateStr={settings.targetDate}
              isGoalReached={currentElo >= settings.targetElo}
            />

            {/* 2. Today's Objective & Month's Objective Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
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
            startElo={effectiveStartElo}
            targetElo={settings.targetElo}
            startDateStr={settings.startDate}
            targetDateStr={settings.targetDate}
            username={settings.username}
            defaultMode={settings.selectedMode}
          />
        )}

        {/* TAB 3: CALENDAR */}
        {currentTab === 'calendar' && (
          <MilestoneCalendar
            currentElo={currentElo}
            syncHistory={syncHistory}
            milestones={settings.customMilestones}
            startElo={effectiveStartElo}
            targetElo={settings.targetElo}
            startDateStr={settings.startDate}
            targetDateStr={settings.targetDate}
          />
        )}

        {/* TAB 4: HISTORY */}
        {currentTab === 'history' && (
          <SyncLog
            history={syncHistory}
            onHistoryUpdate={(updated) => {
              setSyncHistory(updated);
              persistToCloudAndNotify(settings.username, updated, settings, {
                force: true,
                notifySuccess: true,
              });
            }}
            onShowMessage={showToast}
            username={settings.username}
            onPurgeAccountData={handlePurgeAccountData}
            isAdmin={isAdmin}
            isIframe={isIframe}
            onOpenSecurityModal={handleOpenSecurityModal}
            startDateStr={settings.startDate}
            lastJsonBinSyncTime={lastJsonBinSyncTime}
            jsonBinStatus={jsonBinStatus}
            confirmedDayHashes={confirmedDayHashes}
            onVerifyJsonBinSync={handleVerifyJsonBinSync}
            isVerifyingJsonBin={isVerifyingJsonBin}
            onOpenNetworkModal={() => setNetworkModalOpen(true)}
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
            onHistoryUpdate={(updated) => {
              setSyncHistory(updated);
              persistToCloudAndNotify(settings.username, updated, settings, {
                force: true,
                notifySuccess: true,
              });
            }}
            isAdmin={isAdmin}
            isIframe={isIframe}
            onOpenSecurityModal={handleOpenSecurityModal}
            onLockAdmin={handleLockAdmin}
          />
        )}

        {/* TAB 8: PROFILE VIEW (On-site screen with player banner, big avatar photo, and stats) */}
        {currentTab === 'profile' && (
          <ProfileView
            username={settings.username}
            profile={profile}
            stats={stats}
            settings={settings}
            isAdmin={isAdmin}
            isSpectator={isSpectator}
            onBackToDashboard={() => setCurrentTab('dashboard')}
          />
        )}

        {/* TAB 9: COMPREHENSIVE ADMIN PANEL (Sidebar dedicated tab) */}
        {currentTab === 'admin' && !effectiveIsIframe && (
          <AdminPanelView
            currentUsername={settings.username}
            isAdmin={isAdmin}
            onOpenSecurityModal={handleOpenSecurityModal}
            onLockAdmin={handleLockAdmin}
            onOpenCreateAccount={handleOpenCreateAccount}
            onQuickSwitchAccount={handleQuickSwitchAccount}
            onSelectTab={setCurrentTab}
            onShowMessage={showToast}
            siteActivityConfig={siteActivityConfig}
            clientIp={clientIp}
            onSiteActivityUpdated={(updated) => setSiteActivityConfig(updated)}
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

      {/* Network & JSONBin Status and Configuration Modal */}
      {networkModalOpen && (
        <NetworkAndJsonBinModal
          isOpen={networkModalOpen}
          onClose={() => setNetworkModalOpen(false)}
          username={settings.username}
          onHistoryUpdate={(updated) => {
            setSyncHistory(updated);
            persistToCloudAndNotify(settings.username, updated, settings, {
              force: true,
              notifySuccess: false,
            });
          }}
          onShowMessage={showToast}
          onOpenSettings={() => {
            if (!isAdmin) {
              handleOpenSecurityModal('Accès aux Paramètres Cloud (2FA)', () => setCurrentTab('settings'));
            } else {
              setCurrentTab('settings');
            }
          }}
        />
      )}

      {/* Editorial Clean Footer - Responsive for Mobile & Tablet */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-[#070a10]/90 py-4 sm:py-6 text-center text-xs text-neutral-400 transition-colors backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
            <span className="font-bold text-white tracking-wide">ROAD TO 2000 ELO</span>
            <span aria-hidden="true" className="text-neutral-600 hidden sm:inline">·</span>
            <span className="hidden sm:inline">Programme Officiel de Performance</span>
            {isIframe && (
              <>
                <span aria-hidden="true" className="text-neutral-600">·</span>
                <span className="text-[#facc15] font-bold">[Iframe]</span>
              </>
            )}
            {isSpectator && (
              <>
                <span aria-hidden="true" className="text-neutral-600">·</span>
                <span className="text-sky-400 font-bold">[Spectateur]</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] font-mono text-neutral-400">
            <span>@{settings.username}</span>
            <span aria-hidden="true" className="text-neutral-600">·</span>
            <span>Échéance 31/12/2027</span>
          </div>
        </div>
      </footer>

      {/* Mobile Minimalist Bottom Navigation Dock (< sm) */}
      <nav
        aria-label="Navigation mobile"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#07090e]/95 backdrop-blur-xl border-t border-neutral-800/80 px-2 py-1.5 flex items-center justify-around shadow-[0_-8px_30px_rgba(0,0,0,0.6)]"
      >
        <button
          onClick={() => setCurrentTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
            currentTab === 'dashboard'
              ? 'text-[#facc15] font-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <LayoutDashboard className="h-5 w-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Bilan</span>
        </button>

        <button
          onClick={() => setCurrentTab('charts')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
            currentTab === 'charts'
              ? 'text-[#facc15] font-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <LineChart className="h-5 w-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Courbe</span>
        </button>

        <button
          onClick={() => setCurrentTab('calendar')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
            currentTab === 'calendar'
              ? 'text-[#facc15] font-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Calendar className="h-5 w-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Calendrier</span>
        </button>

        {!isSpectator && (
          <button
            onClick={() => setCurrentTab('history')}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
              currentTab === 'history'
                ? 'text-[#facc15] font-black'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <History className="h-5 w-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Historique</span>
          </button>
        )}

        {!isIframe && !isSpectator && hasAdminAccess && (
          <button
            onClick={() => {
              if (!isAdmin) {
                handleOpenSecurityModal('Panel Administrateur', () => setCurrentTab('admin'));
              } else {
                setCurrentTab('admin');
              }
            }}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
              currentTab === 'admin'
                ? 'text-[#facc15] font-black'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="h-5 w-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Admin</span>
          </button>
        )}

        {!isIframe && !isSpectator && (
          <button
            onClick={() => {
              if (!isAdmin) {
                handleOpenSecurityModal('Accès aux Réglages', () => setCurrentTab('settings'));
              } else {
                setCurrentTab('settings');
              }
            }}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
              currentTab === 'settings'
                ? 'text-[#facc15] font-black'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <SettingsIcon className="h-5 w-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Réglages</span>
          </button>
        )}
      </nav>
    </div>
  );
}
