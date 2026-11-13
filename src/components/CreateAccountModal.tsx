/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { createManagedAccount } from '../utils/security';
import { GameMode, TrajectoryModel } from '../types/chess';

interface CreateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountCreated?: (username: string) => void;
  onShowMessage: (msg: string, type: 'info' | 'success' | 'warning', title?: string) => void;
}

export const CreateAccountModal: React.FC<CreateAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountCreated,
  onShowMessage,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [username, setUsername] = useState('');
  const [jsonBinId, setJsonBinId] = useState('');
  const [jsonBinApiKey, setJsonBinApiKey] = useState('');

  // Objectives
  const [startElo, setStartElo] = useState<number>(1500);
  const [targetElo, setTargetElo] = useState<number>(2000);
  const [startDate, setStartDate] = useState<string>('2026-11-01');
  const [targetDate, setTargetDate] = useState<string>('2027-12-31');
  const [selectedMode, setSelectedMode] = useState<GameMode | 'auto'>('auto');
  const [trajectoryModel, setTrajectoryModel] = useState<TrajectoryModel>('linear');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUsername, setCreatedUsername] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser || cleanUser.length < 3) {
      setError('Le pseudo Chess.com doit comporter au moins 3 caractères.');
      return;
    }
    if (cleanUser === 'alpharomeo1500') {
      setError('Le compte officiel @alpharomeo1500 existe déjà.');
      return;
    }
    if (!jsonBinId.trim() || jsonBinId.trim().length < 10) {
      setError('Veuillez spécifier un Bin ID JSONBin valide pour isoler les données de ce compte.');
      return;
    }
    setStep(2);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await createManagedAccount({
        username: username.trim().toLowerCase(),
        jsonBinId: jsonBinId.trim(),
        jsonBinApiKey: jsonBinApiKey.trim() || undefined,
        startElo,
        targetElo,
        startDate,
        targetDate,
        selectedMode,
        trajectoryModel,
      });

      if (res.success && res.username) {
        setCreatedUsername(res.username);
        setStep(3);
        onShowMessage(
          `Compte @${res.username} créé avec succès ! Protégé par l'A2F principale.`,
          'success',
          'Nouveau Compte'
        );
        if (onAccountCreated) {
          onAccountCreated(res.username);
        }
      } else {
        setError(res.error || 'Erreur lors de la création du compte.');
      }
    } catch (err: any) {
      setError(err?.message || 'Erreur inconnue.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-3xl border border-neutral-800 bg-[#0c0f14] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-neutral-950 via-[#0c0f14] to-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#facc15]/10 border border-[#facc15]/30 flex items-center justify-center text-[#facc15]">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Création de Compte Joueur
              </h3>
              <span className="text-[10px] text-[#facc15] font-semibold">
                Espace Réservé Administrateur
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-5 pt-3 pb-2 flex items-center justify-between text-[11px] font-bold text-neutral-400 border-b border-neutral-800/60 bg-neutral-950/40">
          <span className={step === 1 ? 'text-[#facc15]' : ''}>1. Compte & JSONBin</span>
          <span>&rarr;</span>
          <span className={step === 2 ? 'text-[#facc15]' : ''}>2. Paramètres & Objectif</span>
          <span>&rarr;</span>
          <span className={step === 3 ? 'text-[#10b981]' : ''}>3. Confirmation</span>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-[#ef4444]/15 border border-[#ef4444]/30 text-[#ef4444] text-xs leading-relaxed">
              {error}
            </div>
          )}

          {/* STEP 1: Username & JSONBin credentials */}
          {step === 1 && (
            <form onSubmit={handleStep1Next} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-neutral-300">
                  Pseudo Chess.com du joueur
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ex : magnuscarlsen"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:border-[#facc15] focus:outline-none font-mono"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#facc15]">
                  <Database className="h-4 w-4" />
                  <span>Stockage Cloud Dédié (JSONBin)</span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-neutral-300">
                    Bin ID JSONBin pour ce compte *
                  </label>
                  <input
                    type="text"
                    required
                    value={jsonBinId}
                    onChange={(e) => setJsonBinId(e.target.value)}
                    placeholder="Ex : 6732ab... (ID de Bin dédié)"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:border-[#facc15] focus:outline-none font-mono"
                  />
                  <p className="text-[10px] text-neutral-500">
                    Chaque compte possède son propre Bin JSONBin isolé pour stocker ses synchronisations quotidiennes.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-neutral-300">
                    Clé API JSONBin Master Key (Optionnelle)
                  </label>
                  <input
                    type="password"
                    value={jsonBinApiKey}
                    onChange={(e) => setJsonBinApiKey(e.target.value)}
                    placeholder="Laissez vide pour utiliser la clé par défaut"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:border-[#facc15] focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#facc15]/5 border border-[#facc15]/20 text-[11px] text-neutral-300 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#facc15] shrink-0" />
                <span>
                  Ce compte utilisera exclusivement l'<strong className="text-white">A2F principale unique</strong> pour se connecter (sans mot de passe).
                </span>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#facc15] text-black text-xs font-bold hover:bg-[#eab308] transition-all shadow-md"
                >
                  <span>Suivant : Objectifs</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Custom Project Objectives for this user */}
          {step === 2 && (
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-neutral-300">Elo de départ</label>
                  <input
                    type="number"
                    value={startElo}
                    onChange={(e) => setStartElo(Number(e.target.value))}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-neutral-300">Elo cible</label>
                  <input
                    type="number"
                    value={targetElo}
                    onChange={(e) => setTargetElo(Number(e.target.value))}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-neutral-300">Date de départ</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-neutral-300">Date échéance</label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-neutral-300">Cadence principale</label>
                  <select
                    value={selectedMode}
                    onChange={(e) => setSelectedMode(e.target.value as any)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white"
                  >
                    <option value="auto">Auto (Meilleure)</option>
                    <option value="blitz">Blitz</option>
                    <option value="rapid">Rapide</option>
                    <option value="bullet">Bullet</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-neutral-300">Modèle de progression</label>
                  <select
                    value={trajectoryModel}
                    onChange={(e) => setTrajectoryModel(e.target.value as any)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white"
                  >
                    <option value="linear">Linéaire constant</option>
                    <option value="milestones">Par jalons mensuels</option>
                    <option value="custom">Personnalisé</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 text-xs font-bold hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Retour</span>
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#facc15] text-black text-xs font-bold hover:bg-[#eab308] transition-all shadow-md disabled:opacity-50"
                >
                  {isLoading ? <span>Création en cours...</span> : <span>Créer le Compte Officiel</span>}
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Confirmation */}
          {step === 3 && createdUsername && (
            <div className="space-y-4 text-center">
              <div className="flex flex-col items-center space-y-2 py-2">
                <div className="h-14 w-14 rounded-2xl bg-[#10b981]/15 border border-[#10b981]/40 flex items-center justify-center text-[#10b981]">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h4 className="text-base font-black text-white">
                  Compte @{createdUsername} prêt !
                </h4>
                <p className="text-xs text-neutral-400 max-w-sm leading-relaxed">
                  Le compte a été ajouté à la liste des joueurs officiels et isolé avec son propre stockage JSONBin (<code className="text-[#facc15]">{jsonBinId}</code>).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80 text-xs text-neutral-300 text-left space-y-1.5">
                <p>
                  <strong className="text-white">Connexion :</strong> Utilisez uniquement le code à 6 chiffres de l'<strong className="text-[#facc15]">A2F principale</strong> sur la page d'accueil.
                </p>
                <p>
                  <strong className="text-white">Mode Spectateur :</strong> Visible par tous en lecture seule sans consommer votre quota JSONBin.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#facc15] text-black font-black text-xs hover:bg-[#eab308] shadow-md transition-all"
                >
                  Terminer & Fermer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
