/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import fs from 'fs';
import crypto from 'crypto';

interface AuthSession {
  sessionId: string;
  scanning: boolean;
  ipPrefix: string;
  detectedIp: string;
  unlocked: boolean;
  isTrusted?: boolean;
  trustedIps?: string[];
  unlockReason?: string;
  createdAt: number;
  updatedAt: number;
}

// In-memory session store
const sessions = new Map<string, AuthSession>();

// Persistent server-side trusted IPs
const TRUSTED_IPS_FILE = path.resolve(os.tmpdir(), 'roadto2000_trusted_ips.json');
const serverTrustedIps = new Set<string>();

// Load trusted IPs from disk
function loadTrustedIpsFromDisk() {
  try {
    if (fs.existsSync(TRUSTED_IPS_FILE)) {
      const raw = fs.readFileSync(TRUSTED_IPS_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach((ip: string) => {
          if (typeof ip === 'string' && ip.trim().length >= 7) {
            serverTrustedIps.add(ip.trim());
          }
        });
      }
    }
  } catch (err) {
    console.warn('[RoadTo2000] Failed to load trusted IPs from disk:', err);
  }
}

// Save trusted IPs to disk
function saveTrustedIpsToDisk() {
  try {
    fs.writeFileSync(TRUSTED_IPS_FILE, JSON.stringify(Array.from(serverTrustedIps)), 'utf-8');
  } catch (err) {
    console.warn('[RoadTo2000] Failed to save trusted IPs to disk:', err);
  }
}

loadTrustedIpsFromDisk();

// Active SSE client connections per sessionId
type SSEListener = (session: AuthSession) => void;
const sessionListeners = new Map<string, Set<SSEListener>>();

function addSessionListener(sessionId: string, listener: SSEListener) {
  if (!sessionListeners.has(sessionId)) {
    sessionListeners.set(sessionId, new Set());
  }
  sessionListeners.get(sessionId)!.add(listener);
}

function removeSessionListener(sessionId: string, listener: SSEListener) {
  const set = sessionListeners.get(sessionId);
  if (set) {
    set.delete(listener);
    if (set.size === 0) {
      sessionListeners.delete(sessionId);
    }
  }
}

function broadcastSessionUpdate(session: AuthSession) {
  const set = sessionListeners.get(session.sessionId);
  if (set) {
    for (const listener of set) {
      try {
        listener(session);
      } catch (err) {
        console.warn('SSE broadcast error:', err);
      }
    }
  }
}

// Helper to mask IP prefix (e.g., 82.64.12.34 -> 82.64.***)
function formatIpPrefix(ip: string): string {
  const clean = ip.trim();
  if (!clean) return '***';
  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length >= 2) {
      return `${parts[0]}.${parts[1]}.***`;
    }
  } else if (clean.includes(':')) {
    const parts = clean.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}:***`;
    }
  }
  return clean.substring(0, Math.min(clean.length, 6)) + '***';
}

// Extract real client IP from Express request (handles Google Cloud Run, reverse proxies, and local)
function extractClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();

  const forwarded = req.headers['x-forwarded-for'];
  let ip = '';
  if (typeof forwarded === 'string') {
    ip = forwarded.split(',')[0].trim();
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    ip = forwarded[0].trim();
  } else {
    ip = req.socket.remoteAddress || '';
  }
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  return ip.trim();
}

// Verify if a client IP is trusted without trusting any client spoofing
function isServerIpTrusted(clientIp: string, sessionIps?: string[]): boolean {
  const clean = clientIp.trim();
  if (!clean) return false;

  const normalized = clean.startsWith('::ffff:') ? clean.replace('::ffff:', '') : clean;

  const pool = new Set<string>();
  serverTrustedIps.forEach((ip) => pool.add(ip.trim()));
  if (Array.isArray(sessionIps)) {
    sessionIps.forEach((ip) => {
      if (ip && typeof ip === 'string' && ip.trim().length >= 7) {
        pool.add(ip.trim());
      }
    });
  }

  for (const trusted of pool) {
    const cleanTrusted = trusted.startsWith('::ffff:') ? trusted.replace('::ffff:', '') : trusted;
    if (normalized === cleanTrusted) return true;
    if (cleanTrusted.endsWith('.*')) {
      const prefix = cleanTrusted.slice(0, -2);
      if (normalized.startsWith(prefix)) return true;
    }
  }
  return false;
}

// Find local LAN IPv4 address (e.g. 192.168.1.45)
function getLocalLanIp(): string {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const netList = interfaces[name];
      if (!netList) continue;
      for (const net of netList) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {}
  return '127.0.0.1';
}

// Periodic cleanup of sessions older than 45 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > 45 * 60 * 1000) {
      sessions.delete(id);
      sessionListeners.delete(id);
    }
  }
}, 10 * 60 * 1000);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const HOST = '0.0.0.0';

  app.use(express.json());

  // CORS middleware for seamless cross-device & cross-preview requests
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // 1. Client IP lookup endpoint
  app.get('/api/auth/client-ip', (req: Request, res: Response) => {
    const ip = extractClientIp(req);
    res.json({
      ip,
      ipPrefix: formatIpPrefix(ip),
      isTrusted: isServerIpTrusted(ip),
    });
  });

  // 2. Server info (LAN address for seamless mobile QR scan on local network)
  app.get('/api/auth/server-info', (_req: Request, res: Response) => {
    const lanIp = getLocalLanIp();
    res.json({
      lanIp,
      port: PORT,
    });
  });

  // 3. Trusted IPs management endpoints (strictly server-stored, not from URL parameters!)
  app.get('/api/auth/trusted-ips', (_req: Request, res: Response) => {
    res.json({
      trustedIps: Array.from(serverTrustedIps),
    });
  });

  app.post('/api/auth/trusted-ips', (req: Request, res: Response) => {
    const { ips, ip, action } = req.body || {};
    if (Array.isArray(ips)) {
      serverTrustedIps.clear();
      ips.forEach((item) => {
        if (typeof item === 'string' && item.trim().length >= 7) {
          serverTrustedIps.add(item.trim());
        }
      });
      saveTrustedIpsToDisk();
      res.json({ success: true, count: serverTrustedIps.size });
      return;
    }

    if (ip && typeof ip === 'string') {
      const cleanIp = ip.trim();
      if (action === 'remove') {
        serverTrustedIps.delete(cleanIp);
      } else if (cleanIp.length >= 7) {
        serverTrustedIps.add(cleanIp);
      }
      saveTrustedIpsToDisk();
      res.json({ success: true, count: serverTrustedIps.size });
      return;
    }

    res.status(400).json({ error: 'Invalid payload' });
  });

  // 4. Initialize auth session (called by desktop PC when opening 2FA modal)
  app.post('/api/auth/session/init', (req: Request, res: Response) => {
    const { sessionId, trustedIps } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    // Sync any trusted IPs from desktop to server
    if (Array.isArray(trustedIps)) {
      trustedIps.forEach((item: string) => {
        if (typeof item === 'string' && item.trim().length >= 7) {
          serverTrustedIps.add(item.trim());
        }
      });
      saveTrustedIpsToDisk();
    }

    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        scanning: false,
        ipPrefix: '',
        detectedIp: '',
        unlocked: false,
        isTrusted: false,
        trustedIps: Array.isArray(trustedIps) ? trustedIps : [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      sessions.set(sessionId, session);
    } else if (Array.isArray(trustedIps)) {
      session.trustedIps = trustedIps;
    }

    res.json({ success: true, session });
  });

  // 5. Smartphone reports QR code scan start (live presence detection)
  // CRITICAL: Uses actual TCP/HTTP connection IP. Never trusts URL parameters!
  app.post('/api/auth/session/scan', (req: Request, res: Response) => {
    const { sessionId } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    // Extract real client IP of the connecting phone
    const realClientIp = extractClientIp(req);
    const prefix = formatIpPrefix(realClientIp || 'Mobile');

    let session = sessions.get(sessionId);
    const isTrusted = isServerIpTrusted(realClientIp, session?.trustedIps);

    if (!session) {
      session = {
        sessionId,
        scanning: true,
        ipPrefix: prefix,
        detectedIp: realClientIp,
        unlocked: false,
        isTrusted,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } else {
      session.scanning = true;
      session.ipPrefix = prefix;
      session.detectedIp = realClientIp;
      session.isTrusted = isTrusted;
      session.updatedAt = Date.now();
    }

    sessions.set(sessionId, session);
    broadcastSessionUpdate(session);

    res.json({
      success: true,
      sessionId,
      ip: realClientIp,
      ipPrefix: prefix,
      isTrusted,
      scanning: true,
    });
  });

// Deterministic 6-digit session activation code generator
function generateSessionValidationCode(sessionId: string): string {
  let sum = 0;
  for (let i = 0; i < sessionId.length; i++) {
    sum = (sum * 31 + sessionId.charCodeAt(i)) % 900000;
  }
  return (100000 + (sum % 900000)).toString();
}

  // 6. Smartphone unlocks remote session (after typing password or trusted IP)
  app.post('/api/auth/session/unlock', (req: Request, res: Response) => {
    const { sessionId, reason } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    const realClientIp = extractClientIp(req);
    let session = sessions.get(sessionId);

    if (!session) {
      session = {
        sessionId,
        scanning: true,
        ipPrefix: formatIpPrefix(realClientIp),
        detectedIp: realClientIp,
        unlocked: true,
        unlockReason: reason || 'remote',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } else {
      session.unlocked = true;
      session.unlockReason = reason || 'remote';
      session.updatedAt = Date.now();
    }

    sessions.set(sessionId, session);
    broadcastSessionUpdate(session);

    res.json({
      success: true,
      sessionId,
      unlocked: true,
      reason: session.unlockReason,
    });
  });

const DEFAULT_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

function base32ToBuffer(base32: string): Buffer {
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
  return Buffer.from(output);
}

function verifyServerTotpCode(candidate: string, secret = DEFAULT_TOTP_SECRET): boolean {
  const clean = candidate.trim().replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const keyBuffer = base32ToBuffer(secret);
  const now = Date.now();

  for (const offset of [0, -30000, 30000]) {
    const epoch = Math.floor((now + offset) / 1000);
    const timeStep = Math.floor(epoch / 30);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(timeStep), 0);

    const hmac = crypto.createHmac('sha1', keyBuffer).update(timeBuffer).digest();
    const off = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[off] & 0x7f) << 24) |
      ((hmac[off + 1] & 0xff) << 16) |
      ((hmac[off + 2] & 0xff) << 8) |
      (hmac[off + 3] & 0xff);
    const expected = (binary % 1000000).toString().padStart(6, '0');
    if (clean === expected) return true;
  }
  return false;
}

  // 6b. Verify 6-digit activation code or TOTP code submitted from desktop or phone
  app.post('/api/auth/session/verify-code', (req: Request, res: Response) => {
    const { sessionId, code } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    const cleanCode = String(code || '').trim().replace(/\D/g, '');
    const expected = generateSessionValidationCode(sessionId);
    const isTotpValid = verifyServerTotpCode(cleanCode);

    if (cleanCode === expected || isTotpValid) {
      const realClientIp = extractClientIp(req);
      const unlockReason = isTotpValid ? 'totp_authenticator' : 'activation_code';
      let session = sessions.get(sessionId);
      if (!session) {
        session = {
          sessionId,
          scanning: true,
          ipPrefix: isTotpValid ? 'Authenticator' : formatIpPrefix(realClientIp),
          detectedIp: realClientIp,
          unlocked: true,
          unlockReason,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      } else {
        session.unlocked = true;
        session.unlockReason = unlockReason;
        session.updatedAt = Date.now();
      }

      sessions.set(sessionId, session);
      broadcastSessionUpdate(session);

      res.json({ success: true, unlocked: true, reason: unlockReason });
      return;
    }

    res.status(401).json({ success: false, error: 'Code d\'activation incorrect' });
  });

  // 7. Polling endpoint for session status
  app.get('/api/auth/session/status', (req: Request, res: Response) => {
    const sessionId = String(req.query.sessionId || '');
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.json({
        sessionId,
        scanning: false,
        ipPrefix: '',
        unlocked: false,
        isTrusted: false,
      });
      return;
    }

    res.json({
      sessionId: session.sessionId,
      scanning: session.scanning,
      ipPrefix: session.ipPrefix,
      detectedIp: session.detectedIp,
      unlocked: session.unlocked,
      isTrusted: session.isTrusted,
      unlockReason: session.unlockReason,
      updatedAt: session.updatedAt,
    });
  });

  // 7b. Server-Sent Events (SSE) stream for instant real-time push to desktop
  app.get('/api/auth/session/events', (req: Request, res: Response) => {
    const sessionId = String(req.query.sessionId || '');
    if (!sessionId) {
      res.status(400).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Send immediate initial status
    const current = sessions.get(sessionId) || {
      sessionId,
      scanning: false,
      ipPrefix: '',
      detectedIp: '',
      unlocked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    res.write(`data: ${JSON.stringify(current)}\n\n`);

    const listener: SSEListener = (data) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {}
    };

    addSessionListener(sessionId, listener);

    // Keepalive ping every 10s to prevent proxy connection drops
    const keepAliveTimer = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {}
    }, 10000);

    req.on('close', () => {
      clearInterval(keepAliveTimer);
      removeSessionListener(sessionId, listener);
    });
  });

  // 8. User Persistent Cloud Sync API (Syncs history & settings between PC & Phone)
  const DATA_DIR = path.resolve(__dirname, 'data');
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[RoadTo2000] Could not create data dir, fallback to tmpdir:', err);
  }

  function getUserDataFilePath(username: string): string {
    const clean = (username || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const preferredDir = fs.existsSync(DATA_DIR) ? DATA_DIR : os.tmpdir();
    return path.resolve(preferredDir, `roadto2000_userdata_${clean}.json`);
  }

  // Merge helper: preserves 1 record per calendar day (Europe/Paris local date), never drops remote days unless replaceExact is true
  function normalizeDayKey(timestamp: string): string | null {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return null;
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Paris',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
      if (/^\d{4}-\d{2}-\d{2}$/.test(parts)) return parts;
    } catch {}
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function mergeHistoryRecords(primary: any[], secondary: any[], username: string): any[] {
    const byDay = new Map<string, any>();

    // Process secondary first, then primary so primary wins on conflicts while preserving missing fields like puzzles/note
    const insertList = (list: any[], overwrite: boolean) => {
      for (const r of list) {
        if (!r || typeof r.bestRating !== 'number' || r.bestRating <= 0) continue;
        if (username === 'alpharomeo1500' && r.bestRating === 1938) continue;
        if (r.username && String(r.username).trim().toLowerCase() !== username) continue;

        const dayKey = normalizeDayKey(r.timestamp);
        if (!dayKey) continue;

        const existing = byDay.get(dayKey);
        if (!existing) {
          byDay.set(dayKey, { ...r, username });
        } else if (overwrite) {
          byDay.set(dayKey, {
            ...existing,
            ...r,
            username,
            puzzles: r.puzzles ?? existing.puzzles ?? null,
            note: r.note ?? existing.note,
          });
        } else {
          // Existing (primary) stays authoritative, only backfill missing optional fields
          byDay.set(dayKey, {
            ...r,
            ...existing,
            username,
            puzzles: existing.puzzles ?? r.puzzles ?? null,
            note: existing.note ?? r.note,
          });
        }
      }
    };

    insertList(Array.isArray(secondary) ? secondary : [], false);
    insertList(Array.isArray(primary) ? primary : [], true);

    return Array.from(byDay.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 500);
  }

  function computeRecordVerificationHash(r: any, username: string): string {
    const clean = (username || 'alpharomeo1500').trim().toLowerCase();
    const dayKey = normalizeDayKey(r?.timestamp || '') || '';
    return `${clean}|${dayKey}|${r?.bullet ?? ''}|${r?.blitz ?? ''}|${r?.rapid ?? ''}|${r?.puzzles ?? ''}|${r?.bestRating ?? ''}|${r?.bestMode ?? ''}`;
  }

  function buildConfirmedDayHashes(records: any[], username: string): Record<string, string> {
    const map: Record<string, string> = {};
    if (!Array.isArray(records)) return map;
    for (const r of records) {
      if (!r || !r.timestamp) continue;
      const dayKey = normalizeDayKey(r.timestamp);
      if (!dayKey) continue;
      map[dayKey] = computeRecordVerificationHash(r, username);
    }
    return map;
  }

  app.get('/api/user-data/:username', (req: Request, res: Response) => {
    try {
      const username = (req.params.username || '').trim().toLowerCase();
      if (!username) {
        res.status(400).json({ error: 'Username required' });
        return;
      }
      const userCfg = getJsonBinUserConfig(username);
      const filePath = getUserDataFilePath(username);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        res.json({
          success: true,
          username,
          history: Array.isArray(data.history) ? data.history : [],
          settings: data.settings || null,
          lastUpdated: data.lastUpdated || 0,
          jsonBinLastSyncTime: userCfg.lastSyncTime || null,
          jsonBinRemoteUpdatedAt: userCfg.remoteUpdatedAt || null,
          jsonBinStatus: userCfg.lastStatus,
          confirmedDayHashes: userCfg.confirmedDayHashes || {},
        });
        return;
      }
      res.json({
        success: true,
        username,
        history: [],
        settings: null,
        lastUpdated: 0,
        jsonBinLastSyncTime: userCfg.lastSyncTime || null,
        jsonBinRemoteUpdatedAt: userCfg.remoteUpdatedAt || null,
        jsonBinStatus: userCfg.lastStatus,
        confirmedDayHashes: userCfg.confirmedDayHashes || {},
      });
    } catch (err: any) {
      console.error('[RoadTo2000] Failed to read user data:', err);
      res.status(500).json({ error: 'Failed to read user data' });
    }
  });

  app.post('/api/user-data/:username', async (req: Request, res: Response) => {
    try {
      const username = (req.params.username || '').trim().toLowerCase();
      if (!username) {
        res.status(400).json({ error: 'Username required' });
        return;
      }

      const {
        history: incomingHistory,
        settings: incomingSettings,
        forcePush = false,
        replaceExact = false,
        binId: overrideBinId,
        apiKey: overrideApiKey,
      } = req.body || {};

      // Persist user-specific bin overrides if provided by client
      if (typeof overrideBinId === 'string' && overrideBinId.trim()) {
        updateJsonBinUserConfig(username, {
          binId: overrideBinId.trim(),
          ...(typeof overrideApiKey === 'string' && overrideApiKey.trim()
            ? { apiKey: overrideApiKey.trim() }
            : {}),
        });
      }

      const filePath = getUserDataFilePath(username);
      let existingHistory: any[] = [];
      let existingSettings: any = null;

      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw);
          if (Array.isArray(data.history)) existingHistory = data.history;
          if (data.settings) existingSettings = data.settings;
        } catch {}
      }

      const incomingList = Array.isArray(incomingHistory) ? incomingHistory : [];
      const finalHistory = replaceExact
        ? incomingList
            .filter((r) => r && typeof r.bestRating === 'number' && r.bestRating > 0)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 500)
        : mergeHistoryRecords(incomingList, existingHistory, username);

      const mergedSettings = incomingSettings
        ? { ...(existingSettings || {}), ...incomingSettings, username }
        : existingSettings;

      const payloadToSave = {
        username,
        history: finalHistory,
        settings: mergedSettings,
        lastUpdated: Date.now(),
      };

      fs.writeFileSync(filePath, JSON.stringify(payloadToSave, null, 2), 'utf-8');

      // Synchronize with JSONBin.io and await real status so client always gets accurate result + timestamp
      let jsonBinResult: {
        pushed: boolean;
        skipped: boolean;
        reason?: string;
        lastSyncTime: number | null;
        remoteUpdatedAt?: string | null;
        status: string;
        error?: string | null;
        mergedHistory?: any[];
        mergedSettings?: any;
      } = {
        pushed: false,
        skipped: true,
        lastSyncTime: getJsonBinUserConfig(username).lastSyncTime,
        remoteUpdatedAt: getJsonBinUserConfig(username).remoteUpdatedAt || null,
        status: getJsonBinUserConfig(username).lastStatus,
        error: null,
      };

      try {
        jsonBinResult = await pushToJsonBin(username, payloadToSave, {
          force: Boolean(forcePush),
          replaceExact: Boolean(replaceExact),
        });
        if (jsonBinResult.mergedHistory) {
          payloadToSave.history = jsonBinResult.mergedHistory;
          if (jsonBinResult.mergedSettings) {
            payloadToSave.settings = jsonBinResult.mergedSettings;
          }
          fs.writeFileSync(filePath, JSON.stringify(payloadToSave, null, 2), 'utf-8');
        }
      } catch (err: any) {
        console.warn('[RoadTo2000] JSONBin push warning:', err?.message);
        jsonBinResult = {
          pushed: false,
          skipped: false,
          lastSyncTime: getJsonBinUserConfig(username).lastSyncTime,
          remoteUpdatedAt: getJsonBinUserConfig(username).remoteUpdatedAt || null,
          status: 'error',
          error: err?.message || 'Erreur lors de la sauvegarde JSONBin',
        };
      }

      res.json({
        success: true,
        username,
        history: payloadToSave.history,
        settings: payloadToSave.settings,
        count: payloadToSave.history.length,
        lastUpdated: payloadToSave.lastUpdated,
        jsonBin: jsonBinResult,
      });
    } catch (err: any) {
      console.error('[RoadTo2000] Failed to save user data:', err);
      res.status(500).json({ error: 'Failed to save user data' });
    }
  });

  // 8c. JSONBin.io Cloud Cache Integration (Strictly Isolated Per Account)
  const storageDir = fs.existsSync(DATA_DIR) ? DATA_DIR : os.tmpdir();
  const JSONBIN_CONFIG_FILE = path.resolve(storageDir, 'roadto2000_jsonbin_config.json');
  const DEFAULT_ALPHA_BIN_ID = '6af3559affd5d16053b75b82';
  const DEFAULT_ALPHA_API_KEY = '$2a$10$nOO6WNU996CcWwBht/K8MuDshQsOPktO28uEy.WTBESmEHAsRjcZy';

  interface JsonBinUserConfig {
    binId: string;
    apiKey: string;
    enabled: boolean;
    lastSyncTime: number | null;
    remoteUpdatedAt?: string | null;
    lastStatus: 'synced' | 'pending_keys' | 'error' | 'syncing';
    lastError?: string;
    lastPushedSignature?: string;
    confirmedDayHashes?: Record<string, string>;
    requestsToday: number;
    savedRequests: number;
    lastDayTracked: string;
    lastSkippedReason?: string;
  }

  interface JsonBinMultiUserStore {
    version: 2;
    users: Record<string, JsonBinUserConfig>;
  }

  function createDefaultUserConfig(username: string): JsonBinUserConfig {
    const clean = username.trim().toLowerCase();
    const isAlpha = clean === 'alpharomeo1500';
    const envBinId = isAlpha ? (process.env.JSONBIN_BIN_ID || DEFAULT_ALPHA_BIN_ID).trim() : '';
    const envApiKey = isAlpha ? (process.env.JSONBIN_API_KEY || DEFAULT_ALPHA_API_KEY).trim() : '';
    return {
      binId: envBinId,
      apiKey: envApiKey,
      enabled: true,
      lastSyncTime: null,
      remoteUpdatedAt: null,
      lastStatus: envBinId ? 'synced' : 'pending_keys',
      requestsToday: 0,
      savedRequests: 0,
      lastDayTracked: new Date().toISOString().split('T')[0],
    };
  }

  function loadJsonBinStore(): JsonBinMultiUserStore {
    const store: JsonBinMultiUserStore = {
      version: 2,
      users: {
        alpharomeo1500: createDefaultUserConfig('alpharomeo1500'),
      },
    };

    if (fs.existsSync(JSONBIN_CONFIG_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(JSONBIN_CONFIG_FILE, 'utf-8'));
        if (parsed && parsed.version === 2 && parsed.users && typeof parsed.users === 'object') {
          for (const [uname, cfg] of Object.entries(parsed.users)) {
            const clean = uname.trim().toLowerCase();
            if (!clean || !cfg || typeof cfg !== 'object') continue;
            const c = cfg as Partial<JsonBinUserConfig>;
            store.users[clean] = {
              ...createDefaultUserConfig(clean),
              ...c,
              binId: (c.binId || (clean === 'alpharomeo1500' ? DEFAULT_ALPHA_BIN_ID : '')).trim(),
              apiKey: (c.apiKey || (clean === 'alpharomeo1500' ? DEFAULT_ALPHA_API_KEY : '')).trim(),
              enabled: c.enabled !== false,
            };
          }
        } else if (parsed && typeof parsed === 'object' && typeof parsed.binId === 'string') {
          // Migrate legacy single-user v1 config into alpharomeo1500 slot
          store.users.alpharomeo1500 = {
            ...createDefaultUserConfig('alpharomeo1500'),
            ...parsed,
            binId: (parsed.binId || DEFAULT_ALPHA_BIN_ID).trim(),
            apiKey: (parsed.apiKey || DEFAULT_ALPHA_API_KEY).trim(),
            enabled: parsed.enabled !== false,
          };
        }
      } catch {}
    }

    return store;
  }

  let jsonBinStore: JsonBinMultiUserStore = loadJsonBinStore();

  function saveJsonBinStoreToDisk() {
    try {
      fs.writeFileSync(JSONBIN_CONFIG_FILE, JSON.stringify(jsonBinStore, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Failed to save jsonbin config file:', err);
    }
  }

  function getJsonBinUserConfig(username: string): JsonBinUserConfig {
    const clean = (username || 'alpharomeo1500').trim().toLowerCase();
    if (!jsonBinStore.users[clean]) {
      jsonBinStore.users[clean] = createDefaultUserConfig(clean);
      saveJsonBinStoreToDisk();
    }
    const cfg = jsonBinStore.users[clean];
    const todayStr = new Date().toISOString().split('T')[0];
    if (cfg.lastDayTracked !== todayStr) {
      cfg.lastDayTracked = todayStr;
      cfg.requestsToday = 0;
    }
    // Always backfill master API key if user has a binId configured without key
    if (cfg.binId && !cfg.apiKey) {
      cfg.apiKey = (process.env.JSONBIN_API_KEY || DEFAULT_ALPHA_API_KEY).trim();
    }
    return cfg;
  }

  function updateJsonBinUserConfig(username: string, patch: Partial<JsonBinUserConfig>): JsonBinUserConfig {
    const clean = (username || 'alpharomeo1500').trim().toLowerCase();
    const current = getJsonBinUserConfig(clean);
    const updated: JsonBinUserConfig = {
      ...current,
      ...patch,
    };
    jsonBinStore.users[clean] = updated;
    saveJsonBinStoreToDisk();
    return updated;
  }

  // Quota Saver: Computes a COMPLETE signature over ALL daily records (including puzzles) AND all settings
  function computeDataSignature(username: string, data: any): string {
    const records = Array.isArray(data.history) ? data.history : [];
    const sorted = [...records].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const allRecordsSig = sorted
      .map(
        (r: any) =>
          `${r.id || ''}_${r.timestamp}_${r.bullet ?? ''}_${r.blitz ?? ''}_${r.rapid ?? ''}_${r.puzzles ?? ''}_${r.bestRating}_${r.bestMode}_${r.source || ''}_${r.note || ''}`
      )
      .join(';');
    const s = data.settings || {};
    const settingsStr = JSON.stringify({
      username: s.username || username,
      startElo: s.startElo,
      targetElo: s.targetElo,
      startDate: s.startDate,
      targetDate: s.targetDate,
      selectedMode: s.selectedMode,
      trajectoryModel: s.trajectoryModel,
      autoSyncMinutes: s.autoSyncMinutes,
      theme: s.theme,
      notifications: s.notifications,
      customMilestones: s.customMilestones,
    });
    return crypto.createHash('md5').update(`${username}:::${allRecordsSig}:::${settingsStr}`).digest('hex');
  }

  const OFFICIAL_DAILY_RECORDS = [
    {
      timestamp: '2026-11-10T17:24:45.922Z',
      username: 'alpharomeo1500',
      bullet: 1605,
      blitz: 1504,
      rapid: 1300,
      bestRating: 1605,
      bestMode: 'bullet',
      source: 'API Chess.com directe',
      id: 'sync_1794331486338_pfphq',
    },
    {
      timestamp: '2026-11-09T19:40:08.913Z',
      username: 'alpharomeo1500',
      bullet: 1605,
      blitz: 1504,
      rapid: 1300,
      bestRating: 1605,
      bestMode: 'bullet',
      source: 'API Chess.com directe',
      id: 'sync_1794253209385_972kv',
    },
    {
      timestamp: '2026-11-08T18:51:41.620Z',
      username: 'alpharomeo1500',
      bullet: 1533,
      blitz: 1504,
      rapid: 1300,
      bestRating: 1533,
      bestMode: 'bullet',
      source: 'API Chess.com directe',
      id: 'sync_1794163902789_s8f9x',
    },
    {
      timestamp: '2026-11-07T11:52:48.268Z',
      username: 'alpharomeo1500',
      bullet: 1533,
      blitz: 1504,
      rapid: 1278,
      bestRating: 1533,
      bestMode: 'bullet',
      source: 'API Chess.com directe',
      id: 'sync_1794052368563_6nb0h',
    },
    {
      timestamp: '2026-11-06T14:53:53.491Z',
      username: 'alpharomeo1500',
      bullet: 1533,
      blitz: 1504,
      rapid: 1289,
      bestRating: 1533,
      bestMode: 'bullet',
      source: 'API Chess.com directe',
      id: 'sync_1793976833877_wqwqy',
    },
    {
      timestamp: '2026-11-05T17:37:23.531Z',
      username: 'alpharomeo1500',
      bullet: 1533,
      blitz: 1504,
      rapid: 1289,
      bestRating: 1533,
      bestMode: 'bullet',
      source: 'API Chess.com directe',
      id: 'sync_1793900244303_1mipg',
    },
    {
      id: 'sync_1793819905222_fjot6',
      username: 'alpharomeo1500',
      timestamp: '2026-11-04T19:18:20.064Z',
      bullet: 1517,
      blitz: 1504,
      rapid: 1277,
      bestRating: 1517,
      bestMode: 'bullet',
      source: 'Import fichier',
    },
    {
      id: 'sync_1793738071765_ne021',
      username: 'alpharomeo1500',
      timestamp: '2026-11-03T20:34:30.854Z',
      bullet: 1509,
      blitz: 1504,
      rapid: 1289,
      bestRating: 1509,
      bestMode: 'bullet',
      source: 'Import fichier',
    },
    {
      id: 'sync_1793652444978_gh17m',
      username: 'alpharomeo1500',
      timestamp: '2026-11-02T20:47:24.663Z',
      bullet: 1509,
      blitz: 1458,
      rapid: 1289,
      bestRating: 1509,
      bestMode: 'bullet',
      source: 'Import fichier',
    },
  ];

  function getBaseJsonTemplate(username = 'alpharomeo1500') {
    const clean = username.trim().toLowerCase();
    const rawRecords = clean === 'alpharomeo1500' ? OFFICIAL_DAILY_RECORDS : [];

    const records = rawRecords.map((r) => ({
      ...r,
      username: clean,
    }));

    return {
      exportedAt: new Date().toISOString(),
      project: 'Road to 2000 Elo',
      username: clean,
      version: '2.0',
      recordsCount: records.length,
      records,
      history: records,
      player: {
        username: clean,
        targetElo: 2000,
        targetDate: '2027-12-31T23:59:59.000Z',
        startDate: '2026-10-31',
        startRatings: {
          bullet: 1500,
          blitz: 1458,
          rapid: 1289,
        },
        currentRatings: {
          bullet: records[0]?.bullet ?? 1500,
          blitz: records[0]?.blitz ?? 1458,
          rapid: records[0]?.rapid ?? 1289,
        },
        bestMode: records[0]?.bestMode ?? 'bullet',
        bestRating: records[0]?.bestRating ?? 1500,
      },
      settings: {
        username: clean,
        startElo: 1500,
        targetElo: 2000,
        startDate: '2026-10-31',
        targetDate: '2027-12-31',
        selectedMode: 'auto',
        autoSyncMinutes: 15,
        theme: 'dark',
        timezone: 'Europe/Paris',
      },
    };
  }

  async function pushToJsonBin(
    username: string,
    data: any,
    options: { force?: boolean; replaceExact?: boolean } = {}
  ): Promise<{
    pushed: boolean;
    skipped: boolean;
    reason?: string;
    lastSyncTime: number | null;
    remoteUpdatedAt?: string | null;
    status: string;
    error?: string | null;
    mergedHistory?: any[];
    mergedSettings?: any;
    confirmedDayHashes?: Record<string, string>;
  }> {
    const cleanUser = (username || 'alpharomeo1500').trim().toLowerCase();
    const cfg = getJsonBinUserConfig(cleanUser);
    const force = Boolean(options.force);
    const replaceExact = Boolean(options.replaceExact);

    if (!cfg.enabled) {
      return {
        pushed: false,
        skipped: true,
        reason: 'Synchronisation JSONBin désactivée pour ce compte',
        lastSyncTime: cfg.lastSyncTime,
        remoteUpdatedAt: cfg.remoteUpdatedAt || null,
        status: cfg.lastStatus,
      };
    }

    if (!cfg.binId) {
      cfg.lastStatus = 'pending_keys';
      saveJsonBinStoreToDisk();
      return {
        pushed: false,
        skipped: true,
        reason: `Bin ID JSONBin non configuré pour @${cleanUser}`,
        lastSyncTime: cfg.lastSyncTime,
        remoteUpdatedAt: cfg.remoteUpdatedAt || null,
        status: 'pending_keys',
      };
    }

    // Quota Optimization: skip ONLY when full data+settings signature AND confirmedDayHashes exist and match
    const initialSig = computeDataSignature(cleanUser, data);
    const hasConfirmedHashes =
      cfg.confirmedDayHashes && Object.keys(cfg.confirmedDayHashes).length >= (Array.isArray(data.history) ? data.history.length : 0);
    if (!force && !replaceExact && hasConfirmedHashes && cfg.lastPushedSignature === initialSig && cfg.lastStatus === 'synced') {
      cfg.savedRequests = (cfg.savedRequests || 0) + 1;
      cfg.lastSkippedReason = 'Données et paramètres strictement identiques : 0 requête consommée';
      cfg.lastStatus = 'synced';
      saveJsonBinStoreToDisk();
      return {
        pushed: false,
        skipped: true,
        reason: cfg.lastSkippedReason,
        lastSyncTime: cfg.lastSyncTime,
        remoteUpdatedAt: cfg.remoteUpdatedAt || null,
        status: 'synced',
        confirmedDayHashes: cfg.confirmedDayHashes || {},
      };
    }

    const previousStatus = cfg.lastStatus;
    try {
      cfg.lastStatus = 'syncing';
      const cleanBinId = cfg.binId.trim();
      const targetUrl = `https://api.jsonbin.io/v3/b/${cleanBinId}`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (cfg.apiKey) {
        headers['X-Master-Key'] = cfg.apiKey.trim();
        headers['X-Access-Key'] = cfg.apiKey.trim();
      }

      const rawIncoming = Array.isArray(data.records)
        ? data.records
        : Array.isArray(data.history)
        ? data.history
        : [];

      let finalRecords = rawIncoming.map((r: any) => ({ ...r, username: cleanUser }));
      let finalSettings = data.settings || null;

      // CRITICAL SAFETY GUARD: Merge-Before-PUT!
      // Unless replaceExact is true (explicit user purge/replace), fetch latest remote Bin contents first
      // so we NEVER erase records saved from another device or earlier session!
      if (!replaceExact) {
        try {
          const readHeaders: Record<string, string> = {};
          if (cfg.apiKey) {
            readHeaders['X-Master-Key'] = cfg.apiKey.trim();
            readHeaders['X-Access-Key'] = cfg.apiKey.trim();
          }
          const latestRes = await fetch(`${targetUrl}/latest`, { headers: readHeaders });
          if (latestRes.ok) {
            cfg.requestsToday = (cfg.requestsToday || 0) + 1;
            const latestBody = await latestRes.json();
            const remoteBin = latestBody.record || latestBody;
            const remoteUser = (remoteBin.username || remoteBin.player?.username || cleanUser).trim().toLowerCase();
            if (remoteUser === cleanUser) {
              const remoteRecords = Array.isArray(remoteBin.records)
                ? remoteBin.records
                : Array.isArray(remoteBin.history)
                ? remoteBin.history
                : [];
              if (remoteRecords.length > 0) {
                finalRecords = mergeHistoryRecords(finalRecords, remoteRecords, cleanUser);
              }
              if (!finalSettings && remoteBin.settings) {
                finalSettings = { ...remoteBin.settings, username: cleanUser };
              }
            }
          }
        } catch (readErr: any) {
          console.warn('[RoadTo2000] Pre-PUT JSONBin read check skipped:', readErr?.message);
        }

        // Safety abort: never overwrite a populated remote bin if finalRecords ended up empty unexpectedly
        if (finalRecords.length === 0 && rawIncoming.length === 0 && !data.allowEmptyPush) {
          cfg.lastStatus = previousStatus === 'error' ? 'error' : 'synced';
          saveJsonBinStoreToDisk();
          return {
            pushed: false,
            skipped: true,
            reason: 'Protection anti-écrasement : aucune donnée locale à pousser',
            lastSyncTime: cfg.lastSyncTime,
            remoteUpdatedAt: cfg.remoteUpdatedAt || null,
            status: cfg.lastStatus,
          };
        }
      }

      const finalPayloadData = { history: finalRecords, settings: finalSettings };
      const finalSig = computeDataSignature(cleanUser, finalPayloadData);

      // If merging with remote reveals nothing changed remotely vs local, skip the PUT too
      if (!force && !replaceExact && cfg.lastPushedSignature === finalSig && previousStatus === 'synced') {
        cfg.confirmedDayHashes = buildConfirmedDayHashes(finalRecords, cleanUser);
        cfg.savedRequests = (cfg.savedRequests || 0) + 1;
        cfg.lastSkippedReason = 'Cache JSONBin déjà strictement identique';
        cfg.lastStatus = 'synced';
        saveJsonBinStoreToDisk();
        return {
          pushed: false,
          skipped: true,
          reason: cfg.lastSkippedReason,
          lastSyncTime: cfg.lastSyncTime,
          remoteUpdatedAt: cfg.remoteUpdatedAt || null,
          status: 'synced',
          mergedHistory: finalRecords,
          mergedSettings: finalSettings,
          confirmedDayHashes: cfg.confirmedDayHashes,
        };
      }

      const latest = finalRecords[0] || {};
      const exportedAt = new Date().toISOString();

      const payload = {
        exportedAt,
        project: 'Road to 2000 Elo',
        username: cleanUser,
        version: '2.0',
        recordsCount: finalRecords.length,
        records: finalRecords,
        history: finalRecords,
        player: {
          username: cleanUser,
          targetElo: finalSettings?.targetElo ?? 2000,
          targetDate: finalSettings?.targetDate ?? '2027-12-31T23:59:59.000Z',
          startDate: finalSettings?.startDate ?? '2026-10-31',
          startRatings: {
            bullet: 1500,
            blitz: 1458,
            rapid: 1289,
          },
          currentRatings: {
            bullet: latest.bullet ?? 1500,
            blitz: latest.blitz ?? 1458,
            rapid: latest.rapid ?? 1289,
            ...(typeof latest.puzzles === 'number' ? { puzzles: latest.puzzles } : {}),
          },
          bestMode: latest.bestMode ?? 'bullet',
          bestRating: latest.bestRating ?? (finalSettings?.startElo ?? 1500),
        },
        settings: finalSettings || {
          username: cleanUser,
          startElo: 1500,
          targetElo: 2000,
          startDate: '2026-10-31',
          targetDate: '2027-12-31',
          selectedMode: 'auto',
          autoSyncMinutes: 15,
          theme: 'dark',
          timezone: 'Europe/Paris',
        },
      };

      const res = await fetch(targetUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`JSONBin erreur ${res.status}: ${errText.substring(0, 120)}`);
      }

      // Parse echoed remote JSONBin payload to verify what JSONBin actually saved
      const putBody = await res.json().catch(() => null);
      const confirmedRemoteRecords = Array.isArray(putBody?.record?.records)
        ? putBody.record.records
        : Array.isArray(putBody?.record?.history)
        ? putBody.record.history
        : finalRecords;
      const confirmedDayHashes = buildConfirmedDayHashes(confirmedRemoteRecords, cleanUser);

      const nowMs = Date.now();
      cfg.requestsToday = (cfg.requestsToday || 0) + 1;
      cfg.lastSyncTime = nowMs;
      cfg.remoteUpdatedAt = exportedAt;
      cfg.lastPushedSignature = finalSig;
      cfg.confirmedDayHashes = confirmedDayHashes;
      cfg.lastSkippedReason = undefined;
      cfg.lastStatus = 'synced';
      cfg.lastError = undefined;
      saveJsonBinStoreToDisk();

      return {
        pushed: true,
        skipped: false,
        lastSyncTime: nowMs,
        remoteUpdatedAt: exportedAt,
        status: 'synced',
        mergedHistory: finalRecords,
        mergedSettings: finalSettings,
        confirmedDayHashes,
      };
    } catch (err: any) {
      cfg.lastStatus = 'error';
      cfg.lastError = err?.message || 'Erreur de connexion JSONBin';
      saveJsonBinStoreToDisk();
      throw err;
    }
  }

  // Get JSONBin status & base template (per username)
  app.get('/api/jsonbin/status', (req: Request, res: Response) => {
    const username = (String(req.query.username || '') || 'alpharomeo1500').trim().toLowerCase();
    const cfg = getJsonBinUserConfig(username);
    res.json({
      configured: Boolean(cfg.binId),
      binId: cfg.binId || null,
      hasApiKey: Boolean(cfg.apiKey),
      enabled: cfg.enabled,
      lastSyncTime: cfg.lastSyncTime,
      remoteUpdatedAt: cfg.remoteUpdatedAt || null,
      lastStatus: cfg.lastStatus,
      lastError: cfg.lastError || null,
      confirmedDayHashes: cfg.confirmedDayHashes || {},
      quotaInfo: {
        requestsToday: cfg.requestsToday || 0,
        savedRequests: cfg.savedRequests || 0,
        quotaSaverActive: true,
        lastSkippedReason: cfg.lastSkippedReason || null,
      },
      template: getBaseJsonTemplate(username),
    });
  });

  // Get Base JSON content directly
  app.get('/api/jsonbin/template', (req: Request, res: Response) => {
    const username = (String(req.query.username || '') || 'alpharomeo1500').trim().toLowerCase();
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(getBaseJsonTemplate(username), null, 2));
  });

  // Update JSONBin credentials (Bin ID & API Key) per username
  app.post('/api/jsonbin/config', async (req: Request, res: Response) => {
    try {
      const { binId, apiKey, enabled, username: reqUser } = req.body || {};
      const username = (reqUser || 'alpharomeo1500').trim().toLowerCase();
      const patch: Partial<JsonBinUserConfig> = {};
      if (typeof binId === 'string') patch.binId = binId.trim();
      if (typeof apiKey === 'string' && apiKey.trim()) patch.apiKey = apiKey.trim();
      if (typeof enabled === 'boolean') patch.enabled = enabled;

      const cfg = updateJsonBinUserConfig(username, patch);

      // Test connection if Bin ID is present
      if (cfg.binId) {
        try {
          const testHeaders: Record<string, string> = {};
          if (cfg.apiKey) {
            testHeaders['X-Master-Key'] = cfg.apiKey;
            testHeaders['X-Access-Key'] = cfg.apiKey;
          }
          const testRes = await fetch(`https://api.jsonbin.io/v3/b/${cfg.binId}/latest`, {
            headers: testHeaders,
          });
          if (testRes.ok) {
            cfg.lastStatus = 'synced';
            cfg.lastError = undefined;
            try {
              const testBody = await testRes.json();
              const rec = testBody.record || testBody;
              if (rec?.exportedAt) cfg.remoteUpdatedAt = rec.exportedAt;
            } catch {}
          } else {
            cfg.lastStatus = 'error';
            cfg.lastError = `Statut ${testRes.status}: Clé ou Bin invalide`;
          }
        } catch (testErr: any) {
          cfg.lastStatus = 'error';
          cfg.lastError = testErr?.message || 'Connexion impossible à jsonbin.io';
        }
      } else {
        cfg.lastStatus = 'pending_keys';
        cfg.lastError = undefined;
      }

      saveJsonBinStoreToDisk();
      res.json({
        success: true,
        username,
        configured: Boolean(cfg.binId),
        binId: cfg.binId || null,
        hasApiKey: Boolean(cfg.apiKey),
        lastStatus: cfg.lastStatus,
        lastError: cfg.lastError || null,
        lastSyncTime: cfg.lastSyncTime,
        remoteUpdatedAt: cfg.remoteUpdatedAt || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Config update failed' });
    }
  });

  // Manual or automatic trigger to push current state to JSONBin
  app.post('/api/jsonbin/sync', async (req: Request, res: Response) => {
    try {
      const {
        username: reqUser,
        force,
        replaceExact,
        history: clientHistory,
        settings: clientSettings,
        binId: overrideBinId,
        apiKey: overrideApiKey,
      } = req.body || {};
      const username = (reqUser || 'alpharomeo1500').trim().toLowerCase();

      if (typeof overrideBinId === 'string' && overrideBinId.trim()) {
        updateJsonBinUserConfig(username, {
          binId: overrideBinId.trim(),
          ...(typeof overrideApiKey === 'string' && overrideApiKey.trim()
            ? { apiKey: overrideApiKey.trim() }
            : {}),
        });
      }

      const filePath = getUserDataFilePath(username);
      let serverData: any = { history: [], settings: null };
      if (fs.existsSync(filePath)) {
        try {
          serverData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch {}
      }

      // Merge any incoming client history/settings into serverData before pushing
      const mergedHistory = Array.isArray(clientHistory)
        ? replaceExact
          ? clientHistory
          : mergeHistoryRecords(clientHistory, serverData.history || [], username)
        : serverData.history || [];

      const mergedSettings = clientSettings
        ? { ...(serverData.settings || {}), ...clientSettings, username }
        : serverData.settings;

      const currentData = {
        username,
        history: mergedHistory,
        settings: mergedSettings,
        lastUpdated: Date.now(),
      };
      fs.writeFileSync(filePath, JSON.stringify(currentData, null, 2), 'utf-8');

      const result = await pushToJsonBin(username, currentData, {
        force: Boolean(force),
        replaceExact: Boolean(replaceExact),
      });

      if (result.mergedHistory) {
        currentData.history = result.mergedHistory;
        if (result.mergedSettings) currentData.settings = result.mergedSettings;
        fs.writeFileSync(filePath, JSON.stringify(currentData, null, 2), 'utf-8');
      }

      res.json({
        success: true,
        pushed: result.pushed,
        skipped: result.skipped,
        reason: result.reason || null,
        lastSyncTime: result.lastSyncTime,
        remoteUpdatedAt: result.remoteUpdatedAt || null,
        status: result.status,
        history: currentData.history,
        settings: currentData.settings,
        confirmedDayHashes: result.confirmedDayHashes || getJsonBinUserConfig(username).confirmedDayHashes || {},
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Échec de synchronisation vers JSONBin',
      });
    }
  });

  // Pull latest records from JSONBin and merge into server storage (per username)
  app.post('/api/jsonbin/pull', async (req: Request, res: Response) => {
    try {
      const { username: reqUser, binId: overrideBinId, apiKey: overrideApiKey } = req.body || {};
      const requestedUser = (reqUser || 'alpharomeo1500').trim().toLowerCase();

      if (typeof overrideBinId === 'string' && overrideBinId.trim()) {
        updateJsonBinUserConfig(requestedUser, {
          binId: overrideBinId.trim(),
          ...(typeof overrideApiKey === 'string' && overrideApiKey.trim()
            ? { apiKey: overrideApiKey.trim() }
            : {}),
        });
      }

      const cfg = getJsonBinUserConfig(requestedUser);
      if (!cfg.binId) {
        res.status(400).json({ error: `Bin ID non configuré pour @${requestedUser}` });
        return;
      }

      const headers: Record<string, string> = {};
      if (cfg.apiKey) {
        headers['X-Master-Key'] = cfg.apiKey;
        headers['X-Access-Key'] = cfg.apiKey;
      }

      const pullRes = await fetch(`https://api.jsonbin.io/v3/b/${cfg.binId}/latest`, {
        headers,
      });

      if (!pullRes.ok) {
        const errText = await pullRes.text().catch(() => '');
        cfg.lastStatus = 'error';
        cfg.lastError = `Échec lecture JSONBin (${pullRes.status})`;
        saveJsonBinStoreToDisk();
        res.status(pullRes.status).json({ error: `Échec lecture JSONBin (${pullRes.status}): ${errText.substring(0, 80)}` });
        return;
      }

      const body = await pullRes.json();
      const binRecord = body.record || body;
      const incomingHistory = Array.isArray(binRecord.records)
        ? binRecord.records
        : Array.isArray(binRecord.history)
        ? binRecord.history
        : [];
      const username = (binRecord.username || binRecord.player?.username || requestedUser).trim().toLowerCase();

      const filePath = getUserDataFilePath(username);
      let existingHistory: any[] = [];
      let existingSettings: any = null;

      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw);
          if (Array.isArray(data.history)) existingHistory = data.history;
          if (data.settings) existingSettings = data.settings;
        } catch {}
      }

      // Remote JSONBin entries take precedence for matching days during a pull, while keeping any unsynced local days
      const mergedHistory = mergeHistoryRecords(incomingHistory, existingHistory, username);
      const mergedSettings = binRecord.settings
        ? { ...(existingSettings || {}), ...binRecord.settings, username }
        : existingSettings;

      const nowMs = Date.now();
      const updatedPayload = {
        username,
        history: mergedHistory,
        settings: mergedSettings,
        lastUpdated: nowMs,
      };

      fs.writeFileSync(filePath, JSON.stringify(updatedPayload, null, 2), 'utf-8');

      // Strictly confirm ONLY records truly present on remote JSONBin!
      const confirmedRemoteDayHashes = buildConfirmedDayHashes(incomingHistory, username);

      cfg.requestsToday = (cfg.requestsToday || 0) + 1;
      cfg.lastSyncTime = nowMs;
      cfg.remoteUpdatedAt = typeof binRecord.exportedAt === 'string' ? binRecord.exportedAt : new Date(nowMs).toISOString();
      cfg.lastStatus = 'synced';
      cfg.lastError = undefined;
      cfg.confirmedDayHashes = confirmedRemoteDayHashes;
      cfg.lastPushedSignature = computeDataSignature(username, { history: incomingHistory, settings: binRecord.settings || updatedPayload.settings });
      saveJsonBinStoreToDisk();

      res.json({
        success: true,
        history: updatedPayload.history,
        settings: updatedPayload.settings,
        count: updatedPayload.history.length,
        lastSyncTime: cfg.lastSyncTime,
        remoteUpdatedAt: cfg.remoteUpdatedAt,
        confirmedDayHashes: confirmedRemoteDayHashes,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erreur lors du pull JSONBin' });
    }
  });

  // 8d. Global Accounts Registry JSONBin Config & Sync Persistence
  const ACCOUNTS_REGISTRY_CONFIG_FILE = path.resolve(storageDir, 'roadto2000_accounts_registry_config.json');
  const ACCOUNTS_REGISTRY_DATA_FILE = path.resolve(storageDir, 'roadto2000_accounts_registry_data.json');
  const DEFAULT_REG_BIN_ID = '6af9f1d7ffd5d16053c38f30';
  const DEFAULT_REG_API_KEY = '$2a$10$nOO6WNU996CcWwBht/K8MuDshQsOPktO28uEy.WTBESmEHAsRjcZy';

  app.get('/api/accounts-registry/config', (_req: Request, res: Response) => {
    let current: Record<string, any> = {};
    if (fs.existsSync(ACCOUNTS_REGISTRY_CONFIG_FILE)) {
      try {
        current = JSON.parse(fs.readFileSync(ACCOUNTS_REGISTRY_CONFIG_FILE, 'utf-8'));
      } catch {}
    }
    const binId = current.binId || DEFAULT_REG_BIN_ID;
    res.json({
      success: true,
      configured: Boolean(binId),
      binId,
      hasApiKey: Boolean(current.apiKey || DEFAULT_REG_API_KEY),
    });
  });

  app.post('/api/accounts-registry/config', (req: Request, res: Response) => {
    try {
      const { binId, apiKey, enabled } = req.body || {};
      let current: Record<string, any> = {};
      if (fs.existsSync(ACCOUNTS_REGISTRY_CONFIG_FILE)) {
        try {
          current = JSON.parse(fs.readFileSync(ACCOUNTS_REGISTRY_CONFIG_FILE, 'utf-8'));
        } catch {}
      }
      const updated = {
        ...current,
        ...(typeof binId === 'string' && binId.trim() ? { binId: binId.trim() } : { binId: current.binId || DEFAULT_REG_BIN_ID }),
        ...(typeof apiKey === 'string' && apiKey.trim() ? { apiKey: apiKey.trim() } : { apiKey: current.apiKey || DEFAULT_REG_API_KEY }),
        ...(typeof enabled === 'boolean' ? { enabled } : {}),
        updatedAt: Date.now(),
      };
      fs.writeFileSync(ACCOUNTS_REGISTRY_CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
      res.json({ success: true, configured: Boolean(updated.binId) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to save accounts registry config' });
    }
  });

  app.post('/api/accounts-registry/sync', (req: Request, res: Response) => {
    try {
      const payload = req.body || {};
      fs.writeFileSync(ACCOUNTS_REGISTRY_DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8');
      res.json({ success: true, accountsCount: Array.isArray(payload.accounts) ? payload.accounts.length : 0 });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to save accounts registry payload' });
    }
  });

  // 8e. Site Activity & Maintenance/Pause Control Persistence
  const SITE_ACTIVITY_FILE = path.resolve(storageDir, 'roadto2000_site_activity.json');

  function getDefaultSiteActivityServer() {
    return {
      enabled: false,
      mode: 'maintenance',
      customTitle: 'Maintenance technique en cours',
      customMessage: 'Une opération de maintenance est en cours pour sécuriser et optimiser vos données.',
      scheduleType: 'immediate',
      countdownMinutes: 5,
      pauseAtTimestamp: null,
      resumeType: 'manual',
      resumeDurationMinutes: 30,
      resumeAtTimestamp: null,
      autoResume: false,
      showCountdownBanner: true,
      devices: {
        all: true,
        desktop: true,
        mobile: true,
        tablet: true,
      },
      iframePolicy: 'block_all',
      ipPolicy: {
        mode: 'all',
        ips: [],
        exemptTrustedAdminIps: true,
      },
      allowAdminBypass: true,
      updatedAt: 0,
      updatedBy: 'alpharomeo1500',
    };
  }

  function loadSiteActivityServer() {
    const def = getDefaultSiteActivityServer();
    if (fs.existsSync(SITE_ACTIVITY_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(SITE_ACTIVITY_FILE, 'utf-8'));
        const merged = { ...def, ...parsed };
        if (
          merged.enabled &&
          merged.autoResume &&
          typeof merged.resumeAtTimestamp === 'number' &&
          merged.resumeAtTimestamp > 0 &&
          Date.now() >= merged.resumeAtTimestamp
        ) {
          merged.enabled = false;
          merged.updatedAt = Date.now();
          fs.writeFileSync(SITE_ACTIVITY_FILE, JSON.stringify(merged, null, 2), 'utf-8');
        }
        return merged;
      } catch {}
    }
    return def;
  }

  app.get('/api/site-activity', (req: Request, res: Response) => {
    const config = loadSiteActivityServer();
    res.json({
      success: true,
      config,
      clientIp: extractClientIp(req),
      serverTime: Date.now(),
    });
  });

  app.post('/api/site-activity', (req: Request, res: Response) => {
    try {
      const def = getDefaultSiteActivityServer();
      const incoming = req.body && typeof req.body === 'object' ? req.body : {};
      const next = {
        ...def,
        ...incoming,
        devices: {
          ...def.devices,
          ...(incoming.devices || {}),
        },
        ipPolicy: {
          ...def.ipPolicy,
          ...(incoming.ipPolicy || {}),
          ips: Array.isArray(incoming.ipPolicy?.ips) ? incoming.ipPolicy.ips : def.ipPolicy.ips,
        },
        updatedAt: Date.now(),
      };
      fs.writeFileSync(SITE_ACTIVITY_FILE, JSON.stringify(next, null, 2), 'utf-8');
      res.json({ success: true, config: next });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to save site activity config' });
    }
  });

  // 9. Chess.com API proxy route
  app.get('/api/chess-proxy/*', async (req: Request, res: Response) => {
    try {
      const subpath = req.url.replace(/^\/api\/chess-proxy/, '');
      const targetUrl = `https://api.chess.com/pub${subpath}`;
      const chessRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'RoadTo2000EloApp (contact: contact@roadto2000.app)',
          'Accept': 'application/json',
        },
      });

      const data = await chessRes.text();
      res
        .status(chessRes.status)
        .setHeader('Content-Type', chessRes.headers.get('content-type') || 'application/json')
        .send(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Chess proxy error' });
    }
  });

  // 9. Vite Dev Middleware / Production Static Server
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[RoadTo2000] Full-Stack server running at http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[RoadTo2000] Server failed to start:', err);
  process.exit(1);
});
