/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  QrCode,
  ShieldCheck,
  Smartphone,
  Unlock,
  X,
} from 'lucide-react';
import {
  fetchTotpConfigFromServer,
  generateQrCodeDataUrl,
  getTotpSecret,
  getTotpUri,
  isTotpEnrolled,
  setAdminSession,
  setTotpEnrolled,
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

  // 2FA verification for revealing QR code (no password needed)
  const [qrVerifyCode, setQrVerifyCode] = useState<string>('');
  const [isAuthorizingQrReveal, setIsAuthorizingQrReveal] = useState<boolean>(false);
  const [showQrVerifyInput, setShowQrVerifyInput] = useState<boolean>(false);
  const [qrRevealError, setQrRevealError] = useState<string>('');

  // Live 30s TOTP countdown bar
  const [secondsLeft, setSecondsLeft] = useState<number>(() => 30 - (Math.floor(Date.now() / 1000) % 30));

  // Live visual unlock animation
  const [unlockingState, setUnlockingState] = useState<{
    step: number;
    message: string;
  } | null>(null);

  const unlockedRef = useRef(false);
  const verifyingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset modal state on open and reconcile TOTP secret from server
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    unlockedRef.current = false;
    verifyingRef.current = false;
    setCode('');
    setErrorMessage('');
    setIsUnlocked(false);
    setUnlockingState(null);
    setIsVerifying(false);
    setQrVerifyCode('');
    setQrRevealError('');
    setShowQrVerifyInput(false);

    const localSec = getTotpSecret();
    const enrolled = isTotpEnrolled();
    setSecretKey(localSec);
    setIsEnrolled(enrolled);
    setShowPairingQr(!enrolled);

    fetchTotpConfigFromServer().then((serverCfg) => {
      if (isMounted && serverCfg) {
        setSecretKey(serverCfg.secret);
        setIsEnrolled(serverCfg.enrolled);
        setShowPairingQr(!serverCfg.enrolled);
      }
    });

    setTimeout(() => {
      inputRef.current?.focus();
    }, 150);

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Generate QR code when secretKey changes or modal opens
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    async function loadQr() {
      const uri = getTotpUri('Romeo', 'RoadTo2000Elo', secretKey);
      const url = await generateQrCodeDataUrl(uri);
      if (isMounted) setQrDataUrl(url);
    }

    loadQr();
    return () => {
      isMounted = false;
    };
  }, [isOpen, secretKey]);

  // 1-second timer for live 30s TOTP period indicator
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setSecondsLeft(30 - (Math.floor(Date.now() / 1000) % 30));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

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
    }, 800);
  }, [onSuccess, onClose, onShowMessage]);

  // Verify the 6-digit TOTP code
  const handleVerify = async (e?: React.FormEvent, directCode?: string) => {
    if (e) e.preventDefault();
    if (verifyingRef.current || unlockedRef.current || unlockingState) return;

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

    verifyingRef.current = true;
    setIsVerifying(true);

    try {
      const isValid = await verifyTotpCode(input, secretKey);

      if (isValid) {
        setTotpEnrolled(true);
        setIsEnrolled(true);
        setShowPairingQr(false);

        setUnlockingState({
          step: 1,
          message: 'Code Authenticator validé !',
        });

        setTimeout(() => {
          setUnlockingState({
            step: 2,
            message: 'Attribution des privilèges administrateur...',
          });
        }, 350);

        setTimeout(() => {
          setUnlockingState({
            step: 3,
            message: 'Ouverture de votre session...',
          });
        }, 700);

        setTimeout(() => {
          completeUnlock();
        }, 1050);
        return;
      }

      setErrorMessage(
        'Code incorrect ou expiré. Vérifiez que vous lisez bien « RoadTo2000Elo (Romeo) » dans Authenticator.'
      );
    } catch {
      setErrorMessage('Une erreur est survenue lors de la vérification.');
    } finally {
      verifyingRef.current = false;
      setIsVerifying(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
    setErrorMessage('');
    if (cleaned.length === 6) {
      handleVerify(undefined, cleaned);
    }
  };

  // Authorize QR code reveal with current 6-digit A2F code (no password)
  const handleAuthorizeQrReveal = async (e: React.FormEvent) => {
    e.preventDefault();
    setQrRevealError('');
    const cleaned = qrVerifyCode.trim().replace(/\D/g, '');
    if (cleaned.length !== 6) {
      setQrRevealError('Entrez votre code A2F à 6 chiffres actuel.');
      return;
    }
    setIsAuthorizingQrReveal(true);

    try {
      const isValid = await verifyTotpCode(cleaned, secretKey);
      if (isValid) {
        setShowPairingQr(true);
        setShowQrVerifyInput(false);
        setQrVerifyCode('');
      } else {
        setQrRevealError('Code A2F à 6 chiffres incorrect ou expiré.');
      }
    } catch {
      setQrRevealError('Erreur de vérification.');
    } finally {
      setIsAuthorizingQrReveal(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl border border-white/[0.12] bg-[#0c1019]/95 p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl space-y-6">
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
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#facc15]/30 bg-[#facc15]/10 text-[#facc15]">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>Authentification 2FA Principale</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              Pour déverrouiller <strong className="text-[#facc15]">{actionTitle}</strong>, confirmez votre identité avec votre application Authenticator.
            </p>
          </div>
        </div>

        {/* STATE 1: Live Unlocking Sequence Animation */}
        {unlockingState && !isUnlocked ? (
          <div className="p-6 text-center space-y-4 bg-gradient-to-b from-[#facc15]/15 via-emerald-950/40 to-emerald-900/40 border border-emerald-500/40 rounded-2xl shadow-xl animate-in zoom-in-95 duration-200">
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
              <h4 className="text-sm font-bold text-white pt-1">{unlockingState.message}</h4>
            </div>

            <div className="h-2 w-full bg-neutral-950 rounded-full overflow-hidden border border-neutral-800 max-w-xs mx-auto">
              <div
                className="h-full bg-gradient-to-r from-[#facc15] via-emerald-400 to-emerald-300 transition-all duration-300 ease-out"
                style={{ width: `${(unlockingState.step / 3) * 100}%` }}
              />
            </div>
          </div>
        ) : isUnlocked ? (
          /* STATE 2: Unlocked Success State */
          <div className="p-8 text-center space-y-3 bg-emerald-950/30 border border-emerald-600/50 rounded-2xl animate-in zoom-in-95">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
            <h4 className="text-base font-bold text-emerald-300">Session Administrateur Active !</h4>
            <p className="text-xs text-neutral-400">Application des droits d&apos;administration en cours...</p>
          </div>
        ) : (
          /* STATE 3: Primary 2FA Code Input */
          <div className="space-y-5">
            {showPairingQr ? (
              <div className="rounded-xl border border-[#facc15]/30 bg-neutral-950/90 p-4 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between text-xs border-b border-neutral-800 pb-2">
                  <span className="font-bold text-[#facc15] flex items-center gap-1.5">
                    <QrCode className="h-4 w-4" />
                    <span>Jumelage Authenticator (A2F Principale)</span>
                  </span>
                  {isEnrolled && (
                    <button
                      type="button"
                      onClick={() => setShowPairingQr(false)}
                      className="text-[11px] text-neutral-400 hover:text-white"
                    >
                      Masquer
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
                      <QrCode className="h-10 w-10 animate-pulse text-[#facc15]" />
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-neutral-300 text-center leading-relaxed">
                  Scannez ce QR Code dans <strong>Microsoft Authenticator</strong> ou <strong>Google Authenticator</strong>.
                </p>

                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-[11px] font-mono">
                  <span className="text-neutral-400 truncate">
                    Clé : <strong className="text-[#facc15]">{secretKey}</strong>
                  </span>
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
                  >
                    {copiedSecret ? 'Copié !' : 'Copier'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3.5 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Smartphone className="h-4 w-4 text-[#facc15] shrink-0" />
                  <div className="min-w-0">
                    <span className="font-bold text-white block truncate">RoadTo2000Elo (Romeo)</span>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      Renouvellement dans {secondsLeft}s
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQrVerifyInput((v) => !v)}
                  className="text-[11px] font-medium text-neutral-400 hover:text-[#facc15] underline underline-offset-2 shrink-0"
                >
                  {showQrVerifyInput ? 'Fermer QR' : 'Afficher le QR'}
                </button>
              </div>
            )}

            {/* SINGLE QR REVEAL PROMPT (when unlocked via current A2F code) */}
            {showQrVerifyInput && !showPairingQr && (
              <form
                onSubmit={handleAuthorizeQrReveal}
                className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5 space-y-2.5 animate-in fade-in"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-[#facc15]" />
                    <span>Entrez le code actuel pour révéler le QR</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowQrVerifyInput(false)}
                    className="text-[11px] text-neutral-400 hover:text-white"
                  >
                    Annuler
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={qrVerifyCode}
                    onChange={(e) => setQrVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Code A2F (6 chiffres)"
                    className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-[#facc15] font-mono tracking-widest placeholder-neutral-500 focus:border-[#facc15] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isAuthorizingQrReveal || qrVerifyCode.length !== 6}
                    className="rounded-lg bg-[#facc15] hover:bg-[#eab308] text-black px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-40"
                  >
                    {isAuthorizingQrReveal ? '...' : 'Révéler'}
                  </button>
                </div>
                {qrRevealError && <p className="text-[10px] text-[#ef4444] font-medium">{qrRevealError}</p>}
              </form>
            )}

            {/* 6-DIGIT CODE INPUT FORM */}
            <form onSubmit={(e) => handleVerify(e)} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-200">
                    Code à 6 chiffres Authenticator
                  </label>
                  <span className="text-[10px] font-mono text-neutral-400">{secondsLeft}s restantes</span>
                </div>

                {/* Live 30s indicator progress line */}
                <div className="h-1 w-full bg-neutral-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#facc15]/70 transition-all duration-1000 ease-linear"
                    style={{ width: `${(secondsLeft / 30) * 100}%` }}
                  />
                </div>

                <div className="relative pt-1">
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={handleCodeChange}
                    placeholder="••••••"
                    autoFocus
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3.5 text-2xl font-mono font-bold tracking-[0.4em] text-center text-[#facc15] placeholder-neutral-700 focus:border-[#facc15] focus:outline-none focus:ring-1 focus:ring-[#facc15] transition-all shadow-inner"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-neutral-500 pt-1">
                    <KeyRound className="h-5 w-5" />
                  </div>
                </div>

                {errorMessage && (
                  <div className="flex items-start gap-1.5 text-xs text-[#ef4444] font-medium pt-1 leading-snug">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[10px] text-neutral-400 italic">
                  Validation automatique dès 6 chiffres
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
                    className="flex items-center gap-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black px-4 py-2 text-xs font-bold transition-all shadow-[0_0_15px_rgba(250,204,21,0.25)] disabled:opacity-40"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span>{isVerifying ? 'Vérification...' : 'Valider'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
