/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Lock,
  QrCode,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Unlock,
  X,
} from 'lucide-react';
import {
  generateQrCodeDataUrl,
  generateSessionValidationCode,
  getMobileAuthUrl,
  getServerInfo,
  getTotpUri,
  getTrustedIps,
  setAdminSession,
  verifyTotpCode,
} from '../utils/security';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionTitle?: string;
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning') => void;
}

type ScanMode = 'web' | 'authenticator';

export const SecurityModal: React.FC<SecurityModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  actionTitle = 'Accès aux fonctions sensibles',
  onShowMessage,
}) => {
  const [sessionId] = useState<string>(() => `auth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const [scanMode, setScanMode] = useState<ScanMode>('web');
  const [webQrDataUrl, setWebQrDataUrl] = useState<string>('');
  const [totpQrDataUrl, setTotpQrDataUrl] = useState<string>('');
  const [mobileUrl, setMobileUrl] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [codeOrPassword, setCodeOrPassword] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  // Live status of mobile device interaction
  const [mobileScanningInfo, setMobileScanningInfo] = useState<{
    ipPrefix: string;
    timestamp: number;
  } | null>(null);

  // Live remote unlocking animation state on PC
  const [remoteUnlockingState, setRemoteUnlockingState] = useState<{
    isUnlocking: boolean;
    ipPrefix: string;
    step: number;
    message: string;
  } | null>(null);

  const unlockedRef = useRef(false);
  const remoteTriggeredRef = useRef(false);

  // Final successful unlock callback
  const completeUnlock = React.useCallback(() => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    setIsUnlocked(true);
    setAdminSession();
    onShowMessage('Authentification réussie ! Session administrateur active.', 'success');
    setTimeout(() => {
      onSuccess();
      onClose();
    }, 1200);
  }, [onSuccess, onClose, onShowMessage]);

  // Trigger smooth multi-step unlock animation on PC when remote unlock signal is received
  const startRemoteUnlockSequence = React.useCallback((ipPrefix?: string) => {
    if (remoteTriggeredRef.current || unlockedRef.current) return;
    remoteTriggeredRef.current = true;

    const deviceIp = ipPrefix || mobileScanningInfo?.ipPrefix || 'Appareil mobile';
    setRemoteUnlockingState({
      isUnlocking: true,
      ipPrefix: deviceIp,
      step: 1,
      message: 'Signal de déverrouillage capté depuis votre smartphone...',
    });

    // Step 2: Privilege validation
    setTimeout(() => {
      setRemoteUnlockingState({
        isUnlocking: true,
        ipPrefix: deviceIp,
        step: 2,
        message: 'Autorisation accordée · Synchronisation de la session...',
      });
    }, 850);

    // Step 3: PC screen unlocking
    setTimeout(() => {
      setRemoteUnlockingState({
        isUnlocking: true,
        ipPrefix: deviceIp,
        step: 3,
        message: 'Déverrouillage de cet ordinateur en cours...',
      });
    }, 1700);

    // Step 4: Finalize
    setTimeout(() => {
      completeUnlock();
    }, 2400);
  }, [mobileScanningInfo?.ipPrefix, completeUnlock]);

  const expectedMobileCode = generateSessionValidationCode(sessionId);

  // 1. Generate QR codes & initialize server session on open
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    unlockedRef.current = false;
    remoteTriggeredRef.current = false;

    // Register session on backend server with current trusted IPs list
    fetch('/api/auth/session/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        trustedIps: getTrustedIps(),
      }),
    }).catch(() => {});

    // Compute reachable mobile URL (use actual origin without broken ais-pre replacement!)
    async function setupQrCodes() {
      let baseOrigin = typeof window !== 'undefined' ? window.location.origin : '';

      if (
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ) {
        const info = await getServerInfo();
        if (info?.lanIp && info.lanIp !== '127.0.0.1') {
          baseOrigin = `http://${info.lanIp}:${info.port || 3000}`;
        }
      }

      const url = getMobileAuthUrl(sessionId, baseOrigin);
      if (!isMounted) return;
      setMobileUrl(url);

      // Web Auth QR code
      const webDataUrl = await generateQrCodeDataUrl(url);
      if (isMounted) setWebQrDataUrl(webDataUrl);

      // Universal TOTP Authenticator QR code (100% offline fallback)
      const totpUri = getTotpUri('Admin', 'RoadTo2000');
      const totpDataUrl = await generateQrCodeDataUrl(totpUri);
      if (isMounted) setTotpQrDataUrl(totpDataUrl);
    }

    setupQrCodes();

    return () => {
      isMounted = false;
    };
  }, [isOpen, sessionId]);

  // 2. Multi-channel listener for instant mobile scan & remote unlock
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    let sse: EventSource | null = null;
    let pollTimer: any = null;

    // A. Instant Real-Time Push via Server-Sent Events (SSE)
    try {
      if (typeof window !== 'undefined' && 'EventSource' in window) {
        sse = new EventSource(`/api/auth/session/events?sessionId=${encodeURIComponent(sessionId)}`);
        sse.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.scanning) {
              setMobileScanningInfo({
                ipPrefix: data.ipPrefix || '***',
                timestamp: Date.now(),
              });
            }
            if (data.unlocked) {
              startRemoteUnlockSequence(data.ipPrefix);
            }
          } catch {}
        };
      }
    } catch {}

    // B. Ultra-reliable polling every 250ms across all networks & proxies
    const pollStatus = async () => {
      if (!isMounted || unlockedRef.current || remoteTriggeredRef.current) return;
      try {
        const res = await fetch(`/api/auth/session/status?sessionId=${encodeURIComponent(sessionId)}`);
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.scanning) {
            setMobileScanningInfo((prev) => {
              if (prev && prev.ipPrefix === data.ipPrefix) return prev;
              return {
                ipPrefix: data.ipPrefix || '***',
                timestamp: Date.now(),
              };
            });
          }
          if (data.unlocked) {
            startRemoteUnlockSequence(data.ipPrefix);
          }
        }
      } catch {}
    };

    pollStatus();
    pollTimer = setInterval(pollStatus, 250);

    // C. Local BroadcastChannel (cross-tab / same machine)
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('roadto2000_auth_channel');
        bc.onmessage = (event) => {
          if (!isMounted) return;
          if (event.data?.type === 'MOBILE_SCAN_STARTED' && event.data?.sessionId === sessionId) {
            setMobileScanningInfo({
              ipPrefix: event.data.ipPrefix || '***',
              timestamp: Date.now(),
            });
          }
          if (event.data?.type === 'MOBILE_UNLOCKED' && event.data?.sessionId === sessionId) {
            startRemoteUnlockSequence(event.data.ipPrefix);
          }
        };
      }
    } catch {}

    // D. LocalStorage event listener
    const handleStorageEvent = (e: StorageEvent) => {
      if (!isMounted) return;
      if (e.key === `roadto2000_scanning_${sessionId}` && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setMobileScanningInfo({
            ipPrefix: parsed.ipPrefix || '***',
            timestamp: parsed.timestamp || Date.now(),
          });
        } catch {}
      }
      if (e.key === `roadto2000_unlocked_${sessionId}` && e.newValue === 'true') {
        startRemoteUnlockSequence();
      }
    };

    window.addEventListener('storage', handleStorageEvent);

    return () => {
      isMounted = false;
      if (pollTimer) clearInterval(pollTimer);
      if (sse) sse.close();
      if (bc) bc.close();
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [isOpen, sessionId, startRemoteUnlockSequence]);

  // Handle 6-digit code verification (Session code or TOTP Authenticator code)
  const handleVerify = async (e?: React.FormEvent, directCode?: string) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    const input = (directCode !== undefined ? directCode : codeOrPassword).trim().replace(/\D/g, '');

    if (!input) {
      setErrorMessage('Veuillez scanner le QR Code avec votre smartphone ou saisir le code d\'activation à 6 chiffres.');
      return;
    }

    if (input.length !== 6) {
      setErrorMessage('Le code d\'activation mobile doit comporter exactement 6 chiffres.');
      return;
    }

    setIsVerifying(true);

    try {
      // 1. Check against deterministic 6-digit session validation code
      if (input === expectedMobileCode) {
        startRemoteUnlockSequence('Code mobile validé');
        return;
      }

      // 2. Check against TOTP (Google Authenticator / Apple Passwords)
      const isTotpMatch = await verifyTotpCode(input);
      if (isTotpMatch) {
        startRemoteUnlockSequence('Code Authenticator validé');
        return;
      }

      // 3. Check with backend server verify-code endpoint
      const serverRes = await fetch('/api/auth/session/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, code: input }),
      });

      if (serverRes.ok) {
        const data = await serverRes.json();
        if (data.unlocked) {
          startRemoteUnlockSequence(data.reason === 'totp_authenticator' ? 'Authenticator' : 'Code serveur');
          return;
        }
      }

      setErrorMessage('Code à 6 chiffres incorrect. Saisissez le code affiché sur votre smartphone ou dans votre application Authenticator.');
    } catch {
      setErrorMessage('Une erreur est survenue lors de la vérification.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCodeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCodeOrPassword(cleaned);
    setErrorMessage('');
    // Auto-verify as soon as 6 digits are typed!
    if (cleaned.length === 6) {
      handleVerify(undefined, cleaned);
    }
  };

  const activeQrUrl = scanMode === 'web' ? webQrDataUrl : totpQrDataUrl;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-neutral-800"
          title="Fermer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3.5 pr-8">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>Authentification 2FA Smartphone</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              Pour déverrouiller <strong className="text-amber-300">{actionTitle}</strong>, confirmez votre identité depuis votre smartphone.
            </p>
          </div>
        </div>

        {/* LIVE STATE 1: Remote Unlock in Progress Animation (PC visibly reacts!) */}
        {remoteUnlockingState && !isUnlocked ? (
          <div className="p-6 text-center space-y-4 bg-gradient-to-b from-amber-500/15 via-emerald-950/40 to-emerald-900/40 border border-emerald-500/40 rounded-2xl shadow-xl animate-in zoom-in-95 duration-300">
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/25 animate-ping" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/25 border border-emerald-500/60 text-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.4)]">
                <Unlock className="h-7 w-7 animate-pulse text-emerald-400" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold uppercase tracking-wider border border-emerald-500/30">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Appareil Distant Connecté</span>
              </div>
              <h4 className="text-base font-bold text-white pt-1">
                Déverrouillage en direct par votre téléphone !
              </h4>
              <p className="text-xs text-neutral-300 leading-relaxed font-mono">
                Source : <strong className="text-amber-300">{remoteUnlockingState.ipPrefix}</strong>
              </p>
            </div>

            {/* Visual Step Progress */}
            <div className="space-y-2 pt-2 max-w-sm mx-auto">
              <div className="h-2.5 w-full bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-emerald-400 to-emerald-300 transition-all duration-700 ease-out"
                  style={{ width: `${(remoteUnlockingState.step / 3) * 100}%` }}
                />
              </div>
              <p className="text-xs text-emerald-300/90 font-medium animate-pulse">
                {remoteUnlockingState.message}
              </p>
            </div>
          </div>
        ) : isUnlocked ? (
          /* LIVE STATE 2: Unlocked Success confirmation */
          <div className="p-8 text-center space-y-3 bg-emerald-950/30 border border-emerald-600/50 rounded-2xl animate-in zoom-in-95">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
            <h4 className="text-base font-bold text-emerald-300">Session Administrateur Active !</h4>
            <p className="text-xs text-neutral-400">Application des droits d'administration en cours...</p>
          </div>
        ) : (
          /* NORMAL STATE: QR Code, Mode Selector, Waiting status & Activation Code Form */
          <div className="space-y-5">
            {/* Mode Switcher: Web Mobile vs Google Authenticator */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-neutral-950 border border-neutral-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setScanMode('web')}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg transition-all ${
                  scanMode === 'web'
                    ? 'bg-amber-500 text-neutral-950 shadow font-bold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>Page Web Mobile</span>
              </button>
              <button
                type="button"
                onClick={() => setScanMode('authenticator')}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg transition-all ${
                  scanMode === 'authenticator'
                    ? 'bg-amber-500 text-neutral-950 shadow font-bold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Google Authenticator</span>
              </button>
            </div>

            {/* Step 1: QR Code & Instructions */}
            <div className="flex flex-col sm:flex-row items-center gap-5 rounded-xl border border-neutral-800/80 bg-neutral-950/80 p-4 sm:p-5">
              <div className="relative shrink-0 flex items-center justify-center rounded-xl bg-white p-2.5 shadow-lg border border-neutral-700">
                {activeQrUrl ? (
                  <img
                    src={activeQrUrl}
                    alt="QR Code de connexion mobile 2FA"
                    className="h-36 w-36 sm:h-40 sm:w-40 object-contain rounded"
                  />
                ) : (
                  <div className="h-36 w-36 sm:h-40 sm:w-40 flex items-center justify-center text-neutral-400">
                    <QrCode className="h-10 w-10 animate-pulse text-amber-500" />
                  </div>
                )}
              </div>

              <div className="space-y-2.5 text-xs text-neutral-300">
                <div className="flex items-center gap-2 text-amber-400 font-semibold uppercase tracking-wider text-[11px]">
                  {scanMode === 'web' ? <Smartphone className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  <span>{scanMode === 'web' ? 'Scan Direct Par Appareil Photo' : '100% Hors-Ligne Sans Connexion'}</span>
                </div>

                {scanMode === 'web' ? (
                  <ol className="space-y-1.5 text-neutral-300/90 list-decimal list-inside leading-relaxed text-[11px]">
                    <li>
                      Scannez ce QR Code avec l'<strong>appareil photo</strong> de votre téléphone.
                    </li>
                    <li>
                      Si votre téléphone partage votre <strong>IP de confiance</strong>, le déverrouillage est instantané !
                    </li>
                    <li>
                      Sinon, tapez votre mot de passe et cliquez sur <strong>Déverrouiller à distance</strong>.
                    </li>
                  </ol>
                ) : (
                  <ol className="space-y-1.5 text-neutral-300/90 list-decimal list-inside leading-relaxed text-[11px]">
                    <li>
                      Ouvrez <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> ou l'<strong>Appareil Photo iPhone</strong>.
                    </li>
                    <li>
                      Scannez ce QR Code pour obtenir votre code à 6 chiffres instantanément.
                    </li>
                    <li>
                      Saisissez les 6 chiffres ci-dessous pour déverrouiller cet ordinateur.
                    </li>
                  </ol>
                )}

                {/* Real-Time Live Presence Indicator (in web mode) */}
                {scanMode === 'web' && (
                  mobileScanningInfo ? (
                    <div className="pt-1.5 p-2 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-200 animate-in fade-in space-y-0.5">
                      <div className="flex items-center gap-2 text-[11px] font-bold text-white">
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                        </span>
                        <span>📱 Téléphone connecté en direct !</span>
                      </div>
                      <p className="text-[10px] text-neutral-300 leading-snug">
                        Validation en cours avec l'IP :{' '}
                        <strong className="font-mono text-amber-300 font-bold tracking-wider">{mobileScanningInfo.ipPrefix}</strong>
                      </p>
                    </div>
                  ) : (
                    <div className="pt-1 flex items-center gap-2 text-[10px] text-amber-400/90 font-mono">
                      <Radio className="h-3 w-3 animate-pulse text-amber-400" />
                      <span>En attente du scan par votre smartphone...</span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Mobile Link Helper (Strictly no simulator link on PC as requested!) */}
            {mobileUrl && scanMode === 'web' && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-neutral-950/90 border border-neutral-800 text-[11px]">
                <div className="flex items-center gap-1.5 text-neutral-400 truncate">
                  <Smartphone className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="text-neutral-400 font-medium">Lien d'accès smartphone :</span>
                  <span className="font-mono text-[10px] text-neutral-500 truncate">{mobileUrl.replace(/^https?:\/\//, '').split('&')[0]}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (navigator?.clipboard) {
                      navigator.clipboard.writeText(mobileUrl);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 2000);
                    }
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition-colors shrink-0 font-medium text-[11px]"
                >
                  {copiedUrl ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedUrl ? 'Copié !' : 'Copier lien mobile'}</span>
                </button>
              </div>
            )}

            {/* Step 2: 6-digit Activation Code Manual Input */}
            <form onSubmit={(e) => handleVerify(e)} className="space-y-3 pt-1 border-t border-neutral-800/80">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-200">
                    Code d'activation mobile (6 chiffres)
                  </label>
                  <span className="text-[10px] text-amber-400 font-medium">
                    {scanMode === 'web' ? 'Affiché sur votre smartphone' : 'Affiché dans Google Authenticator'}
                  </span>
                </div>

                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Saisissez les 6 chiffres affichés sur votre smartphone (validation instantanée) :
                </p>

                <div className="relative pt-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={codeOrPassword}
                    onChange={handleCodeInputChange}
                    placeholder="••••••"
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-xl font-mono font-bold tracking-[0.4em] text-center text-amber-300 placeholder-neutral-700 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-neutral-500 pt-1">
                    <KeyRound className="h-4 w-4" />
                  </div>
                </div>

                {errorMessage && (
                  <div className="flex items-start gap-1.5 text-xs text-rose-400 font-medium pt-1 leading-snug">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[10px] text-neutral-500 italic">
                  Se déverrouille automatiquement dès 6 chiffres saisis
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifying || codeOrPassword.trim().length !== 6}
                    className="flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 px-4 py-2 text-xs font-bold transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] disabled:opacity-40"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span>{isVerifying ? 'Vérification...' : 'Valider le code'}</span>
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
