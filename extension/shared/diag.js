// @ts-check
// diag: what the extension can tell a person about its own connection to the Vyre connector, in plain words with the one fix.
// The worker records every attempt (background.js) and this turns the record into a sentence, for the extension's popup
// and its badge. Nothing here reads a page or a secret.

/**
 * @typedef {{ startedAt: number, attempts: number, lastAttemptAt: number|null, lastError: string|null, lastErrorAt: number|null,
 *   connectedAt: number|null, everConnected: boolean, failingSince: number|null }} Conn
 */

/** Chrome's own words for a native-messaging failure, and what they mean here. */
const KNOWN = [
  { re: /closed the connection|not found|refused|failed/i, headline: "Waiting for Claude Code or Codex.", fix: "Open Claude Code or Codex with vyre-chrome added (see README.md in the Vyre for Chrome folder). It connects within a few seconds. Only one session can drive this browser at a time." },


];

/**
 * @param {Conn|null|undefined} c @param {number} now
 * @returns {{ state: "connected"|"connecting"|"failing"|"unknown", headline: string, fix: string|null, detail: string|null }}
 */
export function explain(c, now = Date.now()) {
  if (!c) return { state: "unknown", headline: "The extension has not tried to connect yet.", fix: "Wait a few seconds, or reload the extension in chrome://extensions.", detail: null };
  if (c.connectedAt && !c.failingSince) return { state: "connected", headline: "Connected to Vyre.", fix: null, detail: null };
  const err = c.lastError || "";
  const hit = KNOWN.find(k => k.re.test(err));
  const since = c.failingSince ? Math.round((now - c.failingSince) / 1000) : 0;
  if (!c.lastError && c.attempts <= 1 && since < 5) return { state: "connecting", headline: "Connecting to Vyre...", fix: null, detail: null };
  if (hit) return { state: "failing", headline: hit.headline, fix: hit.fix, detail: `${err} (${c.attempts} tries, failing for ${since} s)` };
  if (c.everConnected) return { state: "failing", headline: "The connection to Vyre dropped.", fix: "Is Claude Code (the Vyre for Chrome server) still running? Start a Claude Code session, or run `vyre-chrome doctor`.", detail: err ? `${err} (${c.attempts} tries)` : null };
  return { state: "failing", headline: "Not connected to Vyre yet.", fix: "Open Claude Code or Codex with vyre-chrome added (see README.md in the Vyre for Chrome folder). It connects within a few seconds.", detail: err ? `${err} (${c.attempts} tries, failing for ${since} s)` : `${c.attempts} tries, failing for ${since} s` };
}
