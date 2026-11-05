/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { AppSettings, SyncRecord } from '../types/chess';
import { verifyTotpCode } from '../utils/security';

interface SecurePurgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  actionType: 'purge' | 'reset';
  username: string;
  settings: AppSettings;
  syncHistory: SyncRecord[];
}

export const SecurePurgeModal: React.FC<SecurePurgeModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  actionType,
  username,
  settings,
  syncHistory,
}) => {
  // Steps: 1 = Backup download, 2 = First 2FA, 3 = Second 2FA, 4 = Executing/Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [hasDownloadedBackup, setHasDownloadedBackup] = useState<boolean>(false);
  const [firstCode, setFirstCode] = useState<string>('');
  const [secondCode, setSecondCode] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const firstInputRef = useRef<HTMLInputElement>(null);
  const secondInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const isReset = actionType === 'reset';
  const actionTitle = isReset
    ? 'Réinitialisation Totale des Paramètres'
    : `Purge Complète du Cache (@${username})`;

  // Step 1: Force download safety backup
  const handleDownloadBackup = () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const backupData = {
      appName: 'RoadTo2000Elo',
      exportDate: now.toISOString(),
      username: username,
      action: actionType,
      summary: {
        totalRecords: syncHistory.length,
        latestRating: syncHistory[0]?.bestRating || settings.startElo,
        startDate: settings.startDate,
        targetDate: settings.targetDate,
      },
      settings: settings,
      syncHistory: syncHistory,
      checksum: `SECURE_BACKUP_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `roadto2000_sauvegarde_securite_${username}_${dateStr}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setHasDownloadedBackup(true);
    setErrorMsg('');
  };

  // Step 2: First 2FA Code Submit
  const handleFirstCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = firstCode.trim().replace(/\D/g, '');
    if (clean.length !== 6) {
      setErrorMsg('Veuillez saisir un code à 6 chiffres valide.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');
    try {
      const isValid = await verifyTotpCode(clean);
      if (isValid) {
        setStep(3);
        setErrorMsg('');
        setTimeout(() => secondInputRef.current?.focus(), 150);
      } else {
        setErrorMsg('Code A2F incorrect ou expiré. Vérifiez l’heure de votre smartphone.');
      }
    } catch {
      setErrorMsg('Erreur lors de la vérification.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Step 3: Second 2FA Code Submit
  const handleSecondCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = secondCode.trim().replace(/\D/g, '');
    if (clean.length !== 6) {
      setErrorMsg('Veuillez saisir le second code de confirmation à 6 chiffres.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');
    try {
      const isValid = await verifyTotpCode(clean);
      if (isValid) {
        setStep(4);
        setTimeout(() => {
          onConfirm();
          onClose();
        }, 800);
      } else {
        setErrorMsg('Second code A2F incorrect. Entrez le code actuel de votre application.');
      }
    } catch {
      setErrorMsg('Erreur lors de la vérification.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl border border-neutral-800 bg-[#0c0f14] p-6 sm:p-8 shadow-2xl space-y-6 text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1 rounded-lg transition-colors"
          title="Fermer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3.5 border-b border-neutral-800/80 pb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#facc15]/30 bg-[#facc15]/10 text-[#facc15]">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 px-2 py-0.5 rounded-full">
                Protection renforcée
              </span>
              <span className="text-[10px] font-mono text-neutral-400">
                Sauvegarde + Double A2F
              </span>
            </div>
            <h3 className="text-base font-bold text-white pt-1">{actionTitle}</h3>
          </div>
        </div>

        {/* Stepper Progress Indicator (Blanc, Jaune, Vert) */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
          <div
            className={`p-2 rounded-xl border transition-all ${
              step >= 1
                ? hasDownloadedBackup
                  ? 'border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]'
                  : 'border-[#facc15]/50 bg-[#facc15]/10 text-[#facc15]'
                : 'border-neutral-800 bg-neutral-900/60 text-neutral-500'
            }`}
          >
            <div className="text-[10px] font-bold">Étape 1</div>
            <div className="text-[11px] font-bold">1. Sauvegarde</div>
          </div>

          <div
            className={`p-2 rounded-xl border transition-all ${
              step >= 2
                ? step > 2
                  ? 'border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]'
                  : 'border-[#facc15]/50 bg-[#facc15]/10 text-[#facc15]'
                : 'border-neutral-800 bg-neutral-900/60 text-neutral-500'
            }`}
          >
            <div className="text-[10px] font-bold">Étape 2</div>
            <div className="text-[11px] font-bold">2. A2F (1/2)</div>
          </div>

          <div
            className={`p-2 rounded-xl border transition-all ${
              step >= 3
                ? step === 4
                  ? 'border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]'
                  : 'border-[#facc15]/50 bg-[#facc15]/10 text-[#facc15]'
                : 'border-neutral-800 bg-neutral-900/60 text-neutral-500'
            }`}
          >
            <div className="text-[10px] font-bold">Étape 3</div>
            <div className="text-[11px] font-bold">3. A2F (2/2)</div>
          </div>
        </div>

        {/* STEP 1: MANDATORY BACKUP DOWNLOAD */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2.5 text-xs text-neutral-300 leading-relaxed">
              <div className="font-bold text-white flex items-center gap-1.5">
                <FileCheck className="h-4 w-4 text-[#facc15]" />
                <span>Sauvegarde de sécurité obligatoire avant destruction</span>
              </div>
              <p>
                Par mesure de précaution absolue, vous devez d&apos;abord télécharger une archive complète de vos données avant de pouvoir lancer la purge ou réinitialisation.
              </p>
              <div className="pt-2 border-t border-neutral-800/80 font-mono text-[11px] text-neutral-400 space-y-1">
                <div>• Joueur concerné : <strong className="text-white">@{username}</strong></div>
                <div>• Historique enregistré : <strong className="text-white">{syncHistory.length} relevés journaliers</strong></div>
                <div>• Cible officielle : <strong className="text-white">{settings.targetElo} Elo (au {settings.targetDate.split('T')[0]})</strong></div>
              </div>
            </div>

            {hasDownloadedBackup ? (
              <div className="p-3.5 rounded-xl border border-[#10b981]/40 bg-[#10b981]/15 text-xs text-[#10b981] font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Sauvegarde de sécurité téléchargée avec succès sur votre appareil !</span>
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-[#facc15] hover:text-white px-4 py-2.5 text-xs font-bold text-neutral-200 transition-all"
              >
                <Download className="h-4 w-4 text-[#facc15]" />
                <span>{hasDownloadedBackup ? 'Re-télécharger la sauvegarde' : 'Télécharger la sauvegarde (.json)'}</span>
              </button>

              <button
                type="button"
                disabled={!hasDownloadedBackup}
                onClick={() => {
                  setStep(2);
                  setErrorMsg('');
                  setTimeout(() => firstInputRef.current?.focus(), 150);
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black px-5 py-2.5 text-xs font-bold transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Continuer vers l&apos;A2F (1/2)</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: FIRST 2FA VALIDATION */}
        {step === 2 && (
          <form onSubmit={handleFirstCodeSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-white flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4 text-[#facc15]" />
                  <span>Première vérification A2F (1/2)</span>
                </label>
                <span className="text-[10px] text-neutral-400 font-mono">Microsoft / Google Authenticator</span>
              </div>
              <p className="text-xs text-neutral-300">
                Saisissez le premier code à 6 chiffres affiché sur votre application mobile :
              </p>

              <div className="relative pt-1">
                <input
                  ref={firstInputRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={firstCode}
                  onChange={(e) => setFirstCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  autoFocus
                  className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-2xl font-mono font-bold tracking-[0.4em] text-center text-[#facc15] placeholder-neutral-700 focus:border-[#facc15] focus:outline-none focus:ring-1 focus:ring-[#facc15]"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-neutral-500 pt-1">
                  <KeyRound className="h-5 w-5" />
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-1.5 text-xs text-[#ef4444] font-medium pt-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-neutral-400 hover:text-white"
              >
                ← Retour à la sauvegarde
              </button>

              <button
                type="submit"
                disabled={isVerifying || firstCode.trim().length !== 6}
                className="flex items-center gap-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black px-5 py-2.5 text-xs font-bold transition-all shadow-md disabled:opacity-40"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>{isVerifying ? 'Vérification...' : 'Valider le 1er code (1/2)'}</span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: SECOND 2FA CONFIRMATION */}
        {step === 3 && (
          <form onSubmit={handleSecondCodeSubmit} className="space-y-4">
            <div className="p-3 rounded-xl border border-[#10b981]/40 bg-[#10b981]/15 text-xs text-[#10b981] font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Premier code A2F confirmé avec succès !</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-[#ef4444]" />
                  <span>Seconde confirmation A2F obligatoire (2/2)</span>
                </label>
                <span className="text-[10px] text-neutral-400 font-mono">Double rempart</span>
              </div>
              <p className="text-xs text-neutral-300">
                Confirmez l&apos;opération irréversible en saisissant une seconde fois votre code A2F actuel :
              </p>

              <div className="relative pt-1">
                <input
                  ref={secondInputRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={secondCode}
                  onChange={(e) => setSecondCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  autoFocus
                  className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-2xl font-mono font-bold tracking-[0.4em] text-center text-[#ef4444] placeholder-neutral-700 focus:border-[#ef4444] focus:outline-none focus:ring-1 focus:ring-[#ef4444]"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-neutral-500 pt-1">
                  <KeyRound className="h-5 w-5" />
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-1.5 text-xs text-[#ef4444] font-medium pt-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs text-neutral-400 hover:text-white"
              >
                ← Code précédent
              </button>

              <button
                type="submit"
                disabled={isVerifying || secondCode.trim().length !== 6}
                className="flex items-center gap-2 rounded-xl bg-[#ef4444] hover:bg-[#dc2626] text-white px-5 py-2.5 text-xs font-bold transition-all shadow-md disabled:opacity-40"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>{isVerifying ? 'Confirmation...' : 'Confirmer et Exécuter (2/2)'}</span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 4: SUCCESS EXECUTION */}
        {step === 4 && (
          <div className="p-8 text-center space-y-3 bg-[#10b981]/15 border border-[#10b981]/40 rounded-2xl animate-in zoom-in-95">
            <CheckCircle2 className="h-12 w-12 text-[#10b981] mx-auto animate-bounce" />
            <h4 className="text-base font-bold text-white">Double validation A2F certifiée !</h4>
            <p className="text-xs text-neutral-300">
              {isReset
                ? 'Réinitialisation des paramètres effectuée.'
                : `Purge du cache de @${username} terminée.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
