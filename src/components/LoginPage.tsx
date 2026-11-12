/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CheckCircle2,
  Crown,
  Eye,
  KeyRound,
  Lock,
  PauseCircle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  User,
  Users,
  Zap,
} from 'lucide-react';
import {
  AccountStatus,
  authenticateWithTotpOnly,
  getPublicAuthorizedAccounts,
} from '../utils/security';

interface LoginPageProps {
  onLoginSuccess: (username: string, isAdmin: boolean, isSpectator?: boolean) => void;
  defaultUsername?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  defaultUsername = 'alpharomeo1500',
}) => {
  const [authorizedAccounts, setAuthorizedAccounts] = useState<
    { username: string; status: AccountStatus; isMaster: boolean }[]
  >([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(defaultUsername);
  const [authMode, setAuthMode] = useState<'choose' | 'totp'>('choose');
  const [totpCode, setTotpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const list = getPublicAuthorizedAccounts();
    setAuthorizedAccounts(list);
    if (!selectedAccount && list.length > 0) {
      setSelectedAccount(list[0].username);
    }
  }, []);

  const activeAccountObj = authorizedAccounts.find(
    (a) => a.username.toLowerCase() === (selectedAccount || '').toLowerCase()
  ) || {
    username: selectedAccount || 'alpharomeo1500',
    status: 'active' as AccountStatus,
    isMaster: selectedAccount?.toLowerCase() === 'alpharomeo1500',
  };

  const isAlphaRomeo = activeAccountObj.isMaster;
  const isSuspended = activeAccountObj.status === 'suspended';
  const isBanned = activeAccountObj.status === 'banned';

  const handleSelectAccount = (username: string) => {
    setSelectedAccount(username);
    setAuthMode('choose');
    setTotpCode('');
    setErrorMessage(null);
  };

  const handleStartTotpLogin = () => {
    if (isBanned) {
      setErrorMessage("Ce compte a été banni par l'administration.");
      return;
    }
    if (isSuspended) {
      setErrorMessage("Ce compte est temporairement suspendu par l'administration.");
      return;
    }
    setAuthMode('totp');
    setErrorMessage(null);
  };

  const handleSpectatorAccess = () => {
    if (!selectedAccount) return;
    onLoginSuccess(selectedAccount, false, true);
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setErrorMessage(null);

    const cleanCode = totpCode.trim();
    if (!cleanCode) {
      setErrorMessage(
        isAlphaRomeo
          ? 'Veuillez saisir votre code à 6 chiffres Microsoft Authenticator ou votre clé maître (alpha604).'
          : 'Veuillez saisir votre code A2F à 6 chiffres.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const res = await authenticateWithTotpOnly(selectedAccount, cleanCode);
      if (res.success) {
        onLoginSuccess(selectedAccount, !!res.isAdmin, false);
      } else {
        setErrorMessage(res.error || 'Code A2F invalide.');
      }
    } catch {
      setErrorMessage('Une erreur est survenue lors de la vérification.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-neutral-100 flex flex-col justify-center items-center p-4 sm:p-6 relative selection:bg-[#facc15]/30 selection:text-white font-sans overflow-x-hidden">
      {/* Subtle Ambient Background Lighting */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-white/[0.04] via-[#facc15]/[0.03] to-transparent blur-3xl opacity-80" />
        <div className="absolute -bottom-20 right-10 w-[450px] h-[450px] bg-[#10b981]/[0.02] blur-3xl rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-lg mx-auto space-y-6">
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
              <span>Plateforme Officielle Certifiée</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-display">
              ROAD TO 2000 <span className="text-[#facc15]">ELO</span>
            </h1>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              Sélectionnez un compte officiel pour vous connecter via son code A2F ou consulter les performances en mode spectateur.
            </p>
          </div>
        </div>

        {/* 1. Account Selection Grid (Only authorized accounts created by administration) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="font-bold text-neutral-300 flex items-center gap-1.5">
              <Users className="h-4 w-4 text-[#facc15]" />
              Comptes Officiels Autorisés
            </span>
            <span className="text-[11px] text-neutral-400 font-mono">
              {authorizedAccounts.length} joueur{authorizedAccounts.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto scrollbar-thin pr-1">
            {authorizedAccounts.map((acc) => {
              const isSelected = selectedAccount?.toLowerCase() === acc.username.toLowerCase();
              const isAlpha = acc.isMaster;

              return (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => handleSelectAccount(acc.username)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                    isSelected
                      ? 'border-[#facc15] bg-[#facc15]/10 shadow-[0_0_15px_rgba(250,204,21,0.15)] ring-1 ring-[#facc15]'
                      : 'border-neutral-800 bg-[#0c0f14]/80 hover:border-neutral-700 hover:bg-neutral-900/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-10 w-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                        isAlpha
                          ? 'bg-gradient-to-br from-[#facc15] to-[#ca8a04] text-black shadow-md'
                          : 'bg-neutral-800 text-white'
                      }`}
                    >
                      {acc.username.substring(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white font-mono truncate">
                          @{acc.username}
                        </span>
                        {isAlpha && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#facc15]/20 text-[#facc15] font-black uppercase">
                            Admin Maître
                          </span>
                        )}
                        {acc.status === 'suspended' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold uppercase">
                            Suspendu
                          </span>
                        )}
                        {acc.status === 'banned' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#ef4444]/20 text-[#ef4444] font-bold uppercase">
                            Banni
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-neutral-400 block truncate">
                        {isAlpha ? 'Compte principal officiel' : 'Suivi de performance Chess.com'}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 pl-2">
                    {isSelected ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#facc15] block shadow-[0_0_8px_rgba(250,204,21,0.8)]" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-neutral-700 block" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Interactive Card: Choose Between Connect (A2F) or Spectator */}
        <div className="rounded-3xl border border-neutral-800 bg-[#0c0f14]/90 backdrop-blur-xl p-6 sm:p-7 shadow-2xl space-y-5">
          {/* Active target banner */}
          <div className="flex items-center justify-between pb-4 border-b border-neutral-800/80">
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-neutral-400">Compte sélectionné :</span>
              <span className="text-xs font-mono font-bold text-white px-2.5 py-1 rounded-xl bg-neutral-900 border border-neutral-800">
                @{activeAccountObj.username}
              </span>
            </div>

            {isAlphaRomeo ? (
              <span className="text-[11px] text-[#facc15] font-mono flex items-center gap-1 font-bold">
                <Smartphone className="h-3.5 w-3.5" />
                A2F / alpha604
              </span>
            ) : (
              <span className="text-[11px] text-[#10b981] font-mono flex items-center gap-1">
                <KeyRound className="h-3.5 w-3.5" />
                A2F autonome
              </span>
            )}
          </div>

          {/* Mode 1: Selection between Se Connecter and Spectateur */}
          {authMode === 'choose' ? (
            <div className="space-y-4">
              <div className="text-xs text-neutral-300 leading-relaxed">
                Choisissez comment vous souhaitez accéder au profil <strong className="text-white">@{activeAccountObj.username}</strong> :
              </div>

              {/* Action 1: Se Connecter (Requires ONLY A2F code) */}
              <button
                type="button"
                onClick={handleStartTotpLogin}
                disabled={isSuspended || isBanned}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-[#facc15] to-[#eab308] text-black font-black text-xs transition-all shadow-[0_0_20px_rgba(250,204,21,0.25)] hover:scale-[1.01] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed group"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="h-10 w-10 rounded-xl bg-black/10 flex items-center justify-center shrink-0">
                    <KeyRound className="h-5 w-5 text-black" />
                  </div>
                  <div>
                    <div className="text-sm font-black">Se Connecter</div>
                    <div className="text-[11px] font-sans font-medium text-black/80">
                      Code A2F uniquement (aucun mot de passe requis)
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Status warning if account is suspended or banned */}
              {isSuspended && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
                  <PauseCircle className="h-4 w-4 shrink-0" />
                  <span>Ce compte est temporairement suspendu par l'administrateur.</span>
                </div>
              )}
              {isBanned && (
                <div className="p-3 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-xs flex items-center gap-2">
                  <Ban className="h-4 w-4 shrink-0" />
                  <span>Ce compte a été banni par l'administrateur.</span>
                </div>
              )}

              {/* Action 2: Mode Spectateur */}
              <button
                type="button"
                onClick={handleSpectatorAccess}
                className="w-full flex items-center justify-between p-4 rounded-2xl border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-white font-bold text-xs transition-all hover:scale-[1.01] active:scale-95 group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                    <Eye className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-sky-400">Mode Spectateur</div>
                    <div className="text-[11px] text-neutral-400">
                      Lecture seule immédiate (sans consommer le quota JSONBin)
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-sky-400 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          ) : (
            /* Mode 2: Prompt for 6-digit A2F code only (No password field!) */
            <form onSubmit={handleTotpSubmit} className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setAuthMode('choose')}
                  className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Retour au choix</span>
                </button>
                <span className="text-[10px] text-[#facc15] font-mono uppercase tracking-wider font-bold">
                  Code A2F Seul
                </span>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-300">
                  {isAlphaRomeo
                    ? 'Code Microsoft Authenticator (ou mot de passe maître)'
                    : 'Code A2F (Application Authenticator)'}
                </label>

                <div className="relative">
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={isAlphaRomeo ? 20 : 6}
                    value={totpCode}
                    onChange={(e) => {
                      setTotpCode(e.target.value.trim());
                      setErrorMessage(null);
                    }}
                    placeholder={isAlphaRomeo ? 'Ex : 123456 ou alpha604' : 'Ex : 123456'}
                    className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 pl-11 text-base sm:text-lg text-[#facc15] placeholder-neutral-500 focus:border-[#facc15] focus:outline-none font-mono tracking-widest text-center transition-all shadow-inner"
                  />
                  <KeyRound className="absolute left-3.5 top-3.5 h-5 w-5 text-neutral-500 pointer-events-none" />
                </div>

                <div className="text-[11px] text-neutral-400 bg-neutral-900/50 border border-neutral-800 rounded-xl p-3 space-y-1">
                  {isAlphaRomeo ? (
                    <p className="leading-relaxed">
                      Entrez le code à 6 chiffres de votre application <strong className="text-[#facc15]">Microsoft Authenticator</strong>, ou utilisez votre passe maître (<code className="text-[#facc15] font-mono">alpha604</code>).
                    </p>
                  ) : (
                    <p className="leading-relaxed">
                      Saisissez le code à 6 chiffres généré par votre application Authenticator. <br />
                      <span className="text-neutral-500 text-[10px]">
                        Note : Le code maître d'AlphaRoméo déverrouille également n'importe quel compte.
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {/* Error message */}
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
                  <span>Vérification A2F...</span>
                ) : (
                  <>
                    <span>Valider et Accéder au Compte</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Admin Master 2FA Override Notice */}
          <div className="pt-2 border-t border-neutral-800/80 text-[11px] text-neutral-400 text-center leading-relaxed">
            <span className="text-[#facc15] font-bold">Passe-Partout Administrateur :</span> Le code 2FA d'AlphaRoméo déverrouille l'accès à tous les profils de la plateforme.
          </div>
        </div>

        {/* 24-hour Session Info Footer */}
        <div className="text-center text-[11px] text-neutral-400 space-y-1">
          <p>Session active pendant 24 heures sans redemander l'A2F.</p>
          <p className="text-[10px] text-neutral-500">
            En mode spectateur, les identifiants cloud et fonctions d'écriture restent masqués et protégés.
          </p>
        </div>
      </div>
    </div>
  );
};
