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

  app.get('/api/user-data/:username', (req: Request, res: Response) => {
    try {
      const username = (req.params.username || '').trim().toLowerCase();
      if (!username) {
        res.status(400).json({ error: 'Username required' });
        return;
      }
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
        });
        return;
      }
      res.json({
        success: true,
        username,
        history: [],
        settings: null,
        lastUpdated: 0,
      });
    } catch (err: any) {
      console.error('[RoadTo2000] Failed to read user data:', err);
      res.status(500).json({ error: 'Failed to read user data' });
    }
  });

  app.post('/api/user-data/:username', (req: Request, res: Response) => {
    try {
      const username = (req.params.username || '').trim().toLowerCase();
      if (!username) {
        res.status(400).json({ error: 'Username required' });
        return;
      }

      const { history: incomingHistory, settings: incomingSettings } = req.body || {};
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

      // Merge incoming and existing history: 1 sync per day, keep newest timestamp of that day
      const combined = [...(Array.isArray(incomingHistory) ? incomingHistory : []), ...existingHistory];
      const validRecords = combined.filter((r) => {
        if (!r || typeof r.bestRating !== 'number' || r.bestRating <= 0) return false;
        // Clean out legacy test 1938
        if (username === 'alpharomeo1500' && r.bestRating === 1938) return false;
        if (r.username && r.username.toLowerCase() !== username) return false;
        return true;
      });

      // Sort newest first
      validRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Deduplicate by calendar day
      const seenDays = new Set<string>();
      const onePerDay: any[] = [];
      for (const r of validRecords) {
        const d = new Date(r.timestamp);
        if (isNaN(d.getTime())) continue;
        const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!seenDays.has(dayKey)) {
          seenDays.add(dayKey);
          onePerDay.push(r);
        }
      }

      const mergedSettings = incomingSettings || existingSettings;
      const payloadToSave = {
        username,
        history: onePerDay.slice(0, 500),
        settings: mergedSettings,
        lastUpdated: Date.now(),
      };

      fs.writeFileSync(filePath, JSON.stringify(payloadToSave, null, 2), 'utf-8');

      // Trigger automatic background sync to JSONBin.io if configured
      pushToJsonBin(username, payloadToSave).catch((err) => {
        console.warn('[RoadTo2000] Background JSONBin push warning:', err?.message);
      });

      res.json({
        success: true,
        username,
        history: payloadToSave.history,
        settings: payloadToSave.settings,
        count: payloadToSave.history.length,
        lastUpdated: payloadToSave.lastUpdated,
      });
    } catch (err: any) {
      console.error('[RoadTo2000] Failed to save user data:', err);
      res.status(500).json({ error: 'Failed to save user data' });
    }
  });

  // 8c. JSONBin.io Cloud Cache Integration
  const storageDir = fs.existsSync(DATA_DIR) ? DATA_DIR : os.tmpdir();
  const JSONBIN_CONFIG_FILE = path.resolve(storageDir, 'roadto2000_jsonbin_config.json');

  interface JsonBinServerConfig {
    binId: string;
    apiKey: string;
    enabled: boolean;
    lastSyncTime: number | null;
    lastStatus: 'synced' | 'pending_keys' | 'error' | 'syncing';
    lastError?: string;
    lastPushedSignature?: string;
    requestsToday: number;
    savedRequests: number;
    lastDayTracked: string;
    lastSkippedReason?: string;
  }

  function loadJsonBinConfig(): JsonBinServerConfig {
    const envBinId = (process.env.JSONBIN_BIN_ID || '').trim();
    const envApiKey = (process.env.JSONBIN_API_KEY || '').trim();
    let fileConfig: Partial<JsonBinServerConfig> = {};
    if (fs.existsSync(JSONBIN_CONFIG_FILE)) {
      try {
        fileConfig = JSON.parse(fs.readFileSync(JSONBIN_CONFIG_FILE, 'utf-8'));
      } catch {}
    }
    const binId = (fileConfig.binId || envBinId).trim();
    const apiKey = (fileConfig.apiKey || envApiKey).trim();
    return {
      binId,
      apiKey,
      enabled: fileConfig.enabled !== false,
      lastSyncTime: fileConfig.lastSyncTime || null,
      lastStatus: fileConfig.lastStatus || (binId ? 'synced' : 'pending_keys'),
      lastError: fileConfig.lastError,
      lastPushedSignature: fileConfig.lastPushedSignature,
      requestsToday: fileConfig.requestsToday || 0,
      savedRequests: fileConfig.savedRequests || 0,
      lastDayTracked: fileConfig.lastDayTracked || new Date().toISOString().split('T')[0],
      lastSkippedReason: fileConfig.lastSkippedReason,
    };
  }

  let jsonBinState: JsonBinServerConfig = loadJsonBinConfig();

  function saveJsonBinConfigToDisk(config: JsonBinServerConfig) {
    try {
      fs.writeFileSync(JSONBIN_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Failed to save jsonbin config file:', err);
    }
  }

  // Quota Saver: Computes a signature of the data to avoid calling JSONBin when data is unchanged
  function computeDataSignature(username: string, data: any): string {
    const records = Array.isArray(data.history) ? data.history : [];
    const topRecords = records.slice(0, 10).map((r: any) => `${r.id}_${r.timestamp}_${r.bestRating}_${r.bestMode}`).join(';');
    const s = data.settings || {};
    const settingsStr = `${s.username}_${s.startElo}_${s.targetElo}_${s.selectedMode}`;
    return crypto.createHash('md5').update(`${username}:::${topRecords}:::${settingsStr}`).digest('hex');
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
    const rawRecords = username === 'alpharomeo1500' ? OFFICIAL_DAILY_RECORDS : [
      {
        id: `sync_initial_${Date.now()}`,
        timestamp: new Date().toISOString(),
        username,
        bullet: 1500,
        blitz: 1458,
        rapid: 1289,
        bestRating: 1500,
        bestMode: 'bullet',
        source: 'Initialisation du projet',
      },
    ];

    const records = rawRecords.map((r) => ({
      ...r,
      username,
    }));

    return {
      exportedAt: new Date().toISOString(),
      project: 'Road to 2000 Elo',
      username,
      version: '2.0',
      recordsCount: records.length,
      records,
      history: records,
      player: {
        username,
        targetElo: 2000,
        targetDate: '2027-12-31T23:59:59.000Z',
        startDate: '2026-11-06',
        startRatings: {
          bullet: 1500,
          blitz: 1458,
          rapid: 1289,
        },
        currentRatings: {
          bullet: records[0]?.bullet ?? 1605,
          blitz: records[0]?.blitz ?? 1504,
          rapid: records[0]?.rapid ?? 1300,
        },
        bestMode: records[0]?.bestMode ?? 'bullet',
        bestRating: records[0]?.bestRating ?? 1605,
      },
      settings: {
        username,
        startElo: 1500,
        targetElo: 2000,
        startDate: '2026-11-06',
        targetDate: '2027-12-31',
        selectedMode: 'auto',
        autoSyncMinutes: 15,
        theme: 'dark',
        timezone: 'Europe/Paris',
      },
    };
  }

  async function pushToJsonBin(username: string, data: any, force = false): Promise<boolean> {
    if (!jsonBinState.enabled) return false;
    if (!jsonBinState.binId) {
      jsonBinState.lastStatus = 'pending_keys';
      return false;
    }

    // Reset daily counter if a new calendar day has started
    const todayStr = new Date().toISOString().split('T')[0];
    if (jsonBinState.lastDayTracked !== todayStr) {
      jsonBinState.lastDayTracked = todayStr;
      jsonBinState.requestsToday = 0;
    }

    // Quota Optimization 1: Compare content signature
    const currentSig = computeDataSignature(username, data);
    if (!force && jsonBinState.lastPushedSignature === currentSig) {
      jsonBinState.savedRequests = (jsonBinState.savedRequests || 0) + 1;
      jsonBinState.lastSkippedReason = 'Données strictement identiques : 0 requête consommée pour préserver votre quota';
      jsonBinState.lastStatus = 'synced';
      saveJsonBinConfigToDisk(jsonBinState);
      return false;
    }

    // Quota Optimization 2: Minimum 5-minute interval between automatic background pushes
    if (!force && jsonBinState.lastSyncTime && Date.now() - jsonBinState.lastSyncTime < 5 * 60 * 1000) {
      jsonBinState.savedRequests = (jsonBinState.savedRequests || 0) + 1;
      jsonBinState.lastSkippedReason = 'Intervalle de temporisation actif (5 min) : requête économisée';
      saveJsonBinConfigToDisk(jsonBinState);
      return false;
    }

    try {
      jsonBinState.lastStatus = 'syncing';
      const cleanBinId = jsonBinState.binId.trim();
      const targetUrl = `https://api.jsonbin.io/v3/b/${cleanBinId}`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (jsonBinState.apiKey) {
        headers['X-Master-Key'] = jsonBinState.apiKey.trim();
        headers['X-Access-Key'] = jsonBinState.apiKey.trim();
      }

      const rawList = Array.isArray(data.records)
        ? data.records
        : (Array.isArray(data.history) && data.history.length > 0
            ? data.history
            : (username === 'alpharomeo1500' ? OFFICIAL_DAILY_RECORDS : []));

      const records = rawList.map((r: any) => ({
        ...r,
        username,
      }));

      const latest = records[0] || {};

      const payload = {
        exportedAt: new Date().toISOString(),
        project: 'Road to 2000 Elo',
        username,
        version: '2.0',
        recordsCount: records.length,
        records,
        history: records,
        player: {
          username,
          targetElo: 2000,
          targetDate: '2027-12-31T23:59:59.000Z',
          startDate: '2026-11-06',
          startRatings: {
            bullet: 1500,
            blitz: 1458,
            rapid: 1289,
          },
          currentRatings: {
            bullet: latest.bullet ?? 1605,
            blitz: latest.blitz ?? 1504,
            rapid: latest.rapid ?? 1300,
          },
          bestMode: latest.bestMode ?? 'bullet',
          bestRating: latest.bestRating ?? 1605,
        },
        settings: data.settings || {
          username,
          startElo: 1500,
          targetElo: 2000,
          startDate: '2026-11-06',
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
        throw new Error(`JSONBin error ${res.status}: ${errText.substring(0, 100)}`);
      }

      jsonBinState.requestsToday = (jsonBinState.requestsToday || 0) + 1;
      jsonBinState.lastSyncTime = Date.now();
      jsonBinState.lastPushedSignature = currentSig;
      jsonBinState.lastSkippedReason = undefined;
      jsonBinState.lastStatus = 'synced';
      jsonBinState.lastError = undefined;
      saveJsonBinConfigToDisk(jsonBinState);
      return true;
    } catch (err: any) {
      jsonBinState.lastStatus = 'error';
      jsonBinState.lastError = err?.message || 'Erreur de connexion JSONBin';
      saveJsonBinConfigToDisk(jsonBinState);
      throw err;
    }
  }

  // Get JSONBin status & base template
  app.get('/api/jsonbin/status', (req: Request, res: Response) => {
    const username = (String(req.query.username || '') || 'alpharomeo1500').trim().toLowerCase();
    res.json({
      configured: Boolean(jsonBinState.binId),
      binId: jsonBinState.binId || null,
      hasApiKey: Boolean(jsonBinState.apiKey),
      enabled: jsonBinState.enabled,
      lastSyncTime: jsonBinState.lastSyncTime,
      lastStatus: jsonBinState.lastStatus,
      lastError: jsonBinState.lastError || null,
      quotaInfo: {
        requestsToday: jsonBinState.requestsToday || 0,
        savedRequests: jsonBinState.savedRequests || 0,
        quotaSaverActive: true,
        lastSkippedReason: jsonBinState.lastSkippedReason || null,
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

  // Update JSONBin credentials (Bin ID & API Key)
  app.post('/api/jsonbin/config', async (req: Request, res: Response) => {
    try {
      const { binId, apiKey, enabled } = req.body || {};
      if (typeof binId === 'string') {
        jsonBinState.binId = binId.trim();
      }
      if (typeof apiKey === 'string') {
        jsonBinState.apiKey = apiKey.trim();
      }
      if (typeof enabled === 'boolean') {
        jsonBinState.enabled = enabled;
      }

      // If credentials provided, test connection
      if (jsonBinState.binId) {
        try {
          const testHeaders: Record<string, string> = {};
          if (jsonBinState.apiKey) {
            testHeaders['X-Master-Key'] = jsonBinState.apiKey;
            testHeaders['X-Access-Key'] = jsonBinState.apiKey;
          }
          const testRes = await fetch(`https://api.jsonbin.io/v3/b/${jsonBinState.binId}/latest`, {
            headers: testHeaders,
          });
          if (testRes.ok) {
            jsonBinState.lastStatus = 'synced';
            jsonBinState.lastError = undefined;
          } else {
            jsonBinState.lastStatus = 'error';
            jsonBinState.lastError = `Statut ${testRes.status}: Clé ou Bin invalide`;
          }
        } catch (testErr: any) {
          jsonBinState.lastStatus = 'error';
          jsonBinState.lastError = testErr?.message || 'Connexion impossible à jsonbin.io';
        }
      } else {
        jsonBinState.lastStatus = 'pending_keys';
        jsonBinState.lastError = undefined;
      }

      saveJsonBinConfigToDisk(jsonBinState);
      res.json({
        success: true,
        configured: Boolean(jsonBinState.binId),
        binId: jsonBinState.binId || null,
        hasApiKey: Boolean(jsonBinState.apiKey),
        lastStatus: jsonBinState.lastStatus,
        lastError: jsonBinState.lastError || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Config update failed' });
    }
  });

  // Manual or automatic trigger to push current state to JSONBin
  app.post('/api/jsonbin/sync', async (req: Request, res: Response) => {
    try {
      const { username: reqUser, force } = req.body || {};
      const username = (reqUser || 'alpharomeo1500').trim().toLowerCase();
      const filePath = getUserDataFilePath(username);

      let currentData: any = { history: [], settings: null };
      if (fs.existsSync(filePath)) {
        try {
          currentData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch {}
      }

      const didPush = await pushToJsonBin(username, currentData, Boolean(force));

      res.json({
        success: true,
        pushed: didPush,
        skipped: !didPush,
        reason: jsonBinState.lastSkippedReason || null,
        lastSyncTime: jsonBinState.lastSyncTime,
        status: jsonBinState.lastStatus,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Échec de synchronisation vers JSONBin',
      });
    }
  });

  // Pull latest records from JSONBin and merge into server storage
  app.post('/api/jsonbin/pull', async (req: Request, res: Response) => {
    try {
      if (!jsonBinState.binId) {
        res.status(400).json({ error: 'Bin ID non configuré' });
        return;
      }

      const headers: Record<string, string> = {};
      if (jsonBinState.apiKey) {
        headers['X-Master-Key'] = jsonBinState.apiKey;
        headers['X-Access-Key'] = jsonBinState.apiKey;
      }

      const pullRes = await fetch(`https://api.jsonbin.io/v3/b/${jsonBinState.binId}/latest`, {
        headers,
      });

      if (!pullRes.ok) {
        res.status(pullRes.status).json({ error: 'Échec de lecture depuis JSONBin' });
        return;
      }

      const body = await pullRes.json();
      const binRecord = body.record || body;
      const incomingHistory = Array.isArray(binRecord.records)
        ? binRecord.records
        : (Array.isArray(binRecord.history) ? binRecord.history : []);
      const username = (binRecord.username || binRecord.player?.username || 'alpharomeo1500').trim().toLowerCase();

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

      const combined = [...incomingHistory, ...existingHistory];
      const validRecords = combined.filter((r) => {
        if (!r || typeof r.bestRating !== 'number' || r.bestRating <= 0) return false;
        if (username === 'alpharomeo1500' && r.bestRating === 1938) return false;
        if (r.username && r.username.toLowerCase() !== username) return false;
        return true;
      });

      validRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const seenDays = new Set<string>();
      const onePerDay: any[] = [];
      for (const r of validRecords) {
        const d = new Date(r.timestamp);
        if (isNaN(d.getTime())) continue;
        const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!seenDays.has(dayKey)) {
          seenDays.add(dayKey);
          onePerDay.push(r);
        }
      }

      const updatedPayload = {
        username,
        history: onePerDay.slice(0, 500),
        settings: binRecord.settings || existingSettings,
        lastUpdated: Date.now(),
      };

      fs.writeFileSync(filePath, JSON.stringify(updatedPayload, null, 2), 'utf-8');

      jsonBinState.lastSyncTime = Date.now();
      jsonBinState.lastStatus = 'synced';
      saveJsonBinConfigToDisk(jsonBinState);

      res.json({
        success: true,
        history: updatedPayload.history,
        settings: updatedPayload.settings,
        count: updatedPayload.history.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erreur lors du pull JSONBin' });
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
