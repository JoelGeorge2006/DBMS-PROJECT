/**
 * MINERVA — server-side authentication
 *
 * - PINs are stored as scrypt hashes with a per-user salt; comparison is timing-safe.
 * - A session is a random 32-byte token in an httpOnly, SameSite=Strict cookie.
 *   Only its SHA-256 is stored (USER_SESSION), so a leaked database can't be replayed.
 * - Session lookups go through an LRU cache (dsa/LRUCache.js) in front of the table.
 * - Failed sign-ins are rate-limited with sliding windows of attempt times
 *   (dsa/SlidingWindow.js): 5 failures for one account from one address lock that
 *   pair for 15 minutes, so a stranger can't lock someone out from elsewhere;
 *   20 failures from one address lock the address; 50 failures on one account
 *   from anywhere lock the account (stored in APP_USER.locked_until, so it
 *   survives a restart).
 * - PIN reset is a demo (no e-mail/SMS): the code is returned to the caller. It is
 *   refused for administrator accounts; reset those with `npm run reset-pin`.
 * - Roles map to permission sets; requirePermission() guards routes.
 */
import crypto from 'crypto';
import { LRUCache } from '../dsa/LRUCache.js';
import { SlidingWindowLimiter } from '../dsa/SlidingWindow.js';

export const SESSION_COOKIE = 'minerva_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const RESET_TTL_MS = 10 * 60 * 1000;
const MIN_PIN_LENGTH = 6;

export const ROLES = {
  admin: { label: 'Database Administrator', permissions: new Set(['view', 'sql', 'manage_users']) },
  inspector: { label: 'Mining Lease Inspector', permissions: new Set(['view']) },
  surveyor: { label: 'Geological Field Surveyor', permissions: new Set(['view']) },
  viewer: { label: 'Viewer', permissions: new Set(['view']) },
};

// Demo accounts seeded into APP_USER (PINs are hashed on insert)
export const DEMO_USERS = [
  { username: 'USR-1024', display_name: 'Joel George', role: 'admin', pin: 'minerva@2026' },
  { username: 'INS-4088', display_name: 'R. K. Sharma', role: 'inspector', pin: 'inspector@2026' },
  { username: 'GEO-9921', display_name: 'Ananya Sen', role: 'surveyor', pin: 'surveyor@2026' },
];

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(pin), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString('hex');
  return { hash, salt };
}

export function verifyPin(pin, hash, salt) {
  const candidate = Buffer.from(hashPin(pin, salt).hash, 'hex');
  const stored = Buffer.from(hash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

/** Insert the demo users if APP_USER is empty (fresh or migrated databases) */
export function ensureDemoUsers(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM APP_USER').get().n > 0) return 0;
  const insert = db.prepare(`INSERT INTO APP_USER (username, display_name, role, password_hash, password_salt, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  db.transaction(() => {
    DEMO_USERS.forEach((u) => {
      const { hash, salt } = hashPin(u.pin);
      insert.run(u.username, u.display_name, u.role, hash, salt, new Date().toISOString());
    });
  })();
  return DEMO_USERS.length;
}

// ---------------------------------------------------------------------------
// Auth service bound to a database
// ---------------------------------------------------------------------------
export function createAuth(db) {
  const sessions = new LRUCache(1000);
  const WINDOW = 15 * 60 * 1000;
  // username|address: the lock a normal user meets after 5 wrong PINs
  const userLimiter = new SlidingWindowLimiter({ limit: 5, windowMs: WINDOW });
  // Per address the bar is higher: several people may share one network
  const ipLimiter = new SlidingWindowLimiter({ limit: 20, windowMs: WINDOW });
  // One account attacked from many addresses
  const accountLimiter = new SlidingWindowLimiter({ limit: 50, windowMs: WINDOW });
  // Reset codes requested per account (each request cancels the previous code)
  const resetLimiter = new SlidingWindowLimiter({ limit: 3, windowMs: WINDOW });

  const q = {
    userByName: db.prepare('SELECT * FROM APP_USER WHERE username = ? COLLATE NOCASE'),
    userById: db.prepare('SELECT * FROM APP_USER WHERE user_id = ?'),
    addSession: db.prepare('INSERT INTO USER_SESSION (token_hash, user_id, created_at, expires_at, last_seen, ip) VALUES (?, ?, ?, ?, ?, ?)'),
    session: db.prepare(`SELECT s.token_hash, s.expires_at, s.last_seen, u.user_id, u.username, u.display_name, u.role
      FROM USER_SESSION s JOIN APP_USER u ON u.user_id = s.user_id WHERE s.token_hash = ?`),
    deleteSession: db.prepare('DELETE FROM USER_SESSION WHERE token_hash = ?'),
    deleteUserSessions: db.prepare('DELETE FROM USER_SESSION WHERE user_id = ?'),
    deleteExpired: db.prepare('DELETE FROM USER_SESSION WHERE expires_at <= ?'),
    touch: db.prepare('UPDATE USER_SESSION SET last_seen = ? WHERE token_hash = ?'),
    setFailures: db.prepare('UPDATE APP_USER SET failed_attempts = ?, locked_until = ? WHERE user_id = ?'),
    setPin: db.prepare('UPDATE APP_USER SET password_hash = ?, password_salt = ?, failed_attempts = 0, locked_until = NULL WHERE user_id = ?'),
    audit: db.prepare('INSERT INTO AUDIT_LOG (user_id, username, action, detail, ip, at) VALUES (?, ?, ?, ?, ?, ?)'),
    addReset: db.prepare('INSERT INTO PIN_RESET (user_id, code_hash, expires_at, used) VALUES (?, ?, ?, 0)'),
    latestReset: db.prepare('SELECT * FROM PIN_RESET WHERE user_id = ? AND used = 0 ORDER BY reset_id DESC LIMIT 1'),
    useReset: db.prepare('UPDATE PIN_RESET SET used = 1 WHERE user_id = ? AND used = 0'),
    resetAttempt: db.prepare('UPDATE PIN_RESET SET attempts = attempts + 1 WHERE reset_id = ?'),
    knownIp: db.prepare("SELECT 1 FROM AUDIT_LOG WHERE user_id = ? AND action = 'login' AND ip = ? LIMIT 1"),
  };

  const audit = (user, action, detail, ip) =>
    q.audit.run(user?.user_id ?? null, user?.username ?? null, action, detail ?? null, ip ?? null, new Date().toISOString());

  const publicUser = (u) => ({
    id: u.user_id,
    username: u.username,
    name: u.display_name,
    role: u.role,
    roleLabel: ROLES[u.role]?.label || u.role,
    permissions: [...(ROLES[u.role]?.permissions || [])],
  });

  const pairKey = (username, ip) => `${username.toLowerCase()}|${ip}`;

  function lockState(username, ip, user) {
    const now = Date.now();
    const states = [userLimiter.check(pairKey(username, ip), now), ipLimiter.check(ip, now), accountLimiter.check(username.toLowerCase(), now)];
    // A lock written by an earlier run of the server still applies
    const stored = user?.locked_until ? new Date(user.locked_until).getTime() - now : 0;
    if (stored > 0) states.push({ locked: true, retryAfterMs: stored });
    const locked = states.filter((st) => st.locked);
    if (locked.length) return { locked: true, retryAfterMs: Math.max(...locked.map((st) => st.retryAfterMs)) };
    return { locked: false };
  }

  function recordFailure(username, ip, user) {
    const now = Date.now();
    const pair = userLimiter.record(pairKey(username, ip), now);
    const byIp = ipLimiter.record(ip, now);
    const account = accountLimiter.record(username.toLowerCase(), now);
    if (user) {
      q.setFailures.run(account.attempts, account.locked ? new Date(now + account.retryAfterMs).toISOString() : null, user.user_id);
    }
    const locked = [pair, byIp, account].filter((st) => st.locked);
    if (locked.length) return { locked: true, retryAfterMs: Math.max(...locked.map((st) => st.retryAfterMs)) };
    return { locked: false, attemptsLeft: userLimiter.limit - pair.attempts };
  }

  return {
    sessions,
    userLimiter,
    ipLimiter,
    publicUser,

    /** -> { ok, user, token, newIp } | { ok: false, status, error, retryAfterMs?, attemptsLeft? } */
    login(username, pin, ip) {
      const name = String(username || '').trim();
      const user = name ? q.userByName.get(name) : null;
      const lock = lockState(name, ip, user);
      if (lock.locked) {
        return { ok: false, status: 429, error: 'Too many failed attempts.', retryAfterMs: lock.retryAfterMs };
      }
      // Hash even for unknown users so response time doesn't reveal which usernames exist
      const valid = user ? verifyPin(pin, user.password_hash, user.password_salt) : (hashPin(String(pin || 'x')), false);
      if (!valid) {
        const s = recordFailure(name || '(blank)', ip, user);
        audit(user, 'login_failed', name, ip);
        if (s.locked) return { ok: false, status: 429, error: 'Too many failed attempts.', retryAfterMs: s.retryAfterMs };
        return { ok: false, status: 401, error: 'Wrong identifier or PIN.', attemptsLeft: s.attemptsLeft };
      }

      userLimiter.reset(pairKey(name, ip));
      q.setFailures.run(0, null, user.user_id);
      const newIp = !q.knownIp.get(user.user_id, ip);
      const token = crypto.randomBytes(32).toString('base64url');
      const now = Date.now();
      const expiresAt = now + SESSION_TTL_MS;
      q.addSession.run(sha256(token), user.user_id, new Date(now).toISOString(), new Date(expiresAt).toISOString(), new Date(now).toISOString(), ip);
      audit(user, 'login', null, ip);
      q.deleteExpired.run(new Date(now).toISOString());
      return { ok: true, user: publicUser(user), token, newIp, maxAgeMs: SESSION_TTL_MS };
    },

    /** User for a session token, or null. Served from the LRU cache when possible. */
    sessionUser(token) {
      if (!token) return null;
      const key = sha256(token);
      const now = Date.now();
      const cached = sessions.get(key, now);
      if (cached) {
        // Record activity at most once a minute per session
        if (now - cached.lastTouched > 60 * 1000) {
          cached.lastTouched = now;
          q.touch.run(new Date(now).toISOString(), key);
        }
        return cached.user;
      }
      const row = q.session.get(key);
      if (!row) return null;
      const left = new Date(row.expires_at).getTime() - now;
      if (left <= 0) {
        q.deleteSession.run(key);
        return null;
      }
      const user = publicUser(row);
      sessions.set(key, { user, lastTouched: now }, left, now);
      q.touch.run(new Date(now).toISOString(), key);
      return user;
    },

    logout(token) {
      if (!token) return;
      const key = sha256(token);
      const row = q.session.get(key);
      sessions.delete(key);
      q.deleteSession.run(key);
      if (row) audit(row, 'logout', null, null);
    },

    /** Demo PIN reset: the code is returned to the caller because no e-mail/SMS is sent */
    requestReset(username, ip) {
      const name = String(username || '').trim();
      const locks = [ipLimiter.check(ip), resetLimiter.check(name.toLowerCase())].filter((st) => st.locked);
      if (locks.length) return { ok: false, status: 429, error: 'Too many reset requests.', retryAfterMs: Math.max(...locks.map((st) => st.retryAfterMs)) };
      ipLimiter.record(ip);
      resetLimiter.record(name.toLowerCase());
      const user = q.userByName.get(name);
      // The demo hands out the code; never do that for an account that can run SQL
      if (user && ROLES[user.role]?.permissions.has('sql')) {
        return { ok: false, status: 403, error: 'Administrator PINs are reset on the server: npm run reset-pin -- <identifier>.' };
      }
      if (!user) return { ok: false, status: 404, error: 'No account with that identifier.' };
      const code = String(crypto.randomInt(100000, 1000000));
      q.useReset.run(user.user_id);
      q.addReset.run(user.user_id, sha256(code), new Date(Date.now() + RESET_TTL_MS).toISOString());
      audit(user, 'reset_requested', null, ip);
      return { ok: true, demoCode: code, expiresInMinutes: RESET_TTL_MS / 60000 };
    },

    confirmReset(username, code, newPin, ip) {
      const user = q.userByName.get(String(username || '').trim());
      const reset = user ? q.latestReset.get(user.user_id) : null;
      if (!user || !reset) return { ok: false, status: 400, error: 'Request a new code first.' };
      if (new Date(reset.expires_at).getTime() <= Date.now()) return { ok: false, status: 400, error: 'That code has expired. Request a new one.' };
      if (reset.attempts >= 5) return { ok: false, status: 429, error: 'Too many wrong codes. Request a new one.' };
      if (sha256(String(code || '').trim()) !== reset.code_hash) {
        q.resetAttempt.run(reset.reset_id);
        ipLimiter.record(ip);
        return { ok: false, status: 400, error: 'That code is not correct.' };
      }
      if (String(newPin || '').length < MIN_PIN_LENGTH) {
        return { ok: false, status: 400, error: `The new PIN must be at least ${MIN_PIN_LENGTH} characters.` };
      }
      const { hash, salt } = hashPin(newPin);
      db.transaction(() => {
        q.setPin.run(hash, salt, user.user_id);
        q.useReset.run(user.user_id);
        q.deleteUserSessions.run(user.user_id);
      })();
      // Signed out everywhere: old sessions must not survive a PIN change
      sessions.deleteWhere((v) => v.user.id === user.user_id);
      accountLimiter.reset(user.username.toLowerCase());
      audit(user, 'reset_completed', null, ip);
      return { ok: true };
    },

    stats() {
      return {
        sessionCache: { size: sessions.size, capacity: sessions.capacity, hits: sessions.hits, misses: sessions.misses, hitRate: sessions.hitRate() },
        limiter: {
          accountsWithFailures: userLimiter.activeKeys(),
          addressesWithFailures: ipLimiter.activeKeys(),
          limit: userLimiter.limit,
          windowMinutes: userLimiter.windowMs / 60000,
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
export function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionCookie(token, maxAgeMs) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}`;
}

export const clearedCookie = () => `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;

export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
