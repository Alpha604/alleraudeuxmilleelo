/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  FileText,
  KeyRound,
  Lock,
  Monitor,
  PowerOff,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Tag,
  Unlock,
  Wrench,
  X,
} from 'lucide-react';
import {
  DeviceCategory,
  formatRemainingDuration,
  SITE_PAUSE_MODE_META,
  SiteActivityConfig,
  SiteActivityEvaluation,
  SitePauseMode,
} from '../utils/siteActivity';
import { formatJsonBinTimestamp } from '../utils/cloudSync';
import {
  fetchTotpConfigFromServer,
  getTotpLockoutStatus,
  getTotpSecret,
  isExplicitReadOnlyEmbed,
  isTotpEnrolled,
  setAdminSession,
  setTotpEnrolled,
  syncTotpSecretToServer,
  verifyTotpCodeDetailed,
} from '../utils/security';
import { BrandLogo } from './BrandLogo';

interface SitePauseOverlayProps {
  config: SiteActivityConfig;
  evaluation: SiteActivityEvaluation;
  deviceType: DeviceCategory;
  isIframe: boolean;
  clientIp: string;
  onOpenAdminUnlock: () => void;
  onAdminUnlocked?: () => void;
  onRefreshStatus: () => void;
}

const MODE_ICONS: Record<SitePauseMode, React.ReactNode> = {
  arret: <PowerOff className="h-8 w-8 text-[#ef4444]" />,
  maintenance: <Wrench className="h-8 w-8 text-amber-400" />,
  administration: <ShieldCheck className="h-8 w-8 text-[#facc15]" />,
  moderation: <ShieldAlert className="h-8 w-8 text-purple-400" />,
  mise_a_jour: <RefreshCw className="h-8 w-8 text-sky-400 animate-spin" />,
};

export const SitePauseOverlay: React.FC<SitePauseOverlayProps> = ({
  config,
  evaluation,
  deviceType,
  isIframe,
  clientIp,
  onOpenAdminUnlock,
  onAdminUnlocked,
  onRefreshStatus,
}) => {
  const meta = SITE_PAUSE_MODE_META[config.mode] || SITE_PAUSE_MODE_META.maintenance;
  const readOnlyEmbed = isExplicitReadOnlyEmbed();

  const [adminDrawerOpen, setAdminDrawerOpen] = useState(false);
  const [inlineCode, setInlineCode] = useState('');
  const [inlineError, setInlineError] = useState('');
  const [isVerifyingInline, setIsVerifyingInline] = useState(false);
  const [enrolled, setEnrolled] = useState<boolean>(() => isTotpEnrolled());
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(() => getTotpLockoutStatus().remainingSeconds);

  useEffect(() => {
    fetchTotpConfigFromServer().then((cfg) => {
      if (cfg) {
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
    if (!adminDrawerOpen) return;
    setLockoutSeconds(getTotpLockoutStatus().remainingSeconds);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAdminDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adminDrawerOpen]);

  const deviceLabel =
    deviceType === 'mobile' ? 'Mobile' : deviceType === 'tablet' ? 'Tablette' : 'Ordinateur';

  const DeviceIcon =
    deviceType === 'mobile' ? Smartphone : deviceType === 'tablet' ? Tablet : Monitor;

  const verifyInline = async (candidate: string) => {
    const lockStatus = getTotpLockoutStatus();
    if (lockStatus.locked) {
      setLockoutSeconds(lockStatus.remainingSeconds);
      setInlineError(`Blocage anti-spam actif : réessayez dans ${lockStatus.remainingSeconds}s.`);
      return;
    }

    const clean = candidate.replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) {
      setInlineError('Entrez le code A2F à 6 chiffres.');
      return;
    }
    setIsVerifyingInline(true);
    setInlineError('');
    try {
      const secret = getTotpSecret();
      const result = await verifyTotpCodeDetailed(clean, secret);
      if (result.valid) {
        setLockoutSeconds(0);
        setTotpEnrolled(true);
        setEnrolled(true);
        syncTotpSecretToServer(secret, true).catch(() => {});
        setAdminSession();
        setAdminDrawerOpen(false);
        if (onAdminUnlocked) {
          onAdminUnlocked();
        }
      } else {
        if (result.locked && result.remainingSeconds) {
          setLockoutSeconds(result.remainingSeconds);
        }
        setInlineCode('');
        setInlineError(
          result.error ||
            'Code incorrect ou expiré. Cliquez sur « Afficher QR / Changer l’A2F » pour scanner le QR Code.'
        );
      }
    } catch {
      setInlineError('Erreur lors de la vérification A2F.');
    } finally {
      setIsVerifyingInline(false);
    }
  };

  const cleanUpcomingVersion = (config.upcomingVersion || '').trim().replace(/^v+/i, '');
  const cleanExtendedDetails = (config.extendedDetails || '').trim();

  return (
    <div className="fixed inset-0 z-[100] bg-[#07090e] text-neutral-100 flex flex-col justify-between p-4 sm:p-8 overflow-y-auto">
      {/* Subtle Ambient Accent Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[380px] blur-3xl opacity-15 rounded-full"
          style={{ backgroundColor: meta.accentHex }}
        />
      </div>

      {/* Top Spacer for Vertical Centering */}
      <div className="h-4 shrink-0" aria-hidden="true" />

      {/* Main Centered Visitor Notice Card */}
      <div className="relative z-10 mx-auto w-full max-w-xl rounded-3xl border border-neutral-800 bg-[#0b0e14] p-6 sm:p-10 shadow-2xl space-y-5 text-center">
        {/* Brand Header */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs font-display font-bold tracking-wider">
          <BrandLogo size="sm" />
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-lg border text-[11px] font-bold"
            style={{
              color: meta.accentHex,
              borderColor: `${meta.accentHex}40`,
              backgroundColor: `${meta.accentHex}12`,
            }}
          >
            {meta.label}
          </span>
        </div>

        {/* Mode Icon Container */}
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-3xl border border-neutral-800 bg-neutral-950 flex items-center justify-center shadow-inner">
            {MODE_ICONS[config.mode]}
          </div>
        </div>

        {/* Target Version Banner when Mise à jour (or version provided) */}
        {cleanUpcomingVersion && (
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-sky-500/35 bg-sky-500/10 text-sky-300 text-xs font-mono font-bold">
              <Tag className="h-3.5 w-3.5 text-sky-400" />
              <span>
                {config.mode === 'mise_a_jour'
                  ? `Nouvelle version en déploiement : v${cleanUpcomingVersion}`
                  : `Version cible : v${cleanUpcomingVersion}`}
              </span>
            </div>
          </div>
        )}

        {/* Title & Custom Message */}
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-white font-display tracking-tight text-balance">
            {config.customTitle || meta.defaultTitle}
          </h1>
          <p className="text-sm text-neutral-300 leading-relaxed max-w-lg mx-auto whitespace-pre-line">
            {config.customMessage || meta.defaultMessage}
          </p>
        </div>

        {/* Extended Rich Pause Information */}
        {cleanExtendedDetails && (
          <div className="rounded-2xl border border-neutral-800/90 bg-neutral-950/85 p-4 sm:p-5 text-left space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-200">
              <FileText className="h-3.5 w-3.5 text-[#facc15] shrink-0" />
              <span>Informations complémentaires</span>
            </div>
            <div className="text-xs sm:text-sm text-neutral-300 leading-relaxed whitespace-pre-line">
              {cleanExtendedDetails}
            </div>
          </div>
        )}

        {/* Estimated Resume Countdown / Time Box */}
        {config.resumeAtTimestamp && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/90 p-4 space-y-1.5">
            <div className="flex items-center justify-center gap-2 text-xs text-neutral-400">
              <Clock className="h-3.5 w-3.5 text-[#facc15]" />
              <span>Reprise estimée</span>
            </div>
            {evaluation.secondsUntilResume !== null && evaluation.secondsUntilResume > 0 ? (
              <>
                <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-[#facc15]">
                  {formatRemainingDuration(evaluation.secondsUntilResume)}
                </div>
                <div className="text-[11px] font-mono text-neutral-400">
                  Prévu le {formatJsonBinTimestamp(config.resumeAtTimestamp)} (Paris)
                </div>
              </>
            ) : (
              <div className="text-xs font-mono text-neutral-300">
                Prévu le {formatJsonBinTimestamp(config.resumeAtTimestamp)} (Paris)
              </div>
            )}
          </div>
        )}

        {/* Context Metadata & Refresh */}
        <div className="flex flex-col items-center gap-3 pt-2 border-t border-neutral-800/80">
          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-neutral-400">
            <span className="inline-flex items-center gap-1.5">
              <DeviceIcon className="h-3.5 w-3.5 text-neutral-400" />
              <span>{deviceLabel}</span>
            </span>
            {isIframe && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-400">Iframe intégré</span>
              </>
            )}
            {clientIp && (
              <>
                <span aria-hidden="true">·</span>
                <span>IP : {clientIp}</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onRefreshStatus}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-xs font-bold text-neutral-200 transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[#facc15]" />
            <span>Vérifier l&apos;état</span>
          </button>
        </div>
      </div>

      {/* Discrete Bottom Admin Trigger (Hidden out of the main view) */}
      <div className="relative z-10 w-full flex items-center justify-center pt-6 pb-2 shrink-0">
        {!readOnlyEmbed && (
          <button
            type="button"
            onClick={() => {
              setInlineError('');
              setInlineCode('');
              setAdminDrawerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] text-[11px] font-medium text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer"
            title="Connexion Administrateur (A2F)"
          >
            <Lock className="h-3 w-3" />
            <span>Accès Admin</span>
          </button>
        )}
      </div>

      {/* Compact On-Demand Admin 2FA Unlock Dialog */}
      {adminDrawerOpen && !readOnlyEmbed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Déverrouillage Administrateur A2F"
          onClick={() => setAdminDrawerOpen(false)}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl border border-neutral-800 bg-[#0b0e14] p-5 sm:p-6 shadow-2xl space-y-4 text-left"
          >
            <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#facc15]">
                <Lock className="h-4 w-4" />
                <span>Accès Administrateur (A2F)</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAdminDrawerOpen(false);
                }}
                aria-label="Fermer l'accès admin"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!enrolled && (
              <div className="p-3 rounded-xl border border-[#facc15]/40 bg-[#facc15]/10 text-xs text-amber-200 flex items-center justify-between gap-2">
                <span>Scannez d&apos;abord votre QR code A2F pour activer votre clé.</span>
                <button
                  type="button"
                  onClick={() => {
                    setAdminDrawerOpen(false);
                    onOpenAdminUnlock();
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-[#facc15] text-black text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  QR Code
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                verifyInline(inlineCode);
              }}
              className="space-y-3"
            >
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  disabled={lockoutSeconds > 0}
                  value={inlineCode}
                  onChange={(e) => {
                    if (lockoutSeconds > 0) return;
                    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setInlineCode(cleaned);
                    setInlineError('');
                    if (cleaned.length === 6) {
                      verifyInline(cleaned);
                    }
                  }}
                  placeholder="Code à 6 chiffres..."
                  className="w-full rounded-xl border border-neutral-800 bg-[#07090e] pl-10 pr-3 py-3 text-base font-mono font-bold tracking-[0.35em] text-[#facc15] placeholder:tracking-normal placeholder:font-sans placeholder:text-xs placeholder:text-neutral-500 focus:border-[#facc15] focus:outline-none disabled:opacity-45"
                />
                <KeyRound className="h-4 w-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {lockoutSeconds > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-[#ef4444]/35 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#ef4444] font-semibold">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <span>Blocage anti-spam actif : réessayez dans {lockoutSeconds}s.</span>
                </div>
              )}

              {inlineError && lockoutSeconds === 0 && (
                <div className="flex items-start gap-1.5 text-xs text-[#ef4444] font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{inlineError}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAdminDrawerOpen(false);
                    onOpenAdminUnlock();
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-300 hover:text-[#facc15] cursor-pointer"
                >
                  <QrCode className="h-3.5 w-3.5 text-[#facc15]" />
                  <span>{enrolled ? 'Afficher QR / Changer A2F' : 'Configurer l’A2F'}</span>
                </button>

                <button
                  type="submit"
                  disabled={isVerifyingInline || lockoutSeconds > 0 || inlineCode.length !== 6}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-extrabold transition-colors disabled:opacity-40 shrink-0 cursor-pointer"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  <span>
                    {lockoutSeconds > 0
                      ? `Bloqué (${lockoutSeconds}s)`
                      : isVerifyingInline
                      ? 'Vérification...'
                      : 'Débloquer'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
