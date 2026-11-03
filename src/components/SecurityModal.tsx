/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Unlock,
  X,
} from 'lucide-react';
import {
  generateNewTotpSecret,
  generateQrCodeDataUrl,
  getTotpSecret,
  getTotpUri,
  isTotpEnrolled,
  setAdminSession,
  setTotpEnrolled,
  verifyAdminPassword,
  verifyTotpCode,
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
  const [code, setCode] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  // Enrollment / Pairing State
  const [isEnrolled, setIsEnrolled] = useState<boolean>(() => isTotpEnrolled());
  const [showPairingQr, setShowPairingQr] = useState<boolean>(() => !isTotpEnrolled());
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [secretKey, setSecretKey] = useState<string>(() => getTotpSecret());
  const [copiedSecret, setCopiedSecret] = useState<boolean>(false);

  // Admin password unlock for revealing QR code (anti-tamper)
  const [adminUnlockPassword, setAdminUnlockPassword] = useState<string>('');
  const [isAuthorizingQrReveal, setIsAuthorizingQrReveal] = useState<boolean>(false);
  const [showAdminPasswordInput, setShowAdminPasswordInput] = useState<boolean>(false);
  const [qrRevealError, setQrRevealError] = useState<string>('');

  // Live visual unlock animation
  const [unlockingState, setUnlockingState] = useState<{
    step: number;
    message: string;
  } | null>(null);

  const unlockedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate QR code for pairing when needed
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    unlockedRef.current = false;

    async function loadQr() {
      const uri = getTotpUri('Romeo', 'RoadTo2000Elo', secretKey);
      const url = await generateQrCodeDataUrl(uri);
      if (isMounted) setQrDataUrl(url);
    }

    loadQr();

    // Auto-focus code input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 150);

    return () => {
      isMounted = false;
    };
  }, [isOpen, secretKey]);

  // Complete unlock callback
  const completeUnlock = React.useCallback(() => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    setIsUnlocked(true);
    setAdminSession();
    onShowMessage('Authentification Microsoft Authenticator réussie ! Session active.', 'success');
    setTimeout(() => {
      onSuccess();
      onClose();
    }, 1100);
  }, [onSuccess, onClose, onShowMessage]);

  // Verify the 6-digit TOTP code
  const handleVerify = async (e?: React.FormEvent, directCode?: string) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    const input = (directCode !== undefined ? directCode : code).trim().replace(/\D/g, '');

    if (!input) {
      setErrorMessage('Veuillez saisir le code à 6 chiffres affiché sur votre application Authenticator.');
      return;
    }

    if (input.length !== 6) {
      setErrorMessage('Le code doit comporter exactement 6 chiffres.');
      return;
    }

    setIsVerifying(true);

    try {
      const isValid = await verifyTotpCode(input, secretKey);

      if (isValid) {
        // Confirm enrollment so QR code is permanently masked on future visits
        setTotpEnrolled(true);
        setIsEnrolled(true);
        setShowPairingQr(false);

        // Visual unlock progress sequence
        setUnlockingState({
          step: 1,
          message: 'Code Microsoft Authenticator validé !',
        });

        setTimeout(() => {
          setUnlockingState({
            step: 2,
            message: 'Attribution des privilèges administrateur...',
          });
        }, 450);

        setTimeout(() => {
          setUnlockingState({
            step: 3,
            message: 'Ouverture de votre session...',
          });
        }, 850);

        setTimeout(() => {
          completeUnlock();
        }, 1300);
        return;
      }

      setErrorMessage('Code incorrect ou expiré. Entrez les 6 chiffres affichés en ce moment dans votre application Authenticator.');
    } catch {
      setErrorMessage('Une erreur est survenue lors de la vérification.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
    setErrorMessage('');
    // Auto-verify as soon as 6 digits are typed!
    if (cleaned.length === 6) {
      handleVerify(undefined, cleaned);
    }
  };

  // Authorize QR code reveal with master password (Alpha604)
  const handleAuthorizeQrReveal = async (e: React.FormEvent) => {
    e.preventDefault();
    setQrRevealError('');
    setIsAuthorizingQrReveal(true);

    try {
      const isValid = await verifyAdminPassword(adminUnlockPassword);
      if (isValid) {
        setShowPairingQr(true);
        setShowAdminPasswordInput(false);
        setAdminUnlockPassword('');
      } else {
        setQrRevealError('Mot de passe administrateur incorrect.');
      }
    } catch {
      setQrRevealError('Erreur de vérification.');
    } finally {
      setIsAuthorizingQrReveal(false);
    }
  };

  // Regenerate a brand new unique private secret (invalidates any old phone)
  const handleRegenerateSecret = async () => {
    if (window.confirm('Voulez-vous générer une NOUVELLE clé secrète ? Vos anciens codes Authenticator cesseront immédiatement de fonctionner et vous devrez rescanner le QR code avec votre téléphone.')) {
      const newSec = generateNewTotpSecret();
      setSecretKey(newSec);
      setIsEnrolled(false);
      setShowPairingQr(true);
      setCode('');
      onShowMessage('Nouvelle clé secrète générée. Scannez le nouveau QR code avec votre téléphone.', 'info');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 sm:p-8 shadow-2xl space-y-6">
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
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>Authentification 2FA Exclusive</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              Pour déverrouiller <strong className="text-amber-300">{actionTitle}</strong>, confirmez votre identité avec votre application Authenticator.
            </p>
          </div>
        </div>

        {/* STATE 1: Live Unlocking Sequence Animation */}
        {unlockingState && !isUnlocked ? (
          <div className="p-6 text-center space-y-4 bg-gradient-to-b from-amber-500/15 via-emerald-950/40 to-emerald-900/40 border border-emerald-500/40 rounded-2xl shadow-xl animate-in zoom-in-95 duration-200">
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/25 animate-ping" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/25 border border-emerald-500/60 text-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.4)]">
                <Unlock className="h-7 w-7 animate-pulse text-emerald-400" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold uppercase tracking-wider border border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                <span>Code Microsoft / Google Authenticator Confirmé</span>
              </div>
              <h4 className="text-sm font-bold text-white pt-1">
                {unlockingState.message}
              </h4>
            </div>

            <div className="h-2 w-full bg-neutral-950 rounded-full overflow-hidden border border-neutral-800 max-w-xs mx-auto">
              <div
                className="h-full bg-gradient-to-r from-amber-500 via-emerald-400 to-emerald-300 transition-all duration-500 ease-out"
                style={{ width: `${(unlockingState.step / 3) * 100}%` }}
              />
            </div>
          </div>
        ) : isUnlocked ? (
          /* STATE 2: Unlocked Success State */
          <div className="p-8 text-center space-y-3 bg-emerald-950/30 border border-emerald-600/50 rounded-2xl animate-in zoom-in-95">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
            <h4 className="text-base font-bold text-emerald-300">Session Administrateur Active !</h4>
            <p className="text-xs text-neutral-400">Application des droits d'administration en cours...</p>
          </div>
        ) : (
          /* STATE 3: Primary 2FA Code Input (With Protected QR Code Pairing) */
          <div className="space-y-5">
            {/* PAIRING QR CODE SECTION (Only shown during setup or when explicitly unlocked by the owner) */}
            {showPairingQr ? (
              <div className="rounded-xl border border-amber-500/30 bg-neutral-950/90 p-4 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between text-xs border-b border-neutral-800 pb-2">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <QrCode className="h-4 w-4" />
                    <span>Jumelage Initial (À scanner une seule fois)</span>
                  </span>
                  {isEnrolled && (
                    <button
                      type="button"
                      onClick={() => setShowPairingQr(false)}
                      className="text-[11px] text-neutral-400 hover:text-white"
                    >
                      Masquer le QR Code
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-center p-2 rounded-xl bg-white shadow-lg border border-neutral-700 max-w-[200px] mx-auto">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR Code Microsoft Authenticator"
                      className="h-44 w-44 object-contain rounded"
                    />
                  ) : (
                    <div className="h-44 w-44 flex items-center justify-center text-neutral-400">
                      <QrCode className="h-10 w-10 animate-pulse text-amber-500" />
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-neutral-300 text-center leading-relaxed">
                  Scannez ce QR Code dans <strong>Microsoft Authenticator</strong> ou <strong>Google Authenticator</strong>.
                  <br />
                  <span className="text-amber-300 text-[10px]">
                    Une fois jumelé, le QR Code sera masqué pour garantir que vous seul possédez les codes sur votre téléphone.
                  </span>
                </p>

                {/* Secret Key in text for manual entry */}
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-[11px] font-mono">
                  <span className="text-neutral-400 truncate">Clé : <strong className="text-amber-300">{secretKey}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      if (navigator?.clipboard) {
                        navigator.clipboard.writeText(secretKey);
                        setCopiedSecret(true);
                        setTimeout(() => setCopiedSecret(false), 2000);
                      }
                    }}
                    className="text-neutral-300 hover:text-white shrink-0 p-1 rounded"
                    title="Copier la clé secrète"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ) : (
              /* MASKED PAIRING STATE: Informative Privacy Banner */
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-xs">
                <div className="flex items-center gap-2 text-emerald-300">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="font-semibold text-[11px]">Votre téléphone est jumelé et sécurisé</span>
                </div>
                <span className="text-[10px] text-neutral-400 font-mono">QR Code masqué</span>
              </div>
            )}

            {/* 6-DIGIT CODE INPUT FORM */}
            <form onSubmit={(e) => handleVerify(e)} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-200">
                    Code à 6 chiffres Microsoft / Google Authenticator
                  </label>
                  <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
                    <Smartphone className="h-3 w-3" />
                    <span>Sur votre smartphone</span>
                  </span>
                </div>

                <div className="relative pt-1">
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={handleCodeChange}
                    placeholder="••••••"
                    autoFocus
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3.5 text-2xl font-mono font-bold tracking-[0.4em] text-center text-amber-300 placeholder-neutral-700 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all shadow-inner"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-neutral-500 pt-1">
                    <KeyRound className="h-5 w-5" />
                  </div>
                </div>

                {errorMessage && (
                  <div className="flex items-start gap-1.5 text-xs text-rose-400 font-medium pt-1 leading-snug">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[10px] text-neutral-500 italic">
                  Validation instantanée dès les 6 chiffres saisis
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifying || code.trim().length !== 6}
                    className="flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 px-4 py-2 text-xs font-bold transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] disabled:opacity-40"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span>{isVerifying ? 'Vérification...' : 'Valider'}</span>
                  </button>
                </div>
              </div>
            </form>

            {/* RE-PAIRING / PRIVACY OPTIONS (Protected to ensure ONLY the owner can re-pair) */}
            {!showPairingQr && (
              <div className="pt-2 border-t border-neutral-800 text-center space-y-2">
                {!showAdminPasswordInput ? (
                  <button
                    type="button"
                    onClick={() => setShowAdminPasswordInput(true)}
                    className="text-[11px] text-neutral-400 hover:text-amber-300 underline transition-colors"
                  >
                    Changer de smartphone / Afficher le QR Code de jumelage
                  </button>
                ) : (
                  <form onSubmit={handleAuthorizeQrReveal} className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2.5 text-left animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-neutral-300">
                        Entrez votre mot de passe pour révéler le QR Code
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAdminPasswordInput(false)}
                        className="text-[10px] text-neutral-500 hover:text-neutral-300"
                      >
                        Fermer
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={adminUnlockPassword}
                        onChange={(e) => setAdminUnlockPassword(e.target.value)}
                        placeholder="Mot de passe"
                        className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-amber-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={isAuthorizingQrReveal || !adminUnlockPassword}
                        className="rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-40"
                      >
                        {isAuthorizingQrReveal ? '...' : 'Révéler'}
                      </button>
                    </div>

                    {qrRevealError && (
                      <p className="text-[10px] text-rose-400 font-medium">{qrRevealError}</p>
                    )}

                    <div className="pt-1 flex items-center justify-between text-[10px]">
                      <span className="text-neutral-500">Sécurité anti-espionnage</span>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
