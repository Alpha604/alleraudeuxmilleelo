/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Moon,
  RefreshCw,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  Sliders,
  Sun,
  Trash2,
  User,
} from 'lucide-react';
import { AppSettings, GameMode, TrajectoryModel } from '../types/chess';
import { DEFAULT_SETTINGS } from '../utils/storage';

interface SettingsViewProps {
  settings: AppSettings;
  onSettingsUpdate: (updated: AppSettings) => void;
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning') => void;
  onPurgeAccountData?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSettingsUpdate,
  onShowMessage,
  onPurgeAccountData,
}) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [isSaved, setIsSaved] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isNewUser = form.username.trim().toLowerCase() !== settings.username.trim().toLowerCase();
    onSettingsUpdate(form);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
    if (!isNewUser) {
      onShowMessage('Paramètres enregistrés avec succès ! Tous les calculs ont été mis à jour.', 'success');
    }
  };

  const handleReset = () => {
    setForm(DEFAULT_SETTINGS);
    onSettingsUpdate(DEFAULT_SETTINGS);
    onShowMessage('Paramètres réinitialisés aux valeurs officielles du projet (alpharomeo1500, 1500 → 2000 Elo).', 'info');
  };

  const handleExecutePurge = () => {
    setShowPurgeModal(false);
    if (onPurgeAccountData) {
      onPurgeAccountData();
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-100 dark:text-neutral-100 light:text-neutral-900 flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-amber-400" />
            <span>Paramètres Personnalisables Du Projet</span>
          </h2>
          <p className="text-xs text-neutral-400">
            Ajustez votre profil, vos cibles et les préférences du moteur de performance.
          </p>
        </div>

        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors self-start"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Réinitialiser par défaut</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Profil & Objectifs Principaux */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/90 light:border-neutral-200 light:bg-white space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400 border-b border-neutral-800 pb-3">
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
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
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
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
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
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none font-mono"
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
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none font-mono"
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
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
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
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
              />
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Date limite : 31 décembre 2027 à 23h59 (Europe/Paris).
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Algorithme de trajectoire & Synchronisation */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/90 light:border-neutral-200 light:bg-white space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400 border-b border-neutral-800 pb-3">
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
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
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
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
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
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400 border-b border-neutral-800 pb-3">
            <Bell className="h-4 w-4" />
            <span>Thème Visuel & Notifications De Performance</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-2">
                Thème d'affichage
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, theme: 'dark' })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${
                    form.theme === 'dark'
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                  }`}
                >
                  <Moon className="h-4 w-4" />
                  <span>Noir Charbon / Or Doux (Défaut)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, theme: 'light' })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${
                    form.theme === 'light'
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                  }`}
                >
                  <Sun className="h-4 w-4" />
                  <span>Mode Clair</span>
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
                    className="rounded border-neutral-700 bg-neutral-950 text-amber-500"
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
                    className="rounded border-neutral-700 bg-neutral-950 text-amber-500"
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
                    className="rounded border-neutral-700 bg-neutral-950 text-amber-500"
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
              onClick={() => setShowPurgeModal(true)}
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
            className="flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-neutral-950 px-5 py-2 text-xs font-bold transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)]"
          >
            <Save className="h-4 w-4" />
            <span>Enregistrer Les Modifications</span>
          </button>
        </div>
      </form>

      {/* Confirmation Modal for Hard Purge */}
      {showPurgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-900/60 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-base font-bold text-white">Confirmer la purge du cache</h3>
            </div>
            <p className="mt-3 text-xs text-neutral-300 leading-relaxed">
              Êtes-vous certain de vouloir purger le cache local ? Toutes les anciennes données enregistrées pour <strong>@{form.username}</strong> et les anciens comptes seront effacées. L'application se re-synchronisera immédiatement avec l'API officielle de Chess.com.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPurgeModal(false)}
                className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleExecutePurge}
                className="rounded-lg bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-bold text-white transition-colors"
              >
                Confirmer la purge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
