/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminPanelView } from './components/AdminPanelView';
import { DailyObjectiveCard } from './components/DailyObjectiveCard';
import { FirebaseErrorBoundary } from './components/FirebaseErrorBoundary';
import { GameModesBreakdown } from './components/GameModesBreakdown';
import { HeroEloCard } from './components/HeroEloCard';
import { HistoryChart } from './components/HistoryChart';
import { IframeEmbedGuide } from './components/IframeEmbedGuide';
import { KpiSummaryRow } from './components/KpiSummaryRow';
import { MilestoneCalendar } from './components/MilestoneCalendar';
import { MobileLiquidGlassDock } from './components/MobileLiquidGlassDock';
import { MobileMoreSheet } from './components/MobileMoreSheet';
import { MobileNotificationCenter } from './components/MobileNotificationCenter';
import { MobileProfileSheet } from './components/MobileProfileSheet';
import { Navbar, NavTab } from './components/Navbar';
import { NotificationToast, ToastMessage } from './components/NotificationToast';
import { MonthlyObjectiveCard } from './components/MonthlyObjectiveCard';
import { NetworkAndJsonBinModal } from './components/NetworkAndJsonBinModal';
import { FirebaseSyncModal } from './components/FirebaseSyncModal';
import { Sidebar } from './components/Sidebar';
import { SecurityModal } from './components/SecurityModal';
import { SettingsView } from './components/SettingsView';
import { SyncLog } from './components/SyncLog';
import { TestRunner } from './components/TestRunner';
import {
  AppSettings,
  AppTheme,
  ChessComProfileResponse,
  ChessComStatsResponse,
  GameMode,
  SyncRecord,
} from './types/chess';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, isAuthorizedOwnerUser, signOutFirebase } from './firebase';
import { FirebaseMirrorStatus, getFirebaseMirrorStatus, mirrorDataToFirestore } from './utils/firebaseMirror';
import {
  deriveFirebaseIndicatorStatus,
  getSyncDiagnosticsSnapshot,
  installGlobalSyncDiagnosticsCapture,
  SyncDiagnosticsSnapshot,
} from './utils/syncDiagnostics';
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
  DeviceCategory,
  evaluateSiteActivity,
  fetchSiteActivity,
  formatRemainingDuration,
  getLocalSiteActivityConfig,
  setLocalSiteActivityConfig,
  SITE_PAUSE_MODE_META,
  SiteActivityConfig,
  subscribeSiteActivityFirestore,
} from './utils/siteActivity';
import {
  clearUserSession,
  fetchTotpConfigFromServer,
  getActiveUserSession,
  getClientIp,
  getTrustedIps,
  isAdminSessionActive,
  isExplicitReadOnlyEmbed,
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
  normalizeSiteVersion,
  purgeAllUserData,
  purgeLegacyAndStaleData,
  saveStoredSettings,
} from './utils/storage';
import {
  AppNotificationItem,
  getNotificationPrefs,
  getStoredNotifications,
  inferNotificationMeta,
  MobileNotificationPrefs,
  saveNotificationPrefs,
  saveStoredNotifications,
  triggerNotificationHaptic,
} from './utils/notifications';

export default function App() {
  // Strict Iframe & Embed Mode Detection
  const isIframe = useMemo(() => isRunningInIframe(), []);

  // Mandatory Google Sign-In state (owner account verified via SHA-256 without exposing email)
  const [googleAuthState, setGoogleAuthState] = useState<{
    ready: boolean;
    authorized: boolean;
    error: string | null;
  }>({
    ready: false,
    authorized: false,
    error: null,
  });

  // Session state (must pass Google auth first, then either 2FA for full rights or limited read access)
  const [userSession, setUserSession] = useState<UserSession | null>(() => getActiveUserSession());

  // Admin 2FA Session state (strictly false unless unlocked by 2FA)
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
  const [notificationHistory, setNotificationHistory] = useState<AppNotificationItem[]>(() =>
    getStoredNotifications()
  );
  const [notifPrefs, setNotifPrefs] = useState<MobileNotificationPrefs>(() => getNotificationPrefs());
  const [notificationCenterOpen, setNotificationCenterOpen] = useState<boolean>(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState<boolean>(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState<boolean>(false);

  // Network, JSONBin & Firebase online status states
  const [networkModalOpen, setNetworkModalOpen] = useState(false);
  const [firebaseModalOpen, setFirebaseModalOpen] = useState(false);
  const [syncDiagnostics, setSyncDiagnostics] = useState<SyncDiagnosticsSnapshot>(() =>
    getSyncDiagnosticsSnapshot()
  );
  const [isFirebaseMirrorSyncing, setIsFirebaseMirrorSyncing] = useState<boolean>(
    () => getFirebaseMirrorStatus().status === 'syncing'
  );
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
  const [deviceType, setDeviceType] = useState<DeviceCategory>(() => detectDeviceCategory());
  const [siteActivityConfig, setSiteActivityConfig] = useState<SiteActivityConfig>(() => getLocalSiteActivityConfig());
  const [clientIp, setClientIp] = useState<string>('');
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState<number>(0);
  const [pauseAdminOverride, setPauseAdminOverride] = useState<boolean>(false);
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

  // Apply theme to document element (base=dark, light, ocean, colors, and system Desktop auto-detection)
  useEffect(() => {
    const root = document.documentElement;
    const applyResolvedTheme = (resolved: 'dark' | 'light' | 'ocean' | 'colors') => {
      root.setAttribute('data-theme', resolved);
      if (resolved === 'light') {
        root.classList.remove('dark');
      } else {
        root.classList.add('dark');
      }
    };

    const applyTheme = (theme: AppTheme) => {
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyResolvedTheme(prefersDark ? 'dark' : 'light');
      } else if (theme === 'light' || theme === 'ocean' || theme === 'colors') {
        applyResolvedTheme(theme);
      } else {
        applyResolvedTheme('dark');
      }
    };

    applyTheme(settings.theme);

    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        applyResolvedTheme(e.matches ? 'dark' : 'light');
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

    const handleDiagUpdated = (e: Event) => {
      const detail = (e as CustomEvent<SyncDiagnosticsSnapshot>).detail;
      setSyncDiagnostics(detail || getSyncDiagnosticsSnapshot());
    };
    const handleMirrorUpdated = (e: Event) => {
      const detail = (e as CustomEvent<FirebaseMirrorStatus>).detail;
      setIsFirebaseMirrorSyncing(detail?.status === 'syncing');
    };

    installGlobalSyncDiagnosticsCapture();
    window.addEventListener('roadto2000:sync-diagnostics-updated', handleDiagUpdated);
    window.addEventListener('roadto2000:firebase-mirror-updated', handleMirrorUpdated);
    window.addEventListener('roadto2000:jsonbin-updated', handleJsonBinUpdated);
    checkJsonBin();
    const interval = setInterval(checkJsonBin, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('roadto2000:sync-diagnostics-updated', handleDiagUpdated);
      window.removeEventListener('roadto2000:firebase-mirror-updated', handleMirrorUpdated);
      window.removeEventListener('roadto2000:jsonbin-updated', handleJsonBinUpdated);
      clearInterval(interval);
    };
  }, [settings.username]);

  // Enforce authorized Google Auth state & reconcile Firebase-first (with JSONBin fallback)
  useEffect(() => {
    let active = true;

    const handleAuthRejected = (e: Event) => {
      if (!active) return;
      const reason =
        (e as CustomEvent<{ reason?: string }>).detail?.reason ||
        "Accès refusé : ce compte Google n'est pas autorisé à accéder à cet espace.";
      setGoogleAuthState({ ready: true, authorized: false, error: reason });
    };

    window.addEventListener('roadto2000:firebase-auth-rejected', handleAuthRejected);

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!active) return;
      if (!fbUser) {
        setGoogleAuthState((prev) => ({
          ready: true,
          authorized: false,
          error: prev.error,
        }));
        return;
      }

      const authorized = await isAuthorizedOwnerUser(fbUser);
      if (!active) return;

      if (!authorized) {
        setGoogleAuthState({
          ready: true,
          authorized: false,
          error: "Accès refusé : ce compte Google n'est pas autorisé à accéder à cet espace.",
        });
        return;
      }

      setGoogleAuthState({ ready: true, authorized: true, error: null });

      try {
        const res = await reconcileCloudSync(settings.username, syncHistory, settings, {
          isSpectator: Boolean(userSession?.isSpectator),
          forcePull: false,
        });
        if (!active) return;
        if (res.didUpdate) {
          setSyncHistory(res.history);
          if (res.history.length > 0) setLastSyncTime(res.history[0].timestamp);
          if (res.settings) setSettings({ ...res.settings, username: 'alpharomeo1500' });
        }
        if (res.sourceUsed === 'firebase') {
          setJsonBinStatus('synced');
          if (res.confirmedDayHashes) setConfirmedDayHashes(res.confirmedDayHashes);
        } else if (syncHistory.length > 0) {
          mirrorDataToFirestore({
            username: settings.username,
            history: syncHistory,
            settings,
            jsonBinSyncedAt: lastSyncTime,
          }).catch(() => {});
        }
      } catch {}
    });

    return () => {
      active = false;
      window.removeEventListener('roadto2000:firebase-auth-rejected', handleAuthRejected);
      unsub();
    };
  }, [settings.username]);

  // Reconcile TOTP secret from backend on mount & keep device category responsive to resize/rotation
  useEffect(() => {
    fetchTotpConfigFromServer().catch(() => {});

    const updateDevice = () => {
      const detected = detectDeviceCategory();
      setDeviceType((prev) => (prev === detected ? prev : detected));
    };
    window.addEventListener('resize', updateDevice);
    window.addEventListener('orientationchange', updateDevice);
    return () => {
      window.removeEventListener('resize', updateDevice);
      window.removeEventListener('orientationchange', updateDevice);
    };
  }, []);

  // Fetch & poll Site Activity / Pause configuration across all devices and iframes
  const clientIpRef = useRef<string>('');
  const refreshSiteActivity = useCallback(async (forceCloud = false) => {
    try {
      const res = await fetchSiteActivity(forceCloud);
      setSiteActivityConfig(res.config);
      if (typeof res.serverTime === 'number' && Number.isFinite(res.serverTime)) {
        setServerClockOffsetMs(res.serverTime - Date.now());
      }
      if (res.clientIp) {
        clientIpRef.current = res.clientIp;
        setClientIp(res.clientIp);
      } else if (!clientIpRef.current) {
        const publicIp = await getClientIp();
        if (publicIp) {
          clientIpRef.current = publicIp;
          setClientIp(publicIp);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    refreshSiteActivity(true);

    // Real-time Firestore listener (<100ms propagation for site pause/resume across all devices)
    const unsubSiteActivity = subscribeSiteActivityFirestore((fbConfig) => {
      setLocalSiteActivityConfig(fbConfig);
      setSiteActivityConfig(fbConfig);
    });

    const handleUpdated = (e: Event) => {
      const custom = e as CustomEvent<SiteActivityConfig>;
      if (custom.detail) {
        setSiteActivityConfig(custom.detail);
      }
    };
    const handleVisibilityOrFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        refreshSiteActivity(false);
      }
    };
    const handleOnlineSync = () => refreshSiteActivity(true);
    const handleStorageSync = (ev: StorageEvent) => {
      if (ev.key === 'roadto2000_site_activity_v1') {
        refreshSiteActivity(false);
      }
    };

    window.addEventListener('roadto2000:site-activity-updated', handleUpdated);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('online', handleOnlineSync);
    window.addEventListener('storage', handleStorageSync);

    const pollId = setInterval(() => {
      refreshSiteActivity(false);
    }, 15000);

    return () => {
      unsubSiteActivity();
      window.removeEventListener('roadto2000:site-activity-updated', handleUpdated);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('online', handleOnlineSync);
      window.removeEventListener('storage', handleStorageSync);
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
      now: activityNowTick + serverClockOffsetMs,
      adminOverride: pauseAdminOverride,
    });
  }, [siteActivityConfig, isAdmin, isIframe, deviceType, clientIp, activityNowTick, serverClockOffsetMs, pauseAdminOverride]);

  useEffect(() => {
    if (siteActivityEvaluation.autoResumedExpired) {
      refreshSiteActivity(true);
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

  // Persistent Notification History & Mobile Toast helper
  const showToast = useCallback(
    (
      message: string,
      type: 'info' | 'success' | 'warning' = 'info',
      title = 'Road to 2000',
      options?: { targetTab?: NavTab; bypassDnd?: boolean }
    ) => {
      const inferred = inferNotificationMeta(title, message);
      const category = inferred.category;
      const targetTab = options?.targetTab ?? inferred.targetTab;
      const now = Date.now();
      const id = `toast_${now}_${Math.random().toString(36).substring(2, 6)}`;

      const historyItem: AppNotificationItem = {
        id,
        title,
        message,
        type,
        category,
        createdAt: now,
        read: false,
        targetTab,
      };

      setNotificationHistory((prev) => {
        const next = [historyItem, ...prev].slice(0, 40);
        saveStoredNotifications(next);
        return next;
      });

      if (!options?.bypassDnd && (notifPrefs.dnd || !notifPrefs.categories[category])) {
        return;
      }

      if (notifPrefs.haptic) {
        triggerNotificationHaptic(type);
      }

      const durationMs =
        notifPrefs.autoHideSeconds === 0 ? 0 : (notifPrefs.autoHideSeconds || 6) * 1000;

      const newToast: ToastMessage = {
        id,
        title,
        message,
        type,
        category,
        createdAt: now,
        durationMs,
        targetTab,
      };

      setToasts((prev) => [...prev, newToast]);
      if (durationMs > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, durationMs + 400);
      }
    },
    [notifPrefs]
  );

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleUpdateNotifPrefs = useCallback((next: MobileNotificationPrefs) => {
    setNotifPrefs(next);
    saveNotificationPrefs(next);
  }, []);

  const handleMarkAllNotificationsRead = useCallback(() => {
    setNotificationHistory((prev) => {
      const next = prev.map((item) => ({ ...item, read: true }));
      saveStoredNotifications(next);
      return next;
    });
  }, []);

  const handleMarkOneNotificationRead = useCallback((id: string) => {
    setNotificationHistory((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, read: true } : item));
      saveStoredNotifications(next);
      return next;
    });
  }, []);

  const handleDeleteOneNotification = useCallback((id: string) => {
    setNotificationHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveStoredNotifications(next);
      return next;
    });
  }, []);

  const handleClearAllNotifications = useCallback(() => {
    setNotificationHistory([]);
    saveStoredNotifications([]);
  }, []);

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
    if (isExplicitReadOnlyEmbed()) {
      showToast('Cette action est désactivée en mode Iframe consultation.', 'warning');
      return;
    }
    if (isAdmin && !siteActivityEvaluation.isBlocked) {
      if (onGranted) onGranted();
      return;
    }
    setSecurityModalTitle(title);
    setPendingAction(() => onGranted || null);
    setSecurityModalOpen(true);
  }, [isAdmin, siteActivityEvaluation.isBlocked, showToast]);

  const handleSecuritySuccess = useCallback(() => {
    setIsAdmin(true);
    setHasAdminRole(true);
    setPauseAdminOverride(true);
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
    setPauseAdminOverride(false);
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

    const canRunCloudSync = Boolean(userSession) && (isExplicitReadOnlyEmbed() || googleAuthState.authorized);

    if (canRunCloudSync) {
      doReconciliation(true);
    }

    const handleFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && canRunCloudSync) {
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
  }, [settings.username, Boolean(userSession), googleAuthState.authorized]);

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

  // User logout / lock session & sign out Google Firebase
  const handleLogout = useCallback(async () => {
    try {
      await signOutFirebase();
    } catch {}
    clearUserSession();
    revokeAdminSession();
    setIsAdmin(false);
    setPauseAdminOverride(false);
    setHasAdminRole(true);
    setUserSession(null);
    setCurrentTab('dashboard');
    showToast('Session verrouillée. Reconnectez-vous via Google & A2F.', 'info', 'Session fermée');
  }, [showToast]);

  // Blocked Account Creation Wizard
  const handleOpenCreateAccount = useCallback(() => {
    showToast(
      'La création et la gestion des comptes sont temporairement bloquées.',
      'warning',
      'Fonctionnalité bloquée'
    );
  }, [showToast]);

  // Instant theme update helper (preview + local persistence)
  const handlePreviewTheme = useCallback((nextTheme: AppTheme) => {
    setSettings((prev) => {
      const updated: AppSettings = { ...prev, theme: nextTheme };
      saveStoredSettings(updated);
      return updated;
    });
  }, []);

  // Toggle Theme cycling (dark -> light -> ocean -> colors -> system)
  const handleToggleTheme = () => {
    const cycleMap: Record<AppTheme, AppTheme> = {
      dark: 'light',
      light: 'ocean',
      ocean: 'colors',
      colors: 'system',
      system: 'dark',
    };
    const nextTheme = cycleMap[settings.theme] || 'dark';
    handlePreviewTheme(nextTheme);
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
          onAdminUnlocked={() => {
            setIsAdmin(true);
            setHasAdminRole(true);
            setPauseAdminOverride(true);
            showToast('Déverrouillage A2F réussi. Accès Administrateur accordé.', 'success', 'Accès Admin');
          }}
          onRefreshStatus={() => refreshSiteActivity(true)}
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

  const readOnlyEmbed = isExplicitReadOnlyEmbed();

  // Wait for Firebase Auth restoration before rendering protected screens
  if (!readOnlyEmbed && !googleAuthState.ready) {
    return (
      <div className="min-h-screen w-full bg-[#07090e] text-neutral-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 rounded-2xl border border-[#facc15]/30 bg-[#facc15]/10 flex items-center justify-center">
            <span className="h-5 w-5 rounded-full border-2 border-[#facc15] border-t-transparent animate-spin" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-white">Vérification de la session Google...</p>
            <p className="text-xs font-mono text-neutral-500">
              Version v{normalizeSiteVersion(settings.siteVersion)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Enforce mandatory authorized Google Sign-In + optional 2FA gate before entering app
  if (!readOnlyEmbed && (!googleAuthState.authorized || !userSession)) {
    return (
      <>
        <LoginPage
          isGoogleAuthorized={googleAuthState.authorized}
          authError={googleAuthState.error}
          siteVersion={settings.siteVersion}
          onClearAuthError={() => setGoogleAuthState((prev) => ({ ...prev, error: null }))}
          onLoginSuccess={handleLoginSuccess}
        />
        <NotificationToast toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const isSpectator = false;
  const effectiveIsIframe = isIframe;
  const hasAdminAccess = true;
  const effectiveSessionExpiresAt = userSession?.expiresAt ?? Date.now() + 24 * 60 * 60 * 1000;

  const firebaseIndicatorStatus = deriveFirebaseIndicatorStatus(
    syncDiagnostics,
    isFirebaseMirrorSyncing
  );
  const firebaseIssuesCount = syncDiagnostics.issues.filter(
    (i) => !i.resolved && i.severity !== 'info'
  ).length;
  const lastFirebaseSyncTime =
    syncDiagnostics.firebase.lastWriteAt || syncDiagnostics.firebase.lastReadAt;

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
        onOpenFirebaseModal={() => setFirebaseModalOpen(true)}
        firebaseStatus={firebaseIndicatorStatus}
        lastFirebaseSyncTime={lastFirebaseSyncTime}
        firebaseIssuesCount={firebaseIssuesCount}
        isNetworkOnline={isNetworkOnline}
        profile={profile}
        stats={stats}
        username={settings.username}
        isExpanded={isSidebarExpanded}
        onToggleExpanded={handleToggleSidebar}
        onLogout={handleLogout}
        sessionExpiresAt={effectiveSessionExpiresAt}
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
        onOpenFirebaseModal={() => setFirebaseModalOpen(true)}
        firebaseStatus={firebaseIndicatorStatus}
        lastFirebaseSyncTime={lastFirebaseSyncTime}
        firebaseIssuesCount={firebaseIssuesCount}
        isNetworkOnline={isNetworkOnline}
        onLogout={handleLogout}
        sessionExpiresAt={effectiveSessionExpiresAt}
        hasAdminAccess={hasAdminAccess}
        onQuickSwitchAccount={handleQuickSwitchAccount}
        unreadNotificationsCount={notificationHistory.filter((n) => !n.read).length}
        onOpenNotificationCenter={() => setNotificationCenterOpen(true)}
        onOpenProfileSheet={() => setProfileSheetOpen(true)}
      />

      {/* Main Content Viewport - Fully responsive for Mobile, Tablet & PC */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-28 sm:pb-8 space-y-5 sm:space-y-8">
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
            syncHistory={syncHistory}
            onSettingsUpdate={handleSettingsUpdate}
            onPreviewTheme={handlePreviewTheme}
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

      {/* Top-Anchored Swipeable Mobile Notifications & Desktop Toasts */}
      <NotificationToast
        toasts={toasts}
        onDismiss={dismissToast}
        onOpenCenter={() => setNotificationCenterOpen(true)}
        onNavigateTab={(tab) => {
          if (!isAdmin && (tab === 'settings' || tab === 'tests' || tab === 'admin')) {
            handleOpenSecurityModal(
              tab === 'admin' ? 'Panel Administrateur' : 'Paramètres',
              () => setCurrentTab(tab)
            );
            return;
          }
          setCurrentTab(tab);
        }}
      />

      {/* Mobile Notification Center Bottom Sheet & Preferences */}
      <MobileNotificationCenter
        isOpen={notificationCenterOpen}
        onClose={() => setNotificationCenterOpen(false)}
        notifications={notificationHistory}
        prefs={notifPrefs}
        onUpdatePrefs={handleUpdateNotifPrefs}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onMarkOneRead={handleMarkOneNotificationRead}
        onDeleteOne={handleDeleteOneNotification}
        onClearAll={handleClearAllNotifications}
        onNavigateTab={(tab) => {
          if (!isAdmin && (tab === 'settings' || tab === 'tests' || tab === 'admin')) {
            handleOpenSecurityModal(
              tab === 'admin' ? 'Panel Administrateur' : 'Paramètres',
              () => setCurrentTab(tab)
            );
            return;
          }
          setCurrentTab(tab);
        }}
        onSavePreferences={() => {
          showToast(
            'Préférences de notifications enregistrées.',
            'success',
            'Notifications'
          );
        }}
      />

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

      {/* Firebase Live Sync & Reported Issues Diagnostics Modal */}
      {firebaseModalOpen && (
        <FirebaseSyncModal
          isOpen={firebaseModalOpen}
          onClose={() => setFirebaseModalOpen(false)}
          username={settings.username}
          onPushToFirebase={async () => {
            const res = await mirrorDataToFirestore({
              username: settings.username,
              history: syncHistory,
              settings,
              jsonBinSyncedAt: lastSyncTime,
            });
            if (!res.ok) {
              showToast(
                res.error || 'Connexion Google Firebase requise pour envoyer vers Firestore.',
                'warning',
                'Firebase'
              );
            }
            return res.ok;
          }}
          onReconcileNow={async () => {
            const activeUser = settings.username.trim().toLowerCase();
            const res = await reconcileCloudSync(
              activeUser,
              getStoredSyncHistory(activeUser),
              settings,
              { isSpectator: Boolean(userSession?.isSpectator), forcePull: true }
            );
            if (res.didUpdate) {
              setSyncHistory(res.history);
              if (res.history.length > 0) setLastSyncTime(res.history[0].timestamp);
              if (res.settings) setSettings({ ...res.settings, username: 'alpharomeo1500' });
            }
            if (res.confirmedDayHashes) setConfirmedDayHashes(res.confirmedDayHashes);
            if (res.lastJsonBinSyncTime) setLastJsonBinSyncTime(res.lastJsonBinSyncTime);
            showToast(
              res.sourceUsed === 'firebase'
                ? `${res.history.length} relevé(s) rechargés depuis Firebase Firestore.`
                : res.sourceUsed === 'jsonbin'
                ? `${res.history.length} relevé(s) chargés via le repli JSONBin.`
                : 'Cache local conservé (aucune mise à jour distante).',
              res.sourceUsed === 'firebase' ? 'success' : 'info',
              'Rechargement Cloud'
            );
          }}
          onOpenNetworkModal={() => setNetworkModalOpen(true)}
          onOpenFirebaseSettings={() => {
            if (!isAdmin) {
              handleOpenSecurityModal('Paramètres Firebase (2FA)', () => setCurrentTab('settings'));
            } else {
              setCurrentTab('settings');
            }
          }}
          onShowMessage={showToast}
        />
      )}

      {/* Editorial Clean Footer - Responsive for Mobile & Tablet */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-[#070a10]/90 pt-4 pb-24 sm:py-6 text-center text-xs text-neutral-400 transition-colors backdrop-blur-md">
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
            <span aria-hidden="true" className="text-neutral-600">·</span>
            <span
              title={settings.siteVersionNote || undefined}
              className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#facc15]/10 border border-[#facc15]/25 text-[#facc15] font-bold"
            >
              Version v{normalizeSiteVersion(settings.siteVersion)}
            </span>
          </div>
        </div>
      </footer>

      {/* Mobile Profile Bottom Sheet (< sm) */}
      <MobileProfileSheet
        isOpen={profileSheetOpen}
        onClose={() => setProfileSheetOpen(false)}
        profile={profile}
        stats={stats}
        username={settings.username}
        isAdmin={isAdmin}
        isIframe={isIframe}
        isSpectator={isSpectator}
        sessionExpiresAt={effectiveSessionExpiresAt}
        onSelectTab={setCurrentTab}
        onOpenSecurityModal={handleOpenSecurityModal}
        onLockAdmin={handleLockAdmin}
        onLogout={handleLogout}
      />

      {/* Mobile "Plus" Drawer Sheet (Paramètres, Panel Admin, Profil, Tests, Iframe) */}
      <MobileMoreSheet
        isOpen={moreSheetOpen}
        onClose={() => setMoreSheetOpen(false)}
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        username={settings.username}
        isAdmin={isAdmin}
        isIframe={isIframe}
        isSpectator={isSpectator}
        hasAdminAccess={hasAdminAccess}
        isSyncing={isSyncing}
        unreadNotificationsCount={notificationHistory.filter((n) => !n.read).length}
        jsonBinStatus={jsonBinStatus}
        firebaseStatus={firebaseIndicatorStatus}
        firebaseIssuesCount={firebaseIssuesCount}
        onOpenSecurityModal={handleOpenSecurityModal}
        onLockAdmin={handleLockAdmin}
        onSync={() => performSync(true)}
        onOpenNotificationCenter={() => setNotificationCenterOpen(true)}
        onOpenNetworkModal={() => setNetworkModalOpen(true)}
        onOpenFirebaseModal={() => setFirebaseModalOpen(true)}
      />

      {/* Mobile Liquid Glass Sliding Dock (< sm) */}
      <MobileLiquidGlassDock
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isSpectator={isSpectator}
        isMoreSheetOpen={moreSheetOpen}
        onOpenMoreSheet={() => setMoreSheetOpen(true)}
      />
    </div>
  );
}
