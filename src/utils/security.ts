/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import QRCode from 'qrcode';

const ADMIN_AUTH_KEY = 'roadto2000_admin_session_v2';
const ADMIN_PASSWORD_HASH_KEY = 'roadto2000_admin_pwd_hash_v3';
const ADMIN_TRUSTED_IP_KEY = 'roadto2000_trusted_ip_v1';
const ADMIN_TRUSTED_IPS_KEY = 'roadto2000_trusted_ips_v2';
const DEFAULT_MASTER_PASSWORD = 'alpha604';

// 30 minutes session duration
export const SESSION_DURATION_MS = 30 * 60 * 1000;

// Memory fallback for SSR / testing environments
const memoryStore: Record<string, string> = {};

// Safe Storage helpers
function safeGet(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function safeSet(key: string, val: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, val);
    }
  } catch {}
  memoryStore[key] = val;
}

function safeRemove(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {}
  delete memoryStore[key];
}

/**
 * SHA-256 hashing using Web Crypto API with case-insensitive normalization
 */
export async function hashPassword(password: string): Promise<string> {
  const normalized = password.trim().toLowerCase();
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
 * Retrieves the stored password hash or sets the default password hash (alpha604)
 */
export async function getStoredPasswordHash(): Promise<string> {
  const stored = safeGet(ADMIN_PASSWORD_HASH_KEY);
  if (stored) return stored;
  const defaultHash = await hashPassword(DEFAULT_MASTER_PASSWORD);
  safeSet(ADMIN_PASSWORD_HASH_KEY, defaultHash);
  return defaultHash;
}

/**
 * Updates the master admin password (case-insensitive)
 */
export async function updateAdminPassword(newPassword: string): Promise<boolean> {
  if (!newPassword || newPassword.trim().length < 4) return false;
  const newHash = await hashPassword(newPassword.trim().toLowerCase());
  safeSet(ADMIN_PASSWORD_HASH_KEY, newHash);
  return true;
}

/**
 * Verifies if entered password matches master admin password (case-insensitive)
 */
export async function verifyAdminPassword(candidate: string): Promise<boolean> {
  const clean = candidate.trim().toLowerCase();
  if (!clean) return false;
  const candidateHash = await hashPassword(clean);
  const targetHash = await getStoredPasswordHash();
  return candidateHash === targetHash;
}

/**
 * Get list of configured trusted IP addresses
 */
export function getTrustedIps(): string[] {
  try {
    const raw = safeGet(ADMIN_TRUSTED_IPS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim()).filter((s) => s.length >= 7);
      }
    }
    // Migration from single IP v1
    const legacy = safeGet(ADMIN_TRUSTED_IP_KEY);
    if (legacy && legacy.trim().length >= 7) {
      const migrated = [legacy.trim()];
      safeSet(ADMIN_TRUSTED_IPS_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {}
  return [];
}

/**
 * Set full list of configured trusted IP addresses
 */
export function setTrustedIps(ips: string[]): void {
  const clean = Array.from(new Set(ips.map((s) => s.trim()).filter((s) => s.length >= 7)));
  safeSet(ADMIN_TRUSTED_IPS_KEY, JSON.stringify(clean));

  // Sync to backend server
  try {
    if (typeof fetch !== 'undefined') {
      fetch('/api/auth/trusted-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ips: clean }),
      }).catch(() => {});
    }
  } catch {}
}

/**
 * Add a new trusted IP address
 */
export function addTrustedIp(ip: string): boolean {
  const clean = ip.trim();
  if (clean.length < 7) return false;
  const current = getTrustedIps();
  if (current.includes(clean)) return true;
  setTrustedIps([...current, clean]);
  return true;
}

/**
 * Remove a specific trusted IP address
 */
export function removeTrustedIp(ip: string): void {
  const clean = ip.trim();
  const current = getTrustedIps();
  setTrustedIps(current.filter((item) => item !== clean));
}

/**
 * Checks whether an IP matches any configured trusted IP
 */
export function isIpTrusted(candidateIp: string, allowedIps?: string[]): boolean {
  const clean = candidateIp.trim();
  if (!clean) return false;
  const pool = allowedIps && allowedIps.length > 0 ? allowedIps : getTrustedIps();
  return pool.some((ip) => ip.trim() === clean);
}

/**
 * Formats an IP address by masking the end for privacy while showing the prefix
 * (e.g. "82.64.12.34" -> "82.64.***")
 */
export function formatIpPrefix(ip: string): string {
  const clean = ip.trim();
  if (!clean) return '***';
  if (clean.includes('.')) {
    // IPv4
    const parts = clean.split('.');
    if (parts.length >= 2) {
      return `${parts[0]}.${parts[1]}.***`;
    }
  } else if (clean.includes(':')) {
    // IPv6
    const parts = clean.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}:***`;
    }
  }
  return clean.substring(0, Math.min(clean.length, 6)) + '***';
}

/**
 * Legacy getter for single IP
 */
export function getTrustedIp(): string {
  const ips = getTrustedIps();
  return ips.length > 0 ? ips[0] : '';
}

/**
 * Legacy setter for single IP
 */
export function setTrustedIp(ip: string): void {
  if (ip.trim()) {
    addTrustedIp(ip);
  } else {
    setTrustedIps([]);
  }
}

export async function getClientIp(): Promise<string> {
  // 1. Fast local server endpoint
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const internalRes = await fetch('/api/auth/client-ip', { signal: controller.signal });
    clearTimeout(timer);
    if (internalRes.ok) {
      const data = await internalRes.json();
      if (data.ip && typeof data.ip === 'string' && data.ip.trim().length >= 7) {
        return data.ip.trim();
      }
    }
  } catch {}

  // 2. Fast public IP fallback
  const endpoints = [
    'https://api.ipify.org?format=json',
    'https://api64.ipify.org?format=json',
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const ip = data.ip || data.ip_addr;
        if (ip && typeof ip === 'string' && ip.trim().length >= 7) {
          return ip.trim();
        }
      }
    } catch {}
  }
  return '';
}

/**
 * Fetches local network info from the backend
 */
export async function getServerInfo(): Promise<{ lanIp: string; port: number } | null> {
  try {
    const res = await fetch('/api/auth/server-info');
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return null;
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
 * This is displayed on the smartphone after entering the correct password (or IP auto-auth),
 * allowing the desktop session to be validated immediately even across isolated networks!
 */
export function generateSessionValidationCode(sessionId: string): string {
  let sum = 0;
  for (let i = 0; i < sessionId.length; i++) {
    sum = (sum * 31 + sessionId.charCodeAt(i)) % 900000;
  }
  const code = (100000 + (sum % 900000)).toString();
  return code;
}

/**
 * Generates the clean URL that the smartphone opens when scanning the QR code.
 * Strictly avoids putting trusted IPs in query parameters to prevent URL spoofing!
 */
export function getMobileAuthUrl(sessionId: string, baseOrigin?: string): string {
  let origin = baseOrigin || '';
  let path = '';
  if (typeof window !== 'undefined') {
    origin = baseOrigin || window.location.origin;
    path = window.location.pathname;
  }
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
    // In AI Studio Build preview or local dev, the app runs in preview mode: never block as third-party iframe embed
    const host = window.location.hostname.toLowerCase();
    if (
      host.includes('run.app') ||
      host.includes('localhost') ||
      host === '127.0.0.1' ||
      host.includes('webcontainer') ||
      host.includes('googleusercontent.com') ||
      host.includes('aistudio')
    ) {
      return false;
    }
    return window.self !== window.top;
  } catch {
    return false;
  }
}
