/**
 * Set a user's PIN from the server console (the web reset is refused for admins).
 *   npm run reset-pin -- USR-1024 'new-pin-here'
 * Signs the user out everywhere and clears any lock.
 */
import { getPool, query, transaction } from '../db/pool.js';
import { hashPin } from '../lib/auth.js';

const [username, pin] = process.argv.slice(2);
if (!username || !pin || pin.length < 6) {
  console.error('Usage: npm run reset-pin -- <identifier> <new PIN, at least 6 characters>');
  process.exit(1);
}
try {
  const { rows: [user] } = await query('SELECT user_id, username FROM app_user WHERE lower(username) = lower($1)', [username]);
  if (!user) {
    console.error(`No account ${username}`);
    process.exitCode = 1;
  } else {
    const { hash, salt } = hashPin(pin);
    await transaction(async (c) => {
      await query('UPDATE app_user SET password_hash = $1, password_salt = $2, failed_attempts = 0, locked_until = NULL WHERE user_id = $3', [hash, salt, user.user_id], c);
      await query('DELETE FROM user_session WHERE user_id = $1', [user.user_id], c);
      await query("INSERT INTO audit_log (user_id, username, action, detail) VALUES ($1, $2, 'reset_completed', 'console')", [user.user_id, user.username], c);
    });
    console.log(`PIN updated for ${user.username}; all of their sessions are signed out.`);
  }
} finally {
  await getPool().end();
}
