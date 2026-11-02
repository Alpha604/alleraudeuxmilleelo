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
  Lock,
  ShieldCheck,
  Smartphone,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  generateSessionValidationCode,
  getClientIp,
  getTrustedIp,
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
  const [detectedIp, setDetectedIp] = useState<string>('');
  const [isTrustedIpMatch, setIsTrustedIpMatch] = useState<boolean>(false);
  const [isCheckingIp, setIsCheckingIp] = useState<boolean>(true);

  // Common unlock execution function
  const executeUnlock = (reason: 'password' | 'trusted_ip') => {
    const code = generateSessionValidationCode(sessionId);
    setGeneratedCode(code);
    setIsSuccess(true);
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

  // On mount: Check client IP and compare with Trusted IP configuration
  useEffect(() => {
    let isMounted = true;

    async function checkIpAndAutoAuth() {
      setIsCheckingIp(true);
      try {
        const params = new URLSearchParams(window.location.search);
        const urlTip = params.get('tip') || '';
        const storedTip = getTrustedIp();
        const configuredTip = (urlTip || storedTip).trim();

        const currentIp = await getClientIp();
        if (!isMounted) return;

        if (currentIp) {
          setDetectedIp(currentIp);

          // If current mobile IP exactly matches configured trusted IP: AUTO-UNLOCK!
          if (configuredTip && currentIp === configuredTip) {
            executeUnlock('trusted_ip');
            return;
          }
        }
      } catch (err) {
        console.warn('IP verification skipped:', err);
      } finally {
        if (isMounted) setIsCheckingIp(false);
      }
    }

    checkIpAndAutoAuth();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const input = password.trim();

    if (!input) {
      setErrorMessage('Veuillez entrer votre mot de passe administrateur.');
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
                    : 'Session Autorisée Avec Succès !'}
                </h2>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  {isTrustedIpMatch ? (
                    <>
                      Votre adresse IP (<strong className="text-amber-300 font-mono">{detectedIp}</strong>) correspond à l'IP de confiance. Déverrouillage automatique effectué sans saisie de mot de passe !
                    </>
                  ) : (
                    'Votre ordinateur a reçu la validation de sécurité et est déverrouillé.'
                  )}
                </p>
              </div>

              {/* 6-digit sync code */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-1.5">
                <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                  {isTrustedIpMatch && <Zap className="h-3.5 w-3.5 text-amber-300" />}
                  <span>Code d'activation unique</span>
                </div>
                <div className="text-3xl font-mono font-bold tracking-widest text-amber-300 py-1">
                  {generatedCode}
                </div>
                <p className="text-[10px] text-neutral-400">
                  Votre ordinateur s'est déverrouillé automatiquement. Si vous n'êtes pas sur le même réseau, saisissez ce code sur votre ordinateur.
                </p>
              </div>

              <button
                type="button"
                onClick={onFinishMobileAuth}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-neutral-950 py-3 text-xs font-bold transition-all shadow-lg"
              >
                <span>Accéder à l'application complète</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex items-center gap-3 border-b border-neutral-800 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Validation De Sécurité</h2>
                  <p className="text-[11px] text-neutral-400">Session ordinateur demandée</p>
                </div>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed">
                Veuillez saisir votre mot de passe administrateur sur ce téléphone pour déverrouiller l'accès aux paramètres, à la synchronisation et aux tests sur votre écran principal.
              </p>

              {/* IP Status pill */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px]">
                <span className="flex items-center gap-1.5 text-neutral-400">
                  <Globe className="h-3.5 w-3.5 text-neutral-500" />
                  <span>Adresse IP de ce téléphone :</span>
                </span>
                <span className="font-mono text-neutral-200">
                  {isCheckingIp ? 'Détection en cours...' : detectedIp || 'Non détectée'}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-medium text-neutral-300">Mot de passe Administrateur</label>
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Entrez votre mot de passe"
                    autoFocus
                    required
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-neutral-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {errorMessage && (
                  <div className="flex items-center gap-2 text-xs text-rose-400 pt-1">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isVerifying}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-neutral-950 py-3 text-xs font-bold transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] disabled:opacity-50"
              >
                <Lock className="h-4 w-4" />
                <span>{isVerifying ? 'Vérification...' : 'Autoriser mon ordinateur'}</span>
              </button>

              <div className="text-center pt-2">
                <span className="text-[11px] text-neutral-500">
                  Sécurisé par chiffrement local SHA-256 (insensible aux majuscules)
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
