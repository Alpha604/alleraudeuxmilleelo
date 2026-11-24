/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Crown,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Globe,
  History,
  KeyRound,
  Layers,
  Lock,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  User,
  Waves,
  Wifi,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  AppSettings,
  AppTheme,
  GameMode,
  ReleaseCategory,
  SiteReleaseEntry,
  SyncRecord,
  TrajectoryModel,
} from '../types/chess';
import {
  DEFAULT_SETTINGS,
  getEffectiveReleaseHistory,
  getStoredSyncHistory,
  normalizeReleaseCategory,
  normalizeSiteVersion,
  OFFICIAL_DAILY_RECORDS,
} from '../utils/storage';
import { FirebaseErrorBoundary } from './FirebaseErrorBoundary';
import { FirebaseSettingsPanel } from './FirebaseSettingsPanel';
import { SecurePurgeModal } from './SecurePurgeModal';
import {
  addTrustedIp,
  getClientIp,
  getTrustedIps,
  removeTrustedIp,
  setTrustedIps,
} from '../utils/security';
import {
  fetchJsonBinStatus,
  formatJsonBinTimestamp,
  JsonBinStatusInfo,
  pullFromJsonBin,
  saveJsonBinConfig,
  syncNowToJsonBin,
} from '../utils/cloudSync';

type SettingsSection = 'preferences' | 'project' | 'updates' | 'security' | 'cloud' | 'firebase';

interface SettingsViewProps {
  settings: AppSettings;
  syncHistory?: SyncRecord[];
  onSettingsUpdate: (updated: AppSettings) => void;
  onPreviewTheme?: (theme: AppTheme) => void;
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning') => void;
  onPurgeAccountData?: () => void;
  onHistoryUpdate?: (history: SyncRecord[]) => void;
  isAdmin?: boolean;
  isIframe?: boolean;
  onOpenSecurityModal?: (title?: string) => void;
  onLockAdmin?: () => void;
  onPreviewReleasePopup?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  syncHistory,
  onSettingsUpdate,
  onPreviewTheme,
  onShowMessage,
  onPurgeAccountData,
  onHistoryUpdate,
  isAdmin = false,
  isIframe = false,
  onOpenSecurityModal,
  onLockAdmin,
  onPreviewReleasePopup,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('preferences');
  const [form, setForm] = useState<AppSettings>(settings);
  const [isSaved, setIsSaved] = useState(false);
  const [secureModalOpen, setSecureModalOpen] = useState(false);
  const [secureModalAction, setSecureModalAction] = useState<'purge' | 'reset'>('purge');

  // Multiple Trusted IPs state
  const [trustedIps, setTrustedIpsState] = useState<string[]>(() => getTrustedIps());
  const [newIpInput, setNewIpInput] = useState<string>('');
  const [isDetectingIp, setIsDetectingIp] = useState<boolean>(false);
  const [ipMessage, setIpMessage] = useState<string>('');

  // JSONBin Cloud Cache state inside Settings
  const [jsonBinInfo, setJsonBinInfo] = useState<JsonBinStatusInfo | null>(null);
  const [binIdInput, setBinIdInput] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isSavingBin, setIsSavingBin] = useState<boolean>(false);
  const [binFeedback, setBinFeedback] = useState<{ message: string; isError?: boolean } | null>(null);
  const [isSyncingBin, setIsSyncingBin] = useState<boolean>(false);
  const [copiedBinJson, setCopiedBinJson] = useState<boolean>(false);

  // Release Publisher & History state
  const [versionInput, setVersionInput] = useState<string>(() => normalizeSiteVersion(settings.siteVersion));
  const [versionTitleInput, setVersionTitleInput] = useState<string>(
    () => settings.siteVersionTitle || ''
  );
  const [versionCategoryInput, setVersionCategoryInput] = useState<ReleaseCategory>(() =>
    normalizeReleaseCategory(settings.siteVersionCategory)
  );
  const [versionNoteInput, setVersionNoteInput] = useState<string>(() => settings.siteVersionNote || '');
  const [versionChangesInput, setVersionChangesInput] = useState<string[]>(() =>
    Array.isArray(settings.siteVersionChanges) ? settings.siteVersionChanges : []
  );
  const [newChangeBullet, setNewChangeBullet] = useState<string>('');
  const [forcePopupInput, setForcePopupInput] = useState<boolean>(true);
  const [editingReleaseId, setEditingReleaseId] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
    if (!editingReleaseId) {
      setVersionInput(normalizeSiteVersion(settings.siteVersion));
      setVersionTitleInput(settings.siteVersionTitle || '');
      setVersionCategoryInput(normalizeReleaseCategory(settings.siteVersionCategory));
      setVersionNoteInput(settings.siteVersionNote || '');
      setVersionChangesInput(
        Array.isArray(settings.siteVersionChanges) ? settings.siteVersionChanges : []
      );
    }
  }, [settings, editingReleaseId]);

  useEffect(() => {
    let isMounted = true;
    fetchJsonBinStatus(form.username).then((data) => {
      if (isMounted && data) {
        setJsonBinInfo(data);
        if (data.binId) setBinIdInput(data.binId);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [form.username]);

  const handleSaveJsonBin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBin(true);
    setBinFeedback(null);
    const res = await saveJsonBinConfig({
      binId: binIdInput.trim(),
      apiKey: apiKeyInput.trim(),
      enabled: true,
      username: form.username,
    });
    setIsSavingBin(false);
    if (res.success) {
      setBinFeedback({ message: 'Identifiants JSONBin validés et enregistrés avec succès !' });
      onShowMessage('Identifiants JSONBin enregistrés !', 'success');
      const updated = await fetchJsonBinStatus(form.username);
      if (updated) setJsonBinInfo(updated);
    } else {
      setBinFeedback({ message: res.lastError || 'Erreur lors de la configuration', isError: true });
      onShowMessage(res.lastError || 'Échec de connexion JSONBin', 'warning');
    }
  };

  const handleManualSyncToJsonBin = async () => {
    setIsSyncingBin(true);
    const res = await syncNowToJsonBin(form.username, true);
    setIsSyncingBin(false);
    if (res.success) {
      const tsLabel = formatJsonBinTimestamp(res.lastSyncTime || res.remoteUpdatedAt);
      if (res.history && onHistoryUpdate) {
        onHistoryUpdate(res.history);
      }
      if (res.skipped) {
        onShowMessage(`Quota préservé : JSONBin déjà à jour (MàJ : ${tsLabel})`, 'info');
      } else {
        onShowMessage(`Données & paramètres sauvegardés sur JSONBin (${tsLabel}) !`, 'success');
      }
      const updated = await fetchJsonBinStatus(form.username);
      if (updated) setJsonBinInfo(updated);
    } else {
      onShowMessage(res.error || 'Erreur lors de la synchronisation JSONBin', 'warning');
    }
  };

  const handlePullFromJsonBinNow = async () => {
    setIsSyncingBin(true);
    const res = await pullFromJsonBin(form.username);
    setIsSyncingBin(false);
    if (res.success && res.history) {
      if (onHistoryUpdate) onHistoryUpdate(res.history);
      const tsLabel = formatJsonBinTimestamp(res.remoteUpdatedAt || res.lastSyncTime);
      onShowMessage(`${res.history.length} relevés restaurés depuis JSONBin (MàJ : ${tsLabel}) !`, 'success');
      const updated = await fetchJsonBinStatus(form.username);
      if (updated) setJsonBinInfo(updated);
    } else {
      onShowMessage(res.error || 'Échec de lecture depuis JSONBin', 'warning');
    }
  };

  const handleCopyOfficialTemplate = async () => {
    const templateContent = jsonBinInfo?.template
      ? JSON.stringify(jsonBinInfo.template, null, 2)
      : JSON.stringify(
          {
            exportedAt: '2026-11-10T17:24:51.128Z',
            project: 'Road to 2000 Elo',
            username: form.username,
            version: '2.0',
            recordsCount: OFFICIAL_DAILY_RECORDS.length,
            records: OFFICIAL_DAILY_RECORDS,
          },
          null,
          2
        );

    try {
      await navigator.clipboard.writeText(templateContent);
      setCopiedBinJson(true);
      onShowMessage('Contenu JSON officiel copié dans le presse-papier !', 'success');
      setTimeout(() => setCopiedBinJson(false), 3000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = templateContent;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedBinJson(true);
      onShowMessage('Contenu JSON officiel copié dans le presse-papier !', 'success');
      setTimeout(() => setCopiedBinJson(false), 3000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isIframe) {
      onShowMessage("Mode Iframe : modification des paramètres interdite.", 'warning');
      return;
    }
    if (!isAdmin) {
      if (onOpenSecurityModal) onOpenSecurityModal('Enregistrement des paramètres');
      return;
    }

    const isNewUser = form.username.trim().toLowerCase() !== settings.username.trim().toLowerCase();
    onSettingsUpdate(form);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
    if (!isNewUser) {
      onShowMessage('Paramètres enregistrés avec succès ! Tous les calculs ont été mis à jour.', 'success');
    }
  };

  const handleBumpSemver = (part: 'patch' | 'minor' | 'major') => {
    const clean = normalizeSiteVersion(versionInput);
    const nums = clean.split('.').map((n) => parseInt(n.replace(/\D/g, ''), 10));
    const major = Number.isFinite(nums[0]) ? nums[0] : 1;
    const minor = Number.isFinite(nums[1]) ? nums[1] : 0;
    const patch = Number.isFinite(nums[2]) ? nums[2] : 0;

    if (part === 'major') {
      setVersionInput(`${major + 1}.0.0`);
      setVersionCategoryInput('major');
    } else if (part === 'minor') {
      setVersionInput(`${major}.${minor + 1}.0`);
      setVersionCategoryInput('feature');
    } else {
      setVersionInput(`${major}.${minor}.${patch + 1}`);
      setVersionCategoryInput('fix');
    }
  };

  const handleAddChangeBullet = () => {
    const clean = newChangeBullet.trim().slice(0, 220);
    if (!clean) return;
    if (versionChangesInput.length >= 20) {
      onShowMessage('Maximum 20 points détaillés par version.', 'warning');
      return;
    }
    setVersionChangesInput((prev) => [...prev, clean]);
    setNewChangeBullet('');
  };

  const handleRemoveChangeBullet = (index: number) => {
    setVersionChangesInput((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateChangeBullet = (index: number, value: string) => {
    setVersionChangesInput((prev) =>
      prev.map((item, idx) => (idx === index ? value.slice(0, 220) : item))
    );
  };

  const handleLoadReleaseForEdit = (entry: SiteReleaseEntry) => {
    setEditingReleaseId(entry.id);
    setVersionInput(normalizeSiteVersion(entry.version));
    setVersionTitleInput(entry.title || '');
    setVersionCategoryInput(normalizeReleaseCategory(entry.category));
    setVersionNoteInput(entry.summary || '');
    setVersionChangesInput(Array.isArray(entry.changes) ? entry.changes : []);
    setForcePopupInput(entry.forcePopup !== false);
  };

  const handleCancelEditRelease = () => {
    setEditingReleaseId(null);
    setVersionInput(normalizeSiteVersion(form.siteVersion));
    setVersionTitleInput(form.siteVersionTitle || '');
    setVersionCategoryInput(normalizeReleaseCategory(form.siteVersionCategory));
    setVersionNoteInput(form.siteVersionNote || '');
    setVersionChangesInput(Array.isArray(form.siteVersionChanges) ? form.siteVersionChanges : []);
    setForcePopupInput(true);
  };

  const handleDeleteReleaseFromHistory = (id: string) => {
    if (isIframe) return;
    if (!isAdmin) {
      if (onOpenSecurityModal) onOpenSecurityModal('Suppression d’une entrée d’historique');
      return;
    }

    const currentHistory = getEffectiveReleaseHistory(form);
    if (currentHistory.length <= 1) {
      onShowMessage('Impossible de supprimer la seule version active.', 'warning');
      return;
    }

    const filtered = currentHistory.filter((entry) => entry.id !== id);
    const newest = filtered[0];

    const updatedSettings: AppSettings = {
      ...form,
      siteVersion: newest.version,
      siteVersionTitle: newest.title,
      siteVersionCategory: newest.category,
      siteVersionNote: newest.summary,
      siteVersionChanges: newest.changes,
      siteVersionUpdatedAt: newest.publishedAt,
      siteVersionHistory: filtered,
    };

    if (editingReleaseId === id) {
      setEditingReleaseId(null);
    }

    setForm(updatedSettings);
    onSettingsUpdate(updatedSettings);
    onShowMessage('Entrée retirée de l’historique des versions.', 'info');
  };

  const handlePublishSiteUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (isIframe) {
      onShowMessage('Mode Iframe : modification de la version interdite.', 'warning');
      return;
    }
    if (!isAdmin) {
      if (onOpenSecurityModal) onOpenSecurityModal('Publication de mise à jour du site');
      return;
    }

    const nextVersion = normalizeSiteVersion(versionInput);
    const nextTitle = versionTitleInput.trim().slice(0, 120) || `Mise à jour v${nextVersion}`;
    const nextSummary = versionNoteInput.trim().slice(0, 600);
    const pendingBullet = newChangeBullet.trim().slice(0, 220);
    const finalChanges = [
      ...versionChangesInput.map((c) => c.trim().slice(0, 220)).filter(Boolean),
      ...(pendingBullet ? [pendingBullet] : []),
    ].slice(0, 20);

    const existingHistory = getEffectiveReleaseHistory(form);
    const nowIso = new Date().toISOString();

    let nextHistory: SiteReleaseEntry[];
    if (editingReleaseId) {
      const existingItem = existingHistory.find((r) => r.id === editingReleaseId);
      const updatedEntry: SiteReleaseEntry = {
        id: editingReleaseId,
        version: nextVersion,
        title: nextTitle,
        category: versionCategoryInput,
        summary: nextSummary,
        changes: finalChanges,
        publishedAt: existingItem?.publishedAt || nowIso,
        forcePopup: forcePopupInput,
      };
      nextHistory = existingHistory.map((item) =>
        item.id === editingReleaseId ? updatedEntry : item
      );
    } else {
      const newEntry: SiteReleaseEntry = {
        id: `rel_${nextVersion}_${Date.now()}`,
        version: nextVersion,
        title: nextTitle,
        category: versionCategoryInput,
        summary: nextSummary,
        changes: finalChanges,
        publishedAt: nowIso,
        forcePopup: forcePopupInput,
      };
      nextHistory = [newEntry, ...existingHistory].slice(0, 25);
    }

    const newest = nextHistory[0];
    const updatedSettings: AppSettings = {
      ...form,
      siteVersion: newest.version,
      siteVersionTitle: newest.title,
      siteVersionCategory: newest.category,
      siteVersionNote: newest.summary,
      siteVersionChanges: newest.changes,
      siteVersionUpdatedAt: newest.publishedAt,
      siteVersionHistory: nextHistory,
    };

    setEditingReleaseId(null);
    setNewChangeBullet('');
    setForm(updatedSettings);
    setVersionInput(newest.version);
    setVersionTitleInput(newest.title);
    setVersionCategoryInput(newest.category);
    setVersionNoteInput(newest.summary);
    setVersionChangesInput(newest.changes);
    onSettingsUpdate(updatedSettings);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
    onShowMessage(`Version v${newest.version} publiée dans l’historique et le pied de page !`, 'success');
  };

  const handleReset = () => {
    if (isIframe) return;
    setSecureModalAction('reset');
    setSecureModalOpen(true);
  };

  const handleInitiatePurge = () => {
    if (isIframe) return;
    setSecureModalAction('purge');
    setSecureModalOpen(true);
  };

  const handleExecuteSecureAction = () => {
    if (secureModalAction === 'reset') {
      setForm(DEFAULT_SETTINGS);
      onSettingsUpdate(DEFAULT_SETTINGS);
      onShowMessage('Paramètres réinitialisés avec succès aux valeurs officielles après double validation A2F.', 'success');
    } else {
      if (onPurgeAccountData) {
        onPurgeAccountData();
      }
      onShowMessage(`Cache de @${form.username} purgé avec succès après double validation A2F.`, 'success');
    }
  };

  const handleDetectCurrentIp = async () => {
    setIsDetectingIp(true);
    setIpMessage('');
    try {
      const ip = await getClientIp();
      if (ip) {
        setNewIpInput(ip);
        setIpMessage(`Adresse IP détectée : ${ip}`);
      } else {
        setIpMessage('Impossible de détecter automatiquement votre IP.');
      }
    } catch {
      setIpMessage('Erreur lors de la détection de l\'adresse IP.');
    } finally {
      setIsDetectingIp(false);
    }
  };

  const handleAddTrustedIp = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIp = newIpInput.trim();
    if (cleanIp.length < 7) {
      setIpMessage('Veuillez entrer une adresse IP valide (ex: 82.64.12.34).');
      return;
    }
    const ok = addTrustedIp(cleanIp);
    if (ok) {
      const updated = getTrustedIps();
      setTrustedIpsState(updated);
      setNewIpInput('');
      setIpMessage(`IP ${cleanIp} ajoutée à la liste de confiance !`);
      onShowMessage(`IP ${cleanIp} ajoutée`, 'success');
      setTimeout(() => setIpMessage(''), 4000);
    } else {
      setIpMessage('Format d\'IP invalide.');
    }
  };

  const handleRemoveTrustedIp = (ipToRemove: string) => {
    removeTrustedIp(ipToRemove);
    const updated = getTrustedIps();
    setTrustedIpsState(updated);
    setIpMessage(`IP ${ipToRemove} retirée.`);
    onShowMessage(`IP ${ipToRemove} retirée.`, 'info');
    setTimeout(() => setIpMessage(''), 3000);
  };

  const handleClearAllTrustedIps = () => {
    setTrustedIps([]);
    setTrustedIpsState([]);
    setIpMessage('Toutes les adresses IP de confiance ont été supprimées.');
    onShowMessage('Toutes les adresses IP de confiance ont été supprimées.', 'info');
    setTimeout(() => setIpMessage(''), 3000);
  };

  // If in Iframe: show strictly read-only banner
  if (isIframe) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="rounded-2xl border border-[#facc15]/30 bg-[#facc15]/10 p-8 text-center space-y-3">
          <Lock className="h-10 w-10 text-[#facc15] mx-auto" />
          <h3 className="text-base font-bold text-[#facc15]">Mode Iframe Sécurisé (Lecture Seule)</h3>
          <p className="text-xs text-neutral-300 max-w-xl mx-auto leading-relaxed">
            Cette intégration fonctionne en mode consultation restreinte. La modification des paramètres, le changement de pseudo, l'effacement de données et les synchronisations manuelles sont formellement bloqués dans un contexte iframe.
          </p>
        </div>
      </div>
    );
  }

  // If not authenticated as Admin: prompt 2FA unlock
  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="rounded-2xl border border-[#facc15]/40 bg-neutral-900/90 p-8 text-center space-y-5 shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#facc15]/30 bg-[#facc15]/10 text-[#facc15]">
            <Lock className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-white">Espace Paramètres Verrouillé (2FA)</h3>
            <p className="text-xs text-neutral-400 max-w-lg mx-auto leading-relaxed">
              Pour des raisons de sécurité, la modification de la configuration du projet nécessite une authentification à deux facteurs avec votre smartphone.
            </p>
          </div>
          <button
            onClick={() => onOpenSecurityModal && onOpenSecurityModal('Accès aux Paramètres')}
            className="inline-flex items-center gap-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black px-6 py-3 text-xs font-bold transition-all shadow-[0_0_20px_rgba(250,204,21,0.25)]"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Déverrouiller avec Microsoft / Google Authenticator (2FA)</span>
          </button>
        </div>
      </div>
    );
  }

  const themeOptions: {
    id: AppTheme;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
    swatchStyle: React.CSSProperties;
    accentColor: string;
  }[] = [
    {
      id: 'dark',
      label: 'Base',
      subtitle: 'Carbone & Or classique',
      icon: <Moon className="h-4 w-4 text-[#facc15]" />,
      swatchStyle: { background: 'linear-gradient(135deg, #07090e 55%, #facc15 100%)' },
      accentColor: '#facc15',
    },
    {
      id: 'light',
      label: 'Clair',
      subtitle: 'Jour haute lisibilité',
      icon: <Sun className="h-4 w-4 text-amber-500" />,
      swatchStyle: { background: 'linear-gradient(135deg, #f8fafc 55%, #f59e0b 100%)' },
      accentColor: '#f59e0b',
    },
    {
      id: 'ocean',
      label: 'Océan',
      subtitle: 'Abyssal & Cyan pur',
      icon: <Waves className="h-4 w-4 text-sky-400" />,
      swatchStyle: { background: 'linear-gradient(135deg, #030d1a 50%, #38bdf8 100%)' },
      accentColor: '#38bdf8',
    },
    {
      id: 'colors',
      label: 'Couleurs',
      subtitle: 'Aurore indigo & rose',
      icon: <Palette className="h-4 w-4 text-pink-400" />,
      swatchStyle: { background: 'linear-gradient(135deg, #2e1065 25%, #ec4899 70%, #22d3ee 100%)' },
      accentColor: '#f472b6',
    },
    {
      id: 'system',
      label: 'Desktop (Auto)',
      subtitle: 'Clair ou Classique selon l’appareil',
      icon: <Monitor className="h-4 w-4 text-neutral-300" />,
      swatchStyle: { background: 'linear-gradient(135deg, #f8fafc 48%, #07090e 52%)' },
      accentColor: '#94a3b8',
    },
  ];

  const handleSelectTheme = (themeId: AppTheme) => {
    setForm((prev) => ({ ...prev, theme: themeId }));
    onPreviewTheme?.(themeId);
  };

  const sectionTabs: {
    id: SettingsSection;
    label: string;
    icon: React.ReactNode;
    desktopOnly?: boolean;
  }[] = [
    { id: 'preferences', label: 'Préférences', icon: <Palette className="h-3.5 w-3.5" /> },
    { id: 'project', label: 'Projet & Calcul', icon: <Sliders className="h-3.5 w-3.5" /> },
    { id: 'updates', label: 'Mise à jour', icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: 'security', label: 'Sécurité & IPs', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
    { id: 'cloud', label: 'Cloud & Purge', icon: <Cloud className="h-3.5 w-3.5" /> },
    {
      id: 'firebase',
      label: 'Paramètre Firebase',
      icon: <Flame className="h-3.5 w-3.5" />,
      desktopOnly: true,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2 flex-wrap">
            <SettingsIcon className="h-5 w-5 text-[#facc15]" />
            <span>Paramètres Du Projet</span>
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              <ShieldCheck className="h-3 w-3" />
              <span>Admin 2FA</span>
            </span>
          </h2>
          <p className="text-xs text-neutral-400 hidden sm:block">
            Sélectionnez une catégorie ci-dessous pour configurer vos thèmes, objectifs, sécurité ou cloud.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {onLockAdmin && (
            <button
              onClick={onLockAdmin}
              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              title="Verrouiller la session d'administration"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Verrouiller</span>
            </button>
          )}

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Réinitialiser</span>
          </button>
        </div>
      </div>

      {/* Selectable Multi-Section Tab Strip */}
      <div className="flex flex-nowrap items-center gap-1.5 p-1.5 rounded-2xl border border-neutral-800 bg-[#0c0f14] overflow-x-auto scrollbar-none">
        {sectionTabs.map((sec) => {
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveSection(sec.id)}
              className={`${
                sec.desktopOnly ? 'hidden sm:flex' : 'flex'
              } items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all ${
                isActive
                  ? 'bg-[#facc15] text-black shadow-md'
                  : 'text-neutral-300 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {sec.icon}
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION: PRÉFÉRENCES (Thèmes + Notifications) */}
      {activeSection === 'preferences' && (
        <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in duration-150">
          {/* Themes Picker */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-4 sm:p-6 shadow-xl backdrop-blur-sm space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15]">
                <Palette className="h-4 w-4" />
                <span>Thème Visuel De L&apos;Application</span>
              </div>
              <span className="text-[11px] font-mono text-neutral-400">
                Aperçu immédiat
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {themeOptions.map((opt) => {
                const selected = form.theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectTheme(opt.id)}
                    className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all active:scale-[0.99] ${
                      selected
                        ? 'border-[#facc15] bg-[#facc15]/10 ring-1 ring-[#facc15]/40 shadow-md'
                        : 'border-neutral-800 bg-neutral-950/70 hover:border-neutral-600'
                    }`}
                  >
                    <div
                      className="h-10 w-10 rounded-xl border border-white/15 shrink-0 shadow-inner"
                      style={opt.swatchStyle}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {opt.icon}
                        <span className="text-xs font-extrabold text-white truncate">
                          {opt.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                        {opt.subtitle}
                      </p>
                    </div>
                    {selected && (
                      <CheckCircle2 className="h-4 w-4 text-[#facc15] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Performance Notifications */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-4 sm:p-6 shadow-xl backdrop-blur-sm space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15] border-b border-neutral-800 pb-3">
              <Bell className="h-4 w-4" />
              <span>Alertes & Notifications De Performance</span>
            </div>

            <div className="space-y-2.5 text-xs text-neutral-300">
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-neutral-800/80 bg-neutral-950/60 cursor-pointer">
                <span>Alerter lors d&apos;un nouveau record Elo personnel</span>
                <input
                  type="checkbox"
                  checked={form.notifications.newPeak}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notifications: { ...form.notifications, newPeak: e.target.checked },
                    })
                  }
                  className="h-4 w-4 accent-[#facc15]"
                />
              </label>
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-neutral-800/80 bg-neutral-950/60 cursor-pointer">
                <span>Notifier lors du franchissement d&apos;un palier mensuel</span>
                <input
                  type="checkbox"
                  checked={form.notifications.milestoneReached}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notifications: { ...form.notifications, milestoneReached: e.target.checked },
                    })
                  }
                  className="h-4 w-4 accent-[#facc15]"
                />
              </label>
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-neutral-800/80 bg-neutral-950/60 cursor-pointer">
                <span>Signaler un écart important sur la trajectoire théorique</span>
                <input
                  type="checkbox"
                  checked={form.notifications.significantDelay}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notifications: { ...form.notifications, significantDelay: e.target.checked },
                    })
                  }
                  className="h-4 w-4 accent-[#facc15]"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {isSaved ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span>Préférences enregistrées !</span>
              </span>
            ) : (
              <span className="text-[11px] text-neutral-500">
                Pensez à enregistrer pour synchroniser votre thème dans le cloud.
              </span>
            )}

            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] active:scale-[0.98] text-black px-5 py-2.5 text-xs font-bold transition-all shadow-[0_0_15px_rgba(250,204,21,0.3)]"
            >
              <Save className="h-4 w-4" />
              <span>Enregistrer</span>
            </button>
          </div>
        </form>
      )}

      {/* SECTION: PROJET & CALCUL */}
      {activeSection === 'project' && (
        <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-150">
          {/* Section 1: Profil & Objectifs Principaux */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-5 sm:p-6 shadow-xl backdrop-blur-sm space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15] border-b border-neutral-800 pb-3">
              <User className="h-4 w-4" />
              <span>Identité & Objectifs Du Projet</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Pseudo Chess.com
                </label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-[#facc15] focus:outline-none"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  Par défaut : <strong className="text-neutral-200">alpharomeo1500</strong>.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Mode de sélection du classement principal
                </label>
                <select
                  value={form.selectedMode}
                  onChange={(e) => setForm({ ...form, selectedMode: e.target.value as 'auto' | GameMode })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-[#facc15] focus:outline-none"
                >
                  <option value="auto">Automatique (Meilleur parmi Blitz, Rapid, Bullet)</option>
                  <option value="bullet">Fixer sur Bullet uniquement</option>
                  <option value="blitz">Fixer sur Blitz uniquement</option>
                  <option value="rapid">Fixer sur Rapide uniquement</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Classement de départ (Base immuable)
                </label>
                <input
                  type="number"
                  min="500"
                  max="2800"
                  value={form.startElo}
                  onChange={(e) => setForm({ ...form, startElo: Number(e.target.value) })}
                  required
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-[#facc15] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Objectif Final (Elo cible)
                </label>
                <input
                  type="number"
                  min="1600"
                  max="3000"
                  value={form.targetElo}
                  onChange={(e) => setForm({ ...form, targetElo: Number(e.target.value) })}
                  required
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-[#facc15] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Date de début du projet
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  required
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-[#facc15] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Date d&apos;échéance finale
                </label>
                <input
                  type="datetime-local"
                  value={form.targetDate.substring(0, 16)}
                  onChange={(e) => setForm({ ...form, targetDate: `${e.target.value}:59` })}
                  required
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-[#facc15] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Algorithme de trajectoire & Synchronisation */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-5 sm:p-6 shadow-xl backdrop-blur-sm space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15] border-b border-neutral-800 pb-3">
              <Sliders className="h-4 w-4" />
              <span>Moteur De Calcul & Synchronisation</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Algorithme de progression théorique
                </label>
                <select
                  value={form.trajectoryModel}
                  onChange={(e) => setForm({ ...form, trajectoryModel: e.target.value as TrajectoryModel })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-[#facc15] focus:outline-none"
                >
                  <option value="linear">1. Progression Linéaire (Recommandé - Simple et transparent)</option>
                  <option value="milestones">2. Paliers Mensuels Step Trajectory</option>
                  <option value="custom">3. Objectifs Personnalisés Manuels</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Intervalle d&apos;actualisation automatique
                </label>
                <select
                  value={form.autoSyncMinutes}
                  onChange={(e) => setForm({ ...form, autoSyncMinutes: Number(e.target.value) })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-[#facc15] focus:outline-none"
                >
                  <option value="0">Manuel uniquement (Aucun appel périodique)</option>
                  <option value="5">Toutes les 5 minutes</option>
                  <option value="15">Toutes les 15 minutes (Recommandé)</option>
                  <option value="30">Toutes les 30 minutes</option>
                  <option value="60">Toutes les heures</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {isSaved ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span>Modifications appliquées !</span>
              </span>
            ) : (
              <span className="text-[11px] text-neutral-500">
                Toutes les modifications sont prises en compte dans les calculs.
              </span>
            )}

            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] active:scale-[0.98] text-black px-5 py-2.5 text-xs font-bold transition-all shadow-[0_0_15px_rgba(250,204,21,0.3)]"
            >
              <Save className="h-4 w-4" />
              <span>Enregistrer</span>
            </button>
          </div>
        </form>
      )}

      {/* SECTION: MISE À JOUR DU SITE & HISTORIQUE DES VERSIONS */}
      {activeSection === 'updates' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Current Version Overview Card */}
          <div className="rounded-2xl border border-[#facc15]/30 bg-neutral-900/90 p-5 sm:p-6 shadow-xl backdrop-blur-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15]">
                <Tag className="h-4 w-4" />
                <span>Version Active En Production</span>
              </div>
              <div className="flex items-center gap-2">
                {onPreviewReleasePopup && (
                  <button
                    type="button"
                    onClick={onPreviewReleasePopup}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-950 hover:border-[#facc15]/50 text-[11px] font-bold text-neutral-200 hover:text-[#facc15] transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Aperçu Pop-up</span>
                  </button>
                )}
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#facc15]/15 border border-[#facc15]/35 font-mono text-xs font-black text-[#facc15]">
                  v{normalizeSiteVersion(settings.siteVersion)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl border border-neutral-800 bg-black/40 p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block">
                  Titre de la version
                </span>
                <span className="text-white font-bold block truncate">
                  {settings.siteVersionTitle || `Version v${normalizeSiteVersion(settings.siteVersion)}`}
                </span>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-black/40 p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block">
                  Dernière publication
                </span>
                <span className="font-mono text-neutral-200 font-semibold block">
                  {settings.siteVersionUpdatedAt
                    ? formatJsonBinTimestamp(settings.siteVersionUpdatedAt)
                    : 'Version initiale'}
                </span>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-black/40 p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block">
                  Versions archivées
                </span>
                <span className="font-mono text-[#facc15] font-bold block">
                  {getEffectiveReleaseHistory(form).length} publication(s)
                </span>
              </div>
            </div>
          </div>

          {/* Publish / Edit Site Release Form */}
          <form
            onSubmit={handlePublishSiteUpdate}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-5 sm:p-6 shadow-xl backdrop-blur-sm space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15]">
                <Sparkles className="h-4 w-4" />
                <span>
                  {editingReleaseId
                    ? 'Modifier une version existante'
                    : 'Créer et publier une nouvelle mise à jour'}
                </span>
              </div>

              {editingReleaseId && (
                <button
                  type="button"
                  onClick={handleCancelEditRelease}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-neutral-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Annuler la modification</span>
                </button>
              )}
            </div>

            {/* Version & SemVer Bumps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs font-medium text-neutral-300">
                    Numéro de version
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleBumpSemver('patch')}
                      className="px-2 py-0.5 rounded-md border border-neutral-700 bg-neutral-950 hover:border-[#facc15]/50 text-[10px] font-mono font-bold text-neutral-200 hover:text-[#facc15] transition-colors"
                    >
                      +0.0.1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBumpSemver('minor')}
                      className="px-2 py-0.5 rounded-md border border-neutral-700 bg-neutral-950 hover:border-[#facc15]/50 text-[10px] font-mono font-bold text-neutral-200 hover:text-[#facc15] transition-colors"
                    >
                      +0.1.0
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBumpSemver('major')}
                      className="px-2 py-0.5 rounded-md border border-neutral-700 bg-neutral-950 hover:border-[#facc15]/50 text-[10px] font-mono font-bold text-neutral-200 hover:text-[#facc15] transition-colors"
                    >
                      +1.0.0
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-xs font-mono font-bold text-[#facc15]">
                    v
                  </span>
                  <input
                    type="text"
                    maxLength={22}
                    required
                    value={versionInput}
                    onChange={(e) => setVersionInput(e.target.value)}
                    placeholder="1.1.0"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 pl-7 pr-4 py-2.5 text-sm font-mono font-bold text-white focus:border-[#facc15] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Titre principal de la version
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={versionTitleInput}
                  onChange={(e) => setVersionTitleInput(e.target.value)}
                  placeholder="Ex: Nouveau système de suivi & mode hors-ligne"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-white placeholder-neutral-600 focus:border-[#facc15] focus:outline-none"
                />
              </div>
            </div>

            {/* Category Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-300">
                Catégorie de mise à jour
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(
                  [
                    {
                      id: 'feature',
                      label: 'Nouveautés',
                      icon: <Sparkles className="h-3.5 w-3.5 text-sky-400" />,
                    },
                    {
                      id: 'improvement',
                      label: 'Améliorations',
                      icon: <Layers className="h-3.5 w-3.5 text-emerald-400" />,
                    },
                    {
                      id: 'fix',
                      label: 'Correctifs',
                      icon: <Wrench className="h-3.5 w-3.5 text-amber-400" />,
                    },
                    {
                      id: 'security',
                      label: 'Sécurité',
                      icon: <ShieldCheck className="h-3.5 w-3.5 text-rose-400" />,
                    },
                    {
                      id: 'major',
                      label: 'Majeure',
                      icon: <Crown className="h-3.5 w-3.5 text-[#facc15]" />,
                    },
                  ] as const
                ).map((cat) => {
                  const selected = versionCategoryInput === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setVersionCategoryInput(cat.id)}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                        selected
                          ? 'border-[#facc15] bg-[#facc15]/15 text-white'
                          : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white hover:border-neutral-700'
                      }`}
                    >
                      {cat.icon}
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detailed Summary */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-neutral-300">
                  Description / Résumé pour les visiteurs
                </label>
                <span className="text-[10px] font-mono text-neutral-500">
                  {versionNoteInput.length}/600
                </span>
              </div>
              <textarea
                rows={3}
                maxLength={600}
                value={versionNoteInput}
                onChange={(e) => setVersionNoteInput(e.target.value)}
                placeholder="Décrivez brièvement les nouveautés affichées dans la pop-up d'accueil et le journal des versions..."
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-white placeholder-neutral-600 focus:border-[#facc15] focus:outline-none resize-y leading-relaxed"
              />
            </div>

            {/* Interactive Bullet Changes Builder */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-neutral-300">
                  Points détaillés (Changelog affiché dans la pop-up)
                </label>
                <span className="text-[10px] font-mono text-neutral-500">
                  {versionChangesInput.length}/20 points
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={220}
                  value={newChangeBullet}
                  onChange={(e) => setNewChangeBullet(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddChangeBullet();
                    }
                  }}
                  placeholder="Ex: Historique des versions consultable depuis le pied de page"
                  className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white placeholder-neutral-600 focus:border-[#facc15] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddChangeBullet}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#facc15]/40 bg-[#facc15]/15 hover:bg-[#facc15]/25 text-xs font-bold text-[#facc15] transition-colors shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Ajouter</span>
                </button>
              </div>

              {versionChangesInput.length > 0 && (
                <ul className="space-y-2 pt-1">
                  {versionChangesInput.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-[#facc15] w-5 text-center shrink-0">
                        {idx + 1}.
                      </span>
                      <input
                        type="text"
                        maxLength={220}
                        value={item}
                        onChange={(e) => handleUpdateChangeBullet(idx, e.target.value)}
                        className="flex-1 rounded-lg border border-neutral-800 bg-black/50 px-3 py-1.5 text-xs text-neutral-200 focus:border-[#facc15] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveChangeBullet(idx)}
                        className="h-8 w-8 rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-rose-400 hover:border-rose-500/40 flex items-center justify-center shrink-0 transition-colors"
                        title="Retirer ce point"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Pop-up Behavior Toggle */}
            <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60 cursor-pointer text-xs">
              <div>
                <span className="font-bold text-white block">
                  Afficher automatiquement la pop-up sur les appareils
                </span>
                <span className="text-[11px] text-neutral-400 block mt-0.5">
                  Les nouveaux appareils et ceux n&apos;ayant pas encore vu cette version verront la fenêtre d&apos;information à leur arrivée.
                </span>
              </div>
              <input
                type="checkbox"
                checked={forcePopupInput}
                onChange={(e) => setForcePopupInput(e.target.checked)}
                className="h-4 w-4 accent-[#facc15] shrink-0"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              {isSaved ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Version v{normalizeSiteVersion(settings.siteVersion)} enregistrée !</span>
                </span>
              ) : (
                <span className="text-[11px] text-neutral-500">
                  Synchronisé en temps réel via Firebase &amp; JSONBin.
                </span>
              )}

              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] active:scale-[0.98] text-black px-5 py-2.5 text-xs font-black transition-all shadow-[0_0_15px_rgba(250,204,21,0.3)]"
              >
                <Sparkles className="h-4 w-4" />
                <span>
                  {editingReleaseId ? 'Enregistrer la modification' : 'Publier la mise à jour'}
                </span>
              </button>
            </div>
          </form>

          {/* Release History Timeline */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-5 sm:p-6 shadow-xl backdrop-blur-sm space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15]">
                <History className="h-4 w-4" />
                <span>Historique des versions publiées</span>
              </div>
              <span className="text-[11px] font-mono text-neutral-400">
                {getEffectiveReleaseHistory(form).length} entrée(s)
              </span>
            </div>

            <div className="space-y-3">
              {getEffectiveReleaseHistory(form).map((entry, idx) => (
                <div
                  key={entry.id}
                  className={`rounded-xl border p-4 space-y-2.5 transition-colors ${
                    idx === 0
                      ? 'border-[#facc15]/35 bg-[#facc15]/[0.04]'
                      : 'border-neutral-800 bg-black/35'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs font-black text-[#facc15]">
                        v{entry.version}
                      </span>
                      {idx === 0 && (
                        <span className="text-[10px] font-bold uppercase text-emerald-400">
                          Active
                        </span>
                      )}
                      <span className="text-xs font-bold text-white truncate">
                        · {entry.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-neutral-500">
                        {formatJsonBinTimestamp(entry.publishedAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleLoadReleaseForEdit(entry)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-700 bg-neutral-900 hover:border-[#facc15]/50 text-[11px] font-bold text-neutral-200 hover:text-[#facc15] transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        <span>Modifier</span>
                      </button>
                      {getEffectiveReleaseHistory(form).length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteReleaseFromHistory(entry.id)}
                          className="h-7 w-7 rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-rose-400 hover:border-rose-500/40 flex items-center justify-center transition-colors"
                          title="Supprimer cette version de l'historique"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {entry.summary && (
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      {entry.summary}
                    </p>
                  )}

                  {entry.changes.length > 0 && (
                    <ul className="space-y-1 text-[11px] text-neutral-400 pl-1">
                      {entry.changes.map((chg, cIdx) => (
                        <li key={cIdx} className="flex items-start gap-2">
                          <span className="text-[#facc15] font-bold">•</span>
                          <span>{chg}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION: SÉCURITÉ & IPS */}
      {activeSection === 'security' && (
        <div className="space-y-6 animate-in fade-in duration-150">

      {/* Section 5: Sécurité A2F Principale Unique */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15]">
            <KeyRound className="h-4 w-4" />
            <span>Sécurité : A2F Principale Unique</span>
          </div>
          <span className="text-[11px] text-emerald-400 font-mono">Sans mot de passe</span>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-300 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Microsoft / Google Authenticator : Jumelé & Actif</span>
            </span>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Protection Exclusive Active
            </span>
          </div>
          <p className="text-xs text-neutral-300 leading-relaxed">
            Seule votre application Authenticator générant les codes à 6 chiffres de l'<strong>A2F principale</strong> permet de vous connecter et de déverrouiller les accès. Aucun mot de passe maître n'est accepté.
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => onOpenSecurityModal && onOpenSecurityModal('Gestion Authenticator 2FA')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 hover:text-white transition-colors"
            >
              <Smartphone className="h-3.5 w-3.5 text-[#facc15]" />
              <span>Jumeler un nouveau téléphone / Afficher le QR Code</span>
            </button>
          </div>
        </div>
      </div>

      {/* Section 6: Gestion de multiples IPs de Confiance pour scan instantané */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15]">
            <Zap className="h-4 w-4 text-[#facc15]" />
            <span>IPs De Confiance : Autorisation Instantanée Par QR Code (Multi-IP)</span>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
            {trustedIps.length} {trustedIps.length > 1 ? 'adresses actives' : 'adresse active'}
          </span>
        </div>

        <div className="space-y-4 max-w-2xl">
          <p className="text-xs text-neutral-300 leading-relaxed">
            Vous pouvez configurer <strong>plusieurs adresses IP de confiance</strong> (ex: le WiFi de votre domicile, votre connexion au bureau ou le partage 4G/5G). Tout smartphone scannant le QR code depuis l'une de ces adresses IP est <strong>immédiatement autorisé</strong> sans avoir besoin de saisir de mot de passe !
          </p>

          {/* Form to add a new IP */}
          <form onSubmit={handleAddTrustedIp} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Ajouter une adresse IP publique de confiance
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={newIpInput}
                    onChange={(e) => setNewIpInput(e.target.value.trim())}
                    placeholder="Ex: 82.64.12.34 (ou cliquez sur Détecter)"
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white placeholder-neutral-600 focus:border-[#facc15] focus:outline-none font-mono"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-neutral-500">
                    <Globe className="h-4 w-4" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDetectCurrentIp}
                  disabled={isDetectingIp}
                  className="flex items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
                >
                  <Wifi className="h-3.5 w-3.5 text-[#facc15]" />
                  <span>{isDetectingIp ? 'Détection...' : 'Détecter mon IP actuelle'}</span>
                </button>

                <button
                  type="submit"
                  disabled={newIpInput.trim().length < 7}
                  className="flex items-center justify-center gap-2 rounded-lg bg-[#facc15] hover:bg-[#eab308] text-black px-4 py-2 text-xs font-bold transition-all shadow-[0_0_15px_rgba(250,204,21,0.2)] disabled:opacity-40 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Ajouter cette IP</span>
                </button>
              </div>
            </div>

            {ipMessage && (
              <div className="flex items-center gap-2 text-xs text-[#facc15] font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span>{ipMessage}</span>
              </div>
            )}
          </form>

          {/* List of active trusted IPs */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-300">
                Adresses IP autorisées pour le déverrouillage direct ({trustedIps.length})
              </span>
              {trustedIps.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllTrustedIps}
                  className="text-[11px] text-neutral-400 hover:text-rose-400 transition-colors"
                >
                  Tout supprimer
                </button>
              )}
            </div>

            {trustedIps.length === 0 ? (
              <div className="p-4 rounded-xl border border-neutral-800/80 bg-neutral-950/60 text-center text-xs text-neutral-500">
                Aucune adresse IP de confiance enregistrée. Ajoutez-en une pour déverrouiller instantanément par QR code sans mot de passe.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {trustedIps.map((ip) => (
                  <div
                    key={ip}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-800/60 bg-emerald-950/30 text-emerald-300 text-xs font-mono"
                  >
                    <Globe className="h-3.5 w-3.5 text-emerald-400" />
                    <span>{ip}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTrustedIp(ip)}
                      title={`Supprimer ${ip}`}
                      className="text-neutral-400 hover:text-rose-400 p-0.5 rounded transition-colors ml-1"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
      )}

      {/* SECTION: CLOUD & PURGE */}
      {activeSection === 'cloud' && (
      <div className="space-y-6 animate-in fade-in duration-150">
      {/* Zone de purge & sécurité des données */}
      <div className="rounded-2xl border border-rose-900/40 bg-rose-950/15 p-5 sm:p-6 shadow-xl backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between border-b border-rose-900/30 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-400">
            <Trash2 className="h-4 w-4" />
            <span>Purge Du Cache & Réinitialisation Du Joueur</span>
          </div>
          <span className="text-[11px] font-mono text-rose-300/80">@{form.username}</span>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-xs text-neutral-300 leading-relaxed max-w-xl">
            Supprime immédiatement tous les relevés en cache local et relance une synchronisation neuve avec Chess.com pour <strong>@{form.username}</strong>.
          </p>

          <button
            type="button"
            onClick={handleInitiatePurge}
            className="flex items-center gap-2 rounded-lg border border-rose-800 bg-rose-950/60 hover:bg-rose-900 text-rose-200 px-4 py-2 text-xs font-bold transition-all shrink-0 active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Purger & Re-synchroniser @{form.username}</span>
          </button>
        </div>
      </div>

      {/* Section 7: Cache Cloud & Synchronisation JSONBin.io (Protégé par 2FA) */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-5 sm:p-6 shadow-xl backdrop-blur-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15]">
            <Cloud className="h-4 w-4 text-[#facc15]" />
            <span>Cache Cloud & Synchronisation JSONBin.io</span>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="h-3 w-3" />
            <span>Modifications Protégées par 2FA</span>
          </span>
        </div>

        <p className="text-xs text-neutral-300 leading-relaxed max-w-2xl">
          Les modifications des identifiants et clés de votre compte JSONBin sont <strong>strictement réservées à l'administrateur déverrouillé par 2FA</strong>. En revanche, la synchronisation quotidienne de vos données (1 relevé par jour) reste <strong>entièrement libre</strong> pour vos appareils et s'effectue automatiquement en arrière-plan sans bloquer vos parties.
        </p>

        {/* Live Status and Quota Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card A: Connection State */}
          <div className="rounded-xl border border-neutral-800 bg-black/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-[#facc15]" />
                État du Bin Cloud
              </span>
              {jsonBinInfo?.configured ? (
                jsonBinInfo.lastStatus === 'synced' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                    <span>Synchronisé</span>
                  </span>
                ) : jsonBinInfo.lastStatus === 'syncing' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#facc15]/15 text-[#facc15] border border-[#facc15]/40">
                    <RefreshCw className="h-3 w-3 animate-spin text-[#facc15]" />
                    <span>En cours...</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444]" />
                    <span>Erreur de clé</span>
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#facc15]/15 text-[#facc15] border border-[#facc15]/40">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#facc15]" />
                  <span>En attente de codes</span>
                </span>
              )}
            </div>
            <div className="font-mono text-xs text-white truncate">
              {jsonBinInfo?.binId ? `Bin ID : ${jsonBinInfo.binId}` : 'Aucun Bin ID configuré'}
            </div>
            <div className="text-[11px] font-mono text-[#facc15]">
              Dernière MàJ : {formatJsonBinTimestamp(jsonBinInfo?.lastSyncTime || jsonBinInfo?.remoteUpdatedAt)}
            </div>
            {jsonBinInfo?.lastError && (
              <p className="text-[11px] text-rose-400 font-sans">{jsonBinInfo.lastError}</p>
            )}
          </div>

          {/* Card B: Quota Protection Counter */}
          <div className="rounded-xl border border-neutral-800 bg-black/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[#10b981]" />
                Protection Quota Active
              </span>
              <span className="text-[10px] font-mono text-[#10b981]">0 gaspillage</span>
            </div>
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-neutral-400 text-[11px] font-sans">Aujourd'hui :</span>
              <span className="font-bold text-white">
                {jsonBinInfo?.quotaInfo?.requestsToday ?? 0} requête(s)
              </span>
            </div>
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-neutral-400 text-[11px] font-sans">Économisées :</span>
              <span className="font-bold text-[#10b981]">
                +{jsonBinInfo?.quotaInfo?.savedRequests ?? 0} évitées
              </span>
            </div>
          </div>
        </div>

        {/* Configuration Form (Protected by 2FA) */}
        <form onSubmit={handleSaveJsonBin} className="space-y-4 rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <KeyRound className="h-4 w-4 text-[#facc15]" />
              <span>Identifiants & Clés d'Accès JSONBin.io</span>
            </span>
            <a
              href="https://jsonbin.io"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[#facc15] hover:underline inline-flex items-center gap-1 font-bold"
            >
              jsonbin.io <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Bin ID (Ex: 6730a4d5e41b4d34e449xxxx)
              </label>
              <input
                type="text"
                value={binIdInput}
                onChange={(e) => setBinIdInput(e.target.value)}
                placeholder="Identifiant du Bin"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white placeholder-neutral-600 focus:border-[#facc15] focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Master Key ou Access Key (JSONBin)
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="$2a$10$..."
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 pr-10 text-xs text-white placeholder-neutral-600 focus:border-[#facc15] focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-white"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {binFeedback && (
            <div
              className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                binFeedback.isError
                  ? 'bg-rose-950/40 border border-rose-800/60 text-rose-300'
                  : 'bg-emerald-950/40 border border-emerald-800/60 text-emerald-300'
              }`}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{binFeedback.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualSyncToJsonBin}
                disabled={isSyncingBin || !jsonBinInfo?.configured}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#10b981]/40 bg-[#10b981]/15 text-xs font-bold text-[#10b981] hover:bg-[#10b981]/25 transition-all disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncingBin ? 'animate-spin' : ''}`} />
                <span>Sauvegarder vers JSONBin</span>
              </button>

              <button
                type="button"
                onClick={handlePullFromJsonBinNow}
                disabled={isSyncingBin || !jsonBinInfo?.configured}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 text-xs font-bold text-white hover:bg-neutral-800 transition-all disabled:opacity-40"
              >
                <Server className="h-3.5 w-3.5" />
                <span>Restaurer depuis JSONBin</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={isSavingBin}
              className="flex items-center gap-2 rounded-lg bg-[#facc15] hover:bg-[#eab308] text-black px-4 py-2 text-xs font-bold transition-all shadow-md disabled:opacity-50"
            >
              {isSavingBin ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>Enregistrer & Tester la clé</span>
            </button>
          </div>
        </form>

        {/* Official 9 Records JSON Template & Copy */}
        <div className="space-y-2 rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-white block">
                Structure JSON Officielle (9 Relevés Quotidiens Certifiés)
              </span>
              <span className="text-[11px] text-neutral-400">
                1 sync par jour du 02 au 10 nov. 2026 · Format conforme à coller directement sur JSONBin
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyOfficialTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-xs font-bold text-neutral-200 hover:text-white hover:border-[#facc15]/50 transition-all"
            >
              {copiedBinJson ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#10b981]" />
                  <span className="text-[#10b981]">Copié !</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-[#facc15]" />
                  <span>Copier le JSON</span>
                </>
              )}
            </button>
          </div>

          <pre className="max-h-48 overflow-y-auto p-3 rounded-lg bg-black/80 border border-neutral-800/80 font-mono text-[10px] text-neutral-300 leading-relaxed scrollbar-thin">
            {JSON.stringify(
              jsonBinInfo?.template || {
                exportedAt: '2026-11-10T17:24:51.128Z',
                project: 'Road to 2000 Elo',
                username: form.username,
                version: '2.0',
                recordsCount: OFFICIAL_DAILY_RECORDS.length,
                records: OFFICIAL_DAILY_RECORDS,
              },
              null,
              2
            )}
          </pre>
        </div>
      </div>
      </div>
      )}

      {/* SECTION: PARAMÈTRE FIREBASE (Vue PC) */}
      {activeSection === 'firebase' && (
        <div className="hidden sm:block">
          <FirebaseErrorBoundary fallbackTitle="Erreur dans l'explorateur Firebase">
            <FirebaseSettingsPanel
              username={form.username}
              settings={form}
              jsonBinHistory={syncHistory ?? getStoredSyncHistory(form.username)}
              onShowMessage={onShowMessage}
            />
          </FirebaseErrorBoundary>
        </div>
      )}

      {/* Secure Purge / Reset Modal with Mandatory Backup & Double 2FA */}
      <SecurePurgeModal
        isOpen={secureModalOpen}
        onClose={() => setSecureModalOpen(false)}
        onConfirm={handleExecuteSecureAction}
        actionType={secureModalAction}
        username={form.username}
        settings={form}
        syncHistory={getStoredSyncHistory(form.username)}
      />
    </div>
  );
};
