/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  KeyRound,
  Lock,
  QrCode,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import {
  fetchTotpConfigFromServer,
  generateQrCodeDataUrl,
  getTotpLockoutStatus,
  getTotpSecret,
  getTotpUri,
  isTotpEnrolled,
  rotateAndSyncTotpSecret,
  setAdminSession,
  setTotpEnrolled,
  syncTotpSecretToServer,
  verifyTotpCodeDetailed,
} from '../utils/security';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionTitle?: string;
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning') => void;
}

interface TwoFactorUnlockLoaderProps {
  step: number; // 1 | 2 | 3
  isUnlocked: boolean;
  message?: string;
  subtitle?: string;
}

const UNLOCK_STEPS = [
  { id: 1, label: 'Code Authenticator vérifié' },
  { id: 2, label: 'Activation des droits Admin' },
  { id: 3, label: 'Session sécurisée ouverte' },
];

export const TwoFactorUnlockLoader: React.FC<TwoFactorUnlockLoaderProps> = ({
  step,
  isUnlocked,
  message,
  subtitle,
}) => {
  const effectiveStep = isUnlocked ? 3 : Math.max(1, Math.min(3, step));
  const progress = isUnlocked ? 1 : effectiveStep === 1 ? 0.36 : effectiveStep === 2 ? 0.72 : 1;
  const circumference = 2 * Math.PI * 34; // ~213.628
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="rounded-2xl border border-neutral-800/90 bg-[#0b0f17] p-5 sm:p-6 shadow-inner space-y-5 animate-in fade-in duration-200">
      <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
        {/* Ambient precision glow */}
        <div
          className={`absolute inset-2 rounded-full blur-xl transition-colors duration-500 ${
            isUnlocked ? 'bg-emerald-500/20' : 'bg-[#facc15]/15'
          }`}
        />

        {/* Orbital SVG reticle */}
        <svg viewBox="0 0 88 88" className="h-24 w-24 relative z-10">
          <defs>
            <linearGradient id="a2fVaultGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>

          {/* Outer subtle rotating compass ring */}
          <g className={isUnlocked ? '' : 'origin-center animate-[spin_7s_linear_infinite]'}>
            <circle
              cx="44"
              cy="44"
              r="41"
              fill="none"
              stroke={isUnlocked ? 'rgba(16,185,129,0.28)' : 'rgba(250,204,21,0.22)'}
              strokeWidth="1"
              strokeDasharray="3 6"
            />
          </g>

          {/* Track ring */}
          <circle
            cx="44"
            cy="44"
            r="34"
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="3"
          />

          {/* Smooth progress arc */}
          <circle
            cx="44"
            cy="44"
            r="34"
            fill="none"
            stroke={isUnlocked ? '#10b981' : 'url(#a2fVaultGrad)'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 44 44)"
            style={{ transition: 'stroke-dashoffset 420ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>

        {/* Center crisp shield badge */}
        <div
          className={`absolute z-20 flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-300 ${
            isUnlocked
              ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-400 scale-105'
              : 'border-[#facc15]/40 bg-[#facc15]/10 text-[#facc15]'
          }`}
        >
          {isUnlocked ? (
            <CheckCircle2 className="h-6 w-6" />
          ) : (
            <ShieldCheck className="h-6 w-6" />
          )}
        </div>
      </div>

      {/* Concise Status Title */}
      <div className="text-center space-y-1">
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] ${
            isUnlocked ? 'text-emerald-400' : 'text-[#facc15]'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isUnlocked ? 'bg-emerald-400' : 'bg-[#facc15] animate-pulse'
            }`}
          />
          <span>{isUnlocked ? 'Accès Administrateur Actif' : 'Validation A2F'}</span>
        </span>
        <h4 className="text-sm font-bold text-white">
          {message || (isUnlocked ? 'Déverrouillage terminé' : 'Vérification sécurisée...')}
        </h4>
        {subtitle && <p className="text-[11px] text-neutral-400">{subtitle}</p>}
      </div>

      {/* 3-Step Clean Progression Checklist */}
      <div className="space-y-2 max-w-[260px] mx-auto pt-1">
        {UNLOCK_STEPS.map((item) => {
          const done = isUnlocked || effectiveStep > item.id;
          const active = !isUnlocked && effectiveStep === item.id;
          return (
            <div
              key={item.id}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-xs border transition-all duration-300 ${
                done
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                  : active
                  ? 'border-[#facc15]/30 bg-[#facc15]/10 text-white'
                  : 'border-white/[0.04] bg-white/[0.02] text-neutral-500'
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center shrink-0">
                {done ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : active ? (
                  <span className="h-2 w-2 rounded-full bg-[#facc15] animate-pulse" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
                )}
              </span>
              <span className="font-medium truncate">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

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

  // Live 30s TOTP countdown bar & anti-spam lockout countdown
  const [secondsLeft, setSecondsLeft] = useState<number>(() => 30 - (Math.floor(Date.now() / 1000) % 30));
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(() => getTotpLockoutStatus().remainingSeconds);

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
    setLockoutSeconds(getTotpLockoutStatus().remainingSeconds);

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

  // 1-second timer for live 30s TOTP period indicator & anti-spam lockout countdown
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setSecondsLeft(30 - (Math.floor(Date.now() / 1000) % 30));
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          return getTotpLockoutStatus().remainingSeconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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

    const lockStatus = getTotpLockoutStatus();
    if (lockStatus.locked) {
      setLockoutSeconds(lockStatus.remainingSeconds);
      setErrorMessage(`Blocage anti-spam actif : réessayez dans ${lockStatus.remainingSeconds}s.`);
      return;
    }

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
      const result = await verifyTotpCodeDetailed(input, secretKey);

      if (result.valid) {
        setLockoutSeconds(0);
        setTotpEnrolled(true);
        setIsEnrolled(true);
        setShowPairingQr(false);
        syncTotpSecretToServer(secretKey, true).catch(() => {});

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

      if (result.locked && result.remainingSeconds) {
        setLockoutSeconds(result.remainingSeconds);
      }
      setCode('');
      setErrorMessage(
        result.error ||
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
    if (lockoutSeconds > 0) return;
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
    const lockStatus = getTotpLockoutStatus();
    if (lockStatus.locked) {
      setLockoutSeconds(lockStatus.remainingSeconds);
      setQrRevealError(`Blocage anti-spam actif : réessayez dans ${lockStatus.remainingSeconds}s.`);
      return;
    }
    setQrRevealError('');
    const cleaned = qrVerifyCode.trim().replace(/\D/g, '');
    if (cleaned.length !== 6) {
      setQrRevealError('Entrez votre code A2F à 6 chiffres actuel.');
      return;
    }
    setIsAuthorizingQrReveal(true);

    try {
      const result = await verifyTotpCodeDetailed(cleaned, secretKey);
      if (result.valid) {
        setLockoutSeconds(0);
        setShowPairingQr(true);
        setShowQrVerifyInput(false);
        setQrVerifyCode('');
      } else {
        if (result.locked && result.remainingSeconds) {
          setLockoutSeconds(result.remainingSeconds);
        }
        setQrRevealError(result.error || 'Code A2F à 6 chiffres incorrect ou expiré.');
      }
    } catch {
      setQrRevealError('Erreur de vérification.');
    } finally {
      setIsAuthorizingQrReveal(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-3 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-3xl border border-neutral-800 bg-[#0c1019] p-4 sm:p-8 shadow-2xl space-y-4 sm:space-y-6"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Fermer"
          className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 z-20 flex h-9 w-9 items-center justify-center text-neutral-400 hover:text-white transition-colors rounded-xl hover:bg-neutral-800"
          title="Fermer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center sm:items-start gap-3 pr-8">
          <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl border border-[#facc15]/30 bg-[#facc15]/10 text-[#facc15]">
            <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-lg font-bold text-white flex items-center gap-2">
              <span className="sm:hidden">Vérification A2F</span>
              <span className="hidden sm:inline">Authentification 2FA Principale</span>
            </h3>
            <p className="hidden sm:block text-xs text-neutral-400 mt-1 leading-relaxed">
              Pour déverrouiller <strong className="text-[#facc15]">{actionTitle}</strong>, confirmez votre identité avec votre application Authenticator.
            </p>
          </div>
        </div>

        {/* STATE 1 & 2: Sleek Orbital 2FA Unlocking Sequence & Success State */}
        {(unlockingState || isUnlocked) ? (
          <TwoFactorUnlockLoader
            step={unlockingState?.step ?? 3}
            isUnlocked={isUnlocked}
            message={
              isUnlocked
                ? 'Session Administrateur Active'
                : unlockingState?.message
            }
            subtitle={
              isUnlocked
                ? 'Application des privilèges complets en cours...'
                : 'Authentification Authenticator en cours'
            }
          />
        ) : (
          /* STATE 3: Primary 2FA Code Input */
          <div className="space-y-3.5 sm:space-y-5">
            {showPairingQr ? (
              <div className="rounded-xl border border-[#facc15]/30 bg-neutral-950/90 p-3 sm:p-4 space-y-2.5 sm:space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between text-xs border-b border-neutral-800 pb-2">
                  <span className="font-bold text-[#facc15] flex items-center gap-1.5">
                    <QrCode className="h-4 w-4" />
                    <span className="sm:hidden">QR Authenticator</span>
                    <span className="hidden sm:inline">Jumelage Authenticator (A2F Principale)</span>
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

                <div className="flex items-center justify-center p-2 rounded-xl bg-white shadow-lg border border-neutral-700 max-w-[168px] sm:max-w-[200px] mx-auto">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR Code Microsoft Authenticator"
                      className="h-36 w-36 sm:h-44 sm:w-44 object-contain rounded"
                    />
                  ) : (
                    <div className="h-36 w-36 sm:h-44 sm:w-44 flex items-center justify-center text-neutral-400">
                      <QrCode className="h-10 w-10 animate-pulse text-[#facc15]" />
                    </div>
                  )}
                </div>

                <p className="hidden sm:block text-[11px] text-neutral-300 text-center leading-relaxed">
                  Scannez ce QR Code dans <strong>Microsoft Authenticator</strong> ou <strong>Google Authenticator</strong>, puis entrez le code à 6 chiffres ci-dessous pour activer.
                </p>

                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-[11px] font-mono">
                  <span className="text-neutral-400 truncate">
                    Clé : <strong className="text-[#facc15]">{secretKey}</strong>
                  </span>
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (navigator?.clipboard) {
                          navigator.clipboard.writeText(secretKey);
                          setCopiedSecret(true);
                          setTimeout(() => setCopiedSecret(false), 2000);
                        }
                      }}
                      className="text-neutral-300 hover:text-white px-1.5 py-0.5 rounded border border-neutral-800 bg-neutral-950"
                    >
                      {copiedSecret ? 'Copié !' : 'Copier'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const fresh = await rotateAndSyncTotpSecret();
                        setSecretKey(fresh);
                        setIsEnrolled(false);
                        setCode('');
                        setErrorMessage('');
                        onShowMessage('Nouvelle clé A2F générée ! Scannez le nouveau QR code.', 'info');
                      }}
                      className="text-[#facc15] hover:text-black hover:bg-[#facc15] px-2 py-0.5 rounded border border-[#facc15]/40 font-sans font-bold transition-colors"
                    >
                      Nouvelle
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2.5 sm:p-3.5 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Smartphone className="h-4 w-4 text-[#facc15] shrink-0" />
                  <div className="min-w-0">
                    <span className="font-bold text-white block truncate text-xs">
                      <span className="sm:hidden">Authenticator</span>
                      <span className="hidden sm:inline">RoadTo2000Elo (Romeo)</span>
                    </span>
                    <span className="hidden sm:inline text-[11px] text-neutral-400 font-mono">
                      Renouvellement dans {secondsLeft}s
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQrVerifyInput((v) => !v)}
                  className="text-[11px] font-medium text-neutral-400 hover:text-[#facc15] underline underline-offset-2 shrink-0"
                >
                  {showQrVerifyInput ? 'Fermer' : 'QR Code'}
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
                    disabled={lockoutSeconds > 0}
                    value={qrVerifyCode}
                    onChange={(e) => setQrVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Code A2F (6 chiffres)"
                    className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-[#facc15] font-mono tracking-widest placeholder-neutral-500 focus:border-[#facc15] focus:outline-none disabled:opacity-45"
                  />
                  <button
                    type="submit"
                    disabled={isAuthorizingQrReveal || lockoutSeconds > 0 || qrVerifyCode.length !== 6}
                    className="rounded-lg bg-[#facc15] hover:bg-[#eab308] text-black px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-40"
                  >
                    {isAuthorizingQrReveal ? '...' : 'Révéler'}
                  </button>
                </div>
                {qrRevealError && <p className="text-[10px] text-[#ef4444] font-medium">{qrRevealError}</p>}
              </form>
            )}

            {/* 6-DIGIT CODE INPUT FORM */}
            <form onSubmit={(e) => handleVerify(e)} className="space-y-3 sm:space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-200">
                    <span className="sm:hidden">Code 6 chiffres</span>
                    <span className="hidden sm:inline">Code à 6 chiffres Authenticator</span>
                  </label>
                  <span className="text-[10px] font-mono text-neutral-400">{secondsLeft}s</span>
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
                    disabled={lockoutSeconds > 0}
                    value={code}
                    onChange={handleCodeChange}
                    placeholder="••••••"
                    autoFocus
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 sm:py-3.5 text-xl sm:text-2xl font-mono font-bold tracking-[0.4em] text-center text-[#facc15] placeholder-neutral-700 focus:border-[#facc15] focus:outline-none focus:ring-1 focus:ring-[#facc15] transition-all shadow-inner disabled:opacity-45"
                  />
                  <div className="hidden sm:flex absolute inset-y-0 right-0 items-center pr-3.5 pointer-events-none text-neutral-500 pt-1">
                    <KeyRound className="h-5 w-5" />
                  </div>
                </div>

                {lockoutSeconds > 0 && (
                  <div className="flex items-center gap-2 rounded-xl border border-[#ef4444]/35 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#ef4444] font-semibold">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>Blocage anti-spam actif : réessayez dans {lockoutSeconds}s.</span>
                  </div>
                )}

                {errorMessage && lockoutSeconds === 0 && (
                  <div className="flex items-start gap-1.5 text-[11px] sm:text-xs text-[#ef4444] font-medium pt-1 leading-snug">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end sm:justify-between gap-3 pt-1">
                <span className="hidden sm:inline text-[10px] text-neutral-400 italic">
                  Validation automatique dès 6 chiffres
                </span>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifying || lockoutSeconds > 0 || code.trim().length !== 6}
                    className="flex items-center justify-center gap-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black px-4 py-2 text-xs font-bold transition-all shadow-[0_0_15px_rgba(250,204,21,0.25)] disabled:opacity-40"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span>
                      {lockoutSeconds > 0 ? `Bloqué (${lockoutSeconds}s)` : isVerifying ? '...' : 'Valider'}
                    </span>
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
