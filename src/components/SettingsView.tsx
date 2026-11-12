/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sun,
  Trash2,
  Unlock,
  User,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { AppSettings, GameMode, SyncRecord, TrajectoryModel } from '../types/chess';
import { DEFAULT_SETTINGS, getStoredSyncHistory, OFFICIAL_DAILY_RECORDS } from '../utils/storage';
import { SecurePurgeModal } from './SecurePurgeModal';
import {
  addTrustedIp,
  getClientIp,
  getTrustedIps,
  removeTrustedIp,
  setTrustedIps,
  updateAdminPassword,
} from '../utils/security';
import {
  fetchJsonBinStatus,
  JsonBinStatusInfo,
  pullFromJsonBin,
  saveJsonBinConfig,
  syncNowToJsonBin,
} from '../utils/cloudSync';

interface SettingsViewProps {
  settings: AppSettings;
  onSettingsUpdate: (updated: AppSettings) => void;
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning') => void;
  onPurgeAccountData?: () => void;
  onHistoryUpdate?: (history: SyncRecord[]) => void;
  isAdmin?: boolean;
  isIframe?: boolean;
  onOpenSecurityModal?: (title?: string) => void;
  onLockAdmin?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSettingsUpdate,
  onShowMessage,
  onPurgeAccountData,
  onHistoryUpdate,
  isAdmin = false,
  isIframe = false,
  onOpenSecurityModal,
  onLockAdmin,
}) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [isSaved, setIsSaved] = useState(false);
  const [secureModalOpen, setSecureModalOpen] = useState(false);
  const [secureModalAction, setSecureModalAction] = useState<'purge' | 'reset'>('purge');

  // Change password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');

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
      if (res.skipped) {
        onShowMessage('Quota préservé : Vos 9 relevés sont déjà parfaitement à jour sur JSONBin !', 'info');
      } else {
        onShowMessage('Relevés sauvegardés en direct sur votre bin JSONBin !', 'success');
      }
      const updated = await fetchJsonBinStatus(form.username);
      if (updated) setJsonBinInfo(updated);
    } else {
      onShowMessage(res.error || 'Erreur lors de la synchronisation JSONBin', 'warning');
    }
  };

  const handlePullFromJsonBinNow = async () => {
    setIsSyncingBin(true);
    const res = await pullFromJsonBin();
    setIsSyncingBin(false);
    if (res.success && res.history) {
      if (onHistoryUpdate) onHistoryUpdate(res.history);
      onShowMessage(`${res.history.length} relevés quotidiens restaurés depuis JSONBin !`, 'success');
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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword.length < 4) {
      setPasswordError('Le nouveau mot de passe doit comporter au moins 4 caractères.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    const ok = await updateAdminPassword(newPassword);
    if (ok) {
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      onShowMessage('Mot de passe administrateur 2FA modifié avec succès !', 'success');
      setTimeout(() => setPasswordSuccess(false), 4000);
    } else {
      setPasswordError('Impossible de mettre à jour le mot de passe.');
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

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-100 dark:text-neutral-100 light:text-neutral-900 flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-[#facc15]" />
            <span>Paramètres Personnalisables Du Projet</span>
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              <ShieldCheck className="h-3 w-3" />
              <span>Session Admin 2FA Active</span>
            </span>
          </h2>
          <p className="text-xs text-neutral-400">
            Ajustez votre profil, vos cibles et les préférences du moteur de performance.
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
            <span>Réinitialiser par défaut</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Profil & Objectifs Principaux */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/90 light:border-neutral-200 light:bg-white space-y-4">
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
                Par défaut : <strong className="text-neutral-200">alpharomeo1500</strong>. Changer de pseudo isole et purge automatiquement les données de l'ancien compte pour éviter toute valeur faussée.
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
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Par défaut : Sélection automatique du classement le plus élevé.
              </span>
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
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Fixé à 1500 Elo pour le projet "Road to 2000".
              </span>
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
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Fixé à 2000 Elo pour l'accomplissement final.
              </span>
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
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Date de référence : 31 octobre 2026.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Date d'échéance finale
              </label>
              <input
                type="datetime-local"
                value={form.targetDate.substring(0, 16)}
                onChange={(e) => setForm({ ...form, targetDate: `${e.target.value}:59` })}
                required
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-[#facc15] focus:outline-none"
              />
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Date limite : 31 décembre 2027 à 23h59 (Europe/Paris).
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Algorithme de trajectoire & Synchronisation */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/90 light:border-neutral-200 light:bg-white space-y-4">
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
              <span className="text-[11px] text-neutral-500 mt-1 block">
                La trajectoire linéaire est le modèle officiel garantissant une cible journalière rigoureuse.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Intervalle d'actualisation automatique
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
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Respecte les limites d'appels de l'API publique Chess.com.
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Thème & Notifications */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/90 light:border-neutral-200 light:bg-white space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15] border-b border-neutral-800 pb-3">
            <Bell className="h-4 w-4" />
            <span>Thème Visuel & Notifications De Performance</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-2">
                Thème d'affichage
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, theme: 'dark' })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                    form.theme === 'dark'
                      ? 'border-[#facc15] bg-[#facc15]/15 text-[#facc15] shadow-sm'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white'
                  }`}
                >
                  <Moon className="h-4 w-4" />
                  <span>Sombre</span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, theme: 'light' })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                    form.theme === 'light'
                      ? 'border-[#facc15] bg-[#facc15]/15 text-[#facc15] shadow-sm'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white'
                  }`}
                >
                  <Sun className="h-4 w-4" />
                  <span>Clair</span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, theme: 'system' })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                    form.theme === 'system'
                      ? 'border-[#facc15] bg-[#facc15]/15 text-[#facc15] shadow-sm'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white'
                  }`}
                >
                  <Monitor className="h-4 w-4" />
                  <span>Système</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-neutral-300">
                Alertes et notifications sportives
              </label>
              <div className="space-y-1.5 text-xs text-neutral-300">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.notifications.newPeak}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        notifications: { ...form.notifications, newPeak: e.target.checked },
                      })
                    }
                    className="rounded border-neutral-700 bg-neutral-950 text-[#facc15]"
                  />
                  <span>Alerter lors d'un nouveau record Elo personnel</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.notifications.milestoneReached}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        notifications: { ...form.notifications, milestoneReached: e.target.checked },
                      })
                    }
                    className="rounded border-neutral-700 bg-neutral-950 text-[#facc15]"
                  />
                  <span>Notifier lors du franchissement d'un palier mensuel</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.notifications.significantDelay}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        notifications: { ...form.notifications, significantDelay: e.target.checked },
                      })
                    }
                    className="rounded border-neutral-700 bg-neutral-950 text-[#facc15]"
                  />
                  <span>Signaler un écart important sur la trajectoire théorique</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Zone de purge & sécurité des données */}
        <div className="rounded-2xl border border-rose-900/40 bg-rose-950/15 p-6 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-rose-900/30 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-400">
              <Trash2 className="h-4 w-4" />
              <span>Purge Du Cache & Réinitialisation Du Joueur</span>
            </div>
            <span className="text-[11px] font-mono text-rose-300/80">Joueur actuel : @{form.username}</span>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-xs text-neutral-300 leading-relaxed max-w-xl">
              Si vous constatez des données résiduelles d'un ancien compte (ou d'un test précédent), ce bouton supprime immédiatement tous les relevés en mémoire cache locale et relance une synchronisation neuve et certifiée avec Chess.com pour <strong>@{form.username}</strong>.
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

        {/* Save Bar */}
        <div className="flex items-center justify-between pt-4">
          {isSaved ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              <span>Modifications appliquées et enregistrées localement !</span>
            </span>
          ) : (
            <span className="text-[11px] text-neutral-500">
              Toutes les modifications sont immédiatement prises en compte dans les calculs.
            </span>
          )}

          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-[#facc15] hover:bg-[#eab308] active:scale-[0.98] text-black px-5 py-2 text-xs font-bold transition-all shadow-[0_0_15px_rgba(250,204,21,0.3)]"
          >
            <Save className="h-4 w-4" />
            <span>Enregistrer Les Modifications</span>
          </button>
        </div>
      </form>

      {/* Section 5: Modification du mot de passe Administrateur 2FA */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15]">
            <KeyRound className="h-4 w-4" />
            <span>Sécurité 2FA : Modifier Le Mot De Passe Maître</span>
          </div>
          <span className="text-[11px] text-neutral-500 font-mono">Insensible à la casse</span>
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
            Seul votre smartphone peut générer les codes à 6 chiffres. Le QR code de jumelage est <strong>strictement masqué</strong> pour empêcher quiconque d'autre de cloner vos accès.
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => onOpenSecurityModal && onOpenSecurityModal('Gestion Authenticator 2FA')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 hover:text-white transition-colors"
            >
              <Smartphone className="h-3.5 w-3.5 text-[#facc15]" />
              <span>Jumeler un nouveau téléphone / Reconfigurer</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-xl">
          <p className="text-xs text-neutral-300 leading-relaxed">
            Ce mot de passe maître confidentiel est requis pour autoriser l'affichage du QR code de jumelage ou modifier les paramètres sensibles.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Nouveau mot de passe maître</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="4 caractères minimum"
                required
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white focus:border-[#facc15] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Confirmer le mot de passe</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmer"
                required
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white focus:border-[#facc15] focus:outline-none"
              />
            </div>
          </div>

          {passwordError && (
            <div className="flex items-center gap-1.5 text-xs text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{passwordError}</span>
            </div>
          )}

          {passwordSuccess && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Nouveau mot de passe maître enregistré avec succès !</span>
            </div>
          )}

          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 text-xs font-semibold transition-colors"
          >
            <Lock className="h-3.5 w-3.5 text-[#facc15]" />
            <span>Changer le mot de passe 2FA</span>
          </button>
        </form>
      </div>

      {/* Section 6: Gestion de multiples IPs de Confiance pour scan instantané */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15]">
            <Zap className="h-4 w-4 text-[#facc15]" />
            <span>IPs De Confiance : Autorisation Instantanée Par QR Code (Multi-IP)</span>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
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

      {/* Section 7: Cache Cloud & Synchronisation JSONBin.io (Protégé par 2FA) */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl backdrop-blur-sm space-y-5">
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
