/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useId, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import {
  generateQrCodeDataUrl,
  generateSessionValidationCode,
  getMobileAuthUrl,
  setAdminSession,
  verifyAdminPassword,
} from '../utils/security';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionTitle?: string;
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning') => void;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  actionTitle = 'Accès aux fonctions sensibles',
  onShowMessage,
}) => {
  const [sessionId] = useState<string>(() => `auth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [mobileUrl, setMobileUrl] = useState<string>('');
  const [codeOrPassword, setCodeOrPassword] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  const expectedMobileCode = generateSessionValidationCode(sessionId);

  // Generate QR code on open
  useEffect(() => {
    if (!isOpen) return;

    const url = getMobileAuthUrl(sessionId);
    setMobileUrl(url);

    generateQrCodeDataUrl(url).then((dataUrl) => {
      setQrDataUrl(dataUrl);
    });
  }, [isOpen, sessionId]);

  // Listen for background unlock events from the mobile device via BroadcastChannel and storage
  useEffect(() => {
    if (!isOpen) return;

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('roadto2000_auth_channel');
        bc.onmessage = (event) => {
          if (event.data?.type === 'MOBILE_UNLOCKED' && event.data?.sessionId === sessionId) {
            handleUnlockSuccess();
          }
        };
      }
    } catch {}

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === `roadto2000_unlocked_${sessionId}` && e.newValue === 'true') {
        handleUnlockSuccess();
      }
    };

    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      if (bc) bc.close();
    };
  }, [isOpen, sessionId]);

  const handleUnlockSuccess = () => {
    setIsUnlocked(true);
    setAdminSession();
    onShowMessage('Authentification réussie ! Session administrateur active.', 'success');
    setTimeout(() => {
      onSuccess();
      onClose();
    }, 1200);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const input = codeOrPassword.trim();

    if (!input) {
      setErrorMessage('Veuillez entrer le code affiché sur votre téléphone ou le mot de passe.');
      return;
    }

    setIsVerifying(true);

    try {
      // 1. Check if it matches the 6-digit session code generated on the phone
      if (input === expectedMobileCode) {
        handleUnlockSuccess();
        return;
      }

      // 2. Check if it matches the master password
      const isPasswordValid = await verifyAdminPassword(input);
      if (isPasswordValid) {
        handleUnlockSuccess();
        return;
      }

      setErrorMessage('Code mobile ou mot de passe invalide. Veuillez réessayer.');
    } catch {
      setErrorMessage('Une erreur est survenue lors de la vérification.');
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-neutral-800"
          title="Fermer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3.5 pr-8">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>Authentification 2FA Requise</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              Pour déverrouiller <strong className="text-amber-300">{actionTitle}</strong>, confirmez votre identité avec votre téléphone.
            </p>
          </div>
        </div>

        {isUnlocked ? (
          <div className="p-8 text-center space-y-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl animate-in zoom-in-95">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
            <h4 className="text-sm font-bold text-emerald-300">Accès Administrateur Déverrouillé !</h4>
            <p className="text-xs text-neutral-400">Application des droits d'administration en cours...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Step 1: QR Code & Mobile Instructions */}
            <div className="flex flex-col sm:flex-row items-center gap-6 rounded-xl border border-neutral-800/80 bg-neutral-950/80 p-4 sm:p-5">
              <div className="relative shrink-0 flex items-center justify-center rounded-xl bg-white p-2.5 shadow-lg border border-neutral-700">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Code de connexion mobile 2FA"
                    className="h-36 w-36 sm:h-40 sm:w-40 object-contain rounded"
                  />
                ) : (
                  <div className="h-36 w-36 sm:h-40 sm:w-40 flex items-center justify-center text-neutral-400">
                    <QrCode className="h-10 w-10 animate-pulse text-amber-500" />
                  </div>
                )}
              </div>

              <div className="space-y-2.5 text-xs text-neutral-300">
                <div className="flex items-center gap-2 text-amber-400 font-semibold uppercase tracking-wider text-[11px]">
                  <Smartphone className="h-4 w-4" />
                  <span>Double Authentification Mobile</span>
                </div>
                <ol className="space-y-2 text-neutral-300/90 list-decimal list-inside leading-relaxed text-[11px]">
                  <li>
                    Ouvrez l'<strong>appareil photo</strong> de votre téléphone et scannez ce QR Code.
                  </li>
                  <li>
                    Une page sécurisée s'ouvre sur votre téléphone : <strong>saisissez votre mot de passe sur votre téléphone</strong>.
                  </li>
                  <li>
                    Validez : cet écran se déverrouille instantanément !
                  </li>
                </ol>

                <div className="pt-1 flex items-center gap-2 text-[10px] text-amber-400/90 font-mono">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                  <span>En attente de confirmation mobile...</span>
                </div>
              </div>
            </div>

            {/* Step 2: Code or Password input */}
            <form onSubmit={handleVerify} className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-neutral-300">
                    Code de validation mobile (6 chiffres) ou mot de passe maître
                  </label>
                  <span className="text-[10px] text-neutral-500">Par défaut : 2000elo</span>
                </div>

                <div className="relative">
                  <input
                    type="password"
                    value={codeOrPassword}
                    onChange={(e) => setCodeOrPassword(e.target.value)}
                    placeholder="Entrez le code mobile ou '2000elo'"
                    autoFocus
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-white placeholder-neutral-600 focus:border-amber-500 focus:outline-none font-mono"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-neutral-500">
                    <KeyRound className="h-4 w-4" />
                  </div>
                </div>

                {errorMessage && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium pt-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 px-5 py-2 text-xs font-bold transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] disabled:opacity-50"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>{isVerifying ? 'Vérification...' : 'Déverrouiller la session'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
