/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Lock,
  Shield,
  ShieldCheck,
  Smartphone,
  User,
  UserPlus,
  Zap,
} from 'lucide-react';
import { authenticateAccount } from '../utils/security';

interface LoginPageProps {
  onLoginSuccess: (username: string, isAdmin: boolean, isSpectator?: boolean) => void;
  defaultUsername?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  defaultUsername = 'alpharomeo1500',
}) => {
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isAlphaRomeo = username.trim().toLowerCase() === 'alpharomeo1500' || username.trim().toLowerCase() === 'alpharomeo';

  const handleSelectAlphaRomeo = () => {
    setUsername('alpharomeo1500');
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const cleanUser = username.trim().toLowerCase();

    if (!cleanUser) {
      setErrorMessage('Veuillez renseigner un pseudo ou nom de compte.');
      return;
    }

    if (!password.trim()) {
      setErrorMessage(
        isAlphaRomeo
          ? 'Veuillez saisir votre code à 6 chiffres Microsoft Authenticator ou votre mot de passe maître (alpha604).'
          : 'Veuillez renseigner votre mot de passe.'
      );
      return;
    }

    if (!isAlphaRomeo && (!totpCode.trim() || totpCode.trim().length !== 6)) {
      setErrorMessage("Veuillez saisir votre code A2F à 6 chiffres (Google Authenticator / Microsoft Authenticator).");
      return;
    }

    setIsLoading(true);
    try {
      const res = await authenticateAccount(cleanUser, password, totpCode);
      if (res.success) {
        onLoginSuccess(cleanUser, !!res.isAdmin, false);
      } else {
        setErrorMessage(res.error || 'Authentification échouée. Veuillez vérifier vos identifiants.');
      }
    } catch (err) {
      setErrorMessage('Une erreur est survenue lors de la vérification.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpectatorAccess = () => {
    const targetUser = username.trim().toLowerCase() || 'alpharomeo1500';
    onLoginSuccess(targetUser, false, true);
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-neutral-100 flex flex-col justify-center items-center p-4 sm:p-6 relative selection:bg-[#facc15]/30 selection:text-white font-sans overflow-x-hidden">
      {/* Subtle Ambient Background Lighting */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-white/[0.04] via-[#facc15]/[0.03] to-transparent blur-3xl opacity-80" />
        <div className="absolute -bottom-20 right-10 w-[450px] h-[450px] bg-[#10b981]/[0.02] blur-3xl rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-auto space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#facc15] via-[#eab308] to-[#ca8a04] p-0.5 shadow-[0_0_35px_rgba(250,204,21,0.35)]">
            <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-[#07090e]">
              <Crown className="h-8 w-8 text-[#facc15]" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#facc15]/10 border border-[#facc15]/30 text-[#facc15] text-[10px] font-black uppercase tracking-widest">
              <Shield className="h-3 w-3" />
              <span>Portail d'Accès Sécurisé</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-display">
              ROAD TO 2000 <span className="text-[#facc15]">ELO</span>
            </h1>
            <p className="text-xs text-neutral-400 max-w-xs mx-auto">
              Connectez votre compte pour accéder à votre suivi de performance officiel et synchroniser vos données.
            </p>
          </div>
        </div>

        {/* Quick select for Official Account */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#facc15] to-[#ca8a04] flex items-center justify-center text-black font-black text-xs shadow-md shrink-0">
              AR
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate">Compte AlphaRoméo</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#facc15]/20 text-[#facc15] font-black uppercase">
                  Officiel
                </span>
              </div>
              <span className="text-[10px] font-mono text-neutral-400 block truncate">@alpharomeo1500</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSelectAlphaRomeo}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              isAlphaRomeo
                ? 'bg-[#facc15] text-black font-black shadow-md'
                : 'border border-neutral-700 bg-neutral-800 text-neutral-300 hover:text-white hover:border-[#facc15]'
            }`}
          >
            {isAlphaRomeo ? 'Sélectionné' : 'Choisir'}
          </button>
        </div>

        {/* Main Authentication Card */}
        <div className="rounded-3xl border border-neutral-800 bg-[#0c0f14]/90 backdrop-blur-xl p-6 sm:p-7 shadow-2xl space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-neutral-300">
                Nom de compte Chess.com
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="Ex : alpharomeo1500"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950/80 px-3.5 py-2.5 pl-10 text-xs text-white placeholder-neutral-500 focus:border-[#facc15] focus:outline-none font-mono transition-colors"
                />
                <User className="absolute left-3.5 top-3 h-4 w-4 text-neutral-500 pointer-events-none" />
              </div>
            </div>

            {/* Password / TOTP field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-neutral-300">
                  {isAlphaRomeo ? 'Code Microsoft Authenticator ou Mot de Passe' : 'Mot de passe'}
                </label>
                {isAlphaRomeo && (
                  <span className="text-[10px] text-[#facc15] flex items-center gap-1 font-mono">
                    <Smartphone className="h-3 w-3" />
                    2FA / alpha604
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder={
                    isAlphaRomeo
                      ? 'Code à 6 chiffres (2FA) ou mot de passe maître'
                      : 'Entrez votre mot de passe'
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950/80 px-3.5 py-2.5 pl-10 pr-10 text-xs text-white placeholder-neutral-500 focus:border-[#facc15] focus:outline-none font-mono transition-colors"
                />
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-neutral-500 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-neutral-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* A2F field for managed accounts */}
              {!isAlphaRomeo && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-neutral-300">
                      Code A2F (Application Authenticator)
                    </label>
                    <span className="text-[10px] text-[#10b981] font-mono">6 chiffres</span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => {
                        setTotpCode(e.target.value.replace(/\D/g, ''));
                        setErrorMessage(null);
                      }}
                      placeholder="Ex : 123456"
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950/80 px-3.5 py-2.5 pl-10 text-xs text-[#facc15] placeholder-neutral-500 focus:border-[#facc15] focus:outline-none font-mono tracking-widest text-center transition-colors"
                    />
                    <KeyRound className="absolute left-3.5 top-3 h-4 w-4 text-neutral-500 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Informative helper note */}
              <div className="text-[11px] text-neutral-400 bg-neutral-900/40 border border-neutral-800/80 rounded-xl p-2.5 mt-2 space-y-1">
                {isAlphaRomeo ? (
                  <p className="leading-relaxed">
                    <strong className="text-white">Compte Officiel :</strong> Entrez le code à 6 chiffres généré par votre application <strong className="text-[#facc15]">Microsoft Authenticator</strong>, ou utilisez votre mot de passe maître (<code className="text-[#facc15] font-mono">alpha604</code>).
                  </p>
                ) : (
                  <p className="leading-relaxed">
                    Saisissez le mot de passe et le code A2F issus du QR code configuré par l'administrateur pour votre compte.
                  </p>
                )}
              </div>
            </div>

            {/* Error banner */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-xs leading-relaxed animate-in fade-in">
                {errorMessage}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-black transition-all shadow-[0_0_20px_rgba(250,204,21,0.25)] active:scale-95 disabled:opacity-50"
            >
              {isLoading ? (
                <span>Vérification en cours...</span>
              ) : (
                <>
                  <span>Se Connecter</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Admin-only account notice */}
          <div className="pt-1 text-center">
            <span className="text-[11px] text-neutral-500">
              Seul l'administrateur <strong className="text-neutral-400">@alpharomeo1500</strong> peut créer de nouveaux comptes pour ce projet.
            </span>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center pt-2">
            <div className="border-t border-neutral-800 w-full" />
            <span className="bg-[#0c0f14] px-3 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              Ou Consultation
            </span>
          </div>

          {/* Spectator / Iframe View Mode Button */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleSpectatorAccess}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-neutral-700 bg-neutral-900/80 hover:bg-neutral-800 hover:border-neutral-600 text-neutral-200 hover:text-white text-xs font-bold transition-all active:scale-95 group"
            >
              <Eye className="h-4 w-4 text-[#facc15] group-hover:scale-110 transition-transform" />
              <span>Accéder en Mode Spectateur (Lecture Seule)</span>
            </button>
            <p className="text-[10px] text-neutral-500 text-center leading-tight">
              Permet de consulter le tableau de bord, les graphiques et le calendrier en lecture seule.
            </p>
          </div>
        </div>

        {/* 24-hour Session Info Footer */}
        <div className="text-center text-[11px] text-neutral-400 space-y-1">
          <p>Session active pendant 24 heures sur cet appareil.</p>
          <p className="text-[10px] text-neutral-500">Chaque compte dispose de son propre stockage JSONBin isolé.</p>
        </div>
      </div>
    </div>
  );
};
