/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  QrCode,
  ShieldAlert,
  Smartphone,
  X,
} from 'lucide-react';
import {
  generateQrCodeDataUrl,
  generateSessionValidationCode,
  getMobileAuthUrl,
  getServerInfo,
  setAdminSession,
} from '../utils/security';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionTitle?: string;
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning') => void;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  actionTitle = 'Accès aux fonctions sensibles',
  onShowMessage,
}) => {
  const [sessionId] = useState<string>(() => `auth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [mobileUrl, setMobileUrl] = useState<string>('');
  const [codeOrPassword, setCodeOrPassword] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [mobileScanningInfo, setMobileScanningInfo] = useState<{
    ipPrefix: string;
    timestamp: number;
  } | null>(null);

  const unlockedRef = React.useRef(false);

  const handleUnlockSuccess = React.useCallback(() => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    setIsUnlocked(true);
    setAdminSession();
    onShowMessage('Authentification réussie ! Session administrateur active.', 'success');
    setTimeout(() => {
      onSuccess();
      onClose();
    }, 1100);
  }, [onSuccess, onClose, onShowMessage]);

  const expectedMobileCode = generateSessionValidationCode(sessionId);

  // Generate QR code and initialize server session on open
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    unlockedRef.current = false;

    // 1. Register session on the backend server
    fetch('/api/auth/session/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});

    // 2. Compute reachable mobile URL (use LAN IP if running on localhost)
    async function setupMobileUrl() {
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
      const dataUrl = await generateQrCodeDataUrl(url);
      if (isMounted) setQrDataUrl(dataUrl);
    }

    setupMobileUrl();

    return () => {
      isMounted = false;
    };
  }, [isOpen, sessionId]);

  // Listen for real-time mobile scan events and remote unlock via Server SSE, Polling, and BroadcastChannel
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    let sse: EventSource | null = null;
    let pollTimer: any = null;

    // 1. Instant Real-Time Push via Server-Sent Events (SSE)
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
              handleUnlockSuccess();
            }
          } catch {}
        };
      }
    } catch {}

    // 2. Ultra-reliable Polling every 750ms as solid guarantee across all networks & proxies
    const pollStatus = async () => {
      if (!isMounted || unlockedRef.current) return;
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
            handleUnlockSuccess();
          }
        }
      } catch {}
    };

    pollTimer = setInterval(pollStatus, 750);

    // 3. Local BroadcastChannel (immediate in-browser tabs)
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
            handleUnlockSuccess();
          }
        };
      }
    } catch {}

    // 4. LocalStorage event
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
        handleUnlockSuccess();
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
  }, [isOpen, sessionId, handleUnlockSuccess]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const input = codeOrPassword.trim();

    if (!input) {
      setErrorMessage('Veuillez scanner le QR Code avec votre téléphone ou saisir le code mobile à 6 chiffres.');
      return;
    }

    setIsVerifying(true);

    try {
      // Strictly verify against the 6-digit session code generated on the smartphone
      if (input === expectedMobileCode) {
        handleUnlockSuccess();
        return;
      }

      // Explicitly reject direct password entry on PC as requested by security policy
      setErrorMessage(
        'Accès refusé : la saisie du mot de passe sur PC est désactivée. Vous devez obligatoirement valider l\'accès depuis votre smartphone ou saisir le code mobile à 6 chiffres affiché sur votre téléphone.'
      );
    } catch {
      setErrorMessage('Une erreur est survenue lors de la vérification.');
    } finally {
      setIsVerifying(false);
    }
  };

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
              <span>Authentification 2FA Téléphone Requise</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              Pour déverrouiller <strong className="text-amber-300">{actionTitle}</strong>, confirmez votre identité avec votre smartphone.
            </p>
          </div>
        </div>

        {isUnlocked ? (
          <div className="p-8 text-center space-y-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl animate-in zoom-in-95">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
            <h4 className="text-sm font-bold text-emerald-300">Accès Administrateur Déverrouillé !</h4>
            <p className="text-xs text-neutral-400">Application des droits d'administration en cours...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Step 1: QR Code & Mobile Instructions */}
            <div className="flex flex-col sm:flex-row items-center gap-6 rounded-xl border border-neutral-800/80 bg-neutral-950/80 p-4 sm:p-5">
              <div className="relative shrink-0 flex items-center justify-center rounded-xl bg-white p-2.5 shadow-lg border border-neutral-700">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
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
                  <Smartphone className="h-4 w-4" />
                  <span>Validation Strictement Mobile</span>
                </div>
                <ol className="space-y-2 text-neutral-300/90 list-decimal list-inside leading-relaxed text-[11px]">
                  <li>
                    Ouvrez l'<strong>appareil photo</strong> de votre téléphone et scannez ce QR Code.
                  </li>
                  <li>
                    Si votre téléphone partage votre <strong>IP de confiance</strong>, l'accès est <strong>instantané</strong> sans mot de passe !
                  </li>
                  <li>
                    Sinon, validez votre mot de passe directement sur votre téléphone.
                  </li>
                </ol>

                {mobileScanningInfo ? (
                  <div className="pt-1.5 p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-200 animate-in fade-in space-y-1">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-white">
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                      </span>
                      <span>Téléphone connecté en direct !</span>
                    </div>
                    <p className="text-[10px] text-neutral-300 leading-snug">
                      Un téléphone est en cours de validation avec l'IP :{' '}
                      <strong className="font-mono text-amber-300 font-bold tracking-wider">{mobileScanningInfo.ipPrefix}</strong>
                    </p>
                  </div>
                ) : (
                  <div className="pt-1 flex items-center gap-2 text-[10px] text-amber-400/90 font-mono">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                    <span>En attente du scan par votre téléphone...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: 6-digit sync code input for cross-network verification */}
            <form onSubmit={handleVerify} className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-neutral-300">
                    Code d'activation mobile (6 chiffres)
                  </label>
                  <span className="text-[10px] text-amber-400/80 font-medium">Affiché sur votre smartphone</span>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={codeOrPassword}
                    onChange={(e) => setCodeOrPassword(e.target.value.replace(/\D/g, ''))}
                    placeholder="Entrez les 6 chiffres (ex: 489201)"
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-white placeholder-neutral-600 focus:border-amber-500 focus:outline-none font-mono tracking-wider"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-neutral-500">
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

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isVerifying || codeOrPassword.trim().length !== 6}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 px-5 py-2 text-xs font-bold transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] disabled:opacity-40"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>{isVerifying ? 'Vérification...' : 'Valider le code mobile'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
