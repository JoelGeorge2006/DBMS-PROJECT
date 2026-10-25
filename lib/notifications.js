/**
 * MINERVA — notifications raised by rules over the data
 *
 * Each rule has a next-check time. The scheduler keeps the rules in the binary-heap
 * PriorityQueue (dsa/Queue.js) keyed by that time, so the next due rule is always
 * at the top: pop it, run it, push it back with its next time. Nothing polls the
 * whole table on a fixed beat.
 *
 * A notification has a dedupe key (e.g. "lease-1y:RJ-JJ-2012-114"), so a rule
 * re-run never raises the same notification twice.
 */
import { PriorityQueue } from '../dsa/Queue.js';

const DAY = 24 * 3600 * 1000;

export function createNotifications(db) {
  const insert = db.prepare(`INSERT OR IGNORE INTO NOTIFICATION (user_id, dedupe_key, rule, priority, mine_id, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const raise = (key, rule, priority, mineId, message, userId = null) =>
    insert.run(userId, key, rule, priority, mineId, message, new Date().toISOString()).changes;

  const RULES = [
    {
      name: 'lease-expiry',
      everyMs: DAY,
      run() {
        let n = 0;
        db.prepare(`SELECT le.lease_id, le.valid_till, m.mine_id, m.mine_name,
            julianday(le.valid_till) - julianday('now') AS days FROM LEASE le JOIN MINE m ON m.lease_id = le.lease_id`).all().forEach((r) => {
          if (r.days <= 365) n += raise(`lease-1y:${r.lease_id}`, 'lease-expiry', 'CRITICAL', r.mine_id, `${r.mine_name}: lease ${r.lease_id} ends ${r.valid_till}`);
          else if (r.days <= 5 * 365) n += raise(`lease-5y:${r.lease_id}`, 'lease-expiry', 'WARNING', r.mine_id, `${r.mine_name}: lease ${r.lease_id} ends within 5 years (${r.valid_till})`);
        });
        return n;
      },
    },
    {
      name: 'cto',
      everyMs: DAY,
      run() {
        let n = 0;
        db.prepare(`SELECT le.lease_id, le.cto_valid_till, m.mine_id, m.mine_name,
            julianday(le.cto_valid_till) - julianday('now') AS days FROM LEASE le JOIN MINE m ON m.lease_id = le.lease_id`).all().forEach((r) => {
          if (r.days < 0) n += raise(`cto-expired:${r.lease_id}:${r.cto_valid_till}`, 'cto', 'CRITICAL', r.mine_id, `${r.mine_name}: consent to operate expired on ${r.cto_valid_till}`);
          else if (r.days <= 90) n += raise(`cto-90d:${r.lease_id}:${r.cto_valid_till}`, 'cto', 'CRITICAL', r.mine_id, `${r.mine_name}: consent to operate ends ${r.cto_valid_till}`);
        });
        return n;
      },
    },
    {
      name: 'status',
      everyMs: 60 * 1000,
      run() {
        let n = 0;
        db.prepare("SELECT mine_id, mine_name, status FROM MINE WHERE status IN ('Expiring', 'Under Maintenance')").all().forEach((r) => {
          n += raise(`status:${r.mine_id}:${r.status}`, 'status', r.status === 'Expiring' ? 'CRITICAL' : 'WARNING', r.mine_id,
            r.status === 'Expiring' ? `${r.mine_name}: lease marked as expiring` : `${r.mine_name}: under maintenance, production halted`);
        });
        return n;
      },
    },
    {
      name: 'production-drop',
      everyMs: DAY,
      run() {
        let n = 0;
        db.prepare(`SELECT p.mine_id, m.mine_name, p.fiscal_year, p.quantity_mt, prev.quantity_mt AS prev_mt
            FROM PRODUCTION p JOIN PRODUCTION prev ON prev.mine_id = p.mine_id AND prev.mineral_id = p.mineral_id AND prev.fiscal_year = p.fiscal_year - 1
            JOIN MINE m ON m.mine_id = p.mine_id
            WHERE p.fiscal_year = (SELECT MAX(fiscal_year) FROM PRODUCTION WHERE mine_id = p.mine_id) AND p.quantity_mt < prev.quantity_mt * 0.8`).all().forEach((r) => {
          const pct = Math.round((1 - r.quantity_mt / r.prev_mt) * 100);
          n += raise(`prod-drop:${r.mine_id}:${r.fiscal_year}`, 'production-drop', 'WARNING', r.mine_id, `${r.mine_name}: output fell ${pct}% in ${r.fiscal_year} (${r.prev_mt} → ${r.quantity_mt} MT)`);
        });
        return n;
      },
    },
  ];

  const schedule = new PriorityQueue();
  let timer = null;

  function runDue() {
    const now = Date.now();
    // The heap's top is the rule due soonest; run every rule that is due
    while (!schedule.isEmpty() && schedule._heap[0].priority <= now) {
      const rule = schedule.dequeue();
      try {
        rule.run();
      } catch (err) {
        console.error(`[MINERVA notifications] rule ${rule.name} failed:`, err.message);
      }
      schedule.enqueue(rule, now + rule.everyMs);
    }
    clearTimeout(timer);
    if (!schedule.isEmpty()) {
      const wait = Math.max(1000, schedule._heap[0].priority - Date.now());
      timer = setTimeout(runDue, Math.min(wait, 2 ** 31 - 1));
      timer.unref?.();
    }
  }

  RULES.forEach((r) => schedule.enqueue(r, 0));
  runDue();

  const listStmt = db.prepare(`SELECT n.notification_id AS id, n.rule, n.priority, n.mine_id AS mineId, n.message, n.created_at AS createdAt,
      (r.read_at IS NOT NULL) AS read
    FROM NOTIFICATION n LEFT JOIN NOTIFICATION_READ r ON r.notification_id = n.notification_id AND r.user_id = ?
    WHERE n.user_id IS NULL OR n.user_id = ?
    ORDER BY CASE n.priority WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END, n.created_at DESC LIMIT 100`);

  return {
    rules: RULES.map((r) => r.name),
    nextChecks: () => schedule.toArray().map((r) => r.name),
    runNow: runDue,
    newSignInAddress(user, ip) {
      raise(`signin:${user.id}:${ip}`, 'sign-in', 'INFO', null, `New sign-in to your account from ${ip}`, user.id);
    },
    list(userId) {
      const rows = listStmt.all(userId, userId).map((r) => ({ ...r, read: Boolean(r.read) }));
      return { data: rows, unread: rows.filter((r) => !r.read).length };
    },
    markRead(userId, ids) {
      const stmt = db.prepare(`INSERT OR IGNORE INTO NOTIFICATION_READ (notification_id, user_id, read_at)
        SELECT notification_id, ?, ? FROM NOTIFICATION WHERE notification_id = ? AND (user_id IS NULL OR user_id = ?)`);
      const at = new Date().toISOString();
      db.transaction(() => ids.forEach((id) => stmt.run(userId, at, id, userId)))();
    },
  };
}
