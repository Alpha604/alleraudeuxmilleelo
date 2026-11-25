/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Lock,
  LogOut,
  QrCode,
  Shield,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { signInWithGoogleFirebase, signOutFirebase } from '../firebase';
import {
  authenticateWithTotpOnly,
  fetchTotpConfigFromServer,
  generateQrCodeDataUrl,
  getTotpLockoutStatus,
  getTotpSecret,
  getTotpUri,
  isTotpEnrolled,
  rotateAndSyncTotpSecret,
  setTotpEnrolled,
  syncTotpSecretToServer,
} from '../utils/security';
import { normalizeSiteVersion } from '../utils/storage';
import { BrandLogo } from './BrandLogo';
import { TwoFactorUnlockLoader } from './SecurityModal';

interface LoginPageProps {
  isGoogleAuthorized: boolean;
  authError?: string | null;
  siteVersion?: string;
  onClearAuthError?: () => void;
  onLoginSuccess: (username: string, isAdmin: boolean, isSpectator?: boolean) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  isGoogleAuthorized,
  authError = null,
  siteVersion,
  onClearAuthError,
  onLoginSuccess,
}) => {
  const [totpCode, setTotpCode] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<boolean>(() => isTotpEnrolled());
  const [secretKey, setSecretKey] = useState<string>(() => getTotpSecret());
  const [qrUrl, setQrUrl] = useState<string>('');
  const [unlockStep, setUnlockStep] = useState<number | null>(null);
  const [isUnlockComplete, setIsUnlockComplete] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(() => getTotpLockoutStatus().remainingSeconds);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTotpConfigFromServer().then((cfg) => {
      if (cfg) {
        setSecretKey(cfg.secret);
        setEnrolled(cfg.enrolled);
      }
    });
  }, []);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => (prev <= 1 ? getTotpLockoutStatus().remainingSeconds : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  useEffect(() => {
    if (!isGoogleAuthorized) return;
    const t = setTimeout(() => codeInputRef.current?.focus(), 140);
    return () => clearTimeout(t);
  }, [isGoogleAuthorized]);

  useEffect(() => {
    if (enrolled) return;
    let active = true;
    generateQrCodeDataUrl(getTotpUri('Romeo', 'RoadTo2000Elo', secretKey)).then((url) => {
      if (active) setQrUrl(url);
    });
    return () => {
      active = false;
    };
  }, [enrolled, secretKey]);

  const handleGoogleLogin = async () => {
    setLocalError(null);
    onClearAuthError?.();
    setIsGoogleLoading(true);
    try {
      await signInWithGoogleFirebase();
    } catch (err: any) {
      const code = err?.code || '';
      const raw = err?.message || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setLocalError('Fenêtre de connexion Google fermée avant la validation.');
      } else if (code === 'auth/popup-blocked') {
        setLocalError('La fenêtre Google a été bloquée par le navigateur. Autorisez les pop-ups puis réessayez.');
      } else if (raw) {
        setLocalError(raw);
      } else {
        setLocalError("Impossible d'ouvrir la connexion Google.");
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSwitchGoogleAccount = async () => {
    setLocalError(null);
    onClearAuthError?.();
    setTotpCode('');
    await signOutFirebase().catch(() => {});
  };

  const handleContinueWithoutAdmin = () => {
    if (!isGoogleAuthorized) return;
    onLoginSuccess('alpharomeo1500', false, false);
  };

  const submitTotpCode = async (codeToVerify: string) => {
    if (!isGoogleAuthorized || isLoading || unlockStep !== null) return;
    const lockStatus = getTotpLockoutStatus();
    if (lockStatus.locked) {
      setLockoutSeconds(lockStatus.remainingSeconds);
      setLocalError(`Blocage anti-spam actif : réessayez dans ${lockStatus.remainingSeconds}s.`);
      return;
    }

    setLocalError(null);
    const cleaned = codeToVerify.replace(/\D/g, '').slice(0, 6);

    if (cleaned.length !== 6) {
      setLocalError('Veuillez saisir le code A2F à 6 chiffres de votre application Authenticator.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await authenticateWithTotpOnly('alpharomeo1500', cleaned);
      if (res.success) {
        setLockoutSeconds(0);
        setTotpEnrolled(true);
        setEnrolled(true);
        syncTotpSecretToServer(secretKey, true).catch(() => {});

        setUnlockStep(1);
        setTimeout(() => setUnlockStep(2), 320);
        setTimeout(() => setUnlockStep(3), 650);
        setTimeout(() => {
          setIsUnlockComplete(true);
        }, 900);
        setTimeout(() => {
          onLoginSuccess('alpharomeo1500', true, false);
        }, 1250);
      } else {
        if (res.locked && res.remainingSeconds) {
          setLockoutSeconds(res.remainingSeconds);
        }
        setTotpCode('');
        setLocalError(res.error || 'Code A2F invalide ou expiré.');
      }
    } catch {
      setLocalError('Une erreur est survenue lors de la vérification.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitTotpCode(totpCode);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (lockoutSeconds > 0) return;
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
    setTotpCode(cleaned);
    setLocalError(null);
    if (cleaned.length === 6) {
      submitTotpCode(cleaned);
    }
  };

  const displayError = localError || authError;
  const formattedVersion = normalizeSiteVersion(siteVersion);

  return (
    <div className="min-h-screen w-full bg-[#07090e] text-neutral-100 flex flex-col justify-between relative selection:bg-[#facc15]/30 selection:text-white font-sans overflow-x-hidden">
      {/* Ambient Background Lighting */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[900px] h-[500px] bg-gradient-to-b from-[#facc15]/[0.05] via-white/[0.02] to-transparent blur-3xl opacity-80" />
        <div className="absolute bottom-0 right-1/4 w-[650px] h-[450px] bg-[#10b981]/[0.03] blur-3xl rounded-full" />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-10 w-full border-b border-neutral-800/80 bg-[#07090e]">
        <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 h-16 sm:h-20 flex items-center justify-between gap-4">
          <BrandLogo size="md" showSubtitle subtitle="Espace Privé Chess.com · @alpharomeo1500" />

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#facc15]/10 border border-[#facc15]/30 text-[#facc15] text-xs font-bold shrink-0">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Accès Protégé Google + A2F</span>
            <span className="sm:hidden">Google + A2F</span>
          </div>
        </div>
      </header>

      {/* Main Centered Login Card */}
      <main className="relative z-10 w-full flex-1 flex items-center justify-center px-4 sm:px-8 py-8 sm:py-12">
        <div className="w-full max-w-xl rounded-3xl border border-neutral-800 bg-[#0c0f14] p-5 sm:p-8 shadow-2xl space-y-6">
          {/* Account Header (Zero Email Exposed) */}
          <div className="flex items-center justify-between gap-3 pb-5 border-b border-neutral-800/80">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-[#facc15] to-[#ca8a04] text-black flex items-center justify-center font-black text-base sm:text-lg shrink-0 shadow-[0_0_20px_rgba(250,204,21,0.3)]">
                AL
              </div>
              <div className="min-w-0">
                <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-400 block">
                  Espace Personnel Sécurisé
                </span>
                <h2 className="text-lg sm:text-xl font-black font-mono text-white truncate">
                  @alpharomeo1500
                </h2>
              </div>
            </div>

            {isGoogleAuthorized ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981] text-[11px] font-bold shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Google vérifié</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold shrink-0">
                <Lock className="h-3.5 w-3.5" />
                <span>Verrouillé</span>
              </span>
            )}
          </div>

          {!isGoogleAuthorized ? (
            /* STEP 1: Mandatory Authorized Google Sign-In */
            <div className="space-y-5">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/75 p-4 sm:p-5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#facc15]">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Étape 1 · Connexion Google Obligatoire</span>
                </div>
                <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                  L&apos;accès à ce tableau de bord est strictement privé. Authentifiez-vous avec le compte{' '}
                  <strong className="text-white">Google propriétaire autorisé</strong> pour continuer.
                </p>
              </div>

              {displayError && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-[#ef4444]/10 border border-[#ef4444]/35 text-[#ef4444] text-xs leading-relaxed">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{displayError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading}
                className="w-full flex items-center justify-center gap-3 py-3.5 sm:py-4 px-5 rounded-2xl bg-white hover:bg-neutral-100 active:scale-[0.99] text-neutral-900 text-sm font-extrabold transition-all shadow-[0_10px_30px_rgba(255,255,255,0.12)] disabled:opacity-60"
              >
                {isGoogleLoading ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-neutral-900 border-t-transparent animate-spin" />
                    <span>Vérification du compte Google...</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                      />
                    </svg>
                    <span>Se connecter avec Google</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-center text-neutral-500 leading-relaxed">
                Par sécurité, aucune adresse e-mail n&apos;est affichée publiquement sur cette page. L&apos;accès complet aux paramètres nécessite ensuite votre code A2F.
              </p>
            </div>
          ) : unlockStep !== null ? (
            /* STEP 2B: Refined 2FA Unlocking Animation */
            <TwoFactorUnlockLoader
              step={unlockStep}
              isUnlocked={isUnlockComplete}
              message={
                isUnlockComplete
                  ? 'Droits Administrateur activés'
                  : 'Ouverture complète de votre session...'
              }
              subtitle="Google vérifié · Double authentification validée"
            />
          ) : (
            /* STEP 2A: Google verified -> Require 2FA for full rights OR enter Read-only */
            <div className="space-y-5">
              {/* Verified Google banner with Switch option (never prints email) */}
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#10b981]/30 bg-[#10b981]/10 px-4 py-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle2 className="h-4 w-4 text-[#10b981] shrink-0" />
                  <div className="min-w-0">
                    <span className="font-bold text-white block truncate">
                      Compte Google autorisé
                    </span>
                    <span className="text-[11px] text-emerald-300/80 block truncate">
                      Étape 2 · Déverrouillez les droits complets avec l&apos;A2F
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSwitchGoogleAccount}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-white/10 bg-black/30 hover:bg-black/50 text-[11px] font-bold text-neutral-300 hover:text-white transition-colors shrink-0"
                >
                  <LogOut className="h-3 w-3" />
                  <span>Changer</span>
                </button>
              </div>

              {/* Optional 2FA Pairing QR if not yet enrolled */}
              {!enrolled && (
                <div className="rounded-2xl border border-[#facc15]/35 bg-neutral-950/90 p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#facc15] flex items-center gap-1.5">
                      <QrCode className="h-4 w-4" />
                      <span>Configurer la clé A2F</span>
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const fresh = await rotateAndSyncTotpSecret();
                        setSecretKey(fresh);
                        setLocalError(null);
                      }}
                      className="text-[11px] font-bold text-[#facc15] hover:underline"
                    >
                      Nouvelle clé
                    </button>
                  </div>
                  {qrUrl && (
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="p-2 rounded-xl bg-white border border-neutral-700 shrink-0">
                        <img src={qrUrl} alt="QR Code A2F" className="h-28 w-28 object-contain" />
                      </div>
                      <div className="space-y-1.5 text-xs text-neutral-300">
                        <p>
                          Scannez ce QR Code dans <strong>Microsoft</strong> ou <strong>Google Authenticator</strong> puis entrez le code à 6 chiffres ci-dessous.
                        </p>
                        <div className="font-mono text-[11px] text-[#facc15] bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-800 inline-block">
                          {secretKey}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Primary Form: Enter 2FA Code for Full Admin Rights */}
              <form onSubmit={handleTotpSubmit} className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs sm:text-sm font-bold text-neutral-200 flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-[#facc15]" />
                    <span>Code Authenticator (Tous les droits)</span>
                  </label>
                  <span className="text-[11px] text-[#facc15] flex items-center gap-1 font-mono">
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>Auto</span>
                  </span>
                </div>

                <input
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={6}
                  disabled={lockoutSeconds > 0}
                  value={totpCode}
                  onChange={handleCodeChange}
                  placeholder="••••••"
                  className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3.5 text-2xl sm:text-3xl text-[#facc15] placeholder-neutral-700 focus:border-[#facc15] focus:outline-none focus:ring-1 focus:ring-[#facc15] font-mono font-black tracking-[0.45em] text-center transition-all shadow-inner disabled:opacity-45"
                />

                {lockoutSeconds > 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/35 text-[#ef4444] text-xs font-semibold">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>Blocage anti-spam actif : réessayez dans {lockoutSeconds}s.</span>
                  </div>
                )}

                {displayError && lockoutSeconds === 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{displayError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || lockoutSeconds > 0 || totpCode.length !== 6}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-2xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs sm:text-sm font-black transition-all shadow-[0_0_20px_rgba(250,204,21,0.25)] active:scale-95 disabled:opacity-40"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>
                    {lockoutSeconds > 0
                      ? `Bloqué (${lockoutSeconds}s)`
                      : isLoading
                      ? 'Vérification...'
                      : 'Déverrouiller tous les droits (Admin A2F)'}
                  </span>
                </button>
              </form>

              {/* Divider */}
              <div className="relative flex items-center justify-center">
                <div className="border-t border-neutral-800 w-full" />
                <span className="bg-[#0c0f14] px-3 text-[10px] uppercase tracking-widest font-bold text-neutral-500 whitespace-nowrap">
                  Ou sans privilèges Admin
                </span>
                <div className="border-t border-neutral-800 w-full" />
              </div>

              {/* Secondary Entry: Google Auth Only (Read-Only / No Admin Rights) */}
              <button
                type="button"
                onClick={handleContinueWithoutAdmin}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-600 text-neutral-200 transition-all text-left group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Lock className="h-4 w-4 text-neutral-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      Accéder au tableau de bord sans droits Admin
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate">
                      Consultation &amp; synchro uniquement · A2F exigée pour modifier
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-neutral-400 group-hover:text-[#facc15] group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="relative z-10 w-full border-t border-neutral-800/80 bg-[#07090e]">
        <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-neutral-400">
          <span>Accès restreint @alpharomeo1500 · Authentification Google &amp; A2F</span>
          <span className="font-mono font-bold text-[#facc15]">Version v{formattedVersion}</span>
        </div>
      </footer>
    </div>
  );
};

