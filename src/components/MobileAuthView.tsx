/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trophy,
  Unlock,
  Zap,
} from 'lucide-react';
import {
  formatIpPrefix,
  generateSessionValidationCode,
  getClientIp,
  getTrustedIps,
  isIpTrusted,
  setAdminSession,
  verifyAdminPassword,
} from '../utils/security';

interface MobileAuthViewProps {
  sessionId: string;
  onFinishMobileAuth: () => void;
}

export const MobileAuthView: React.FC<MobileAuthViewProps> = ({
  sessionId,
  onFinishMobileAuth,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [showActivationCode, setShowActivationCode] = useState(true);
  const [detectedIp, setDetectedIp] = useState<string>('');
  const [isTrustedIpMatch, setIsTrustedIpMatch] = useState<boolean>(false);
  const [isCheckingIp, setIsCheckingIp] = useState<boolean>(true);
  const [hasSentUnlock, setHasSentUnlock] = useState<boolean>(false);

  // Common unlock execution function
  const executeUnlock = (reason: 'password' | 'trusted_ip') => {
    const code = generateSessionValidationCode(sessionId);
    setGeneratedCode(code);
    setIsSuccess(true);
    setHasSentUnlock(true);
    if (reason === 'trusted_ip') {
      setIsTrustedIpMatch(true);
    }

    // 1. Activate admin session on this device
    setAdminSession();

    // 2. Transmit unlock to desktop via localStorage and BroadcastChannel
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(`roadto2000_unlocked_${sessionId}`, 'true');
      }
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('roadto2000_auth_channel');
        bc.postMessage({ type: 'MOBILE_UNLOCKED', sessionId, reason, timestamp: Date.now() });
        bc.close();
      }
    } catch (e) {
      console.warn('Sync broadcast warning:', e);
    }
  };

  // Re-broadcast remote unlock signal
  const handleResendUnlock = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(`roadto2000_unlocked_${sessionId}`, 'true');
      }
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('roadto2000_auth_channel');
        bc.postMessage({ type: 'MOBILE_UNLOCKED', sessionId, reason: 'resend', timestamp: Date.now() });
        bc.close();
      }
    } catch {}
  };

  // On mount: broadcast scan start to PC with masked IP, and check if IP is in trusted list
  useEffect(() => {
    let isMounted = true;

    async function checkIpAndBroadcastScan() {
      setIsCheckingIp(true);
      try {
        const params = new URLSearchParams(window.location.search);
        const urlTips = params.get('tips')?.split(',') || (params.get('tip') ? [params.get('tip')!] : []);
        const storedTips = getTrustedIps();
        const combinedPool = Array.from(new Set([...urlTips, ...storedTips])).filter(Boolean);

        const currentIp = await getClientIp();
        if (!isMounted) return;

        const effectiveIp = currentIp || 'Mobile';
        setDetectedIp(currentIp);

        // Notify desktop in real-time that phone has scanned QR code with IP prefix
        const prefix = formatIpPrefix(effectiveIp);
        try {
          if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            const bc = new BroadcastChannel('roadto2000_auth_channel');
            bc.postMessage({
              type: 'MOBILE_SCAN_STARTED',
              sessionId,
              ipPrefix: prefix,
              fullIp: currentIp,
              timestamp: Date.now(),
            });
            bc.close();
          }
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(
              `roadto2000_scanning_${sessionId}`,
              JSON.stringify({ ipPrefix: prefix, timestamp: Date.now() })
            );
          }
        } catch {}

        // Check if IP is trusted
        if (currentIp && isIpTrusted(currentIp, combinedPool)) {
          setIsTrustedIpMatch(true);
        }
      } catch (err) {
        console.warn('Scan start broadcast error:', err);
      } finally {
        if (isMounted) setIsCheckingIp(false);
      }
    }

    checkIpAndBroadcastScan();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const input = password.trim();

    // If on trusted IP and no password typed, allow instant remote unlock!
    if (isTrustedIpMatch && !input) {
      executeUnlock('trusted_ip');
      return;
    }

    if (!input) {
      setErrorMessage('Veuillez entrer le mot de passe administrateur.');
      return;
    }

    setIsVerifying(true);

    try {
      // Case-insensitive verification (e.g. Alpha604 matches alpha604)
      const isValid = await verifyAdminPassword(input);
      if (isValid) {
        executeUnlock('password');
      } else {
        setErrorMessage('Mot de passe incorrect. Veuillez vérifier votre saisie.');
      }
    } catch {
      setErrorMessage('Une erreur est survenue lors de la validation.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md space-y-6">
        {/* Mobile Header Branding */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-amber-600/5 text-amber-400 shadow-xl shadow-amber-500/10">
            <Trophy className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wider uppercase text-neutral-100">
              ROAD TO 2000 <span className="text-amber-400">ELO</span>
            </h1>
            <p className="text-xs text-neutral-400">Portail d'Autorisation Mobile 2FA</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-sm space-y-6">
          {isSuccess ? (
            <div className="text-center space-y-5 animate-in zoom-in-95 duration-200">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <CheckCircle2 className="h-10 w-10" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-base font-bold text-emerald-300">
                  {isTrustedIpMatch
                    ? 'IP De Confiance Reconnue !'
                    : 'Déverrouillage À Distance Confirmé !'}
                </h2>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Le signal a été transmis en direct à votre ordinateur principal.
                </p>
              </div>

              {/* 6-digit sync code with Toggle Display Button */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                  <span className="flex items-center gap-1.5">
                    {isTrustedIpMatch && <Zap className="h-3.5 w-3.5 text-amber-300" />}
                    <span>Code d'activation mobile</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowActivationCode(!showActivationCode)}
                    className="text-[10px] text-amber-300 underline hover:text-white"
                  >
                    {showActivationCode ? 'Masquer le code' : 'Afficher le code'}
                  </button>
                </div>

                {showActivationCode ? (
                  <div className="text-3xl font-mono font-bold tracking-widest text-amber-300 py-1">
                    {generatedCode}
                  </div>
                ) : (
                  <div className="text-2xl font-mono font-bold tracking-widest text-amber-500/50 py-1">
                    ••••••
                  </div>
                )}

                <p className="text-[10px] text-neutral-400 leading-snug">
                  Votre ordinateur s'est déverrouillé automatiquement. Si vous êtes sur un réseau différent, saisissez ce code sur votre écran PC.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleResendUnlock}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 py-2.5 text-xs font-semibold transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Renvoyer le déverrouillage à distance</span>
                </button>

                <button
                  type="button"
                  onClick={onFinishMobileAuth}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-neutral-950 py-3 text-xs font-bold transition-all shadow-lg"
                >
                  <span>Accéder à l'application complète</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex items-center gap-3 border-b border-neutral-800 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Validation De Sécurité</h2>
                  <p className="text-[11px] text-neutral-400">Session ordinateur en attente</p>
                </div>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed">
                Entrez le mot de passe sur ce téléphone pour déverrouiller à distance la session sur votre ordinateur.
              </p>

              {/* IP Status pill */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-[11px] ${
                isTrustedIpMatch
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-300'
              }`}>
                <span className="flex items-center gap-1.5">
                  {isTrustedIpMatch ? (
                    <Zap className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Globe className="h-3.5 w-3.5 text-neutral-500" />
                  )}
                  <span>IP mobile :</span>
                </span>
                <span className="font-mono font-medium">
                  {isCheckingIp ? 'Détection...' : detectedIp || 'Non détectée'}
                  {isTrustedIpMatch && ' (IP de confiance ✓)'}
                </span>
              </div>

              {isTrustedIpMatch && (
                <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-xs text-emerald-300 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>IP de confiance reconnue</span>
                  </p>
                  <p className="text-[11px] text-neutral-300">
                    Vous pouvez cliquer directement sur <strong>Déverrouiller à distance</strong> sans avoir besoin de taper le mot de passe !
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-medium text-neutral-300">
                    {isTrustedIpMatch ? 'Mot de passe (Facultatif)' : 'Mot de passe Administrateur'}
                  </label>
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isTrustedIpMatch ? "Facultatif (IP reconnue)" : "Entrez votre mot de passe"}
                    autoFocus={!isTrustedIpMatch}
                    required={!isTrustedIpMatch}
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 focus:border-amber-500 focus:outline-none"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-neutral-500">
                    <KeyRound className="h-4 w-4" />
                  </div>
                </div>

                {errorMessage && (
                  <div className="flex items-center gap-2 text-xs text-rose-400 pt-1">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              {/* The two requested buttons: 1. Afficher le mdp | 2. Deverouiller à distance */}
              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-300 hover:text-white py-2.5 text-xs font-medium transition-colors"
                >
                  {showPassword ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5 text-neutral-400" />
                      <span>Masquer le mot de passe</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5 text-neutral-400" />
                      <span>Afficher le mot de passe</span>
                    </>
                  )}
                </button>

                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-neutral-950 py-3 text-xs font-bold transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] disabled:opacity-50"
                >
                  <Unlock className="h-4 w-4" />
                  <span>{isVerifying ? 'Déverrouillage...' : 'Déverrouiller à distance'}</span>
                </button>
              </div>

              <div className="text-center pt-1">
                <span className="text-[11px] text-neutral-500">
                  Sécurisé par chiffrement local SHA-256 (insensible à la casse)
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
