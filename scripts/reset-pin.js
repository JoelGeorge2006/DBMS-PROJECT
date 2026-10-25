/**
 * Set a user's PIN from the server console (the web reset is refused for admins).
 *   npm run reset-pin -- USR-1024 'new-pin-here'
 * Signs the user out everywhere and clears any lock.
 */
import path from 'path';
import Database from 'better-sqlite3';
import { hashPin } from '../lib/auth.js';

const [username, pin] = process.argv.slice(2);
if (!username || !pin || pin.length < 6) {
  console.error('Usage: npm run reset-pin -- <identifier> <new PIN, at least 6 characters>');
  process.exit(1);
}
const db = new Database(path.join(process.cwd(), 'minerva.db'));
const user = db.prepare('SELECT user_id, username FROM APP_USER WHERE username = ? COLLATE NOCASE').get(username);
if (!user) {
  console.error(`No account ${username}`);
  process.exit(1);
}
const { hash, salt } = hashPin(pin);
db.transaction(() => {
  db.prepare('UPDATE APP_USER SET password_hash = ?, password_salt = ?, failed_attempts = 0, locked_until = NULL WHERE user_id = ?').run(hash, salt, user.user_id);
  db.prepare('DELETE FROM USER_SESSION WHERE user_id = ?').run(user.user_id);
  db.prepare("INSERT INTO AUDIT_LOG (user_id, username, action, detail, ip, at) VALUES (?, ?, 'reset_completed', 'console', NULL, ?)").run(user.user_id, user.username, new Date().toISOString());
})();
console.log(`PIN updated for ${user.username}. A running server keeps cached sessions for up to their expiry; restart it to drop them at once.`);
