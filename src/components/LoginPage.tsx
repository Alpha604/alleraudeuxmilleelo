/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CheckCircle2,
  Crown,
  Eye,
  KeyRound,
  PauseCircle,
  Shield,
  ShieldCheck,
  Smartphone,
  Target,
  Users,
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
  const [selectedAccount, setSelectedAccount] = useState<string>(defaultUsername);
  const [authMode, setAuthMode] = useState<'choose' | 'totp'>('choose');
  const [totpCode, setTotpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const list = getPublicAuthorizedAccounts();
    setAuthorizedAccounts(list);
    if (list.length > 0 && !list.some((a) => a.username === selectedAccount)) {
      setSelectedAccount(list[0].username);
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (authMode === 'totp') {
      setTimeout(() => codeInputRef.current?.focus(), 100);
    }
  }, [authMode]);

  const activeAccountObj = authorizedAccounts.find(
    (a) => a.username.toLowerCase() === selectedAccount.toLowerCase()
  ) || {
    username: selectedAccount || 'alpharomeo1500',
    status: 'active' as AccountStatus,
    isMaster: selectedAccount.toLowerCase() === 'alpharomeo1500',
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
    setTotpCode('');
    setErrorMessage(null);
  };

  const handleSpectatorAccess = () => {
    if (!selectedAccount) return;
    onLoginSuccess(selectedAccount, false, true);
  };

  const submitTotpCode = async (codeToVerify: string) => {
    if (!selectedAccount) return;
    setErrorMessage(null);
    const cleaned = codeToVerify.replace(/\D/g, '').slice(0, 6);

    if (cleaned.length !== 6) {
      setErrorMessage('Veuillez saisir le code A2F à 6 chiffres de votre application Authenticator.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await authenticateWithTotpOnly(selectedAccount, cleaned);
      if (res.success) {
        onLoginSuccess(selectedAccount, !!res.isAdmin, false);
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
                Portail Officiel de Performance Chess.com
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#facc15]/10 border border-[#facc15]/30 text-[#facc15] text-xs font-bold">
              <Shield className="h-4 w-4" />
              <span>A2F Principale Unique</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-mono text-neutral-300">
              <Users className="h-3.5 w-3.5 text-[#facc15]" />
              <span>{authorizedAccounts.length} compte{authorizedAccounts.length > 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Full-Width Workspace */}
      <main className="relative z-10 w-full flex-1 flex items-center px-4 sm:px-8 lg:px-12 xl:px-16 py-6 sm:py-10">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-stretch">
          {/* LEFT PANEL (7 cols): Full-Width Authorized Accounts Directory */}
          <section className="lg:col-span-7 flex flex-col justify-between rounded-3xl border border-neutral-800 bg-[#0c0f14]/85 backdrop-blur-xl p-5 sm:p-8 shadow-2xl space-y-6">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800/80 pb-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                    <Users className="h-5 w-5 text-[#facc15]" />
                    <span>Comptes Officiels de la Plateforme</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-neutral-400 mt-1">
                    Sélectionnez un joueur officiel ci-dessous pour vous connecter ou ouvrir la vue spectateur.
                  </p>
                </div>
                <span className="text-xs font-mono px-3 py-1 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 self-start sm:self-center">
                  {authorizedAccounts.length} autorisé{authorizedAccounts.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Accounts Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[430px] overflow-y-auto scrollbar-thin pr-1">
                {authorizedAccounts.map((acc) => {
                  const isSelected = selectedAccount.toLowerCase() === acc.username.toLowerCase();
                  const isAlpha = acc.isMaster;

                  return (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => handleSelectAccount(acc.username)}
                      className={`group flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
                        isSelected
                          ? 'border-[#facc15] bg-[#facc15]/10 shadow-[0_0_25px_rgba(250,204,21,0.18)] ring-1 ring-[#facc15]'
                          : 'border-neutral-800 bg-neutral-950/70 hover:border-neutral-600 hover:bg-neutral-900/80'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`h-12 w-12 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 transition-transform group-hover:scale-105 ${
                            isAlpha
                              ? 'bg-gradient-to-br from-[#facc15] to-[#ca8a04] text-black shadow-lg'
                              : 'bg-neutral-800 text-white border border-neutral-700'
                          }`}
                        >
                          {acc.username.substring(0, 2).toUpperCase()}
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm sm:text-base font-bold text-white font-mono truncate">
                              @{acc.username}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isAlpha ? (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-[#facc15]/20 border border-[#facc15]/40 text-[#facc15] font-black uppercase tracking-wider">
                                Admin Maître
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-semibold uppercase tracking-wider">
                                Joueur Officiel
                              </span>
                            )}

                            {acc.status === 'active' && !isAlpha && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-[#10b981]/15 text-[#10b981] font-bold">
                                Actif
                              </span>
                            )}
                            {acc.status === 'suspended' && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">
                                Suspendu
                              </span>
                            )}
                            {acc.status === 'banned' && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-[#ef4444]/20 text-[#ef4444] font-bold">
                                Banni
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 pl-2">
                        {isSelected ? (
                          <CheckCircle2 className="h-5 w-5 text-[#facc15]" />
                        ) : (
                          <span className="h-3 w-3 rounded-full border border-neutral-600 block group-hover:border-neutral-400" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Platform Security Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-neutral-800/80 text-xs">
              <div className="p-3.5 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-1">
                <div className="flex items-center gap-2 font-bold text-[#facc15]">
                  <Smartphone className="h-4 w-4" />
                  <span>A2F Unique</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-snug">
                  Authentification exclusive par votre application Authenticator à 6 chiffres.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-1">
                <div className="flex items-center gap-2 font-bold text-sky-400">
                  <Eye className="h-4 w-4" />
                  <span>Mode Spectateur</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-snug">
                  Consultation instantanée en lecture seule, sans consommer le quota JSONBin.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-1">
                <div className="flex items-center gap-2 font-bold text-[#10b981]">
                  <Target className="h-4 w-4" />
                  <span>Session 24h</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-snug">
                  Chaque compte dispose de son espace et stockage JSONBin strictement isolé.
                </p>
              </div>
            </div>
          </section>

          {/* RIGHT PANEL (5 cols): Active Account Connection / Spectator Card */}
          <section className="lg:col-span-5 flex flex-col justify-between rounded-3xl border border-neutral-800 bg-[#0c0f14]/95 backdrop-blur-xl p-6 sm:p-8 shadow-2xl space-y-6">
            {/* Selected Player Summary Header */}
            <div className="flex items-center justify-between gap-3 pb-5 border-b border-neutral-800/80">
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`h-14 w-14 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 ${
                    isAlphaRomeo
                      ? 'bg-gradient-to-br from-[#facc15] to-[#ca8a04] text-black shadow-[0_0_20px_rgba(250,204,21,0.3)]'
                      : 'bg-neutral-800 text-white border border-neutral-700'
                  }`}
                >
                  {activeAccountObj.username.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-400 block">
                    Compte sélectionné
                  </span>
                  <h3 className="text-lg sm:text-xl font-black font-mono text-white truncate">
                    @{activeAccountObj.username}
                  </h3>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981] text-[11px] font-bold shrink-0">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>A2F Requise</span>
              </span>
            </div>

            {/* Body: Choice vs A2F 6-digit Input */}
            <div className="flex-1 flex flex-col justify-center space-y-5">
              {authMode === 'choose' ? (
                <div className="space-y-4">
                  <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                    Choisissez votre mode d'accès pour le profil <strong className="text-white font-mono">@{activeAccountObj.username}</strong> :
                  </p>

                  {/* Action 1: Connect with Principal A2F ONLY */}
                  <button
                    type="button"
                    onClick={handleStartTotpLogin}
                    disabled={isSuspended || isBanned}
                    className="w-full flex items-center justify-between p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#facc15] to-[#eab308] text-black font-black transition-all shadow-[0_0_25px_rgba(250,204,21,0.25)] hover:scale-[1.01] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed group text-left"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="h-11 w-11 rounded-xl bg-black/10 flex items-center justify-center shrink-0">
                        <KeyRound className="h-5 w-5 text-black" />
                      </div>
                      <div>
                        <div className="text-sm sm:text-base font-black">Se Connecter</div>
                        <div className="text-xs font-sans font-semibold text-black/80">
                          Code A2F à 6 chiffres uniquement
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform shrink-0" />
                  </button>

                  {isSuspended && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
                      <PauseCircle className="h-4 w-4 shrink-0" />
                      <span>Ce compte est temporairement suspendu par l'administrateur.</span>
                    </div>
                  )}
                  {isBanned && (
                    <div className="p-3.5 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-xs flex items-center gap-2">
                      <Ban className="h-4 w-4 shrink-0" />
                      <span>Ce compte a été banni par l'administrateur.</span>
                    </div>
                  )}

                  {/* Action 2: Mode Spectateur */}
                  <button
                    type="button"
                    onClick={handleSpectatorAccess}
                    className="w-full flex items-center justify-between p-4 sm:p-5 rounded-2xl border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-white font-bold transition-all hover:scale-[1.01] active:scale-95 group text-left"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="h-11 w-11 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                        <Eye className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm sm:text-base font-bold text-sky-400">Mode Spectateur</div>
                        <div className="text-xs text-neutral-400">
                          Lecture seule immédiate · Zéro quota utilisé
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-sky-400 group-hover:translate-x-1 transition-transform shrink-0" />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleTotpSubmit} className="space-y-5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('choose');
                        setTotpCode('');
                        setErrorMessage(null);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-400 hover:text-white transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Retour aux modes d'accès</span>
                    </button>
                    <span className="text-[11px] text-[#facc15] font-mono uppercase tracking-wider font-bold">
                      A2F Principale
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs sm:text-sm font-bold text-neutral-200">
                        Code à 6 chiffres Authenticator
                      </label>
                      <span className="text-[11px] text-[#facc15] flex items-center gap-1 font-mono">
                        <Smartphone className="h-3.5 w-3.5" />
                        <span>Validation auto</span>
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        ref={codeInputRef}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="one-time-code"
                        required
                        autoFocus
                        maxLength={6}
                        value={totpCode}
                        onChange={handleCodeChange}
                        placeholder="••••••"
                        className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-4 text-2xl sm:text-3xl text-[#facc15] placeholder-neutral-700 focus:border-[#facc15] focus:outline-none focus:ring-1 focus:ring-[#facc15] font-mono font-black tracking-[0.45em] text-center transition-all shadow-inner"
                      />
                    </div>

                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Ouvrez <strong className="text-white">Microsoft Authenticator</strong> ou <strong className="text-white">Google Authenticator</strong> et entrez le code à 6 chiffres en cours. La connexion se valide automatiquement.
                    </p>
                  </div>

                  {errorMessage && (
                    <div className="p-3.5 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-xs leading-relaxed animate-in fade-in">
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
                        <span>Déverrouiller @{activeAccountObj.username}</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Bottom info inside right panel */}
            <div className="pt-4 border-t border-neutral-800/80 text-[11px] text-neutral-400 flex items-center justify-between gap-2">
              <span>Connexion sans mot de passe</span>
              <span className="font-mono text-neutral-500">RFC 6238 TOTP</span>
            </div>
          </section>
        </div>
      </main>

      {/* Bottom Full-Width Footer */}
      <footer className="relative z-10 w-full border-t border-neutral-800/80 bg-[#07090e]/90 backdrop-blur-md">
        <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-neutral-400">
          <span>Session persistante 24 heures · Déconnexion manuelle disponible à tout moment</span>
          <span className="text-neutral-500 font-mono">
            Mode spectateur strictement isolé (aucune fuite de Bin ID ni écriture cloud)
          </span>
        </div>
      </footer>
    </div>
  );
};
