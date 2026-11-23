/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import QRCode from 'qrcode';
import { scheduleAccountsRegistryPush } from './accountsRegistryCloud';
import { safeApiFetch } from './backendApi';

const ADMIN_AUTH_KEY = 'roadto2000_admin_session_v2';
const ADMIN_PASSWORD_HASH_KEY = 'roadto2000_admin_pwd_hash_v3';
const ADMIN_TRUSTED_IP_KEY = 'roadto2000_trusted_ip_v1';
const ADMIN_TRUSTED_IPS_KEY = 'roadto2000_trusted_ips_v2';
const DEFAULT_MASTER_PASSWORD = 'alpha604';

// 24 hours session duration (expires after 24h unless user logs out)
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

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
    safeApiFetch('/api/auth/trusted-ips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ips: clean }),
    }).catch(() => {});
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
    const internalRes = await safeApiFetch('/api/auth/client-ip', { timeoutMs: 1200 });
    if (internalRes && internalRes.ok) {
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
    const res = await safeApiFetch('/api/auth/server-info', { timeoutMs: 2500 });
    if (res && res.ok) {
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
 * Checks if URL explicitly forces read-only embed mode.
 */
export function isExplicitReadOnlyEmbed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('embed') === 'true' ||
      params.get('mode') === 'iframe' ||
      params.get('view') === 'readonly'
    );
  } catch {
    return false;
  }
}

/**
 * Checks if the current page is running inside an external iframe or explicitly in embed mode.
 * Distinguishes AI Studio's top-level preview workbench from third-party external embeds.
 */
export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (isExplicitReadOnlyEmbed()) {
      return true;
    }

    const inFrame = window.self !== window.top;
    if (!inFrame) return false;

    let ancestorHost = '';
    try {
      const ancestors = (window.location as unknown as { ancestorOrigins?: DOMStringList }).ancestorOrigins;
      if (ancestors && ancestors.length > 0) {
        ancestorHost = String(ancestors[0] || '').toLowerCase();
      }
    } catch {}
    const referrer = (typeof document !== 'undefined' ? document.referrer || '' : '').toLowerCase();

    const isAiStudioParent = (val: string) =>
      val.includes('aistudio.google.com') ||
      val.includes('makersuite.google.com') ||
      val.includes('googleusercontent.com') ||
      val.includes('usercontent.goog') ||
      val.includes('google.com');

    if (isAiStudioParent(ancestorHost) || isAiStudioParent(referrer)) {
      return false;
    }

    const host = window.location.hostname.toLowerCase();
    // On run.app or localhost inside an unreadable/privacy-stripped parent without an external ancestor, assume preview unless explicit ?embed=true
    if (!ancestorHost && !referrer) {
      return false;
    }

    if ((host === 'localhost' || host === '127.0.0.1') && !ancestorHost) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Pure TypeScript SHA-1 & HMAC-SHA1 (RFC 3174 / RFC 2104 / RFC 6238)
 * Works deterministically in HTTP, HTTPS, iframes, mobile webviews, and Node without WebCrypto.
 */
function sha1Digest(message: Uint8Array): Uint8Array {
  const ml = message.length * 8;
  const withOneLen = message.length + 1;
  const zeroPadLen = (64 - ((withOneLen + 8) % 64)) % 64;
  const totalLen = withOneLen + zeroPadLen + 8;
  const padded = new Uint8Array(totalLen);
  padded.set(message, 0);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, Math.floor(ml / 0x100000000), false);
  view.setUint32(totalLen - 4, ml >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Int32Array(80);

  for (let i = 0; i < totalLen; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getInt32(i + j * 4, false);
    }
    for (let j = 16; j < 80; j++) {
      const n = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = (n << 1) | (n >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let j = 0; j < 80; j++) {
      let f = 0;
      let k = 0;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) | 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setInt32(0, h0, false);
  outView.setInt32(4, h1, false);
  outView.setInt32(8, h2, false);
  outView.setInt32(12, h3, false);
  outView.setInt32(16, h4, false);
  return out;
}

function hmacSha1(keyBytes: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64;
  let k = keyBytes;
  if (k.length > blockSize) {
    k = sha1Digest(k);
  }
  const keyPadded = new Uint8Array(blockSize);
  keyPadded.set(k, 0);

  const oKeyPad = new Uint8Array(blockSize + 20);
  const iKeyPad = new Uint8Array(blockSize + message.length);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = keyPadded[i] ^ 0x5c;
    iKeyPad[i] = keyPadded[i] ^ 0x36;
  }
  iKeyPad.set(message, blockSize);
  const innerHash = sha1Digest(iKeyPad);
  oKeyPad.set(innerHash, blockSize);
  return sha1Digest(oKeyPad);
}

/**
 * Standard RFC 6238 TOTP (Time-based One-Time Password) Support
 * Works 100% deterministically across HTTP/HTTPS, mobile, desktop, and Cloud JSONBin.
 */
export const TOTP_ROTATION_VERSION = 3;
export const DEFAULT_TOTP_SECRET = 'BKEN3KF7SV47667G';
const ADMIN_TOTP_SECRET_KEY = 'roadto2000_totp_secret_v3';
const ADMIN_TOTP_ENROLLED_KEY = 'roadto2000_totp_enrolled_v3';
const ADMIN_TOTP_UPDATED_AT_KEY = 'roadto2000_totp_updated_v3';

const CLOUD_BIN_ID = '6af9f1d7ffd5d16053c38f30';
const CLOUD_API_KEY = '$2a$10$nOO6WNU996CcWwBht/K8MuDshQsOPktO28uEy.WTBESmEHAsRjcZy';

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
    return stored.trim().toUpperCase().replace(/[^A-Z2-7]/g, '') || DEFAULT_TOTP_SECRET;
  }
  safeSet(ADMIN_TOTP_SECRET_KEY, DEFAULT_TOTP_SECRET);
  return DEFAULT_TOTP_SECRET;
}

export function setTotpSecret(secret: string): void {
  const clean = secret.trim().toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (clean.length >= 16) {
    safeSet(ADMIN_TOTP_SECRET_KEY, clean);
    safeSet(ADMIN_TOTP_UPDATED_AT_KEY, String(Date.now()));
  }
}

export function generateNewTotpSecret(): string {
  const newSecret = generateRandomBase32Secret(16);
  safeSet(ADMIN_TOTP_SECRET_KEY, newSecret);
  safeSet(ADMIN_TOTP_ENROLLED_KEY, 'false');
  safeSet(ADMIN_TOTP_UPDATED_AT_KEY, String(Date.now()));
  return newSecret;
}

export async function rotateAndSyncTotpSecret(customSecret?: string): Promise<string> {
  const nextSecret = (customSecret || generateRandomBase32Secret(16))
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, '');
  const validSecret = nextSecret.length >= 16 ? nextSecret : generateRandomBase32Secret(16);
  safeSet(ADMIN_TOTP_SECRET_KEY, validSecret);
  safeSet(ADMIN_TOTP_ENROLLED_KEY, 'false');
  safeSet(ADMIN_TOTP_UPDATED_AT_KEY, String(Date.now()));
  await syncTotpSecretToServer(validSecret, false);
  return validSecret;
}

export function resetTotpToDefaultSecret(): string {
  safeSet(ADMIN_TOTP_SECRET_KEY, DEFAULT_TOTP_SECRET);
  safeSet(ADMIN_TOTP_ENROLLED_KEY, 'false');
  safeSet(ADMIN_TOTP_UPDATED_AT_KEY, String(Date.now()));
  return DEFAULT_TOTP_SECRET;
}

export function isTotpEnrolled(): boolean {
  const stored = safeGet(ADMIN_TOTP_ENROLLED_KEY);
  // Start un-enrolled on fresh v3 rotation until the user scans & verifies their first 6-digit code!
  if (stored === null) return false;
  return stored === 'true';
}

export function setTotpEnrolled(enrolled: boolean): void {
  safeSet(ADMIN_TOTP_ENROLLED_KEY, enrolled ? 'true' : 'false');
  safeSet(ADMIN_TOTP_UPDATED_AT_KEY, String(Date.now()));
}

async function pushTotpConfigToCloudDirect(secret: string, enrolled: boolean): Promise<boolean> {
  if (typeof fetch === 'undefined') return false;
  try {
    const readHeaders: Record<string, string> = {
      'X-Master-Key': CLOUD_API_KEY,
      'X-Access-Key': CLOUD_API_KEY,
    };
    let remoteRecord: Record<string, any> = {};
    const latestRes = await fetch(`https://api.jsonbin.io/v3/b/${CLOUD_BIN_ID}/latest`, {
      headers: readHeaders,
      cache: 'no-store',
    });
    if (latestRes.ok) {
      const body = await latestRes.json();
      remoteRecord = body?.record || body || {};
    }
    const mergedPayload = {
      ...remoteRecord,
      totpConfig: {
        secret,
        enrolled,
        isCustom: secret !== DEFAULT_TOTP_SECRET,
        rotationVersion: TOTP_ROTATION_VERSION,
        updatedAt: Date.now(),
      },
    };
    const putRes = await fetch(`https://api.jsonbin.io/v3/b/${CLOUD_BIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...readHeaders,
      },
      body: JSON.stringify(mergedPayload),
    });
    return putRes.ok;
  } catch {
    return false;
  }
}

async function pullTotpConfigFromCloudDirect(): Promise<{ secret: string; enrolled: boolean } | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${CLOUD_BIN_ID}/latest`, {
      headers: {
        'X-Master-Key': CLOUD_API_KEY,
        'X-Access-Key': CLOUD_API_KEY,
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = await res.json();
    const t = (body?.record || body)?.totpConfig;
    if (
      t &&
      t.rotationVersion === TOTP_ROTATION_VERSION &&
      typeof t.secret === 'string' &&
      t.secret.trim().length >= 16
    ) {
      return {
        secret: t.secret.trim().toUpperCase().replace(/[^A-Z2-7]/g, ''),
        enrolled: Boolean(t.enrolled),
      };
    }
  } catch {}
  return null;
}

export async function syncTotpSecretToServer(secret: string, enrolled = true): Promise<boolean> {
  const clean = secret.trim().toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (clean.length < 16) return false;
  safeSet(ADMIN_TOTP_SECRET_KEY, clean);
  safeSet(ADMIN_TOTP_ENROLLED_KEY, enrolled ? 'true' : 'false');
  safeSet(ADMIN_TOTP_UPDATED_AT_KEY, String(Date.now()));

  try {
    const res = await safeApiFetch('/api/auth/totp/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: clean, enrolled, rotationVersion: TOTP_ROTATION_VERSION }),
    });
    if (res && res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        if (data?.cloudSynced) return true;
      }
    }
  } catch {}

  return await pushTotpConfigToCloudDirect(clean, enrolled);
}

export async function fetchTotpConfigFromServer(): Promise<{ secret: string; enrolled: boolean } | null> {
  try {
    const res = await safeApiFetch('/api/auth/totp/config', { cache: 'no-store' });
    if (res && res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        if (
          data?.secret &&
          typeof data.secret === 'string' &&
          data.secret.length >= 16 &&
          data.rotationVersion === TOTP_ROTATION_VERSION
        ) {
          setTotpSecret(data.secret);
          if (typeof data.enrolled === 'boolean') {
            setTotpEnrolled(data.enrolled);
          }
          return { secret: data.secret, enrolled: Boolean(data.enrolled) };
        }
      }
    }
  } catch {}

  const cloud = await pullTotpConfigFromCloudDirect();
  if (cloud) {
    setTotpSecret(cloud.secret);
    setTotpEnrolled(cloud.enrolled);
    return cloud;
  }
  return null;
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

export function generateTotpCodeSync(secret?: string, timestamp = Date.now()): string {
  const activeSecret = secret || getTotpSecret();
  const epoch = Math.floor(timestamp / 1000);
  const timeStep = Math.floor(epoch / 30);
  const timeBuffer = new Uint8Array(8);
  const view = new DataView(timeBuffer.buffer);
  view.setBigUint64(0, BigInt(timeStep), false);

  const keyBytes = base32ToBytes(activeSecret);
  const sigBytes = hmacSha1(keyBytes, timeBuffer);
  const offset = sigBytes[sigBytes.length - 1] & 0x0f;
  const binary =
    ((sigBytes[offset] & 0x7f) << 24) |
    ((sigBytes[offset + 1] & 0xff) << 16) |
    ((sigBytes[offset + 2] & 0xff) << 8) |
    (sigBytes[offset + 3] & 0xff);
  return (binary % 1000000).toString().padStart(6, '0');
}

export async function generateTotpCode(secret?: string, timestamp = Date.now()): Promise<string> {
  return generateTotpCodeSync(secret, timestamp);
}

export async function verifyTotpCode(candidate: string, secret?: string): Promise<boolean> {
  const clean = candidate.trim().replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const activeSecret = secret || getTotpSecret();
  const now = Date.now();

  // 1. Verify locally across +/- 90s steps with exact pure-TS RFC 6238 HMAC-SHA1
  for (const offset of [0, -30000, 30000, -60000, 60000, -90000, 90000]) {
    const expected = generateTotpCodeSync(activeSecret, now + offset);
    if (clean === expected) return true;
  }

  // 2. Fallback: verify via backend server UTC clock & synced secret (handles browser clock drift or cross-device secret sync)
  try {
    const res = await safeApiFetch('/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: clean, secret: activeSecret }),
      timeoutMs: 3000,
    });
    if (res && res.ok) {
      const data = await res.json();
      if (data?.valid) {
        if (typeof data.activeSecret === 'string' && data.activeSecret.length >= 16) {
          setTotpSecret(data.activeSecret);
        }
        return true;
      }
    }
  } catch {}

  return false;
}

export function getTotpUri(account = 'Romeo', issuer = 'RoadTo2000Elo', secret?: string): string {
  const activeSecret = secret || getTotpSecret();
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${activeSecret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}

// ==========================================
// 24-HOUR USER ACCOUNT SESSION MANAGEMENT
// ==========================================
const USER_SESSION_KEY = 'roadto2000_user_session_v1';
export const USER_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface UserSession {
  username: string;
  connectedAt: number;
  expiresAt: number;
  isSpectator?: boolean;
}

export function getActiveUserSession(): UserSession | null {
  try {
    const raw = safeGet(USER_SESSION_KEY);
    if (!raw) return null;
    const session: UserSession = JSON.parse(raw);
    if (!session || !session.username || Date.now() > session.expiresAt) {
      safeRemove(USER_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveUserSession(username: string, isSpectator = false): UserSession {
  const clean = username.trim().toLowerCase();
  const now = Date.now();
  const session: UserSession = {
    username: clean,
    connectedAt: now,
    expiresAt: now + USER_SESSION_DURATION_MS,
    isSpectator,
  };
  safeSet(USER_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearUserSession(): void {
  safeRemove(USER_SESSION_KEY);
}

// ==========================================
// MANAGED ACCOUNTS REGISTRY & PER-ACCOUNT 2FA
// ==========================================
const ACCOUNTS_REGISTRY_KEY = 'roadto2000_managed_accounts_list_v2';
export type AccountStatus = 'active' | 'suspended' | 'banned';

export function getManagedAccounts(): string[] {
  try {
    const raw = safeGet(ACCOUNTS_REGISTRY_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return Array.from(new Set(['alpharomeo1500', ...list.map((u) => String(u).trim().toLowerCase())]));
      }
    }
  } catch {}
  return ['alpharomeo1500'];
}

export function isAccountRegistered(username: string): boolean {
  const clean = username.trim().toLowerCase();
  if (clean === 'alpharomeo1500' || clean === 'alpharomeo') return true;
  const accounts = getManagedAccounts();
  return accounts.includes(clean);
}

export function getAccountStatus(username: string): AccountStatus {
  const clean = username.trim().toLowerCase();
  if (clean === 'alpharomeo1500') return 'active';
  const stored = safeGet(`roadto2000_acc_status_${clean}`);
  if (stored === 'suspended' || stored === 'banned') return stored;
  return 'active';
}

function notifyAccountsUpdated(syncCloud = true): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('roadto2000:accounts-updated'));
    }
    if (syncCloud) {
      scheduleAccountsRegistryPush();
    }
  } catch {}
}

export function setAccountStatus(username: string, status: AccountStatus): boolean {
  const clean = username.trim().toLowerCase();
  if (clean === 'alpharomeo1500') return false; // Admin master account cannot be suspended or banned
  safeSet(`roadto2000_acc_status_${clean}`, status);
  notifyAccountsUpdated(true);
  return true;
}

export function deleteManagedAccount(username: string): boolean {
  const clean = username.trim().toLowerCase();
  if (clean === 'alpharomeo1500') return false; // Cannot delete master admin
  const accounts = getManagedAccounts().filter((u) => u !== clean);
  safeSet(ACCOUNTS_REGISTRY_KEY, JSON.stringify(accounts));
  safeRemove(`roadto2000_acc_pwd_${clean}`);
  safeRemove(`roadto2000_totp_secret_${clean}`);
  safeRemove(`roadto2000_acc_status_${clean}`);
  safeRemove(`roadto2000_acc_created_${clean}`);
  safeRemove(`roadto2000_jsonbin_binid_${clean}`);
  safeRemove(`roadto2000_jsonbin_apikey_${clean}`);
  safeRemove(`roadto2000_settings_${clean}`);
  notifyAccountsUpdated(true);
  return true;
}

export function getPublicAuthorizedAccounts(): { username: string; status: AccountStatus; isMaster: boolean }[] {
  const list = getManagedAccounts();
  return list.map((username) => ({
    username,
    status: getAccountStatus(username),
    isMaster: username === 'alpharomeo1500',
  }));
}

export function getUserTotpSecret(_username: string): string {
  // Single Principal 2FA shared across the platform
  return getTotpSecret();
}

export interface CreateAccountParams {
  username: string;
  jsonBinId: string;
  jsonBinApiKey?: string;
  startElo?: number;
  targetElo?: number;
  startDate?: string;
  targetDate?: string;
  selectedMode?: string;
  trajectoryModel?: string;
}

export interface CreateAccountResult {
  success: boolean;
  username?: string;
  error?: string;
}

/**
 * Admin-only account creation:
 * Links a dedicated JSONBin and custom objectives; protected by the single principal 2FA.
 */
export async function createManagedAccount(params: CreateAccountParams): Promise<CreateAccountResult> {
  const cleanUser = params.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

  if (!cleanUser || cleanUser.length < 3) {
    return { success: false, error: 'Le pseudo Chess.com doit comporter au moins 3 caractères alphanumériques.' };
  }

  if (cleanUser === 'alpharomeo1500') {
    return { success: false, error: 'Le compte officiel @alpharomeo1500 est déjà le compte administrateur maître.' };
  }

  if (isAccountRegistered(cleanUser)) {
    return { success: false, error: `Le compte @${cleanUser} existe déjà.` };
  }

  if (!params.jsonBinId || params.jsonBinId.trim().length < 10) {
    return { success: false, error: "Veuillez renseigner un Bin ID JSONBin valide pour ce compte." };
  }

  try {
    safeSet(`roadto2000_acc_status_${cleanUser}`, 'active');
    safeSet(`roadto2000_acc_created_${cleanUser}`, new Date().toISOString());

    // Save account-isolated JSONBin configuration
    safeSet(`roadto2000_jsonbin_binid_${cleanUser}`, params.jsonBinId.trim());
    if (params.jsonBinApiKey && params.jsonBinApiKey.trim()) {
      safeSet(`roadto2000_jsonbin_apikey_${cleanUser}`, params.jsonBinApiKey.trim());
    }
    safeSet(`roadto2000_jsonbin_enabled_${cleanUser}`, 'true');

    // Persist per-account JSONBin credentials on Express server if running
    try {
      safeApiFetch('/api/jsonbin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          binId: params.jsonBinId.trim(),
          ...(params.jsonBinApiKey && params.jsonBinApiKey.trim()
            ? { apiKey: params.jsonBinApiKey.trim() }
            : {}),
          enabled: true,
        }),
      }).catch(() => {});
    } catch {}

    // Save custom user objectives
    const userSettings = {
      username: cleanUser,
      startElo: params.startElo ?? 1500,
      targetElo: params.targetElo ?? 2000,
      startDate: params.startDate || new Date().toISOString().split('T')[0],
      targetDate: params.targetDate || '2027-12-31',
      selectedMode: params.selectedMode || 'auto',
      trajectoryModel: params.trajectoryModel || 'linear',
      autoSyncMinutes: 15,
      notifications: { newPeak: true, milestoneReached: true, goalReached: true, syncErrors: true, significantDelay: true },
      theme: 'dark',
      customMilestones: [],
    };
    safeSet(`roadto2000_settings_${cleanUser}`, JSON.stringify(userSettings));

    // Register account in managed list
    const currentList = getManagedAccounts();
    const updatedList = Array.from(new Set([...currentList, cleanUser]));
    safeSet(ACCOUNTS_REGISTRY_KEY, JSON.stringify(updatedList));
    notifyAccountsUpdated(true);

    return {
      success: true,
      username: cleanUser,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erreur lors de la création du compte." };
  }
}

/**
 * Connect strictly with the SINGLE PRINCIPAL 2FA (A2F) 6-digit code.
 * No password or master password is accepted.
 */
export async function authenticateWithTotpOnly(
  username: string,
  totpCode: string
): Promise<{ success: boolean; error?: string; isAdmin?: boolean }> {
  const cleanUser = username.trim().toLowerCase();
  const cleanCode = totpCode.trim().replace(/\D/g, '');

  if (!cleanUser) {
    return { success: false, error: 'Veuillez sélectionner un compte autorisé.' };
  }

  if (!isAccountRegistered(cleanUser)) {
    return {
      success: false,
      error: "Ce compte n'est pas un compte officiel autorisé par l'administration.",
    };
  }

  const status = getAccountStatus(cleanUser);
  if (status === 'banned') {
    return { success: false, error: "Ce compte a été banni par l'administrateur." };
  }
  if (status === 'suspended') {
    return { success: false, error: "Ce compte est actuellement suspendu par l'administrateur." };
  }

  if (cleanCode.length !== 6) {
    return {
      success: false,
      error: 'Veuillez saisir le code A2F à 6 chiffres de votre application Authenticator.',
    };
  }

  // Verify against the SINGLE active principal 2FA secret
  const principalSecret = getTotpSecret();
  const isPrincipalValid = await verifyTotpCode(cleanCode, principalSecret);

  if (isPrincipalValid) {
    const isAdminAccount = cleanUser === 'alpharomeo1500' || cleanUser === 'alpharomeo';
    if (isAdminAccount) {
      setAdminSession();
    }
    return { success: true, isAdmin: isAdminAccount };
  }

  return {
    success: false,
    error: 'Code A2F invalide ou expiré. Vérifiez les 6 chiffres affichés sur votre application Authenticator.',
  };
}


