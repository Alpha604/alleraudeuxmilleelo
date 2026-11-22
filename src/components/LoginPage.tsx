/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Crown,
  KeyRound,
  Lock,
  QrCode,
  Shield,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import {
  authenticateWithTotpOnly,
  fetchTotpConfigFromServer,
  generateQrCodeDataUrl,
  getTotpSecret,
  getTotpUri,
  isTotpEnrolled,
  rotateAndSyncTotpSecret,
  setTotpEnrolled,
  syncTotpSecretToServer,
} from '../utils/security';

interface LoginPageProps {
  onLoginSuccess: (username: string, isAdmin: boolean, isSpectator?: boolean) => void;
  defaultUsername?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
}) => {
  const [totpCode, setTotpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<boolean>(() => isTotpEnrolled());
  const [secretKey, setSecretKey] = useState<string>(() => getTotpSecret());
  const [qrUrl, setQrUrl] = useState<string>('');
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => codeInputRef.current?.focus(), 120);
    fetchTotpConfigFromServer().then((cfg) => {
      if (cfg) {
        setSecretKey(cfg.secret);
        setEnrolled(cfg.enrolled);
      }
    });
  }, []);

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

  const handleDirectAccessWithoutPermissions = () => {
    onLoginSuccess('alpharomeo1500', false, false);
  };

  const submitTotpCode = async (codeToVerify: string) => {
    setErrorMessage(null);
    const cleaned = codeToVerify.replace(/\D/g, '').slice(0, 6);

    if (cleaned.length !== 6) {
      setErrorMessage('Veuillez saisir le code A2F à 6 chiffres de votre application Authenticator.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await authenticateWithTotpOnly('alpharomeo1500', cleaned);
      if (res.success) {
        setTotpEnrolled(true);
        setEnrolled(true);
        syncTotpSecretToServer(secretKey, true).catch(() => {});
        onLoginSuccess('alpharomeo1500', true, false);
      } else {
        setErrorMessage(res.error || 'Code A2F invalide ou expiré.');
      }
    } catch {
      setErrorMessage('Une erreur est survenue lors de la vérification.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitTotpCode(totpCode);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
    setTotpCode(cleaned);
    setErrorMessage(null);
    if (cleaned.length === 6) {
      submitTotpCode(cleaned);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#07090e] text-neutral-100 flex flex-col justify-between relative selection:bg-[#facc15]/30 selection:text-white font-sans overflow-x-hidden">
      {/* Ambient Background Lighting */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[900px] h-[500px] bg-gradient-to-b from-[#facc15]/[0.05] via-white/[0.02] to-transparent blur-3xl opacity-80" />
        <div className="absolute bottom-0 right-1/4 w-[650px] h-[450px] bg-[#10b981]/[0.03] blur-3xl rounded-full" />
      </div>

      {/* Top Full-Width Header Bar */}
      <header className="relative z-10 w-full border-b border-neutral-800/80 bg-[#07090e]/90 backdrop-blur-xl">
        <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 h-16 sm:h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#facc15] via-[#eab308] to-[#ca8a04] p-0.5 shadow-[0_0_25px_rgba(250,204,21,0.35)]">
              <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-[#07090e]">
                <Crown className="h-5 w-5 sm:h-6 sm:w-6 text-[#facc15]" />
              </div>
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-black tracking-tight text-white font-display leading-none">
                ROAD TO 2000 <span className="text-[#facc15]">ELO</span>
              </h1>
              <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-neutral-400">
                Espace Personnel Chess.com · @alpharomeo1500
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#facc15]/10 border border-[#facc15]/30 text-[#facc15] text-xs font-bold">
            <Shield className="h-4 w-4" />
            <span>Mode Mono-Compte</span>
          </div>
        </div>
      </header>

      {/* Main Centered Single-Account Workspace */}
      <main className="relative z-10 w-full flex-1 flex items-center justify-center px-4 sm:px-8 py-8 sm:py-12">
        <div className="w-full max-w-xl rounded-3xl border border-neutral-800 bg-[#0c0f14]/95 backdrop-blur-xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Account Header */}
          <div className="flex items-center justify-between gap-3 pb-5 border-b border-neutral-800/80">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#facc15] to-[#ca8a04] text-black flex items-center justify-center font-black text-lg shrink-0 shadow-[0_0_20px_rgba(250,204,21,0.3)]">
                AL
              </div>
              <div className="min-w-0">
                <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-400 block">
                  Compte Unique Plateforme
                </span>
                <h2 className="text-lg sm:text-xl font-black font-mono text-white truncate">
                  @alpharomeo1500
                </h2>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981] text-[11px] font-bold shrink-0">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Officiel</span>
            </span>
          </div>

          {/* Direct Entry without Permissions */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handleDirectAccessWithoutPermissions}
              className="w-full flex items-center justify-between p-4 sm:p-5 rounded-2xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-[#facc15]/60 text-white font-bold transition-all active:scale-95 group text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-xl bg-[#facc15]/15 border border-[#facc15]/30 flex items-center justify-center text-[#facc15] shrink-0">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm sm:text-base font-black text-white">
                    Accéder au Tableau de bord (Sans permissions)
                  </div>
                  <div className="text-xs text-neutral-400">
                    Consultation immédiate · Déverrouillage A2F requis pour modifier
                  </div>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-[#facc15] group-hover:translate-x-1 transition-transform shrink-0" />
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-neutral-800 w-full" />
            <span className="bg-[#0c0f14] px-3 text-[11px] uppercase tracking-widest font-bold text-neutral-500 whitespace-nowrap">
              Ou avec permissions Admin (A2F)
            </span>
            <div className="border-t border-neutral-800 w-full" />
          </div>

          {/* New 2FA Pairing Panel (shown until first code verification completes) */}
          {!enrolled && (
            <div className="rounded-2xl border border-[#facc15]/35 bg-neutral-950/90 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#facc15] flex items-center gap-1.5">
                  <QrCode className="h-4 w-4" />
                  <span>Configurer la nouvelle clé A2F</span>
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const fresh = await rotateAndSyncTotpSecret();
                    setSecretKey(fresh);
                    setErrorMessage(null);
                  }}
                  className="text-[11px] font-bold text-[#facc15] hover:underline"
                >
                  Nouvelle clé
                </button>
              </div>
              {qrUrl && (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="p-2 rounded-xl bg-white border border-neutral-700 shrink-0">
                    <img src={qrUrl} alt="QR Code A2F" className="h-32 w-32 object-contain" />
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

          {/* Optional Direct 2FA Unlock */}
          <form onSubmit={handleTotpSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-bold text-neutral-200 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[#facc15]" />
                <span>Code Authenticator à 6 chiffres</span>
              </label>
              <span className="text-[11px] text-[#facc15] flex items-center gap-1 font-mono">
                <Smartphone className="h-3.5 w-3.5" />
                <span>Validation auto</span>
              </span>
            </div>

            <input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              value={totpCode}
              onChange={handleCodeChange}
              placeholder="••••••"
              className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-4 text-2xl sm:text-3xl text-[#facc15] placeholder-neutral-700 focus:border-[#facc15] focus:outline-none focus:ring-1 focus:ring-[#facc15] font-mono font-black tracking-[0.45em] text-center transition-all shadow-inner"
            />

            {errorMessage && (
              <div className="p-3 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-xs">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-2xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs sm:text-sm font-black transition-all shadow-[0_0_20px_rgba(250,204,21,0.25)] active:scale-95 disabled:opacity-40"
            >
              {isLoading ? (
                <span>Vérification A2F en cours...</span>
              ) : (
                <>
                  <span>Accéder avec Permissions Admin</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </main>

      <footer className="relative z-10 w-full border-t border-neutral-800/80 bg-[#07090e]/90 backdrop-blur-md">
        <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-neutral-400">
          <span>Compte unique @alpharomeo1500 · Gestion multi-comptes désactivée</span>
          <span className="text-neutral-500 font-mono">RFC 6238 TOTP</span>
        </div>
      </footer>
    </div>
  );
};
