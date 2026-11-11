import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPlist, buildSchtasksArgs, buildCrontabLine, parseDays, parseTime, jobAdd, jobList, jobRemove, jobRun, jobLast, buildPrompt } from "./jobs.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vcjob-"));
const noSched = { schedule: () => "stubbed", unschedule: () => {} };
const quick = { settleMs: 0, pollMs: 20, waitMs: 100, portBusy: async () => false, openChrome: () => {}, notify: false };

/** A fake engine: prints its arguments as the report; FAKE_FAIL=1 exits 3; FAKE_SLEEP=1 hangs. */
function fakeEngine(dir) {
  const f = path.join(dir, "fake-engine.mjs");
  fs.writeFileSync(f, `#!${process.execPath}
const a = process.argv.slice(2);
if (process.env.FAKE_FAIL) { process.stderr.write("boom from engine\\n"); process.exit(3); }
if (process.env.FAKE_SLEEP) setTimeout(() => {}, 60000);
else console.log("All 2 items checked.\\n\\n| item | result |\\n|---|---|\\n| a | done |\\n\\nARGS:" + JSON.stringify(a));
`, { mode: 0o755 });
  return f;
}

function setup() {
  const home = tmp();
  const eng = fakeEngine(home);
  process.env.VYRE_CHROME_ENGINE_BIN = eng;
  const task = path.join(home, "t.md");
  fs.writeFileSync(task, "Check case 123 on example.com and list its status.\n");
  return { home, eng, task };
}

test("schedule builders: weekdays, daily, custom list", () => {
  const w = buildPlist({ name: "n", launcher: "/x/vyre-chrome", at: "07:00", days: "weekdays", jobDir: "/j" });
  assert.equal((w.match(/<key>Weekday<\/key>/g) || []).length, 5);
  assert.match(w, /<key>Hour<\/key><integer>7<\/integer>/);
  assert.match(w, /<string>run\.vyre\.chrome\.job\.n<\/string>/);
  assert.match(w, /<string>\/x\/vyre-chrome<\/string>\s*<string>job<\/string>\s*<string>run<\/string>\s*<string>n<\/string>/);
  assert.match(w, /StandardOutPath/);
  const d = buildPlist({ name: "n", launcher: "/x/v", at: "6:05", days: "daily", jobDir: "/j" });
  assert.equal((d.match(/<key>Weekday<\/key>/g) || []).length, 0);
  assert.match(d, /<key>Minute<\/key><integer>5<\/integer>/);
  assert.deepEqual(parseDays("mon,wed,fri"), [1, 3, 5]);
  assert.deepEqual(parseDays("sat,sun"), [0, 6]);
  assert.equal(parseDays("mon,tue,wed,thu,fri,sat,sun"), null);
  assert.deepEqual(buildSchtasksArgs({ name: "n", launcher: "C:\\v\\vyre-chrome.cmd", at: "07:00", days: "weekdays" }),
    ["/Create", "/TN", "Vyre for Chrome - n", "/TR", "\"C:\\v\\vyre-chrome.cmd\" job run n", "/SC", "WEEKLY", "/D", "MON,TUE,WED,THU,FRI", "/ST", "07:00", "/F"]);
  assert.deepEqual(buildSchtasksArgs({ name: "n", launcher: "L", at: "18:30" }).slice(5, 7), ["/SC", "DAILY"]);
  assert.equal(buildCrontabLine({ name: "n", launcher: "/x/v", at: "07:00", days: "weekdays" }), "0 7 * * 1,2,3,4,5 \"/x/v\" job run n");
  assert.equal(buildCrontabLine({ name: "n", launcher: "/x/v", at: "07:00" }), "0 7 * * * \"/x/v\" job run n");
});

test("invalid times and days are refused", () => {
  for (const t of ["25:00", "7", "07:60", "abc", "", "7:5"]) assert.throws(() => parseTime(t), /not a time/, t);
  assert.throws(() => buildPlist({ name: "n", launcher: "l", at: "24:00", jobDir: "/j" }));
  assert.throws(() => buildSchtasksArgs({ name: "n", launcher: "l", at: "9am" }));
  assert.throws(() => parseDays("funday"), /not a day/);
});

test("job add, list, remove", () => {
  const { home, task } = setup();
  const lines = jobAdd({ dataDir: home, name: "daily-cases", task, at: "07:00", days: "weekdays", chromeProfile: "Profile 1" }, noSched);
  assert.match(lines[0], /daily-cases/);
  assert.equal(fs.readFileSync(path.join(home, "jobs", "daily-cases", "task.md"), "utf8"), fs.readFileSync(task, "utf8"));
  const j = JSON.parse(fs.readFileSync(path.join(home, "jobs", "daily-cases", "job.json"), "utf8"));
  assert.equal(j.engine, "claude"); assert.equal(j.chromeProfile, "Profile 1"); assert.equal(j.days, "weekdays"); assert.ok(j.created); assert.ok(path.isAbsolute(j.bin));
  assert.deepEqual(jobList({ dataDir: home }).map(x => x.name), ["daily-cases"]);
  assert.throws(() => jobAdd({ dataDir: home, name: "../bad", task, at: "07:00" }, noSched), /job name/);
  assert.throws(() => jobAdd({ dataDir: home, name: "x", task, at: "99:00" }, noSched), /not a time/);
  assert.throws(() => jobAdd({ dataDir: home, name: "x", task: "/nope.md", at: "07:00" }, noSched), /does not exist/);
  let unscheduled = "";
  jobRemove({ dataDir: home, name: "daily-cases" }, { unschedule: n => { unscheduled = n; } });
  assert.equal(unscheduled, "daily-cases");
  assert.deepEqual(jobList({ dataDir: home }), []);
  assert.ok(fs.existsSync(path.join(home, "jobs", "daily-cases", "task.md")), "results kept without --purge");
  jobAdd({ dataDir: home, name: "p", task, at: "07:00" }, noSched);
  jobRemove({ dataDir: home, name: "p", purge: true }, noSched);
  assert.ok(!fs.existsSync(path.join(home, "jobs", "p")));
});

test("job run: prompt safety lines, report, latest.md, last", async () => {
  const { home, task } = setup();
  jobAdd({ dataDir: home, name: "r1", task, at: "07:00" }, noSched);
  delete process.env.FAKE_FAIL;
  const r = await jobRun({ dataDir: home, name: "r1" }, quick);
  assert.equal(r.ok, true);
  const rep = fs.readFileSync(r.report, "utf8");
  assert.equal(fs.readFileSync(path.join(home, "jobs", "r1", "latest.md"), "utf8"), rep);
  assert.match(path.basename(r.report), /^\d{4}-\d{2}-\d{2}_\d{4}/);
  assert.ok(fs.existsSync(r.report.replace(/\.md$/, ".log")));
  const args = JSON.parse(rep.split("ARGS:")[1]);
  assert.equal(args[0], "-p");
  const prompt = args[1];
  for (const s of ["Nobody is watching", "Never call chrome_send or chrome_resume", "org-policy.md", "Never skip an item silently", "could not read", "summary line, then a table", "Check case 123 on example.com"]) assert.ok(prompt.includes(s), s);
  const dis = args[args.indexOf("--disallowedTools") + 1];
  assert.match(dis, /mcp__vyre-chrome__chrome_send/); assert.match(dis, /mcp__vyre-chrome__chrome_resume/); assert.match(dis, /Bash/); assert.match(dis, /Write/);
  assert.match(args[args.indexOf("--allowedTools") + 1], /mcp__vyre-chrome/);
  assert.ok(args.includes("--output-format"));
  assert.match(jobLast({ dataDir: home, name: "r1" }).head, /All 2 items checked/);
});

test("job run with codex builds codex args", async () => {
  const { home, task } = setup();
  jobAdd({ dataDir: home, name: "cx", task, at: "07:00", engine: "codex" }, noSched);
  const r = await jobRun({ dataDir: home, name: "cx" }, quick);
  const args = JSON.parse(fs.readFileSync(r.report, "utf8").split("ARGS:")[1]);
  assert.deepEqual(args.slice(0, 5), ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--output-last-message"]);
  assert.ok(args[args.length - 1].includes("Never call chrome_send"));
});

test("a failing engine still writes a failure report", async () => {
  const { home, task } = setup();
  jobAdd({ dataDir: home, name: "f1", task, at: "07:00" }, noSched);
  process.env.FAKE_FAIL = "1";
  try {
    const r = await jobRun({ dataDir: home, name: "f1" }, quick);
    assert.equal(r.ok, false);
    const rep = fs.readFileSync(path.join(home, "jobs", "f1", "latest.md"), "utf8");
    assert.match(rep, /run failed/); assert.match(rep, /code 3/);
    assert.match(fs.readFileSync(r.report.replace(/\.md$/, ".log"), "utf8"), /boom from engine/);
  } finally { delete process.env.FAKE_FAIL; }
});

test("the time limit stops a hung engine and says so", async () => {
  const { home, task } = setup();
  jobAdd({ dataDir: home, name: "slow", task, at: "07:00" }, noSched);
  const jf = path.join(home, "jobs", "slow", "job.json");
  fs.writeFileSync(jf, JSON.stringify({ ...JSON.parse(fs.readFileSync(jf, "utf8")), maxMinutes: 0.01 }));
  process.env.FAKE_SLEEP = "1";
  try {
    const r = await jobRun({ dataDir: home, name: "slow" }, quick);
    assert.equal(r.ok, false); assert.match(r.reason, /time limit/);
  } finally { delete process.env.FAKE_SLEEP; }
});

test("a busy browser link fails with that reason", async () => {
  const { home, task } = setup();
  jobAdd({ dataDir: home, name: "busy", task, at: "07:00" }, noSched);
  const r = await jobRun({ dataDir: home, name: "busy" }, { ...quick, portBusy: async () => true });
  assert.equal(r.ok, false); assert.match(r.reason, /holding the browser link/);
  assert.match(fs.readFileSync(path.join(home, "jobs", "busy", "latest.md"), "utf8"), /holding the browser link/);
});

test("the lock stops a second run; a stale lock is taken over", async () => {
  const { home, task } = setup();
  jobAdd({ dataDir: home, name: "lk", task, at: "07:00" }, noSched);
  const lock = path.join(home, "jobs", "lk", "run.lock");
  fs.writeFileSync(lock, String(process.ppid));
  const r = await jobRun({ dataDir: home, name: "lk" }, quick);
  assert.equal(r.skipped, true); assert.match(r.reason, /already running/);
  assert.ok(!fs.existsSync(path.join(home, "jobs", "lk", "latest.md")));
  fs.writeFileSync(lock, "999999999");
  const r2 = await jobRun({ dataDir: home, name: "lk" }, quick);
  assert.equal(r2.ok, true);
  assert.ok(!fs.existsSync(lock), "lock released");
  // two at once: exactly one runs
  const [a, b] = await Promise.all([jobRun({ dataDir: home, name: "lk" }, quick), jobRun({ dataDir: home, name: "lk" }, quick)]);
  assert.equal([a, b].filter(x => x.skipped).length, 1);
});

test("only the last 90 runs are kept", async () => {
  const { home, task } = setup();
  jobAdd({ dataDir: home, name: "k", task, at: "07:00" }, noSched);
  const runs = path.join(home, "jobs", "k", "runs");
  for (let i = 0; i < 95; i++) { const id = `2020-01-01_${String(i).padStart(4, "0")}`; fs.writeFileSync(path.join(runs, `${id}.md`), "x"); fs.writeFileSync(path.join(runs, `${id}.log`), "x"); }
  await jobRun({ dataDir: home, name: "k" }, quick);
  assert.equal(fs.readdirSync(runs).filter(f => f.endsWith(".md")).length, 90);
  assert.ok(!fs.existsSync(path.join(runs, "2020-01-01_0000.md")));
});

test("buildPrompt wraps the task", () => { assert.match(buildPrompt("n", "do x"), /"n"[\s\S]*do x/); });
