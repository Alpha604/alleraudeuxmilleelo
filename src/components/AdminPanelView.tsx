/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Ban,
  CheckCircle2,
  Copy,
  Crown,
  Database,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileJson,
  Globe,
  KeyRound,
  Lock,
  PauseCircle,
  PlayCircle,
  Plus,
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
  Zap,
} from 'lucide-react';
import {
  AccountStatus,
  addTrustedIp,
  deleteManagedAccount,
  getClientIp,
  getPublicAuthorizedAccounts,
  getTrustedIps,
  isTotpEnrolled,
  removeTrustedIp,
  setAccountStatus,
} from '../utils/security';
import {
  buildInitialJsonBinPayload,
  getClientJsonBinCredentials,
  saveJsonBinConfig,
} from '../utils/cloudSync';
import { getStoredSyncHistory, saveStoredSyncHistory } from '../utils/storage';
import { AppSettings, GameMode, TrajectoryModel } from '../types/chess';
import { NavTab } from './Navbar';

interface AdminPanelViewProps {
  currentUsername: string;
  isAdmin: boolean;
  onOpenSecurityModal: (title?: string, onGranted?: () => void) => void;
  onLockAdmin: () => void;
  onOpenCreateAccount: () => void;
  onQuickSwitchAccount: (targetUsername: string) => void;
  onSelectTab: (tab: NavTab) => void;
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning', title?: string) => void;
}

type AdminSectionTab = 'players' | 'security' | 'jsonbin';

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  currentUsername,
  isAdmin,
  onOpenSecurityModal,
  onLockAdmin,
  onOpenCreateAccount,
  onQuickSwitchAccount,
  onSelectTab,
  onShowMessage,
}) => {
  const [section, setSection] = useState<AdminSectionTab>('players');
  const [accounts, setAccounts] = useState<{ username: string; status: AccountStatus; isMaster: boolean }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<string | null>(null);
  const [revealedBins, setRevealedBins] = useState<Record<string, boolean>>({});

  // Inline player editor state
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editBinId, setEditBinId] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editStartElo, setEditStartElo] = useState(1500);
  const [editTargetElo, setEditTargetElo] = useState(2000);
  const [editTargetDate, setEditTargetDate] = useState('2027-12-31');
  const [editMode, setEditMode] = useState<GameMode | 'auto'>('auto');

  // Trusted IPs state
  const [trustedIps, setTrustedIpsState] = useState<string[]>(() => getTrustedIps());
  const [newIpInput, setNewIpInput] = useState('');
  const [isDetectingIp, setIsDetectingIp] = useState(false);

  // JSONBin Base Payload Generator state
  const [tplUser, setTplUser] = useState('nouveau_joueur');
  const [tplStartElo, setTplStartElo] = useState(1500);
  const [tplTargetElo, setTplTargetElo] = useState(2000);
  const [tplStartDate, setTplStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [tplTargetDate, setTplTargetDate] = useState('2027-12-31');
  const [tplMode, setTplMode] = useState<'auto' | GameMode>('auto');
  const [tplTrajectory, setTplTrajectory] = useState<TrajectoryModel>('linear');
  const [copiedTpl, setCopiedTpl] = useState(false);

  const refreshAccounts = () => {
    setAccounts(getPublicAuthorizedAccounts());
  };

  useEffect(() => {
    refreshAccounts();
    const handler = () => refreshAccounts();
    window.addEventListener('roadto2000:accounts-updated', handler);
    return () => window.removeEventListener('roadto2000:accounts-updated', handler);
  }, []);

  const readPlayerMeta = (username: string) => {
    const clean = username.trim().toLowerCase();
    const creds = getClientJsonBinCredentials(clean);
    const history = getStoredSyncHistory(clean);
    let parsedSettings: Partial<AppSettings> = {};
    try {
      const raw = localStorage.getItem(`roadto2000_settings_${clean}`);
      if (raw) parsedSettings = JSON.parse(raw);
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
    };
  };

  const openEditor = (username: string) => {
    const meta = readPlayerMeta(username);
    setEditingUser(username);
    setEditBinId(meta.binId || '');
    setEditApiKey('');
    setEditStartElo(meta.startElo);
    setEditTargetElo(meta.targetElo);
    setEditTargetDate(meta.targetDate.split('T')[0]);
    setEditMode(meta.selectedMode);
  };

  const handleSavePlayerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const clean = editingUser.trim().toLowerCase();
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

      onShowMessage(`Configuration de @${clean} enregistrée avec succès.`, 'success', 'Panel Admin');
      setEditingUser(null);
      refreshAccounts();
    } catch {
      onShowMessage('Erreur lors de la mise à jour du joueur.', 'warning');
    }
  };

  const handleStatusChange = (username: string, newStatus: AccountStatus) => {
    if (username.toLowerCase() === 'alpharomeo1500') {
      onShowMessage('Le compte maître AlphaRoméo est protégé.', 'warning');
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
        'Statut mis à jour'
      );
    }
  };

  const handleDelete = (username: string) => {
    if (username.toLowerCase() === 'alpharomeo1500') return;
    if (deleteManagedAccount(username)) {
      setConfirmDeleteUser(null);
      refreshAccounts();
      onShowMessage(`Compte @${username} supprimé définitivement.`, 'success', 'Suppression');
    }
  };

  const handlePurgePlayerLocal = (username: string) => {
    saveStoredSyncHistory([], username);
    refreshAccounts();
    onShowMessage(`Historique local de @${username} vidé.`, 'info', 'Cache purgé');
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
    const allData = accounts.map((acc) => ({
      ...acc,
      meta: readPlayerMeta(acc.username),
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
    onShowMessage('Sauvegarde complète de la plateforme téléchargée.', 'success');
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
      onShowMessage('Adresse IP de confiance ajoutée.', 'success');
    }
  };

  const handleRemoveIp = (ip: string) => {
    removeTrustedIp(ip);
    setTrustedIpsState(getTrustedIps());
    onShowMessage(`IP ${ip} retirée.`, 'info');
  };

  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const matchesSearch = acc.username.toLowerCase().includes(searchQuery.trim().toLowerCase());
      const matchesStatus = statusFilter === 'all' || acc.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [accounts, searchQuery, statusFilter]);

  const statsSummary = useMemo(() => {
    return {
      total: accounts.length,
      active: accounts.filter((a) => a.status === 'active').length,
      suspended: accounts.filter((a) => a.status === 'suspended').length,
      banned: accounts.filter((a) => a.status === 'banned').length,
    };
  }, [accounts]);

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
      onShowMessage('Contenu JSON de base copié dans le presse-papier !', 'success');
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

  // Gate Admin Panel behind 2FA if not unlocked
  if (!isAdmin) {
    return (
      <div className="rounded-3xl border border-neutral-800 bg-[#0c0f14]/90 p-8 sm:p-12 text-center space-y-5 shadow-2xl">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-[#facc15]/10 border border-[#facc15]/30 flex items-center justify-center text-[#facc15]">
          <Lock className="h-8 w-8" />
        </div>
        <div className="space-y-2 max-w-md mx-auto">
          <h2 className="text-xl font-black text-white font-display">Panel Administrateur Verrouillé</h2>
          <p className="text-xs sm:text-sm text-neutral-400">
            Confirmez votre identité avec votre code à 6 chiffres de l'A2F principale pour accéder aux outils d'administration avancés.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenSecurityModal('Panel Administrateur')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-black transition-all shadow-[0_0_20px_rgba(250,204,21,0.25)]"
        >
          <ShieldCheck className="h-4 w-4" />
          <span>Déverrouiller avec l'A2F Principale</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="rounded-3xl border border-[#facc15]/30 bg-gradient-to-br from-[#0c0f14] via-[#0c0f14] to-[#facc15]/[0.04] p-6 sm:p-7 shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#facc15]/15 border border-[#facc15]/30 text-[#facc15] text-[10px] font-black uppercase tracking-widest">
            <Crown className="h-3.5 w-3.5" />
            <span>Centre de Contrôle Administrateur</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white font-display tracking-tight">
            Panel Admin & Gestion Plateforme
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-2xl">
            Créez et administrez les comptes joueurs, basculez instantanément sans ré-A2F, générez les modèles JSONBin initiaux et supervisez la sécurité.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              onOpenCreateAccount();
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-black transition-all shadow-[0_0_20px_rgba(250,204,21,0.25)] active:scale-95"
          >
            <UserPlus className="h-4 w-4" />
            <span>Créer un Compte Joueur</span>
          </button>

          <button
            type="button"
            onClick={handleExportPlatformBackup}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white text-xs font-bold transition-all"
          >
            <Download className="h-4 w-4 text-[#facc15]" />
            <span>Backup Global</span>
          </button>

          <button
            type="button"
            onClick={onLockAdmin}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[#10b981]/40 bg-[#10b981]/10 hover:bg-[#10b981]/20 text-[#10b981] text-xs font-bold transition-all"
            title="Verrouiller les droits Admin"
          >
            <Unlock className="h-4 w-4" />
            <span>Verrouiller</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-neutral-800 bg-[#0c0f14]/90 p-4 space-y-1">
          <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-400 block">
            Comptes Officiels
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black font-mono text-white">{statsSummary.total}</span>
            <Users className="h-4 w-4 text-[#facc15]" />
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-[#0c0f14]/90 p-4 space-y-1">
          <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-400 block">
            Joueurs Actifs
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black font-mono text-[#10b981]">{statsSummary.active}</span>
            <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-[#0c0f14]/90 p-4 space-y-1">
          <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-400 block">
            Suspendus / Bannis
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black font-mono text-amber-400">
              {statsSummary.suspended} <span className="text-sm text-neutral-500">/</span>{' '}
              <span className="text-[#ef4444]">{statsSummary.banned}</span>
            </span>
            <ShieldAlert className="h-4 w-4 text-amber-400" />
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-[#0c0f14]/90 p-4 space-y-1">
          <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-400 block">
            A2F Principale Unique
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-sm sm:text-base font-black text-[#10b981]">
              {isTotpEnrolled() ? 'Active & Jumelée' : 'À configurer'}
            </span>
            <ShieldCheck className="h-4 w-4 text-[#10b981]" />
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 pb-3">
        <button
          type="button"
          onClick={() => setSection('players')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            section === 'players'
              ? 'bg-[#facc15] text-black font-black shadow-md'
              : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Joueurs & Bascule Rapide ({accounts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSection('jsonbin')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            section === 'jsonbin'
              ? 'bg-[#facc15] text-black font-black shadow-md'
              : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
          }`}
        >
          <FileJson className="h-4 w-4" />
          <span>Modèle JSONBin de Base</span>
        </button>

        <button
          type="button"
          onClick={() => setSection('security')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            section === 'security'
              ? 'bg-[#facc15] text-black font-black shadow-md'
              : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
          }`}
        >
          <KeyRound className="h-4 w-4" />
          <span>A2F Principale & IPs ({trustedIps.length})</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('tests')}
          className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-800 bg-neutral-900/80 hover:border-[#10b981]/50 text-xs font-bold text-neutral-300 hover:text-[#10b981] transition-all"
        >
          <Activity className="h-4 w-4" />
          <span>Ouvrir Suite de Tests</span>
        </button>
      </div>

      {/* SECTION 1: PLAYERS MANAGEMENT & 1-CLICK SWITCH */}
      {section === 'players' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0c0f14]/80 p-3.5 rounded-2xl border border-neutral-800">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-neutral-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un joueur par pseudo..."
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 pl-10 pr-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:border-[#facc15] focus:outline-none font-mono"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { id: 'all', label: 'Tous' },
                  { id: 'active', label: 'Actifs' },
                  { id: 'suspended', label: 'Suspendus' },
                  { id: 'banned', label: 'Bannis' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    statusFilter === f.id
                      ? 'bg-[#facc15]/20 border border-[#facc15]/50 text-[#facc15]'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <button
                type="button"
                onClick={refreshAccounts}
                className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white"
                title="Actualiser la liste"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Players List */}
          <div className="space-y-3">
            {filteredAccounts.map((acc) => {
              const isAlpha = acc.isMaster;
              const isCurrent = acc.username.toLowerCase() === currentUsername.toLowerCase();
              const meta = readPlayerMeta(acc.username);
              const isBinRevealed = !!revealedBins[acc.username];

              return (
                <div
                  key={acc.username}
                  className={`rounded-2xl border p-4 sm:p-5 space-y-4 transition-all ${
                    isCurrent
                      ? 'border-[#facc15]/60 bg-[#facc15]/[0.04]'
                      : acc.status === 'banned'
                      ? 'border-[#ef4444]/40 bg-[#ef4444]/[0.03]'
                      : acc.status === 'suspended'
                      ? 'border-amber-500/40 bg-amber-500/[0.03]'
                      : 'border-neutral-800 bg-[#0c0f14]/90 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Player Identity & Live Metadata */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`h-12 w-12 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${
                          isAlpha
                            ? 'bg-gradient-to-br from-[#facc15] to-[#ca8a04] text-black shadow-md'
                            : 'bg-neutral-800 text-white border border-neutral-700'
                        }`}
                      >
                        {acc.username.substring(0, 2).toUpperCase()}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-black text-white font-mono">@{acc.username}</span>
                          {isAlpha && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#facc15]/20 text-[#facc15] font-black uppercase">
                              Admin Maître
                            </span>
                          )}
                          {isCurrent && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 font-bold uppercase">
                              Session Active
                            </span>
                          )}
                          {acc.status === 'active' && !isAlpha && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#10b981]/20 text-[#10b981] font-bold">
                              Actif
                            </span>
                          )}
                          {acc.status === 'suspended' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">
                              Suspendu
                            </span>
                          )}
                          {acc.status === 'banned' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#ef4444]/20 text-[#ef4444] font-bold">
                              Banni
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-400 font-mono">
                          <span>
                            Objectif : <strong className="text-neutral-200">{meta.startElo} &rarr; {meta.targetElo} Elo</strong>
                          </span>
                          <span>
                            Syncs : <strong className="text-neutral-200">{meta.syncCount}</strong>
                            {meta.latestRating !== null && (
                              <span className="text-[#facc15]"> ({meta.latestRating} Elo)</span>
                            )}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Database className="h-3 w-3 text-[#facc15]" />
                            <span>
                              Bin :{' '}
                              <strong className="text-neutral-200">
                                {meta.binId
                                  ? isBinRevealed
                                    ? meta.binId
                                    : `${meta.binId.slice(0, 6)}...${meta.binId.slice(-4)}`
                                  : 'Non configuré'}
                              </strong>
                            </span>
                            {meta.binId && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRevealedBins((prev) => ({ ...prev, [acc.username]: !prev[acc.username] }))
                                }
                                className="text-neutral-500 hover:text-white ml-0.5"
                                title={isBinRevealed ? 'Masquer Bin ID' : 'Afficher Bin ID'}
                              >
                                {isBinRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </button>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* 1-Click Switch WITHOUT Re-auth */}
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => onQuickSwitchAccount(acc.username)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-black transition-all active:scale-95 shadow-sm"
                          title="Basculer instantanément sur ce compte sans ressaisir l'A2F"
                        >
                          <span>Basculer</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openEditor(acc.username)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-semibold transition-all"
                      >
                        <Edit3 className="h-3.5 w-3.5 text-[#facc15]" />
                        <span>Éditer</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportPlayer(acc.username)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-semibold transition-all"
                        title="Exporter les données JSON du joueur"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePurgePlayerLocal(acc.username)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-amber-400 text-xs font-semibold transition-all"
                        title="Purger l'historique en cache local pour ce compte"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>

                      {!isAlpha && (
                        <>
                          {acc.status === 'active' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(acc.username, 'suspended')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-semibold transition-all"
                              >
                                <PauseCircle className="h-3.5 w-3.5" />
                                <span>Suspendre</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(acc.username, 'banned')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444] text-xs font-semibold transition-all"
                              >
                                <Ban className="h-3.5 w-3.5" />
                                <span>Bannir</span>
                              </button>
                            </>
                          ) : acc.status === 'suspended' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(acc.username, 'active')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#10b981]/40 bg-[#10b981]/10 hover:bg-[#10b981]/20 text-[#10b981] text-xs font-semibold transition-all"
                              >
                                <PlayCircle className="h-3.5 w-3.5" />
                                <span>Réactiver</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(acc.username, 'banned')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444] text-xs font-semibold transition-all"
                              >
                                <Ban className="h-3.5 w-3.5" />
                                <span>Bannir</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(acc.username, 'active')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#10b981]/40 bg-[#10b981]/10 hover:bg-[#10b981]/20 text-[#10b981] text-xs font-semibold transition-all"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              <span>Débannir</span>
                            </button>
                          )}

                          {confirmDeleteUser === acc.username ? (
                            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#ef4444]/20 border border-[#ef4444]/40">
                              <button
                                type="button"
                                onClick={() => handleDelete(acc.username)}
                                className="px-2 py-1 rounded-lg bg-[#ef4444] text-white font-black text-[10px]"
                              >
                                Confirmer
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteUser(null)}
                                className="px-2 py-1 rounded-lg bg-neutral-800 text-neutral-300 text-[10px]"
                              >
                                Annuler
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteUser(acc.username)}
                              className="p-1.5 rounded-xl border border-neutral-800 hover:border-[#ef4444]/50 hover:bg-[#ef4444]/15 text-neutral-500 hover:text-[#ef4444] transition-all"
                              title="Supprimer définitivement"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline Player Settings Editor */}
                  {editingUser === acc.username && (
                    <form
                      onSubmit={handleSavePlayerEdit}
                      className="pt-4 border-t border-neutral-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in fade-in"
                    >
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-400 mb-1">Elo de départ</label>
                        <input
                          type="number"
                          value={editStartElo}
                          onChange={(e) => setEditStartElo(Number(e.target.value))}
                          className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-400 mb-1">Elo cible</label>
                        <input
                          type="number"
                          value={editTargetElo}
                          onChange={(e) => setEditTargetElo(Number(e.target.value))}
                          className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-400 mb-1">Date échéance</label>
                        <input
                          type="date"
                          value={editTargetDate}
                          onChange={(e) => setEditTargetDate(e.target.value)}
                          className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-400 mb-1">Cadence principale</label>
                        <select
                          value={editMode}
                          onChange={(e) => setEditMode(e.target.value as any)}
                          className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white"
                        >
                          <option value="auto">Auto (Meilleure)</option>
                          <option value="blitz">Blitz</option>
                          <option value="rapid">Rapide</option>
                          <option value="bullet">Bullet</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-400 mb-1">Bin ID JSONBin</label>
                        <input
                          type="text"
                          value={editBinId}
                          onChange={(e) => setEditBinId(e.target.value)}
                          placeholder="Bin ID dédié"
                          className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-400 mb-1">
                          Nouvelle Clé API JSONBin (Optionnel)
                        </label>
                        <input
                          type="password"
                          value={editApiKey}
                          onChange={(e) => setEditApiKey(e.target.value)}
                          placeholder="Laisser vide pour conserver"
                          className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white font-mono"
                        />
                      </div>

                      <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingUser(null)}
                          className="px-3.5 py-2 rounded-xl bg-neutral-800 text-neutral-300 hover:text-white text-xs font-bold"
                        >
                          Annuler
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-black"
                        >
                          Enregistrer les modifications
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}

            {filteredAccounts.length === 0 && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-8 text-center text-xs text-neutral-400">
                Aucun joueur ne correspond à votre recherche.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: BASE JSONBIN GENERATOR */}
      {section === 'jsonbin' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 rounded-2xl border border-neutral-800 bg-[#0c0f14]/90 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#facc15]">
              <Sliders className="h-4 w-4" />
              <span>Paramètres du Bin de Base</span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Configurez ces valeurs puis copiez le JSON généré pour créer un nouveau Bin prêt à l'emploi sur <strong className="text-white">jsonbin.io</strong>.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-neutral-300 mb-1">Pseudo Chess.com</label>
                <input
                  type="text"
                  value={tplUser}
                  onChange={(e) => setTplUser(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Elo départ</label>
                  <input
                    type="number"
                    value={tplStartElo}
                    onChange={(e) => setTplStartElo(Number(e.target.value))}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Elo cible</label>
                  <input
                    type="number"
                    value={tplTargetElo}
                    onChange={(e) => setTplTargetElo(Number(e.target.value))}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Date départ</label>
                  <input
                    type="date"
                    value={tplStartDate}
                    onChange={(e) => setTplStartDate(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Date échéance</label>
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
                  <label className="block font-bold text-neutral-300 mb-1">Cadence</label>
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
                  <label className="block font-bold text-neutral-300 mb-1">Modèle</label>
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
          </div>

          <div className="lg:col-span-7 rounded-2xl border border-neutral-800 bg-[#0c0f14]/90 p-5 flex flex-col space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <FileJson className="h-4 w-4 text-[#facc15]" />
                <span>Contenu JSON Initial à coller sur JSONBin.io</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-black transition-all"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedTpl ? 'Copié !' : 'Copier JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-bold"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>.json</span>
                </button>
              </div>
            </div>

            <pre className="flex-1 max-h-[380px] overflow-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-[11px] font-mono text-emerald-300 leading-relaxed scrollbar-thin">
              {generatedJsonString}
            </pre>
          </div>
        </div>
      )}

      {/* SECTION 3: PRINCIPAL 2FA & TRUSTED IPS */}
      {section === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Principal 2FA Card */}
          <div className="rounded-2xl border border-neutral-800 bg-[#0c0f14]/90 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-[#facc15]">
                <QrCode className="h-4 w-4" />
                <span>A2F Principale Unique</span>
              </div>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#10b981]/20 text-[#10b981] font-bold">
                Active (RFC 6238)
              </span>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Une seule A2F sécurise l'ensemble de la plateforme et tous ses comptes. Aucun mot de passe maître n'est utilisable pour contourner le code à 6 chiffres.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => onOpenSecurityModal('Gestion Authenticator 2FA')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold transition-all"
              >
                <QrCode className="h-4 w-4 text-[#facc15]" />
                <span>Afficher QR / Changer de téléphone</span>
              </button>
              <button
                type="button"
                onClick={onLockAdmin}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-bold transition-all"
              >
                <Lock className="h-4 w-4" />
                <span>Verrouiller Session Admin</span>
              </button>
            </div>
          </div>

          {/* Trusted IPs Management */}
          <div className="rounded-2xl border border-neutral-800 bg-[#0c0f14]/90 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-[#facc15]">
                <Globe className="h-4 w-4" />
                <span>Adresses IP de Confiance</span>
              </div>
              <span className="text-xs font-mono text-[#10b981]">{trustedIps.length} enregistrée(s)</span>
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
                className="px-3 py-2 rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-xs font-bold text-neutral-200 shrink-0"
              >
                {isDetectingIp ? '...' : 'Détecter'}
              </button>
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-black shrink-0 inline-flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Ajouter</span>
              </button>
            </form>

            <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin">
              {trustedIps.length === 0 ? (
                <p className="text-xs text-neutral-500 font-mono">Aucune IP de confiance configurée.</p>
              ) : (
                trustedIps.map((ip) => (
                  <div
                    key={ip}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-xs font-mono"
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
          </div>
        </div>
      )}
    </div>
  );
};
