# Vyre for Chrome: instructions for Codex

This folder is Vyre for Chrome, by Clearfield Labs (made by Irfad Imtiaz). It lets you, Codex, work in the person's own Chrome through an MCP server called `vyre-chrome`. Follow this file when the person asks you to install it, set it up for their organization, or use it.

Speak plainly to the person. Do each step yourself where you can, and tell them only the steps a person must do (the Chrome clicks and the restart).

## 1. Install it

The download carries its own Node, so nothing else needs installing. The person should not have to type anything: you run every command; they only click in Chrome.

1. **Get the folder.** If the person has not downloaded it yet, download the zip for this computer from https://github.com/clearfield-labs/vyre-chrome/releases/latest (`vyre-chrome-mac.zip` on a Mac, `vyre-chrome-windows.zip` on Windows) and unzip it into their home folder (on a Mac not Documents, Desktop or Downloads: macOS stops apps starting programs there), which makes a folder called `Vyre for Chrome`. If they already have it, use the folder that holds this file (it has `vyre-chrome`, `vyre-chrome.cmd`, `extension/`, `runtime/`). Do not install into Documents, Desktop, Downloads or a temporary folder. The setup moves a Mac copy out of those by itself and says where it went; use that path from then on.
2. **Mac only:** clear the download mark so macOS lets the bundled Node run: `xattr -dr com.apple.quarantine "<folder>"`.
3. **Run the setup**, one command:
   - Mac or Linux: `"<folder>/vyre-chrome" setup`
   - Windows: `"<folder>\vyre-chrome.cmd" setup`
   It adds Vyre for Chrome to Claude Code (terminal and Claude desktop app), Claude desktop chat and Codex, whichever are on this computer, replacing any older entry. Read its output to the person in plain words. Lines starting `!!` are problems: fix them or explain them.
4. **The one click in Chrome.** Tell the person, word for word:
   > In Chrome, open a new tab and go to `chrome://extensions`. Turn on **Developer mode** (top right). Press **Load unpacked** and choose this folder: `<folder>/extension`. If an older "Vyre for Chrome" is listed, remove it first.
   Wait until they say done.
5. **Restart.** Ask the person to quit Codex and start it again, so the new server loads.
6. **Check.** After the restart, call `chrome_status`. `connected: true` means done. If not, read its `problem` and `fix` and tell the person. Usual causes: the extension is not loaded, Chrome is closed, or another Claude Code or Codex window already drives this browser (only one at a time).
7. **Offer the organization setup** (section 3) before the first real task.

If the setup cannot run at all (a very locked-down computer), the manual way is the same as step 3 by hand: add an MCP server named `vyre-chrome` whose command is the launcher above with the single argument `mcp`.

## 2. Use it

- Start with `chrome_status`, then `chrome_tabs` (`list`, then `use` the tab the person means). Reuse the open tab. Never open a tab per step.
- Read with `chrome_snapshot`; act with `chrome_act` and `chrome_fill`; do many steps in one `chrome_batch`.
- **Sends are the person's to approve.** When an act comes back `held: true`, show the person what it would send and call `chrome_send` with its id only after they say yes in this conversation. Never approve a send on your own, in full-auto mode included, and never add `chrome_send` or `chrome_resume` to an auto-approve setting.
- **Never** run `vyre-chrome config confirm-sends off` unless the person asks for that exact thing in this conversation. Say what it removes before doing it.
- If the person presses Esc, everything stops. Ask what they want, and call `chrome_resume` only when they say carry on.
- A page that answers `blind: true` is out of reach (a bank, a password manager, a sign-in page, or a site the organization did not allow). Do not try another way around it. Tell the person, and offer to add the site if it is an organization setting.
- GoHighLevel: read `standalone/GHL-PLAYBOOK.md` before the first GHL task. Use `chrome_ghl context`, `chrome_ghl section`, then one `chrome_ghl run`.
- **Before every browser task, read `~/.vyre-chrome/org-policy.md`** (Windows: `%USERPROFILE%\.vyre-chrome\org-policy.md`) if it exists, and follow it. It is the organization's own rules.

## 3. Set it up for an organization

When the person asks to set it up for their firm, team or organization, ask these questions one at a time, in plain words, and set each answer yourself. `<cli>` below is `"<folder>/vyre-chrome"` on Mac and `"<folder>\vyre-chrome.cmd"` on Windows.

1. **Allowed sites.** "Which websites may I use for you? For example your GoHighLevel and your own website. Everything else will be off limits." Then:
   `<cli> config sites add <domain> [<domain>...]`
   A domain covers its subdomains (`gohighlevel.com` covers `app.gohighlevel.com`). For GoHighLevel add both `gohighlevel.com` and `leadconnectorhq.com`, and their white-label domain if they use one. Leaving the list empty means every site except the never-touch list; recommend a list.
2. **Read-only sites.** "Are there sites I may look at but never change?" `<cli> config readonly add <domain>...`
3. **Blocked sites.** "Any site I must never touch, even to read?" `<cli> config block add <domain>...`
4. **Always-ask actions.** "Besides sending, posting, paying and deleting, which buttons should I always ask about first? For example Disable, Revoke, Transfer, Make admin, Archive." Write the answers into the policy file (below).
5. **Learning.** "May I remember how each site is laid out, to work faster next time? It never stores what you type." `<cli> config learn on` or `off`. If they use GoHighLevel for real client work, recommend `off` until they have tried it, because learning a site's operations can repeat a real request.
6. **House rules.** "Anything else I should always or never do in the browser?" (for example: never touch billing, only work in the Workflows section, always use the staff account).

Then write `~/.vyre-chrome/org-policy.md` (Windows: `%USERPROFILE%\.vyre-chrome\org-policy.md`) like this, and show it to the person:

```markdown
# Browser rules for <organization>
Set up on <date> with <person>.

Allowed sites: <list, or "every site except the never-touch list">
Read-only sites: <list or none>
Blocked sites: <list or none>

Always ask before pressing: <buttons and words>
Never: <house rules>
Always: <house rules>
Learning: <on or off>
```

Allowed, read-only and blocked sites are enforced by the program itself. The always-ask list and the house rules are enforced by you: before any click whose label or effect matches them, stop and ask the person, even if the program did not hold it. To change anything later, the person just asks you; update both the setting and the file.

Show the current settings with `<cli> config sites list`, `<cli> config readonly list` and `<cli> config block list`.

## 4. Remove it

`codex mcp remove vyre-chrome` (or delete the `[mcp_servers.vyre-chrome]` entry from `config.toml`), then the person removes the extension in `chrome://extensions`. Settings and logs are in `~/.vyre-chrome`; delete that folder only if the person asks.

## 5. What is not built yet

Be honest about these if asked:
- Only one Codex or Claude Code session can drive the browser at a time.
- The local link accepts only this extension and no web page, but another program running under the same account could still reach it. Recommend a separate Chrome profile with only the needed sites signed in, and switching the extension off when not in use.
- Held actions come from a word list. The always-ask list in the policy file is followed by you, not enforced by the program.

## 6. Daily runs

When the person says "check these on these sites every morning and put the results in a file", set up a daily run. It reads and reports. It never sends, submits, pays or deletes: the run cannot use `chrome_send` or `chrome_resume`, and Codex runs it read-only.

Ask the person:
1. What to check, in plain words.
2. On which sites. They must be on the allowed-sites list: `vyre-chrome config sites add <domain>...` (see section 3).
3. Where the input list is (a CSV or a spreadsheet export). Read it. Never edit it.
4. What time and which days (`daily`, `weekdays`, or `mon,wed,fri`).
5. Which Chrome profile, if they use more than one. The profile folder name is on `chrome://version` ("Profile Path", the last part, for example `Profile 1`).

Then:
1. Write `task.md` in plain words. Give the input file's absolute path and the exact output columns, one row per item. Say what counts as done, not found, could not read and skipped.
2. Run: `vyre-chrome job add <name> --task <task.md> --at 07:00 --days weekdays --engine codex [--chrome-profile "Profile 1"]`
3. Run it once now, while the person watches: `vyre-chrome job run <name>`. Show the report with `vyre-chrome job last <name>`.
4. Only when the report is right, leave it scheduled. If it is wrong, change `task.md`, run `job add` again with the same name, and repeat.

Other commands: `vyre-chrome job list`, `vyre-chrome job remove <name>` (add `--purge` to delete the results too).

Tell the person:
- The computer must be on, logged in, and Chrome allowed to run at that time. On a Mac, keep it awake (System Settings > Battery or Energy) or schedule a wake. On Windows the task runs only while the person is logged on.
- It runs on the account of the person whose Codex is signed in on that computer. It uses their Chrome and their sign-ins.
- If another Codex or Claude Code session is holding the browser, the run waits up to 10 minutes, then fails and says why.
- Results are in `~/.vyre-chrome/jobs/<name>/latest.md` (older ones in `runs/`, the last 90 are kept). Staff without Codex just open that file, or you ask the person to copy or sync `latest.md` to a shared folder.
- On Linux the command prints a crontab line instead of installing it.

Be honest: this was tested on Linux with a fake engine. It has not yet been tried on a real Mac or Windows schedule. The Codex command line was written from memory of its docs and not run against a real Codex. Watch the first scheduled morning.
