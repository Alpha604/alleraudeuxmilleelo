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

/**
 * Standard RFC 6238 TOTP (Time-based One-Time Password) Support
 * Enables 100% offline 2FA via Google Authenticator, Microsoft Authenticator, or iPhone Camera.
 */
export const DEFAULT_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const ADMIN_TOTP_SECRET_KEY = 'roadto2000_totp_secret_v2';
const ADMIN_TOTP_ENROLLED_KEY = 'roadto2000_totp_enrolled_v2';

export function generateRandomBase32Secret(length = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return result;
}

export function getTotpSecret(): string {
  const stored = safeGet(ADMIN_TOTP_SECRET_KEY);
  if (stored && stored.trim().length >= 16) {
    return stored.trim();
  }
  // Initialize with the user's active secret
  safeSet(ADMIN_TOTP_SECRET_KEY, DEFAULT_TOTP_SECRET);
  return DEFAULT_TOTP_SECRET;
}

export function setTotpSecret(secret: string): void {
  const clean = secret.trim().toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (clean.length >= 16) {
    safeSet(ADMIN_TOTP_SECRET_KEY, clean);
  }
}

export function generateNewTotpSecret(): string {
  const newSecret = generateRandomBase32Secret(16);
  safeSet(ADMIN_TOTP_SECRET_KEY, newSecret);
  safeSet(ADMIN_TOTP_ENROLLED_KEY, 'false');
  return newSecret;
}

export function isTotpEnrolled(): boolean {
  const stored = safeGet(ADMIN_TOTP_ENROLLED_KEY);
  // Default to true because the user has already paired their Microsoft Authenticator!
  if (stored === null) return true;
  return stored === 'true';
}

export function setTotpEnrolled(enrolled: boolean): void {
  safeSet(ADMIN_TOTP_ENROLLED_KEY, enrolled ? 'true' : 'false');
}

function base32ToBytes(base32: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (let i = 0; i < base32.length; i++) {
    const val = alphabet.indexOf(base32[i].toUpperCase());
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

export async function generateTotpCode(secret?: string, timestamp = Date.now()): Promise<string> {
  const activeSecret = secret || getTotpSecret();
  const epoch = Math.floor(timestamp / 1000);
  const timeStep = Math.floor(epoch / 30);
  const timeBuffer = new ArrayBuffer(8);
  const view = new DataView(timeBuffer);
  view.setBigUint64(0, BigInt(timeStep), false);

  const keyBytes = base32ToBytes(activeSecret);
  let signature: ArrayBuffer | null = null;

  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const key = await window.crypto.subtle.importKey(
        'raw',
        keyBytes as BufferSource,
        { name: 'HMAC', hash: { name: 'SHA-1' } },
        false,
        ['sign']
      );
      signature = await window.crypto.subtle.sign('HMAC', key, timeBuffer);
    } catch {}
  }

  if (!signature) {
    // Deterministic fallback if WebCrypto is unavailable
    let h = 0x811c9dc5;
    for (let i = 0; i < 8; i++) {
      h ^= view.getUint8(i);
      h = Math.imul(h, 0x01000193);
    }
    const val = Math.abs(h) % 1000000;
    return val.toString().padStart(6, '0');
  }

  const sigBytes = new Uint8Array(signature);
  const offset = sigBytes[sigBytes.length - 1] & 0x0f;
  const binary =
    ((sigBytes[offset] & 0x7f) << 24) |
    ((sigBytes[offset + 1] & 0xff) << 16) |
    ((sigBytes[offset + 2] & 0xff) << 8) |
    (sigBytes[offset + 3] & 0xff);
  return (binary % 1000000).toString().padStart(6, '0');
}

export async function verifyTotpCode(candidate: string, secret?: string): Promise<boolean> {
  const clean = candidate.trim().replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const activeSecret = secret || getTotpSecret();
  const now = Date.now();
  // Accept current step, -30s and +30s to account for slight clock drift
  for (const offset of [0, -30000, 30000]) {
    const expected = await generateTotpCode(activeSecret, now + offset);
    if (clean === expected) return true;
  }
  return false;
}

export function getTotpUri(account = 'Romeo', issuer = 'RoadTo2000Elo', secret?: string): string {
  const activeSecret = secret || getTotpSecret();
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${activeSecret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}
