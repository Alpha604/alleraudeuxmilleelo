/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import QRCode from 'qrcode';

const ADMIN_AUTH_KEY = 'roadto2000_admin_session_v2';
const ADMIN_PASSWORD_HASH_KEY = 'roadto2000_admin_pwd_hash_v2';
const ADMIN_TOTP_SECRET_KEY = 'roadto2000_totp_secret_v2';
const DEFAULT_MASTER_PASSWORD = '2000elo';

// 30 minutes session duration
export const SESSION_DURATION_MS = 30 * 60 * 1000;

// Safe Storage helpers
function safeGet(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {}
  return null;
}

function safeSet(key: string, val: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, val);
    }
  } catch {}
}

function safeRemove(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {}
}

/**
 * SHA-256 hashing using Web Crypto API with fallback
 */
export async function hashPassword(password: string): Promise<string> {
  const normalized = password.trim();
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(`road2000_salt_${normalized}`);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {}
  }
  // Simple deterministic hash fallback
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `hash_${(hash >>> 0).toString(16)}`;
}

/**
 * Retrieves the stored password hash or sets the default password hash (2000elo)
 */
export async function getStoredPasswordHash(): Promise<string> {
  const stored = safeGet(ADMIN_PASSWORD_HASH_KEY);
  if (stored) return stored;
  const defaultHash = await hashPassword(DEFAULT_MASTER_PASSWORD);
  safeSet(ADMIN_PASSWORD_HASH_KEY, defaultHash);
  return defaultHash;
}

/**
 * Updates the master admin password
 */
export async function updateAdminPassword(newPassword: string): Promise<boolean> {
  if (!newPassword || newPassword.trim().length < 4) return false;
  const newHash = await hashPassword(newPassword.trim());
  safeSet(ADMIN_PASSWORD_HASH_KEY, newHash);
  return true;
}

/**
 * Verifies if entered password matches master admin password
 */
export async function verifyAdminPassword(candidate: string): Promise<boolean> {
  const clean = candidate.trim();
  if (!clean) return false;
  const candidateHash = await hashPassword(clean);
  const targetHash = await getStoredPasswordHash();
  return candidateHash === targetHash;
}

/**
 * Checks whether the current admin session is valid and active
 */
export function isAdminSessionActive(): boolean {
  try {
    const raw = safeGet(ADMIN_AUTH_KEY);
    if (!raw) return false;
    const session = JSON.parse(raw);
    if (!session || !session.expiresAt) return false;
    const now = Date.now();
    if (now > session.expiresAt) {
      safeRemove(ADMIN_AUTH_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Sets an active admin session for the specified duration (default 30 mins)
 */
export function setAdminSession(durationMs = SESSION_DURATION_MS): void {
  const session = {
    authenticated: true,
    startedAt: Date.now(),
    expiresAt: Date.now() + durationMs,
  };
  safeSet(ADMIN_AUTH_KEY, JSON.stringify(session));

  // Broadcast to other tabs/windows if available
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bc = new BroadcastChannel('roadto2000_auth_channel');
      bc.postMessage({ type: 'AUTH_UNLOCKED', timestamp: Date.now() });
      bc.close();
    }
  } catch {}
}

/**
 * Revokes the admin session immediately (Lock Now)
 */
export function revokeAdminSession(): void {
  safeRemove(ADMIN_AUTH_KEY);
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bc = new BroadcastChannel('roadto2000_auth_channel');
      bc.postMessage({ type: 'AUTH_LOCKED', timestamp: Date.now() });
      bc.close();
    }
  } catch {}
}

/**
 * Computes a deterministic 6-digit confirmation token for a given session and timestamp.
 * This is displayed on the smartphone after entering the correct password, allowing the user
 * to validate the desktop session immediately even across different devices/networks!
 */
export function generateSessionValidationCode(sessionId: string): string {
  // 6-digit code derived from sessionId
  let sum = 0;
  for (let i = 0; i < sessionId.length; i++) {
    sum = (sum * 31 + sessionId.charCodeAt(i)) % 900000;
  }
  const code = (100000 + (sum % 900000)).toString();
  return code;
}

/**
 * Generates the full URL that the smartphone opens when scanning the QR code
 */
export function getMobileAuthUrl(sessionId: string): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  const path = window.location.pathname;
  return `${origin}${path}?mobile_auth=${encodeURIComponent(sessionId)}`;
}

/**
 * Generates an SVG Data URL QR code for a given text (URL)
 */
export async function generateQrCodeDataUrl(text: string): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width: 280,
      margin: 1.5,
      color: {
        dark: '#171717',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
    return dataUrl;
  } catch (err) {
    console.error('Failed to generate QR code:', err);
    return '';
  }
}

/**
 * Checks if the current page is running inside an iframe or explicitly in embed mode
 */
export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') === 'true' || params.get('mode') === 'iframe' || params.get('view') === 'readonly') {
      return true;
    }
    // Cross-origin iframe detection
    return window.self !== window.top;
  } catch {
    // If accessing window.top throws a security error, it is 100% inside a cross-origin iframe
    return true;
  }
}
