// Daily runs: a saved task that the computer runs on a schedule through Claude Code or Codex, headless.
// It reads and reports. It never sends: chrome_send and chrome_resume are denied to the engine.
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { PKG, dataDirOf } from "./runtime.js";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WIN_DAYS = { sun: "SUN", mon: "MON", tue: "TUE", wed: "WED", thu: "THU", fri: "FRI", sat: "SAT" };
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/i;
const KEEP_RUNS = 90;

/** "HH:MM" to {h, m}. Throws on anything else. @param {string} s */
export function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`"${s}" is not a time. Use HH:MM on a 24-hour clock, for example 07:00.`);
  return { h: Number(m[1]), m: Number(m[2]) };
}

/** Days as a list of 0 (Sunday) to 6, or "daily" as null. weekdays = Mon to Fri. @param {string} [s] @returns {number[]|null} */
export function parseDays(s = "daily") {
  const v = String(s).trim().toLowerCase();
  if (v === "daily" || v === "every" || v === "all") return null;
  if (v === "weekdays") return [1, 2, 3, 4, 5];
  const out = [];
  for (const part of v.split(",").map(x => x.trim()).filter(Boolean)) {
    const i = DAYS.indexOf(part.slice(0, 3));
    if (i < 0 || part.length > 9) throw new Error(`"${part}" is not a day. Use daily, weekdays, or a list like mon,wed,fri.`);
    if (!out.includes(i)) out.push(i);
  }
  if (!out.length) throw new Error("name at least one day");
  const sorted = out.sort((a, b) => a - b);
  return sorted.length === 7 ? null : sorted;
}

/** @param {string} s */
const xml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const labelOf = (/** @type {string} */ name) => `run.vyre.chrome.job.${name}`;
export const plistPathOf = (/** @type {string} */ name, home = os.homedir()) => path.join(home, "Library", "LaunchAgents", `${labelOf(name)}.plist`);
export const taskNameOf = (/** @type {string} */ name) => `Vyre for Chrome - ${name}`;

/**
 * The launchd agent as text.
 * @param {{ name: string, launcher: string, at: string, days?: string, jobDir: string, env?: Record<string,string> }} o
 */
export function buildPlist({ name, launcher, at, days = "daily", jobDir, env = {} }) {
  const { h, m } = parseTime(at);
  const list = parseDays(days);
  const iv = (/** @type {number|null} */ d) => `    <dict>\n${d === null ? "" : `      <key>Weekday</key><integer>${d}</integer>\n`}      <key>Hour</key><integer>${h}</integer>\n      <key>Minute</key><integer>${m}</integer>\n    </dict>`;
  const intervals = (list === null ? [null] : list).map(iv).join("\n");
  const envXml = Object.entries(env).map(([k, v]) => `      <key>${xml(k)}</key><string>${xml(v)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(labelOf(name))}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(launcher)}</string>
    <string>job</string>
    <string>run</string>
    <string>${xml(name)}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
${intervals}
  </array>
  <key>StandardOutPath</key><string>${xml(path.join(jobDir, "launchd.out.log"))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(jobDir, "launchd.err.log"))}</string>
${envXml ? `  <key>EnvironmentVariables</key>\n  <dict>\n${envXml}\n  </dict>\n` : ""}</dict>
</plist>
`;
}

/** The schtasks arguments (Windows), as an argument list, not a shell string. @param {{ name: string, launcher: string, at: string, days?: string }} o */
export function buildSchtasksArgs({ name, launcher, at, days = "daily" }) {
  const { h, m } = parseTime(at);
  const list = parseDays(days);
  const st = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const tr = `"${launcher}" job run ${name}`;
  const base = ["/Create", "/TN", taskNameOf(name), "/TR", tr];
  const sched = list === null ? ["/SC", "DAILY"] : ["/SC", "WEEKLY", "/D", list.map(d => /** @type {any} */ (WIN_DAYS)[DAYS[d]]).join(",")];
  return [...base, ...sched, "/ST", st, "/F"];
}

/** The crontab line (Linux): printed, never installed. @param {{ name: string, launcher: string, at: string, days?: string }} o */
export function buildCrontabLine({ name, launcher, at, days = "daily" }) {
  const { h, m } = parseTime(at);
  const list = parseDays(days);
  return `${m} ${h} * * ${list === null ? "*" : list.join(",")} "${launcher}" job run ${name}`;
}

/** @param {string} bin @param {Record<string,string|undefined>} env */
export function findEngine(bin, env = process.env) {
  if (env.VYRE_CHROME_ENGINE_BIN) return env.VYRE_CHROME_ENGINE_BIN;
  const exe = bin === "codex" ? "codex" : "claude";
  try {
    const r = execFileSync(process.platform === "win32" ? "where" : "which", [exe], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
    if (r) return r;
  } catch { /* try the usual places */ }
  const h = os.homedir();
  const cands = [path.join(h, ".local", "bin", exe), path.join(h, ".claude", "local", exe), `/opt/homebrew/bin/${exe}`, `/usr/local/bin/${exe}`, path.join(h, ".npm-global", "bin", exe), path.join(h, ".volta", "bin", exe)];
  const found = cands.find(c => { try { fs.accessSync(c, fs.constants.X_OK); return true; } catch { return false; } });
  if (found) return found;
  throw new Error(`could not find ${exe} on this computer. Install it and sign in, then run this again.`);
}

/** The launcher that the scheduler calls: the installed copy if there is one, else the folder this runs from. @param {string} dataDir */
export function launcherPath(dataDir = dataDirOf()) {
  const win = process.platform === "win32";
  const f = win ? "vyre-chrome.cmd" : "vyre-chrome";
  const cands = [path.join(dataDir, "app", f), path.join(PKG, f), path.join(PKG, "standalone", f)];
  return cands.find(c => fs.existsSync(c)) || cands[1];
}

const jobsDir = (/** @type {string} */ dataDir) => path.join(dataDir, "jobs");
const jobDirOf = (/** @type {string} */ dataDir, /** @type {string} */ name) => path.join(jobsDir(dataDir), name);
function checkName(/** @type {string} */ name) { if (!NAME_RE.test(String(name || ""))) throw new Error("the job name uses letters, numbers, - and _ only (up to 41 characters)"); }
function readJob(/** @type {string} */ dataDir, /** @type {string} */ name) {
  checkName(name);
  try { return JSON.parse(fs.readFileSync(path.join(jobDirOf(dataDir, name), "job.json"), "utf8")); } catch { throw new Error(`no job named "${name}". "job list" shows them.`); }
}

/** Real scheduling. Returns a sentence for the person. @param {any} job @param {string} dataDir */
function schedule(job, dataDir) {
  const launcher = launcherPath(dataDir);
  const o = { name: job.name, launcher, at: job.at, days: job.days };
  if (process.platform === "darwin") {
    const file = plistPathOf(job.name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const env = { PATH: process.env.PATH || "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", HOME: os.homedir(), ...(process.env.VYRE_CHROME_HOME ? { VYRE_CHROME_HOME: process.env.VYRE_CHROME_HOME } : {}) };
    fs.writeFileSync(file, buildPlist({ ...o, jobDir: jobDirOf(dataDir, job.name), env }));
    const uid = String(process.getuid ? process.getuid() : 501);
    spawnSync("launchctl", ["bootout", `gui/${uid}`, file], { stdio: "ignore" });
    const r = spawnSync("launchctl", ["bootstrap", `gui/${uid}`, file], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`launchctl could not load ${file}: ${(r.stderr || "").trim()}`);
    return `Scheduled with launchd (${file}).`;
  }
  if (process.platform === "win32") {
    const r = spawnSync("schtasks", buildSchtasksArgs(o), { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`schtasks failed: ${(r.stderr || r.stdout || "").trim()}`);
    return `Scheduled in Task Scheduler as "${taskNameOf(job.name)}". It runs only while you are logged on.`;
  }
  return `Linux: add this line with "crontab -e" (not installed for you):\n  ${buildCrontabLine(o)}`;
}

/** @param {string} name */
function unschedule(name) {
  if (process.platform === "darwin") {
    const file = plistPathOf(name);
    const uid = String(process.getuid ? process.getuid() : 501);
    spawnSync("launchctl", ["bootout", `gui/${uid}`, file], { stdio: "ignore" });
    try { fs.unlinkSync(file); } catch { /* not there */ }
  } else if (process.platform === "win32") {
    spawnSync("schtasks", ["/Delete", "/TN", taskNameOf(name), "/F"], { stdio: "ignore" });
  }
}

/**
 * @typedef {{ schedule?: (job: any, dataDir: string) => string, unschedule?: (name: string) => void }} Sched
 * job add. Returns the lines to print.
 * @param {{ dataDir?: string, name: string, task: string, at: string, days?: string, engine?: string, chromeProfile?: string, maxMinutes?: number }} o
 * @param {Sched} [deps]
 */
export function jobAdd(o, deps = {}) {
  const dataDir = o.dataDir || dataDirOf();
  checkName(o.name);
  if (!o.task) throw new Error("job add needs --task <file.md>");
  if (!fs.existsSync(o.task)) throw new Error(`the task file ${o.task} does not exist`);
  parseTime(o.at);
  parseDays(o.days || "daily");
  const engine = o.engine || "claude";
  if (engine !== "claude" && engine !== "codex") throw new Error("--engine is claude or codex");
  const bin = findEngine(engine);
  const dir = jobDirOf(dataDir, o.name);
  fs.mkdirSync(path.join(dir, "runs"), { recursive: true, mode: 0o700 });
  fs.copyFileSync(o.task, path.join(dir, "task.md"));
  const job = { name: o.name, engine, bin, at: o.at, days: o.days || "daily", ...(o.chromeProfile ? { chromeProfile: o.chromeProfile } : {}), maxMinutes: o.maxMinutes || 60, created: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, "job.json"), JSON.stringify(job, null, 2) + "\n", { mode: 0o600 });
  const said = (deps.schedule || schedule)(job, dataDir);
  return [`Saved job "${o.name}" (${engine}, ${job.days} at ${job.at}) in ${dir}.`, said, `Try it now while you watch: vyre-chrome job run ${o.name}`];
}

/** @param {{ dataDir?: string }} o */
export function jobList(o = {}) {
  const dataDir = o.dataDir || dataDirOf();
  /** @type {any[]} */ const jobs = [];
  let names = [];
  try { names = fs.readdirSync(jobsDir(dataDir)); } catch { /* none yet */ }
  for (const n of names.sort()) { try { jobs.push(JSON.parse(fs.readFileSync(path.join(jobsDir(dataDir), n, "job.json"), "utf8"))); } catch { /* not a job */ } }
  return jobs;
}

/** @param {{ dataDir?: string, name: string, purge?: boolean }} o @param {Sched} [deps] */
export function jobRemove(o, deps = {}) {
  const dataDir = o.dataDir || dataDirOf();
  readJob(dataDir, o.name);
  (deps.unschedule || unschedule)(o.name);
  const dir = jobDirOf(dataDir, o.name);
  if (o.purge) { fs.rmSync(dir, { recursive: true, force: true }); return `Removed job "${o.name}" and its results.`; }
  fs.rmSync(path.join(dir, "job.json"), { force: true });
  return `Unscheduled job "${o.name}". Its results are still in ${dir} (--purge deletes them).`;
}

/** @param {{ dataDir?: string, name: string }} o */
export function jobLast({ dataDir = dataDirOf(), name }) {
  checkName(name);
  const f = path.join(jobDirOf(dataDir, name), "latest.md");
  if (!fs.existsSync(f)) throw new Error(`job "${name}" has no report yet`);
  return { path: f, head: fs.readFileSync(f, "utf8").split("\n").slice(0, 12).join("\n") };
}

/** True when something already listens on the browser link port. @param {number} port */
export function portBusy(port) {
  return new Promise(res => {
    const s = net.connect({ host: "127.0.0.1", port });
    const done = (/** @type {boolean} */ v) => { s.destroy(); res(v); };
    s.setTimeout(1500, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

/** @param {string} profile */
function openChrome(profile) {
  try {
    if (process.platform === "darwin") spawnSync("open", ["-g", "-a", "Google Chrome", ...(profile ? ["--args", `--profile-directory=${profile}`] : [])], { stdio: "ignore" });
    else if (process.platform === "win32") spawnSync("cmd", ["/c", "start", "", "chrome", ...(profile ? [`--profile-directory=${profile}`] : [])], { stdio: "ignore" });
  } catch { /* the run reports it if the browser never connects */ }
}

/** The text the engine receives. @param {string} name @param {string} task */
export function buildPrompt(name, task) {
  return `You are running the scheduled job "${name}" for Vyre for Chrome.

Nobody is watching this run. Rules:
- Never call chrome_send or chrome_resume. Anything that would send, submit, pay or delete is skipped and listed in the report.
- Read ~/.vyre-chrome/org-policy.md first and follow it. (On Windows that is %USERPROFILE%\\.vyre-chrome\\org-policy.md.)
- Never skip an item silently. Every item ends as one of: done, not found, could not read (with the reason), or skipped (with the reason).
- Read and report only. Never edit the input files.
- Finish with a markdown report: first a summary line, then a table of every item.

The task:

${task}
`;
}

/** The engine command line. @param {"claude"|"codex"} engine @param {string} bin @param {string} prompt @param {string} lastFile */
export function engineArgs(engine, bin, prompt, lastFile) {
  if (engine === "codex") return ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--output-last-message", lastFile, prompt];
  return ["-p", prompt, "--output-format", "text", "--allowedTools", "mcp__vyre-chrome,Read", "--disallowedTools", "mcp__vyre-chrome__chrome_send,mcp__vyre-chrome__chrome_resume,Bash,Write,Edit,WebFetch"];
}

const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
const stamp = (/** @type {Date} */ d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;

/** @param {string} dir */
function takeLock(dir) {
  const f = path.join(dir, "run.lock");
  for (let i = 0; i < 2; i++) {
    try { fs.writeFileSync(f, String(process.pid), { flag: "wx" }); return f; } catch (e) {
      if (/** @type {any} */ (e).code !== "EEXIST") throw e;
      const pid = Number(fs.readFileSync(f, "utf8"));
      let alive = false;
      if (pid > 0) { try { process.kill(pid, 0); alive = true; } catch (er) { alive = /** @type {any} */ (er).code === "EPERM"; } }
      if (alive) return null;
      try { fs.unlinkSync(f); } catch { /* raced */ }
    }
  }
  return null;
}

/** @param {string} dir */
function prune(dir) {
  const runs = path.join(dir, "runs");
  const ids = fs.readdirSync(runs).filter(f => f.endsWith(".md")).sort();
  for (const f of ids.slice(0, Math.max(0, ids.length - KEEP_RUNS))) {
    for (const x of [f, f.replace(/\.md$/, ".log")]) { try { fs.unlinkSync(path.join(runs, x)); } catch { /* gone */ } }
  }
}

/** First useful line of a report, for the notification. @param {string} md */
const summaryLine = md => (md.split("\n").map(l => l.trim()).find(l => l && !l.startsWith("#") && !l.startsWith("|")) || "Finished.").replace(/[*_`]/g, "").slice(0, 200);

/**
 * job run. Never throws for a failed engine: a failure report is written instead.
 * @param {{ dataDir?: string, name: string }} o
 * @param {{ portBusy?: (p: number) => Promise<boolean>, openChrome?: (profile: string) => void, waitMs?: number, pollMs?: number, settleMs?: number, notify?: boolean }} [deps]
 * @returns {Promise<{ ok: boolean, report?: string, reason?: string, skipped?: boolean }>}
 */
export async function jobRun(o, deps = {}) {
  const dataDir = o.dataDir || dataDirOf();
  const job = readJob(dataDir, o.name);
  const dir = jobDirOf(dataDir, o.name);
  const runs = path.join(dir, "runs");
  fs.mkdirSync(runs, { recursive: true, mode: 0o700 });
  const lock = takeLock(dir);
  if (!lock) return { ok: false, skipped: true, reason: `job "${o.name}" is already running` };
  const startedAt = new Date();
  let id = stamp(startedAt);
  if (fs.existsSync(path.join(runs, `${id}.md`))) id += `${pad(startedAt.getSeconds())}`;
  const reportFile = path.join(runs, `${id}.md`);
  const logFile = path.join(runs, `${id}.log`);
  let log = `job ${o.name} started ${startedAt.toISOString()}\n`;
  /** @type {string} */ let body = "";
  /** @type {string|null} */ let failure = null;
  try {
    const port = Number(process.env.VYRE_CHROME_PORT || 47213);
    (deps.openChrome || openChrome)(job.chromeProfile || "");
    await new Promise(r => setTimeout(r, deps.settleMs ?? 8000));
    const busy = deps.portBusy || portBusy;
    const waitMs = deps.waitMs ?? 10 * 60_000, pollMs = deps.pollMs ?? 30_000;
    const until = Date.now() + waitMs;
    while (await busy(port)) {
      if (Date.now() >= until) { failure = `another Claude Code or Codex session was holding the browser link (port ${port}) for ${Math.round(waitMs / 60000)} minutes. Close that session or run the job later.`; break; }
      log += `port ${port} busy, waiting\n`;
      await new Promise(r => setTimeout(r, pollMs));
    }
    if (!failure) {
      const task = fs.readFileSync(path.join(dir, "task.md"), "utf8");
      const prompt = buildPrompt(o.name, task);
      const bin = process.env.VYRE_CHROME_ENGINE_BIN || job.bin;
      const lastFile = path.join(runs, `${id}.last.txt`);
      const args = engineArgs(job.engine, bin, prompt, lastFile);
      const maxMs = (Number(job.maxMinutes) || 60) * 60_000;
      const r = await new Promise(resolve => {
        let out = "", err = "", killed = false;
        const child = spawn(bin, args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(bin) });
        const timer = setTimeout(() => { killed = true; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 5000).unref(); }, maxMs);
        child.stdout.on("data", d => { out += d; });
        child.stderr.on("data", d => { err += d; });
        child.on("error", e => { clearTimeout(timer); resolve({ code: -1, out, err: err + String(e.message), killed, spawnError: e.message }); });
        child.on("close", code => { clearTimeout(timer); resolve({ code, out, err, killed }); });
      });
      const res = /** @type {any} */ (r);
      log += `engine: ${bin}\nexit: ${res.code}${res.killed ? " (time limit)" : ""}\n--- stderr ---\n${res.err}\n`;
      let answer = res.out;
      if (job.engine === "codex") { try { const t = fs.readFileSync(lastFile, "utf8"); if (t.trim()) answer = t; } catch { /* use stdout */ } try { fs.unlinkSync(lastFile); } catch { /* none */ } }
      if (res.spawnError) failure = `the engine could not start: ${res.spawnError}`;
      else if (res.killed) failure = `the run hit its time limit of ${job.maxMinutes || 60} minutes and was stopped.`;
      else if (res.code !== 0) failure = `the engine exited with code ${res.code}. ${(res.err || "").trim().split("\n").slice(-3).join(" ").slice(0, 300)}`.trim();
      else if (!answer.trim()) failure = "the engine finished but returned no report.";
      else body = answer.trim() + "\n";
    }
  } catch (e) { failure = `the runner failed: ${/** @type {Error} */ (e).message}`; }
  finally { try { fs.unlinkSync(lock); } catch { /* gone */ } }
  if (failure) body = `# ${o.name}: run failed\n\nSummary: this run FAILED. Reason: ${failure}\n\nRun started ${startedAt.toISOString()}. Nothing was changed. See ${path.basename(logFile)} in the runs folder for the engine's messages.\n`;
  fs.writeFileSync(reportFile, body, { mode: 0o600 });
  fs.writeFileSync(logFile, log + (failure ? `failure: ${failure}\n` : ""), { mode: 0o600 });
  fs.copyFileSync(reportFile, path.join(dir, "latest.md"));
  prune(dir);
  if (process.platform === "darwin" && deps.notify !== false && !process.env.VYRE_CHROME_JOB_NO_NOTIFY) {
    const msg = summaryLine(body).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    spawnSync("osascript", ["-e", `display notification "${msg}" with title "Vyre for Chrome: ${o.name}"`], { stdio: "ignore" });
  }
  return failure ? { ok: false, report: reportFile, reason: failure } : { ok: true, report: reportFile };
}

/** The `job` command. @param {string[]} args @param {(s: string) => void} out @returns {Promise<number>} exit code */
export async function jobCli(args, out) {
  const [sub, ...rest] = args;
  const dataDir = dataDirOf();
  /** @param {string} n */
  const flag = n => { const i = rest.indexOf(`--${n}`); return i >= 0 ? (rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : "true") : undefined; };
  const name = rest[0] && !rest[0].startsWith("--") ? rest[0] : undefined;
  const usage = "job add <name> --task <file.md> --at HH:MM [--days daily|weekdays|mon,tue,...] [--engine claude|codex] [--chrome-profile \"Profile 1\"] | list | remove <name> [--purge] | run <name> | last <name>";
  if (sub === "add") {
    if (!name) throw new Error(usage);
    for (const l of jobAdd({ dataDir, name, task: flag("task") || "", at: flag("at") || "", days: flag("days"), engine: flag("engine"), chromeProfile: flag("chrome-profile") })) out(l);
    return 0;
  }
  if (sub === "list") {
    const jobs = jobList({ dataDir });
    if (!jobs.length) out("No daily runs yet. \"vyre-chrome job add\" makes one.");
    for (const j of jobs) out(`${j.name}  ${j.days} ${j.at}  ${j.engine}${j.chromeProfile ? `  profile ${j.chromeProfile}` : ""}`);
    return 0;
  }
  if (sub === "remove") { if (!name) throw new Error(usage); out(jobRemove({ dataDir, name, purge: flag("purge") !== undefined })); return 0; }
  if (sub === "last") { if (!name) throw new Error(usage); const r = jobLast({ dataDir, name }); out(r.path); out(r.head); return 0; }
  if (sub === "run") {
    if (!name) throw new Error(usage);
    const r = await jobRun({ dataDir, name });
    if (r.skipped) { out(`Not run: ${r.reason}.`); return 3; }
    out(r.ok ? `Done. Report: ${r.report}` : `The run failed: ${r.reason}\nReport: ${r.report}`);
    return r.ok ? 0 : 1;
  }
  throw new Error(usage);
}
