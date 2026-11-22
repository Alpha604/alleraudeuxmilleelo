/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Code2,
  Globe,
  Laptop,
  Monitor,
  PauseCircle,
  PlayCircle,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Timer,
  Trash2,
  Wrench,
} from 'lucide-react';
import { getClientIp, getTrustedIps } from '../utils/security';
import { formatJsonBinTimestamp } from '../utils/cloudSync';
import {
  detectDeviceCategory,
  formatRemainingDuration,
  getLocalSiteActivityConfig,
  IframePolicy,
  IpPolicyMode,
  ResumeType,
  saveSiteActivity,
  ScheduleType,
  SITE_PAUSE_MODE_META,
  SiteActivityConfig,
  SitePauseMode,
} from '../utils/siteActivity';

interface SiteActivityPanelProps {
  currentConfig: SiteActivityConfig;
  currentClientIp: string;
  onConfigUpdated: (updated: SiteActivityConfig) => void;
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning', title?: string) => void;
}

function toLocalDatetimeInputValue(ts: number | null | undefined): string {
  const d = ts ? new Date(ts) : new Date(Date.now() + 15 * 60 * 1000);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SiteActivityPanel: React.FC<SiteActivityPanelProps> = ({
  currentConfig,
  currentClientIp,
  onConfigUpdated,
  onShowMessage,
}) => {
  const [draft, setDraft] = useState<SiteActivityConfig>(() => currentConfig || getLocalSiteActivityConfig());
  const [exactPauseInput, setExactPauseInput] = useState<string>(() =>
    toLocalDatetimeInputValue(currentConfig?.pauseAtTimestamp)
  );
  const [exactResumeInput, setExactResumeInput] = useState<string>(() =>
    toLocalDatetimeInputValue(currentConfig?.resumeAtTimestamp)
  );
  const [newIpInput, setNewIpInput] = useState('');
  const [isDetectingIp, setIsDetectingIp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastCloudSyncOk, setLastCloudSyncOk] = useState<boolean | null>(null);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const trustedIps = getTrustedIps();
  const detectedDevice = detectDeviceCategory();
  const isCurrentIpTrusted = Boolean(
    currentClientIp && trustedIps.some((t) => t.trim() === currentClientIp.trim())
  );

  useEffect(() => {
    setDraft(currentConfig);
    if (currentConfig.pauseAtTimestamp) {
      setExactPauseInput(toLocalDatetimeInputValue(currentConfig.pauseAtTimestamp));
    }
    if (currentConfig.resumeAtTimestamp) {
      setExactResumeInput(toLocalDatetimeInputValue(currentConfig.resumeAtTimestamp));
    }
  }, [currentConfig.revision, currentConfig.updatedAt, currentConfig.enabled]);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleSelectMode = (mode: SitePauseMode) => {
    const prevMeta = SITE_PAUSE_MODE_META[draft.mode];
    const nextMeta = SITE_PAUSE_MODE_META[mode];
    const usesDefaultTitle = !draft.customTitle || draft.customTitle === prevMeta.defaultTitle;
    const usesDefaultMsg = !draft.customMessage || draft.customMessage === prevMeta.defaultMessage;

    setDraft((prev) => ({
      ...prev,
      mode,
      customTitle: usesDefaultTitle ? nextMeta.defaultTitle : prev.customTitle,
      customMessage: usesDefaultMsg ? nextMeta.defaultMessage : prev.customMessage,
    }));
  };

  const buildNormalizedTimestamps = (source: SiteActivityConfig): SiteActivityConfig => {
    const now = Date.now();
    let pauseAtTimestamp: number | null = source.pauseAtTimestamp;

    if (source.scheduleType === 'immediate') {
      pauseAtTimestamp = now;
    } else if (source.scheduleType === 'countdown') {
      const mins = Math.max(1, source.countdownMinutes || 5);
      pauseAtTimestamp = now + mins * 60 * 1000;
    } else if (source.scheduleType === 'exact_date') {
      const parsed = exactPauseInput ? new Date(exactPauseInput).getTime() : NaN;
      pauseAtTimestamp = !isNaN(parsed) ? parsed : now;
    }

    let resumeAtTimestamp: number | null = null;
    const effectiveStart = pauseAtTimestamp ?? now;

    if (source.resumeType === 'duration') {
      const rMins = Math.max(1, source.resumeDurationMinutes || 30);
      resumeAtTimestamp = effectiveStart + rMins * 60 * 1000;
    } else if (source.resumeType === 'exact_date') {
      const parsedR = exactResumeInput ? new Date(exactResumeInput).getTime() : NaN;
      resumeAtTimestamp = !isNaN(parsedR) ? parsedR : null;
    }

    return {
      ...source,
      pauseAtTimestamp,
      resumeAtTimestamp,
    };
  };

  const handleSaveAndApply = async (enablePause?: boolean) => {
    setIsSaving(true);
    try {
      const targetEnabled = typeof enablePause === 'boolean' ? enablePause : draft.enabled;
      const prepared = buildNormalizedTimestamps({
        ...draft,
        enabled: targetEnabled,
      });

      const res = await saveSiteActivity(prepared);
      setDraft(res.config);
      onConfigUpdated(res.config);
      setLastCloudSyncOk(res.cloudSynced);
      setCloudSyncError(res.cloudSynced ? null : res.error || 'Synchronisation Cloud JSONBin non confirmée.');

      if (!res.cloudSynced) {
        onShowMessage(
          `Enregistré localement, mais la propagation Cloud multi-appareils a échoué (${res.error || 'JSONBin inaccessible'}).`,
          'warning',
          'Propagation Cloud Partielle'
        );
      } else if (!res.config.enabled) {
        onShowMessage(
          'Site remis EN LIGNE et propagé sur le Cloud JSONBin pour tous les appareils.',
          'success',
          'Activité du Site'
        );
      } else if (
        res.config.scheduleType !== 'immediate' &&
        res.config.pauseAtTimestamp &&
        res.config.pauseAtTimestamp > Date.now()
      ) {
        onShowMessage(
          `Pause (${SITE_PAUSE_MODE_META[res.config.mode].label}) programmée pour le ${formatJsonBinTimestamp(res.config.pauseAtTimestamp)} · Propagée tous appareils.`,
          'warning',
          'Arrêt Programmé'
        );
      } else {
        onShowMessage(
          `Site mis en pause (${SITE_PAUSE_MODE_META[res.config.mode].label}) et propagé sur tous les appareils ciblés.`,
          'warning',
          'Site en Pause Multi-Appareils'
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDetectIp = async () => {
    setIsDetectingIp(true);
    try {
      const ip = currentClientIp || (await getClientIp());
      if (ip) {
        setNewIpInput(ip);
        onShowMessage(`IP détectée : ${ip}`, 'info');
      } else {
        onShowMessage('Impossible de détecter votre IP publique.', 'warning');
      }
    } finally {
      setIsDetectingIp(false);
    }
  };

  const handleAddTargetIp = () => {
    const clean = newIpInput.trim();
    if (clean.length < 3) return;
    if (draft.ipPolicy.ips.includes(clean)) {
      setNewIpInput('');
      return;
    }
    setDraft((prev) => ({
      ...prev,
      ipPolicy: {
        ...prev.ipPolicy,
        ips: [...prev.ipPolicy.ips, clean],
      },
    }));
    setNewIpInput('');
  };

  const handleRemoveTargetIp = (ip: string) => {
    setDraft((prev) => ({
      ...prev,
      ipPolicy: {
        ...prev.ipPolicy,
        ips: prev.ipPolicy.ips.filter((item) => item !== ip),
      },
    }));
  };

  const modeIcons: Record<SitePauseMode, React.ReactNode> = {
    arret: <PowerOff className="h-4 w-4 text-[#ef4444]" />,
    maintenance: <Wrench className="h-4 w-4 text-amber-400" />,
    administration: <ShieldCheck className="h-4 w-4 text-[#facc15]" />,
    moderation: <ShieldAlert className="h-4 w-4 text-purple-400" />,
    mise_a_jour: <RefreshCw className="h-4 w-4 text-sky-400" />,
  };

  const isCurrentlyPaused =
    currentConfig.enabled &&
    (currentConfig.scheduleType === 'immediate' ||
      !currentConfig.pauseAtTimestamp ||
      nowTick >= currentConfig.pauseAtTimestamp);

  const isCountdownRunning =
    currentConfig.enabled &&
    currentConfig.scheduleType !== 'immediate' &&
    Boolean(currentConfig.pauseAtTimestamp && currentConfig.pauseAtTimestamp > nowTick);

  const secondsLeft =
    isCountdownRunning && currentConfig.pauseAtTimestamp
      ? Math.max(0, Math.ceil((currentConfig.pauseAtTimestamp - nowTick) / 1000))
      : null;

  return (
    <div className="space-y-6">
      {/* Live Status Banner & Quick Switch */}
      <section
        className={`rounded-2xl border p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          isCurrentlyPaused
            ? 'border-[#ef4444]/40 bg-[#ef4444]/10'
            : isCountdownRunning
            ? 'border-amber-500/40 bg-amber-500/10'
            : 'border-[#10b981]/30 bg-[#10b981]/[0.06]'
        }`}
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                isCurrentlyPaused
                  ? 'border-[#ef4444]/40 bg-[#ef4444]/20 text-[#ef4444]'
                  : isCountdownRunning
                  ? 'border-amber-500/40 bg-amber-500/20 text-amber-400'
                  : 'border-[#10b981]/40 bg-[#10b981]/20 text-[#10b981]'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isCurrentlyPaused
                    ? 'bg-[#ef4444]'
                    : isCountdownRunning
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-[#10b981]'
                }`}
              />
              {isCurrentlyPaused
                ? `EN PAUSE · ${SITE_PAUSE_MODE_META[currentConfig.mode].label}`
                : isCountdownRunning
                ? `ARRÊT PROGRAMMÉ DANS ${formatRemainingDuration(secondsLeft)}`
                : 'SITE EN LIGNE (ACTIF)'}
            </span>

            {currentClientIp && (
              <span className="text-[11px] font-mono text-neutral-400">
                Votre IP actuelle : <strong className="text-neutral-200">{currentClientIp}</strong>
              </span>
            )}
          </div>

          <p className="text-xs text-neutral-300">
            {isCurrentlyPaused
              ? `Le blocage est actif selon vos règles (Appareils, Iframes, IPs). ${
                  currentConfig.allowAdminBypass
                    ? 'Votre accès Admin A2F contourne la pause.'
                    : 'Bypass Admin désactivé.'
                }`
              : isCountdownRunning && currentConfig.pauseAtTimestamp
              ? `Passage automatique en mode « ${SITE_PAUSE_MODE_META[currentConfig.mode].label} » prévu le ${formatJsonBinTimestamp(
                  currentConfig.pauseAtTimestamp
                )}.`
              : 'La plateforme est pleinement accessible pour tous les appareils, IPs et Iframes.'}
          </p>

          {lastCloudSyncOk !== null && (
            <div
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${
                lastCloudSyncOk
                  ? 'border-[#10b981]/35 bg-[#10b981]/10 text-[#10b981]'
                  : 'border-[#ef4444]/40 bg-[#ef4444]/10 text-[#ef4444]'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  lastCloudSyncOk ? 'bg-[#10b981]' : 'bg-[#ef4444]'
                }`}
              />
              <span>
                {lastCloudSyncOk
                  ? `Propagé sur le Cloud JSONBin (rév. #${currentConfig.revision || 1} · tous appareils synchronisés)`
                  : `Erreur Cloud : ${cloudSyncError || 'non propagé aux autres appareils'}`}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {currentConfig.enabled ? (
            <button
              type="button"
              onClick={() => handleSaveAndApply(false)}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10b981] hover:bg-emerald-400 text-black text-xs font-bold transition-colors disabled:opacity-50"
            >
              <PlayCircle className="h-4 w-4" />
              <span>Remettre le site en ligne maintenant</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSaveAndApply(true)}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#ef4444] hover:bg-red-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
            >
              <PauseCircle className="h-4 w-4" />
              <span>
                {draft.scheduleType === 'immediate' ? 'Mettre en pause maintenant' : 'Activer la planification'}
              </span>
            </button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: MODE + PLANNING */}
        <div className="xl:col-span-7 space-y-6">
          {/* 1. MODE SELECTION */}
          <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] p-5 sm:p-6 space-y-4">
            <div className="border-b border-neutral-800/80 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Power className="h-4 w-4 text-[#facc15]" />
                <span>1. Mode de pause du site</span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Choisissez le motif et l'apparence de l'écran affiché aux visiteurs bloqués.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {(Object.keys(SITE_PAUSE_MODE_META) as SitePauseMode[]).map((mKey) => {
                const meta = SITE_PAUSE_MODE_META[mKey];
                const isSelected = draft.mode === mKey;
                return (
                  <button
                    key={mKey}
                    type="button"
                    onClick={() => handleSelectMode(mKey)}
                    className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                      isSelected
                        ? 'border-[#facc15] bg-[#facc15]/10 text-white shadow-md'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white hover:border-neutral-700'
                    }`}
                  >
                    {modeIcons[mKey]}
                    <span className="text-center leading-tight">{meta.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 pt-2 text-xs">
              <div>
                <label className="block font-semibold text-neutral-300 mb-1">Titre affiché sur l'écran de pause</label>
                <input
                  type="text"
                  value={draft.customTitle}
                  onChange={(e) => setDraft((prev) => ({ ...prev, customTitle: e.target.value }))}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-white focus:border-[#facc15] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-300 mb-1">Message explicatif personnalisé</label>
                <textarea
                  rows={2}
                  value={draft.customMessage}
                  onChange={(e) => setDraft((prev) => ({ ...prev, customMessage: e.target.value }))}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-white focus:border-[#facc15] focus:outline-none resize-none"
                />
              </div>
            </div>
          </section>

          {/* 2. SCHEDULE: WHEN IT STOPS & WHEN IT SHOULD RESUME */}
          <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] p-5 sm:p-6 space-y-5">
            <div className="border-b border-neutral-800/80 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Timer className="h-4 w-4 text-[#facc15]" />
                <span>2. Planification (Arrêt & Reprise prévue)</span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Définissez quand le site s'arrête (immédiat, compte à rebours ou date précise) et quand il devrait reprendre.
              </p>
            </div>

            {/* Stop Timing */}
            <div className="space-y-3 text-xs">
              <span className="font-bold text-neutral-200 block">Déclenchement de la pause :</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(
                  [
                    { id: 'immediate', label: 'Immédiat', desc: 'Bloque tout de suite', icon: <PowerOff className="h-3.5 w-3.5" /> },
                    { id: 'countdown', label: 'Compte à rebours', desc: 'Dans X minutes', icon: <Clock className="h-3.5 w-3.5" /> },
                    { id: 'exact_date', label: 'Date précise', desc: 'Jour & heure exacte', icon: <Calendar className="h-3.5 w-3.5" /> },
                  ] as { id: ScheduleType; label: string; desc: string; icon: React.ReactNode }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, scheduleType: opt.id }))}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                      draft.scheduleType === opt.id
                        ? 'border-[#facc15] bg-[#facc15]/10 text-white'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <span className="mt-0.5 text-[#facc15]">{opt.icon}</span>
                    <div>
                      <div className="font-bold">{opt.label}</div>
                      <div className="text-[11px] text-neutral-400">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              {draft.scheduleType === 'countdown' && (
                <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-neutral-300">Durée du compte à rebours (minutes) :</span>
                    <div className="flex items-center gap-1.5">
                      {[1, 5, 10, 15, 30, 60].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, countdownMinutes: m }))}
                          className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition-colors ${
                            draft.countdownMinutes === m
                              ? 'bg-[#facc15] text-black'
                              : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
                          }`}
                        >
                          {m}m
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={10080}
                    value={draft.countdownMinutes}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, countdownMinutes: Math.max(1, Number(e.target.value) || 1) }))
                    }
                    className="w-full rounded-xl border border-neutral-800 bg-[#0b0e14] px-3 py-2 text-white font-mono"
                  />
                </div>
              )}

              {draft.scheduleType === 'exact_date' && (
                <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2">
                  <label className="block font-semibold text-neutral-300">
                    Date et heure précises d'arrêt :
                  </label>
                  <input
                    type="datetime-local"
                    value={exactPauseInput}
                    onChange={(e) => setExactPauseInput(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-[#0b0e14] px-3 py-2 text-white font-mono"
                  />
                </div>
              )}

              {draft.scheduleType !== 'immediate' && (
                <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-950 cursor-pointer">
                  <div>
                    <span className="font-semibold text-neutral-200 block">Afficher une bannière de compte à rebours</span>
                    <span className="text-[11px] text-neutral-400">
                      Prévient en haut de l'écran avant le blocage effectif
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={draft.showCountdownBanner}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, showCountdownBanner: e.target.checked }))
                    }
                    className="h-4 w-4 accent-[#facc15]"
                  />
                </label>
              )}
            </div>

            {/* Resume / Estimated End Timing */}
            <div className="space-y-3 pt-4 border-t border-neutral-800/80 text-xs">
              <span className="font-bold text-neutral-200 block">Quand le site devrait reprendre :</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(
                  [
                    { id: 'manual', label: 'Reprise manuelle' },
                    { id: 'duration', label: 'Durée estimée (min)' },
                    { id: 'exact_date', label: 'Date & heure de fin' },
                  ] as { id: ResumeType; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, resumeType: opt.id }))}
                    className={`px-3 py-2 rounded-xl border font-bold transition-colors ${
                      draft.resumeType === opt.id
                        ? 'border-[#10b981] bg-[#10b981]/15 text-[#10b981]'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {draft.resumeType === 'duration' && (
                <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2">
                  <label className="block font-semibold text-neutral-300">Durée estimée de la pause (en minutes) :</label>
                  <input
                    type="number"
                    min={1}
                    max={43200}
                    value={draft.resumeDurationMinutes}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        resumeDurationMinutes: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    className="w-full rounded-xl border border-neutral-800 bg-[#0b0e14] px-3 py-2 text-white font-mono"
                  />
                </div>
              )}

              {draft.resumeType === 'exact_date' && (
                <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2">
                  <label className="block font-semibold text-neutral-300">Date et heure de reprise prévue :</label>
                  <input
                    type="datetime-local"
                    value={exactResumeInput}
                    onChange={(e) => setExactResumeInput(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-[#0b0e14] px-3 py-2 text-white font-mono"
                  />
                </div>
              )}

              {draft.resumeType !== 'manual' && (
                <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-950 cursor-pointer">
                  <div>
                    <span className="font-semibold text-neutral-200 block">Réactivation automatique à l'échéance</span>
                    <span className="text-[11px] text-neutral-400">
                      Remet le site automatiquement en ligne dès que la date/durée de fin est atteinte
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={draft.autoResume}
                    onChange={(e) => setDraft((prev) => ({ ...prev, autoResume: e.target.checked }))}
                    className="h-4 w-4 accent-[#10b981]"
                  />
                </label>
              )}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: TARGETING (DEVICES / IFRAMES / IPS / ADMIN BYPASS) */}
        <div className="xl:col-span-5 space-y-6">
          {/* 3. DEVICES & IFRAME TARGETING */}
          <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] p-5 sm:p-6 space-y-5 text-xs">
            <div className="border-b border-neutral-800/80 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Laptop className="h-4 w-4 text-[#facc15]" />
                <span>3. Ciblage Appareils & Iframes</span>
              </h3>
            </div>

            {/* Devices */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-neutral-200">Appareils bloqués :</span>
                <label className="inline-flex items-center gap-2 cursor-pointer text-[#facc15] font-bold">
                  <input
                    type="checkbox"
                    checked={draft.devices.all}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        devices: {
                          all: e.target.checked,
                          desktop: e.target.checked ? true : prev.devices.desktop,
                          mobile: e.target.checked ? true : prev.devices.mobile,
                          tablet: e.target.checked ? true : prev.devices.tablet,
                        },
                      }))
                    }
                    className="h-4 w-4 accent-[#facc15]"
                  />
                  <span>Tous les appareils</span>
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'desktop' as const, label: 'PC / Desktop', icon: <Monitor className="h-4 w-4" /> },
                  { key: 'mobile' as const, label: 'Mobile', icon: <Smartphone className="h-4 w-4" /> },
                  { key: 'tablet' as const, label: 'Tablette', icon: <Tablet className="h-4 w-4" /> },
                ].map((dev) => {
                  const active = draft.devices.all || draft.devices[dev.key];
                  return (
                    <button
                      key={dev.key}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => {
                          const nextVal = !active;
                          const nextDevices = {
                            ...prev.devices,
                            all: false,
                            [dev.key]: nextVal,
                          };
                          if (nextDevices.desktop && nextDevices.mobile && nextDevices.tablet) {
                            nextDevices.all = true;
                          }
                          return { ...prev, devices: nextDevices };
                        })
                      }
                      className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border font-bold transition-colors ${
                        active
                          ? 'border-[#ef4444]/50 bg-[#ef4444]/15 text-white'
                          : 'border-neutral-800 bg-neutral-950 text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {dev.icon}
                      <span>{dev.label}</span>
                      <span className="text-[10px] font-mono">
                        {active ? 'Bloqué' : 'Autorisé'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Iframes */}
            <div className="space-y-2 pt-3 border-t border-neutral-800/80">
              <span className="font-bold text-neutral-200 flex items-center gap-1.5">
                <Code2 className="h-3.5 w-3.5 text-[#facc15]" />
                <span>Comportement avec les Iframes :</span>
              </span>
              <div className="space-y-2">
                {(
                  [
                    {
                      id: 'block_all',
                      label: 'Bloquer le site ET les Iframes',
                      desc: 'Pause totale partout (navigation directe + intégrations)',
                    },
                    {
                      id: 'block_only_iframes',
                      label: 'Bloquer UNIQUEMENT les Iframes',
                      desc: 'Le site reste ouvert en accès direct, seules les pages Iframe sont bloquées',
                    },
                    {
                      id: 'allow_iframes',
                      label: 'Autoriser les Iframes (bloquer le site direct)',
                      desc: 'Seul l’accès direct est mis en pause, les intégrations Iframe continuent',
                    },
                  ] as { id: IframePolicy; label: string; desc: string }[]
                ).map((pol) => (
                  <button
                    key={pol.id}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, iframePolicy: pol.id }))}
                    className={`w-full p-3 rounded-xl border text-left transition-colors ${
                      draft.iframePolicy === pol.id
                        ? 'border-[#facc15] bg-[#facc15]/10 text-white'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="font-bold">{pol.label}</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">{pol.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 4. IP TARGETING & ADMIN BYPASS */}
          <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] p-5 sm:p-6 space-y-4 text-xs">
            <div className="border-b border-neutral-800/80 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Globe className="h-4 w-4 text-[#facc15]" />
                <span>4. Filtrage par Adresses IP & Admin</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {(
                [
                  { id: 'all', label: 'Toutes les IP bloquées' },
                  { id: 'except_list', label: 'Bloquer toutes les IP SAUF la liste blanche ci-dessous' },
                  { id: 'only_list', label: 'Bloquer UNIQUEMENT les IP listées ci-dessous' },
                ] as { id: IpPolicyMode; label: string }[]
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      ipPolicy: { ...prev.ipPolicy, mode: mode.id },
                    }))
                  }
                  className={`px-3 py-2.5 rounded-xl border text-left font-semibold transition-colors ${
                    draft.ipPolicy.mode === mode.id
                      ? 'border-[#facc15] bg-[#facc15]/10 text-white'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {draft.ipPolicy.mode !== 'all' && (
              <div className="space-y-2.5 pt-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newIpInput}
                    onChange={(e) => setNewIpInput(e.target.value)}
                    placeholder="Ex : 82.64.12.34"
                    className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-white font-mono focus:border-[#facc15] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleDetectIp}
                    disabled={isDetectingIp}
                    className="px-3 py-2 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-neutral-200 font-semibold shrink-0"
                  >
                    {isDetectingIp ? '...' : 'Mon IP'}
                  </button>
                  <button
                    type="button"
                    onClick={handleAddTargetIp}
                    className="px-3 py-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black font-bold shrink-0 inline-flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Ajouter</span>
                  </button>
                </div>

                <div className="max-h-32 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950/70 divide-y divide-neutral-800/70">
                  {draft.ipPolicy.ips.length === 0 ? (
                    <p className="p-3 text-center text-neutral-500 font-mono">
                      Aucune IP dans la liste.
                    </p>
                  ) : (
                    draft.ipPolicy.ips.map((ip) => (
                      <div key={ip} className="flex items-center justify-between px-3 py-2 font-mono">
                        <span className="text-neutral-200">{ip}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTargetIp(ip)}
                          className="text-neutral-500 hover:text-[#ef4444]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Live Diagnostic Card for Device / Wi-Fi IP Exemption */}
            <div className="p-3 rounded-xl border border-neutral-800/90 bg-neutral-950/90 space-y-1.5 text-[11px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-neutral-400">
                  Appareil détecté :{' '}
                  <strong className="text-white uppercase font-mono">{detectedDevice}</strong>
                </span>
                <span className="text-neutral-400">
                  IP publique :{' '}
                  <strong className="text-white font-mono">
                    {currentClientIp || 'En cours de détection'}
                  </strong>
                </span>
              </div>
              {isCurrentIpTrusted && (
                <div className="flex items-start gap-1.5 text-amber-300 pt-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Votre IP actuelle figure dans vos <strong>IPs de confiance Admin</strong>.{' '}
                    {draft.ipPolicy.exemptTrustedAdminIps
                      ? 'Tout autre appareil (ex: smartphone) sur le même Wi-Fi sera aussi exempté tant que l’option ci-dessous est cochée.'
                      : 'L’exemption IP Admin est désactivée : même ce réseau Wi-Fi sera bloqué selon vos règles.'}
                  </span>
                </div>
              )}
            </div>

            <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-950 cursor-pointer">
              <div>
                <span className="font-semibold text-neutral-200 block">Exempter les IP de confiance Admin</span>
                <span className="text-[11px] text-neutral-400">
                  {trustedIps.length} IP(s) de confiance enregistrée(s) — Attention au Wi-Fi partagé !
                </span>
              </div>
              <input
                type="checkbox"
                checked={draft.ipPolicy.exemptTrustedAdminIps}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    ipPolicy: { ...prev.ipPolicy, exemptTrustedAdminIps: e.target.checked },
                  }))
                }
                className="h-4 w-4 accent-[#10b981]"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-950 cursor-pointer">
              <div>
                <span className="font-semibold text-neutral-200 block">Bypass Administrateur (2FA déverrouillée)</span>
                <span className="text-[11px] text-neutral-400">
                  Permet à l'admin connecté par A2F d'accéder au site même en pause
                </span>
              </div>
              <input
                type="checkbox"
                checked={draft.allowAdminBypass}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, allowAdminBypass: e.target.checked }))
                }
                className="h-4 w-4 accent-[#facc15]"
              />
            </label>

            {/* Primary Save Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => handleSaveAndApply(true)}
                disabled={isSaving}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-extrabold transition-colors disabled:opacity-50"
              >
                <AlertTriangle className="h-4 w-4" />
                <span>
                  {draft.scheduleType === 'immediate'
                    ? 'Enregistrer & Mettre en pause'
                    : 'Enregistrer & Lancer la planification'}
                </span>
              </button>

              {draft.enabled && (
                <button
                  type="button"
                  onClick={() => handleSaveAndApply(false)}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[#10b981]/40 bg-[#10b981]/15 hover:bg-[#10b981]/25 text-[#10b981] text-xs font-bold transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Mettre En Ligne</span>
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
