# Vyre for Chrome: instructions for Codex

This folder is Vyre for Chrome, by Clearfield Labs (made by Irfad Imtiaz). It lets you, Codex, work in the person's own Chrome through an MCP server called `vyre-chrome`. Follow this file when the person asks you to install it, set it up for their organization, or use it.

Speak plainly to the person. Do each step yourself where you can, and tell them only the steps a person must do (the Chrome clicks and the restart).

## 1. Install it

Do these in order. Stop and say what is wrong if a step fails.

1. **Find the folder.** It is the folder that holds this file (it has `vyre-chrome`, `vyre-chrome.cmd`, `extension/` and `standalone/`). Use its absolute path from here on. If it sits in Downloads or a temporary folder, suggest moving it somewhere it can stay (for example Documents) before going on, because Chrome and the MCP server keep pointing at this path.
2. **Check Node.** Run `node --version`. It must be 22 or newer. If it is missing or older, ask the person to install Node from https://nodejs.org, then continue. (The launcher also looks in nvm, Volta, fnm, asdf and Homebrew, so a Node that the shell cannot see may still be found; check with `"<folder>/vyre-chrome" --version` on Mac, `"<folder>\vyre-chrome.cmd" --version` on Windows.)
3. **Mac only:** make sure the launcher can run: `chmod +x "<folder>/vyre-chrome"`.
4. **Add the MCP server** for this person:
   - Mac or Linux: `codex mcp add vyre-chrome -- "<folder>/vyre-chrome" mcp`
   - Windows: `codex mcp add vyre-chrome -- "<folder>\vyre-chrome.cmd" mcp`
   If `codex mcp add` is not available in this Codex version, add it to `~/.codex/config.toml` (Windows: `%USERPROFILE%\.codex\config.toml`) yourself:
   ```toml
   [mcp_servers.vyre-chrome]
   command = "<folder>/vyre-chrome"   # Windows: "<folder>\\vyre-chrome.cmd"
   args = ["mcp"]
   startup_timeout_sec = 30
   tool_timeout_sec = 300
   ```
   Keep `tool_timeout_sec` at 300 or more either way (edit the entry `codex mcp add` wrote): a whole GoHighLevel build runs as one call and can take a few minutes, and a held send waits for the person.
   If a `vyre-chrome` entry already exists, replace it. Always use the launcher, never plain `node`: the launcher finds Node itself.
5. **Tell the person to load the extension** (you cannot click in Chrome before this exists):
   > Open `chrome://extensions` in Chrome, turn on **Developer mode** (top right), press **Load unpacked** and choose this folder: `<folder>/extension`. If an older "Vyre for Chrome" is there, remove it first.
6. **Restart.** Ask the person to quit Codex and start it again, so the new server loads.
7. **Check.** Call `chrome_status`. `connected: true` means done. If not connected, read its `problem` and `fix` and tell the person. The usual causes: the extension is not loaded, Chrome is closed, or another Codex or Claude Code session already drives this browser (only one at a time).
8. **Offer the organization setup** (section 3) before the first real task.

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
