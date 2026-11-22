/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileJson,
  Globe,
  KeyRound,
  Lock,
  PauseCircle,
  PlayCircle,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  AccountStatus,
  addTrustedIp,
  DEFAULT_TOTP_SECRET,
  deleteManagedAccount,
  generateNewTotpSecret,
  generateQrCodeDataUrl,
  getClientIp,
  getPublicAuthorizedAccounts,
  getTotpSecret,
  getTotpUri,
  getTrustedIps,
  isTotpEnrolled,
  removeTrustedIp,
  resetTotpToDefaultSecret,
  setAccountStatus,
  setTotpEnrolled,
  syncTotpSecretToServer,
} from '../utils/security';
import {
  buildInitialJsonBinPayload,
  getClientJsonBinCredentials,
  saveJsonBinConfig,
} from '../utils/cloudSync';
import {
  buildAccountsRegistryPayload,
  getAccountsRegistryConfig,
  pullAccountsRegistryFromJsonBin,
  pushAccountsRegistryToJsonBin,
  saveAccountsRegistryConfig,
  scheduleAccountsRegistryPush,
} from '../utils/accountsRegistryCloud';
import { getStoredSyncHistory, saveStoredSyncHistory } from '../utils/storage';
import { AppSettings, GameMode, TrajectoryModel } from '../types/chess';
import { getLocalSiteActivityConfig, SiteActivityConfig } from '../utils/siteActivity';
import { NavTab } from './Navbar';
import { SiteActivityPanel } from './SiteActivityPanel';

interface AdminPanelViewProps {
  currentUsername: string;
  isAdmin: boolean;
  onOpenSecurityModal: (title?: string, onGranted?: () => void) => void;
  onLockAdmin: () => void;
  onOpenCreateAccount: () => void;
  onQuickSwitchAccount: (targetUsername: string) => void;
  onSelectTab: (tab: NavTab) => void;
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning', title?: string) => void;
  siteActivityConfig?: SiteActivityConfig;
  clientIp?: string;
  onSiteActivityUpdated?: (updated: SiteActivityConfig) => void;
}

type AdminWorkspaceTab = 'activity' | 'players' | 'jsonbin' | 'security';

interface EnrichedAccount {
  username: string;
  status: AccountStatus;
  isMaster: boolean;
  binId: string;
  hasKey: boolean;
  syncCount: number;
  latestRating: number | null;
  latestDate: string | null;
  startElo: number;
  targetElo: number;
  targetDate: string;
  selectedMode: GameMode | 'auto';
  createdAt: string | null;
}

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  currentUsername,
  isAdmin,
  onOpenSecurityModal,
  onLockAdmin,
  onOpenCreateAccount,
  onQuickSwitchAccount,
  onSelectTab,
  onShowMessage,
  siteActivityConfig,
  clientIp = '',
  onSiteActivityUpdated,
}) => {
  const [workspace, setWorkspace] = useState<AdminWorkspaceTab>('activity');
  const [accounts, setAccounts] = useState<{ username: string; status: AccountStatus; isMaster: boolean }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [selectedUser, setSelectedUser] = useState<string>(currentUsername);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<string | null>(null);
  const [showInline2FaQr, setShowInline2FaQr] = useState(false);
  const [inline2FaSecret, setInline2FaSecret] = useState<string>(() => getTotpSecret());
  const [inline2FaQrUrl, setInline2FaQrUrl] = useState<string>('');
  const [copiedInlineSecret, setCopiedInlineSecret] = useState(false);
  const [confirmRegenerateSecret, setConfirmRegenerateSecret] = useState(false);
  const [revealedBins, setRevealedBins] = useState<Record<string, boolean>>({});
  const [copiedBinUser, setCopiedBinUser] = useState<string | null>(null);

  // Inspector edit form state
  const [editBinId, setEditBinId] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editStartElo, setEditStartElo] = useState(1500);
  const [editTargetElo, setEditTargetElo] = useState(2000);
  const [editTargetDate, setEditTargetDate] = useState('2027-12-31');
  const [editMode, setEditMode] = useState<GameMode | 'auto'>('auto');
  const [isSavingInspector, setIsSavingInspector] = useState(false);

  // Trusted IPs state
  const [trustedIps, setTrustedIpsState] = useState<string[]>(() => getTrustedIps());
  const [newIpInput, setNewIpInput] = useState('');
  const [isDetectingIp, setIsDetectingIp] = useState(false);

  // Per-player JSONBin template generator state
  const [tplUser, setTplUser] = useState('nouveau_joueur');
  const [tplStartElo, setTplStartElo] = useState(1500);
  const [tplTargetElo, setTplTargetElo] = useState(2000);
  const [tplStartDate, setTplStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [tplTargetDate, setTplTargetDate] = useState('2027-12-31');
  const [tplMode, setTplMode] = useState<'auto' | GameMode>('auto');
  const [tplTrajectory, setTplTrajectory] = useState<TrajectoryModel>('linear');
  const [copiedTpl, setCopiedTpl] = useState(false);

  // Global Accounts Registry JSONBin state
  const [registryConfig, setRegistryConfig] = useState(() => getAccountsRegistryConfig());
  const [regBinIdInput, setRegBinIdInput] = useState(() => getAccountsRegistryConfig().binId);
  const [regApiKeyInput, setRegApiKeyInput] = useState(() => getAccountsRegistryConfig().apiKey);
  const [showRegApiKey, setShowRegApiKey] = useState(false);
  const [isTestingRegistry, setIsTestingRegistry] = useState(false);
  const [isSyncingRegistry, setIsSyncingRegistry] = useState(false);
  const [copiedRegistryJson, setCopiedRegistryJson] = useState(false);

  const refreshAccounts = () => {
    setAccounts(getPublicAuthorizedAccounts());
    setRegistryConfig(getAccountsRegistryConfig());
  };

  useEffect(() => {
    refreshAccounts();
    const handler = () => refreshAccounts();
    window.addEventListener('roadto2000:accounts-updated', handler);
    return () => window.removeEventListener('roadto2000:accounts-updated', handler);
  }, []);

  const readPlayerMeta = (username: string): Omit<EnrichedAccount, 'username' | 'status' | 'isMaster'> => {
    const clean = username.trim().toLowerCase();
    const creds = getClientJsonBinCredentials(clean);
    const history = getStoredSyncHistory(clean);
    let parsedSettings: Partial<AppSettings> = {};
    let createdAt: string | null = null;
    try {
      const raw = localStorage.getItem(`roadto2000_settings_${clean}`);
      if (raw) parsedSettings = JSON.parse(raw);
      createdAt = localStorage.getItem(`roadto2000_acc_created_${clean}`);
    } catch {}
    const latestSync = history.length > 0 ? history[0] : null;
    return {
      binId: creds.binId,
      hasKey: Boolean(creds.apiKey),
      syncCount: history.length,
      latestRating: latestSync?.bestRating ?? null,
      latestDate: latestSync?.timestamp ?? null,
      startElo: parsedSettings.startElo ?? 1500,
      targetElo: parsedSettings.targetElo ?? 2000,
      targetDate: parsedSettings.targetDate ?? '2027-12-31',
      selectedMode: (parsedSettings.selectedMode as GameMode | 'auto') ?? 'auto',
      createdAt,
    };
  };

  const enrichedAccounts: EnrichedAccount[] = useMemo(() => {
    return accounts.map((acc) => ({
      ...acc,
      ...readPlayerMeta(acc.username),
    }));
  }, [accounts]);

  const inspectedAccount = useMemo(() => {
    return (
      enrichedAccounts.find((a) => a.username.toLowerCase() === selectedUser.toLowerCase()) ||
      enrichedAccounts[0] ||
      null
    );
  }, [enrichedAccounts, selectedUser]);

  // Keep Inspector inputs synced when inspectedAccount changes
  useEffect(() => {
    if (!inspectedAccount) return;
    setEditBinId(inspectedAccount.binId || '');
    setEditApiKey('');
    setEditStartElo(inspectedAccount.startElo);
    setEditTargetElo(inspectedAccount.targetElo);
    setEditTargetDate((inspectedAccount.targetDate || '2027-12-31').split('T')[0]);
    setEditMode(inspectedAccount.selectedMode);
    setConfirmDeleteUser(null);
  }, [inspectedAccount?.username]);

  const handleSaveInspector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedAccount) return;
    const clean = inspectedAccount.username.trim().toLowerCase();
    setIsSavingInspector(true);
    try {
      const raw = localStorage.getItem(`roadto2000_settings_${clean}`);
      const existing = raw ? JSON.parse(raw) : {};
      const updated = {
        ...existing,
        username: clean,
        startElo: editStartElo,
        targetElo: editTargetElo,
        targetDate: editTargetDate,
        selectedMode: editMode,
      };
      localStorage.setItem(`roadto2000_settings_${clean}`, JSON.stringify(updated));

      if (editBinId.trim()) {
        await saveJsonBinConfig({
          username: clean,
          binId: editBinId.trim(),
          ...(editApiKey.trim() ? { apiKey: editApiKey.trim() } : {}),
          enabled: true,
        });
      }

      scheduleAccountsRegistryPush();
      refreshAccounts();
      onShowMessage(`Profil @${clean} mis à jour et enregistré dans le registre cloud.`, 'success', 'Inspecteur Admin');
    } catch {
      onShowMessage('Impossible de sauvegarder la configuration.', 'warning');
    } finally {
      setIsSavingInspector(false);
    }
  };

  const handleStatusChange = (username: string, newStatus: AccountStatus) => {
    if (username.toLowerCase() === 'alpharomeo1500') {
      onShowMessage('Le compte administrateur maître est protégé.', 'warning');
      return;
    }
    if (setAccountStatus(username, newStatus)) {
      refreshAccounts();
      const labels: Record<AccountStatus, string> = {
        active: 'réactivé',
        suspended: 'suspendu',
        banned: 'banni',
      };
      onShowMessage(
        `Le compte @${username} a été ${labels[newStatus]}.`,
        newStatus === 'active' ? 'success' : 'warning',
        'Modération'
      );
    }
  };

  const handleDelete = (username: string) => {
    if (username.toLowerCase() === 'alpharomeo1500') return;
    if (deleteManagedAccount(username)) {
      setConfirmDeleteUser(null);
      if (selectedUser.toLowerCase() === username.toLowerCase()) {
        setSelectedUser('alpharomeo1500');
      }
      refreshAccounts();
      onShowMessage(`Compte @${username} supprimé définitivement.`, 'success', 'Suppression');
    }
  };

  const handlePurgePlayerLocal = (username: string) => {
    saveStoredSyncHistory([], username);
    refreshAccounts();
    onShowMessage(`Cache d'historique local purgé pour @${username}.`, 'info');
  };

  const handleExportPlayer = (username: string) => {
    const meta = readPlayerMeta(username);
    const history = getStoredSyncHistory(username);
    const payload = {
      exportedAt: new Date().toISOString(),
      username,
      binId: meta.binId,
      recordsCount: history.length,
      records: history,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roadto2000_${username}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowMessage(`Export JSON téléchargé pour @${username}.`, 'success');
  };

  const handleExportPlatformBackup = () => {
    const allData = enrichedAccounts.map((acc) => ({
      ...acc,
      history: getStoredSyncHistory(acc.username),
    }));
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), platform: 'RoadTo2000Elo', accounts: allData }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roadto2000_platform_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowMessage('Archive globale téléchargée.', 'success');
  };

  const handleCopyBinId = (username: string, binId: string) => {
    if (!binId) return;
    navigator.clipboard.writeText(binId).then(() => {
      setCopiedBinUser(username);
      setTimeout(() => setCopiedBinUser(null), 1800);
    });
  };

  const handleDetectCurrentIp = async () => {
    setIsDetectingIp(true);
    try {
      const ip = await getClientIp();
      if (ip) {
        setNewIpInput(ip);
        onShowMessage(`IP détectée : ${ip}`, 'info');
      } else {
        onShowMessage('Impossible de détecter votre IP publique.', 'warning');
      }
    } finally {
      setIsDetectingIp(false);
    }
  };

  const handleAddIp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIpInput.trim() || newIpInput.trim().length < 7) {
      onShowMessage('Veuillez saisir une adresse IP valide.', 'warning');
      return;
    }
    if (addTrustedIp(newIpInput.trim())) {
      setTrustedIpsState(getTrustedIps());
      setNewIpInput('');
      onShowMessage('Adresse IP ajoutée à la liste de confiance.', 'success');
    }
  };

  const handleRemoveIp = (ip: string) => {
    removeTrustedIp(ip);
    setTrustedIpsState(getTrustedIps());
    onShowMessage(`IP ${ip} retirée.`, 'info');
  };

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedAccounts.filter((acc) => {
      const matchesSearch =
        !q || acc.username.toLowerCase().includes(q) || (acc.binId || '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || acc.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [enrichedAccounts, searchQuery, statusFilter]);

  const statsSummary = useMemo(() => {
    const rated = enrichedAccounts.filter((a) => typeof a.latestRating === 'number');
    const avgElo =
      rated.length > 0 ? Math.round(rated.reduce((sum, a) => sum + (a.latestRating || 0), 0) / rated.length) : null;
    const totalSyncs = enrichedAccounts.reduce((sum, a) => sum + a.syncCount, 0);
    return {
      total: enrichedAccounts.length,
      active: enrichedAccounts.filter((a) => a.status === 'active').length,
      restricted: enrichedAccounts.filter((a) => a.status !== 'active').length,
      avgElo,
      totalSyncs,
    };
  }, [enrichedAccounts]);

  const generatedJsonString = useMemo(() => {
    return JSON.stringify(
      buildInitialJsonBinPayload({
        username: tplUser,
        startElo: tplStartElo,
        targetElo: tplTargetElo,
        startDate: tplStartDate,
        targetDate: tplTargetDate,
        selectedMode: tplMode,
        trajectoryModel: tplTrajectory,
      }),
      null,
      2
    );
  }, [tplUser, tplStartElo, tplTargetElo, tplStartDate, tplTargetDate, tplMode, tplTrajectory]);

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(generatedJsonString).then(() => {
      setCopiedTpl(true);
      setTimeout(() => setCopiedTpl(false), 2000);
      onShowMessage('JSON de base joueur copié.', 'success');
    });
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([generatedJsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jsonbin_init_${(tplUser || 'joueur').trim().toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const registryJsonString = useMemo(() => {
    return JSON.stringify(buildAccountsRegistryPayload(), null, 2);
  }, [accounts]);

  const handleCopyRegistryJson = () => {
    navigator.clipboard.writeText(registryJsonString).then(() => {
      setCopiedRegistryJson(true);
      setTimeout(() => setCopiedRegistryJson(false), 2000);
      onShowMessage('JSON du Registre copié.', 'success');
    });
  };

  const handleDownloadRegistryJson = () => {
    const blob = new Blob([registryJsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roadto2000_accounts_registry_init.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveRegistryConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTestingRegistry(true);
    try {
      const res = await saveAccountsRegistryConfig({
        binId: regBinIdInput.trim(),
        apiKey: regApiKeyInput.trim(),
        enabled: true,
      });
      setRegistryConfig(getAccountsRegistryConfig());
      if (res.success && res.status === 'synced') {
        onShowMessage('Registre Cloud JSONBin connecté et vérifié.', 'success', 'Registre Cloud');
      } else if (res.status === 'pending_keys') {
        onShowMessage('Bin ID retiré.', 'info');
      } else {
        onShowMessage(res.error || 'Bin ID ou clé invalide.', 'warning', 'Erreur JSONBin');
      }
    } finally {
      setIsTestingRegistry(false);
    }
  };

  const handleManualPushRegistry = async () => {
    setIsSyncingRegistry(true);
    try {
      const res = await pushAccountsRegistryToJsonBin();
      setRegistryConfig(getAccountsRegistryConfig());
      if (res.success) {
        onShowMessage(`${res.accountsCount} compte(s) poussé(s) sur JSONBin (${registryConfig.binId}).`, 'success');
      } else {
        onShowMessage(res.error || 'Échec de synchronisation vers JSONBin.', 'warning');
      }
    } finally {
      setIsSyncingRegistry(false);
    }
  };

  const handleManualPullRegistry = async () => {
    setIsSyncingRegistry(true);
    try {
      const res = await pullAccountsRegistryFromJsonBin(true);
      refreshAccounts();
      if (res.success) {
        onShowMessage(`${res.importedCount ?? 0} compte(s) synchronisé(s) depuis le registre cloud.`, 'success');
      } else {
        onShowMessage(res.error || 'Échec de lecture depuis JSONBin.', 'warning');
      }
    } finally {
      setIsSyncingRegistry(false);
    }
  };

  // Locked gate screen
  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-[#0b0e14] p-8 sm:p-12 text-center space-y-5">
        <div className="mx-auto h-14 w-14 rounded-2xl border border-[#facc15]/30 bg-[#facc15]/10 flex items-center justify-center text-[#facc15]">
          <Lock className="h-6 w-6" />
        </div>
        <div className="space-y-2 max-w-md mx-auto">
          <h2 className="text-xl font-bold text-white font-display">Console d'Administration verrouillée</h2>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Validez votre code à 6 chiffres depuis votre application Authenticator pour ouvrir la console de gestion.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenSecurityModal('Console Administration')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-bold transition-colors whitespace-nowrap"
        >
          <ShieldCheck className="h-4 w-4" />
          <span>Déverrouiller avec l'A2F Principale</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* 1. CLEAN ENTERPRISE COMMAND HEADER */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-neutral-800/90">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            <span>Administration</span>
            <span aria-hidden="true">/</span>
            <span>Console Plateforme</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-neutral-300">@{currentUsername}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white font-display tracking-tight">
            Console d'Administration
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportPlatformBackup}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-neutral-800 bg-[#0b0e14] hover:bg-neutral-900 text-neutral-200 hover:text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5 text-neutral-400" />
            <span>Exporter archive</span>
          </button>

          <button
            type="button"
            onClick={onLockAdmin}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-neutral-800 bg-[#0b0e14] hover:bg-neutral-900 text-neutral-200 hover:text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Unlock className="h-3.5 w-3.5 text-[#10b981]" />
            <span>Verrouiller</span>
          </button>

          <button
            type="button"
            disabled
            title="Création de nouveaux comptes temporairement bloquée"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-800 bg-neutral-900/70 text-neutral-500 text-xs font-bold cursor-not-allowed whitespace-nowrap shrink-0"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Gestion comptes bloquée</span>
          </button>
        </div>
      </header>

      {/* 2. UNIFIED HAIRLINE METRICS STRIP (Single Elevation, Tabular Numerals) */}
      <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-neutral-800/80">
        <div className="p-4 sm:p-5 space-y-1">
          <span className="text-xs font-medium text-neutral-400 block">Comptes plateforme</span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-white">{statsSummary.total}</span>
            <span className="text-xs text-neutral-400 font-mono tabular-nums">
              {statsSummary.active} actifs · {statsSummary.restricted} restreints
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-1">
          <span className="text-xs font-medium text-neutral-400 block">Elo moyen & relevés</span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#facc15]">
              {statsSummary.avgElo !== null ? statsSummary.avgElo : '—'}
            </span>
            <span className="text-xs text-neutral-400 font-mono tabular-nums">
              {statsSummary.totalSyncs} synchros
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-1">
          <span className="text-xs font-medium text-neutral-400 block">Registre Cloud JSONBin</span>
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`text-sm font-bold ${
                registryConfig.configured && registryConfig.lastStatus !== 'error'
                  ? 'text-[#10b981]'
                  : registryConfig.lastStatus === 'error'
                  ? 'text-[#ef4444]'
                  : 'text-amber-400'
              }`}
            >
              {registryConfig.configured
                ? registryConfig.lastStatus === 'error'
                  ? 'Erreur de connexion'
                  : 'Connecté'
                : 'Non configuré'}
            </span>
            <span className="text-xs text-neutral-400 font-mono tabular-nums">
              {registryConfig.binId ? `${registryConfig.binId.slice(0, 6)}...${registryConfig.binId.slice(-4)}` : '—'}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-1">
          <span className="text-xs font-medium text-neutral-400 block">Sécurité & accès</span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-bold text-white">
              {isTotpEnrolled() ? 'A2F Principale active' : 'A2F à configurer'}
            </span>
            <span className="text-xs text-neutral-400 font-mono tabular-nums">
              {trustedIps.length} IP(s)
            </span>
          </div>
        </div>
      </section>

      {/* 3. WORKSPACE NAVIGATION BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800/80 pb-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#0b0e14] border border-neutral-800/90">
          <button
            type="button"
            onClick={() => setWorkspace('activity')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              workspace === 'activity'
                ? 'bg-[#facc15] text-black font-bold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            <span>Activité du site</span>
          </button>

          <button
            type="button"
            onClick={() => setWorkspace('players')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              workspace === 'players'
                ? 'bg-neutral-800 text-neutral-200 font-bold'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <Lock className="h-3 w-3 text-amber-400" />
            <span>Comptes (Bloqué)</span>
          </button>

          <button
            type="button"
            onClick={() => setWorkspace('jsonbin')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              workspace === 'jsonbin'
                ? 'bg-[#facc15] text-black font-bold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>Registre & JSONBin</span>
          </button>

          <button
            type="button"
            onClick={() => setWorkspace('security')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              workspace === 'security'
                ? 'bg-[#facc15] text-black font-bold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>Sécurité & IPs</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualPullRegistry}
            disabled={isSyncingRegistry || !registryConfig.configured}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-800 bg-[#0b0e14] hover:bg-neutral-900 text-xs font-semibold text-neutral-300 hover:text-white transition-colors disabled:opacity-40 whitespace-nowrap"
            title="Synchroniser la liste des comptes depuis JSONBin"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#facc15] ${isSyncingRegistry ? 'animate-spin' : ''}`} />
            <span>Sync registre</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('tests')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-800 bg-[#0b0e14] hover:bg-neutral-900 text-xs font-semibold text-neutral-300 hover:text-white transition-colors whitespace-nowrap"
          >
            <Activity className="h-3.5 w-3.5 text-[#10b981]" />
            <span>Diagnostics</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* WORKSPACE 0: SITE ACTIVITY & MAINTENANCE/PAUSE CONTROL               */}
      {/* ===================================================================== */}
      {workspace === 'activity' && (
        <SiteActivityPanel
          currentConfig={siteActivityConfig || getLocalSiteActivityConfig()}
          currentClientIp={clientIp}
          onConfigUpdated={(updated) => {
            if (onSiteActivityUpdated) onSiteActivityUpdated(updated);
          }}
          onShowMessage={onShowMessage}
        />
      )}

      {/* ===================================================================== */}
      {/* WORKSPACE 1: ACCOUNT MANAGEMENT TEMPORARILY LOCKED                    */}
      {/* ===================================================================== */}
      {workspace === 'players' && (
        <div className="rounded-2xl border border-amber-500/30 bg-[#0b0e14] p-8 sm:p-12 text-center space-y-5">
          <div className="mx-auto h-14 w-14 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-center text-amber-400">
            <Lock className="h-6 w-6" />
          </div>
          <div className="space-y-2 max-w-lg mx-auto">
            <h2 className="text-lg sm:text-xl font-bold text-white font-display">
              Gestion des comptes temporairement bloquée
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
              La création, le basculement et la gestion multi-comptes sont actuellement verrouillés. La plateforme fonctionne exclusivement sur votre compte personnel <span className="font-mono text-[#facc15] font-bold">@alpharomeo1500</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWorkspace('activity')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-bold transition-colors"
          >
            <Power className="h-4 w-4" />
            <span>Ouvrir la Gestion d'Activité du Site</span>
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* WORKSPACE 2: GLOBAL ACCOUNTS REGISTRY + PLAYER JSONBIN GENERATOR      */}
      {/* ===================================================================== */}
      {workspace === 'jsonbin' && (
        <div className="space-y-6">
          {/* Global Accounts Registry Bin */}
          <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-800/80">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Database className="h-4 w-4 text-[#facc15]" />
                  <span>Registre Global des Comptes (JSONBin Automatique)</span>
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  Synchronise automatiquement tous les comptes créés, statuts et réglages entre vos appareils.
                </p>
              </div>
              <span
                className={`text-xs font-bold ${
                  registryConfig.configured && registryConfig.lastStatus !== 'error'
                    ? 'text-[#10b981]'
                    : registryConfig.lastStatus === 'error'
                    ? 'text-[#ef4444]'
                    : 'text-amber-400'
                }`}
              >
                {registryConfig.configured
                  ? registryConfig.lastStatus === 'error'
                    ? 'Erreur de connexion'
                    : `Actif · ${accounts.length} comptes`
                  : 'En attente de configuration'}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <form onSubmit={handleSaveRegistryConfig} className="lg:col-span-5 space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-neutral-300 mb-1">Bin ID du Registre</label>
                  <input
                    type="text"
                    value={regBinIdInput}
                    onChange={(e) => setRegBinIdInput(e.target.value)}
                    placeholder="Ex : 6af9f1d7ffd5d16053c38f30"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-white font-mono focus:border-[#facc15] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-300 mb-1">Clé API / Master Key JSONBin</label>
                  <div className="relative">
                    <input
                      type={showRegApiKey ? 'text' : 'password'}
                      value={regApiKeyInput}
                      onChange={(e) => setRegApiKeyInput(e.target.value)}
                      placeholder="$2a$10$..."
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 pl-3.5 pr-10 py-2.5 text-white font-mono focus:border-[#facc15] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegApiKey((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                      title={showRegApiKey ? 'Masquer la clé' : 'Afficher la clé'}
                    >
                      {showRegApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {registryConfig.lastError && (
                  <div className="p-2.5 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-xs">
                    {registryConfig.lastError}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isTestingRegistry}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{isTestingRegistry ? 'Test...' : 'Tester & Enregistrer'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleManualPushRegistry}
                    disabled={isSyncingRegistry || !registryConfig.configured}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-white font-semibold disabled:opacity-40 whitespace-nowrap"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-[#facc15] ${isSyncingRegistry ? 'animate-spin' : ''}`} />
                    <span>Push</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleManualPullRegistry}
                    disabled={isSyncingRegistry || !registryConfig.configured}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-sky-400 font-semibold disabled:opacity-40 whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Pull</span>
                  </button>
                </div>
              </form>

              <div className="lg:col-span-7 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-neutral-200">
                    <FileJson className="h-4 w-4 text-[#facc15]" />
                    <span>Payload JSON actuel du Registre</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadRegistryJson}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-neutral-200 text-xs font-semibold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>.json</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyRegistryJson}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-bold"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>{copiedRegistryJson ? 'Copié' : 'Copier JSON'}</span>
                    </button>
                  </div>
                </div>
                <pre className="max-h-56 overflow-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3.5 text-[11px] font-mono text-emerald-300 leading-relaxed scrollbar-thin select-all">
                  {registryJsonString}
                </pre>
              </div>
            </div>
          </section>

          {/* Per-Player Initial Bin Generator */}
          <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] p-5 sm:p-6 space-y-5">
            <div className="pb-4 border-b border-neutral-800/80">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="h-4 w-4 text-[#facc15]" />
                <span>Générateur de Bin Initial (Par Joueur)</span>
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Préparez le JSON initial à coller lors de la création d'un Bin individuel sur jsonbin.io.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5 space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-neutral-300 mb-1">Pseudo Chess.com</label>
                  <input
                    type="text"
                    value={tplUser}
                    onChange={(e) => setTplUser(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-white font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-neutral-300 mb-1">Elo départ</label>
                    <input
                      type="number"
                      value={tplStartElo}
                      onChange={(e) => setTplStartElo(Number(e.target.value))}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-white font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-300 mb-1">Elo cible</label>
                    <input
                      type="number"
                      value={tplTargetElo}
                      onChange={(e) => setTplTargetElo(Number(e.target.value))}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-white font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-neutral-300 mb-1">Date départ</label>
                    <input
                      type="date"
                      value={tplStartDate}
                      onChange={(e) => setTplStartDate(e.target.value)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-300 mb-1">Date échéance</label>
                    <input
                      type="date"
                      value={tplTargetDate}
                      onChange={(e) => setTplTargetDate(e.target.value)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-neutral-300 mb-1">Cadence</label>
                    <select
                      value={tplMode}
                      onChange={(e) => setTplMode(e.target.value as any)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-white"
                    >
                      <option value="auto">Auto</option>
                      <option value="blitz">Blitz</option>
                      <option value="rapid">Rapide</option>
                      <option value="bullet">Bullet</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-300 mb-1">Modèle</label>
                    <select
                      value={tplTrajectory}
                      onChange={(e) => setTplTrajectory(e.target.value as any)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-white"
                    >
                      <option value="linear">Linéaire</option>
                      <option value="milestones">Jalons mensuels</option>
                      <option value="custom">Personnalisé</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-neutral-200">JSON initial prêt à copier</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-neutral-200 text-xs font-semibold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>.json</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyTemplate}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-bold"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>{copiedTpl ? 'Copié' : 'Copier JSON'}</span>
                    </button>
                  </div>
                </div>

                <pre className="max-h-72 overflow-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3.5 text-[11px] font-mono text-emerald-300 leading-relaxed scrollbar-thin select-all">
                  {generatedJsonString}
                </pre>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ===================================================================== */}
      {/* WORKSPACE 3: PRINCIPAL 2FA & TRUSTED IPS                              */}
      {/* ===================================================================== */}
      {workspace === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Principal 2FA Card */}
          <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800/80">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <QrCode className="h-4 w-4 text-[#facc15]" />
                <span>A2F Principale Unique</span>
              </h2>
              <span className="text-xs font-bold text-[#10b981]">Active · RFC 6238</span>
            </div>

            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
              Une seule clé TOTP Authenticator (Google / Microsoft Authenticator) sécurise le Panel Admin et le déverrouillage d'urgence. Aucun mot de passe maître ne contourne ce code.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={async () => {
                  const next = !showInline2FaQr;
                  setShowInline2FaQr(next);
                  if (next) {
                    const current = getTotpSecret();
                    setInline2FaSecret(current);
                    const url = await generateQrCodeDataUrl(getTotpUri('Romeo', 'RoadTo2000Elo', current));
                    setInline2FaQrUrl(url);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold transition-colors"
              >
                <QrCode className="h-3.5 w-3.5 text-[#facc15]" />
                <span>{showInline2FaQr ? 'Masquer QR & Clé A2F' : 'Afficher QR / Clé secrète A2F'}</span>
              </button>

              <button
                type="button"
                onClick={onLockAdmin}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-neutral-300 text-xs font-semibold transition-colors"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Verrouiller Session Admin</span>
              </button>
            </div>

            {showInline2FaQr && (
              <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/90 space-y-3 text-xs">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {inline2FaQrUrl && (
                    <div className="p-2 bg-white rounded-xl border-2 border-[#facc15] shrink-0">
                      <img src={inline2FaQrUrl} alt="QR Code A2F" className="h-36 w-36" />
                    </div>
                  )}
                  <div className="space-y-2 flex-1 min-w-0 text-center sm:text-left">
                    <div className="font-bold text-white">Compte : RoadTo2000Elo (Romeo)</div>
                    <p className="text-[11px] text-neutral-400">
                      Scannez ce QR Code dans votre application Authenticator pour associer un nouveau téléphone.
                    </p>
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <code className="px-2.5 py-1 rounded-lg bg-[#0b0e14] border border-neutral-800 font-mono text-[#facc15] tracking-wider select-all">
                        {inline2FaSecret}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(inline2FaSecret);
                          setCopiedInlineSecret(true);
                          setTimeout(() => setCopiedInlineSecret(false), 2000);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-200 hover:text-white inline-flex items-center gap-1"
                      >
                        {copiedInlineSecret ? <Check className="h-3 w-3 text-[#10b981]" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedInlineSecret ? 'Copié' : 'Copier'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-800/80 flex flex-wrap items-center gap-2">
                  {inline2FaSecret !== DEFAULT_TOTP_SECRET && (
                    <button
                      type="button"
                      onClick={async () => {
                        const def = resetTotpToDefaultSecret();
                        setTotpEnrolled(true);
                        await syncTotpSecretToServer(def, true);
                        setInline2FaSecret(def);
                        const url = await generateQrCodeDataUrl(getTotpUri('Romeo', 'RoadTo2000Elo', def));
                        setInline2FaQrUrl(url);
                        onShowMessage('Clé A2F restaurée sur la clé par défaut et synchronisée sur le serveur.', 'success', 'A2F Synchronisée');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 font-semibold hover:bg-amber-500/20"
                    >
                      Restaurer clé par défaut
                    </button>
                  )}

                  {!confirmRegenerateSecret ? (
                    <button
                      type="button"
                      onClick={() => setConfirmRegenerateSecret(true)}
                      className="px-3 py-1.5 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 text-[#ef4444] font-semibold hover:bg-[#ef4444]/20"
                    >
                      Générer une nouvelle clé A2F
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[#ef4444] font-semibold">Confirmer ? L’ancienne clé ne fonctionnera plus :</span>
                      <button
                        type="button"
                        onClick={async () => {
                          const fresh = generateNewTotpSecret();
                          setTotpEnrolled(true);
                          await syncTotpSecretToServer(fresh, true);
                          setInline2FaSecret(fresh);
                          const url = await generateQrCodeDataUrl(getTotpUri('Romeo', 'RoadTo2000Elo', fresh));
                          setInline2FaQrUrl(url);
                          setConfirmRegenerateSecret(false);
                          onShowMessage('Nouvelle clé A2F générée et synchronisée. Scannez le nouveau QR code !', 'warning', 'Nouvelle Clé A2F');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#ef4444] text-white font-bold"
                      >
                        Oui, régénérer
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRegenerateSecret(false)}
                        className="px-2.5 py-1 rounded-lg border border-neutral-700 text-neutral-300"
                      >
                        Annuler
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Trusted IPs Management */}
          <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800/80">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Globe className="h-4 w-4 text-[#facc15]" />
                <span>Adresses IP de confiance</span>
              </h2>
              <span className="text-xs font-mono tabular-nums text-neutral-400">
                {trustedIps.length} enregistrée(s)
              </span>
            </div>

            <form onSubmit={handleAddIp} className="flex gap-2">
              <input
                type="text"
                value={newIpInput}
                onChange={(e) => setNewIpInput(e.target.value)}
                placeholder="Ex : 82.64.12.34"
                className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white font-mono focus:border-[#facc15] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleDetectCurrentIp}
                disabled={isDetectingIp}
                className="px-3 py-2 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-xs font-semibold text-neutral-200 shrink-0"
              >
                {isDetectingIp ? '...' : 'Détecter'}
              </button>
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-bold shrink-0 inline-flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Ajouter</span>
              </button>
            </form>

            <div className="divide-y divide-neutral-800/70 rounded-xl border border-neutral-800/80 bg-neutral-950/60 max-h-48 overflow-y-auto scrollbar-thin">
              {trustedIps.length === 0 ? (
                <p className="p-4 text-xs text-neutral-500 font-mono text-center">
                  Aucune IP de confiance configurée.
                </p>
              ) : (
                trustedIps.map((ip) => (
                  <div
                    key={ip}
                    className="flex items-center justify-between px-3.5 py-2.5 text-xs font-mono"
                  >
                    <span className="text-neutral-200">{ip}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveIp(ip)}
                      className="text-neutral-500 hover:text-[#ef4444] transition-colors"
                      title="Supprimer cette IP"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
