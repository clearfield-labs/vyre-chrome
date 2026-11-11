// @ts-check
// setup: adds Vyre for Chrome to Claude Code (terminal and desktop app), Claude desktop chat and Codex in one go, with no typing.
// It uses each app's own command when it is there (claude mcp add), and otherwise writes the app's config file itself, keeping a
// backup next to it. Running it again replaces the old entry, so it also moves an install to a new folder.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const NAME = "vyre-chrome";

/** The launcher the apps start: it finds the Node bundled in the download, or one already on the computer. @param {string} pkg */
export function launcherOf(pkg, platform = process.platform) {
  return platform === "win32" ? path.join(pkg, "vyre-chrome.cmd") : path.join(pkg, "vyre-chrome");
}

/** Where a program is on PATH, or null. @param {string} cmd */
function which(cmd) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  const first = r.status === 0 ? String(r.stdout).split(/\r?\n/).find(Boolean) : "";
  return first ? first.trim() : null;
}

/** Write a file through a temporary file, keeping one backup of what was there. @param {string} file @param {string} text */
function writeSafely(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.before-vyre-chrome`);
  const tmp = `${file}.vyre-chrome-tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** Set mcpServers[vyre-chrome] in a JSON config file. @param {string} file @param {any} entry */
function setJsonServer(file, entry) {
  /** @type {any} */ let j = {};
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, "utf8").trim();
    if (raw) j = JSON.parse(raw);
  }
  j.mcpServers = { ...(j.mcpServers || {}), [NAME]: entry };
  writeSafely(file, JSON.stringify(j, null, 2) + "\n");
}

/** Replace the [mcp_servers.vyre-chrome] table (and its sub-tables) in Codex's config.toml. @param {string} file @param {string} launcher */
export function codexToml(existing, launcher) {
  const lines = String(existing || "").split(/\r?\n/);
  /** @type {string[]} */ const kept = [];
  let skipping = false;
  for (const l of lines) {
    const t = l.trim();
    if (/^\[/.test(t)) skipping = /^\[\s*mcp_servers\s*\.\s*("vyre-chrome"|vyre-chrome)\s*(\]|\.)/.test(t);
    if (!skipping) kept.push(l);
  }
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  // A TOML literal string ('...') keeps Windows backslashes as they are.
  const block = [
    "",
    "[mcp_servers.vyre-chrome]",
    `command = '${launcher}'`,
    "args = [\"mcp\"]",
    "startup_timeout_sec = 30",
    "tool_timeout_sec = 300",
    "",
  ];
  return kept.join("\n") + "\n" + block.join("\n");
}

/**
 * Add Vyre for Chrome to every app found on this computer.
 * @param {{ pkg: string, home?: string, platform?: string, only?: string[] }} o
 * @returns {{ app: string, done: boolean, how: string }[]}
 */
export function setup({ pkg, home = os.homedir(), platform = process.platform, only = [] }) {
  // macOS protects Documents, Desktop, Downloads and iCloud Drive: the Claude desktop app may not start a program from
  // there ("Operation not permitted"). So a copy in one of them moves to ~/Vyre for Chrome first, and that copy is used.
  /** @type {string|null} */ let moved = null;
  if (platform === "darwin") {
    const guarded = ["Documents", "Desktop", "Downloads", "Library/Mobile Documents"].map(d => path.join(home, d) + path.sep);
    if (guarded.some(g => (pkg + path.sep).startsWith(g))) {
      const dest = path.join(home, "Vyre for Chrome");
      if (path.resolve(dest) !== path.resolve(pkg)) {
        if (fs.existsSync(dest)) fs.renameSync(dest, `${dest} (old ${new Date().toISOString().slice(0, 10)}-${process.pid})`);
        fs.cpSync(pkg, dest, { recursive: true });
        moved = dest; pkg = dest;
      }
    }
  }
  const launcher = launcherOf(pkg, platform);
  const want = (/** @type {string} */ a) => !only.length || only.includes(a);
  /** @type {{ app: string, done: boolean, how: string }[]} */ const out = [];
  if (platform !== "win32") {
    for (const f of [launcher, path.join(pkg, "standalone", "vyre-chrome")]) { try { fs.chmodSync(f, 0o755); } catch { /* not there */ } }
    try { for (const f of fs.readdirSync(path.join(pkg, "runtime"))) fs.chmodSync(path.join(pkg, "runtime", f), 0o755); } catch { /* no bundled Node */ }
    if (platform === "darwin") spawnSync("xattr", ["-dr", "com.apple.quarantine", pkg]);
  }

  // Claude Code, in the terminal and in the Claude desktop app: one user-wide setting in ~/.claude.json.
  if (want("claude")) {
    const cli = which("claude");
    let done = false, how = "";
    if (cli) {
      for (const scope of ["user", "local", "project"]) spawnSync(cli, ["mcp", "remove", "-s", scope, NAME], { encoding: "utf8" });
      const r = spawnSync(cli, ["mcp", "add", "-s", "user", NAME, "--", launcher, "mcp"], { encoding: "utf8" });
      done = r.status === 0; how = done ? "added with `claude mcp add -s user`" : `claude mcp add failed: ${(r.stderr || r.stdout || "").trim().slice(0, 200)}`;
    }
    if (!done) {
      try { setJsonServer(path.join(home, ".claude.json"), { type: "stdio", command: launcher, args: ["mcp"], env: {} }); done = true; how = "written to ~/.claude.json"; }
      catch (e) { how = `${how ? how + "; " : ""}could not write ~/.claude.json: ${/** @type {Error} */ (e).message}`; }
    }
    out.push({ app: "Claude Code (terminal and Claude desktop app)", done, how });
  }

  // Claude desktop chat (not Claude Code), only when the app is installed.
  if (want("desktop")) {
    const dir = platform === "darwin" ? path.join(home, "Library", "Application Support", "Claude")
      : platform === "win32" ? path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Claude")
      : path.join(home, ".config", "Claude");
    if (fs.existsSync(dir)) {
      try { setJsonServer(path.join(dir, "claude_desktop_config.json"), { command: launcher, args: ["mcp"] }); out.push({ app: "Claude desktop chat", done: true, how: "written to claude_desktop_config.json" }); }
      catch (e) { out.push({ app: "Claude desktop chat", done: false, how: /** @type {Error} */ (e).message }); }
    }
  }

  // Codex: ~/.codex/config.toml, when Codex is installed.
  if (want("codex")) {
    const dir = path.join(process.env.CODEX_HOME || path.join(home, ".codex"));
    if (fs.existsSync(dir) || which("codex")) {
      const file = path.join(dir, "config.toml");
      try { writeSafely(file, codexToml(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "", launcher)); out.push({ app: "Codex", done: true, how: "written to ~/.codex/config.toml" }); }
      catch (e) { out.push({ app: "Codex", done: false, how: /** @type {Error} */ (e).message }); }
    }
  }
  if (moved) out.unshift({ app: "Moved to your home folder", done: true, how: `macOS does not let apps start programs from Documents, Desktop or Downloads, so Vyre for Chrome now lives in ${moved}. Load the extension from there. The old copy can be deleted.` });
  return Object.assign(out, { pkg });
}
