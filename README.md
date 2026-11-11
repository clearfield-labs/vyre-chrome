# Vyre for Chrome

By Clearfield Labs. Made by Irfad Imtiaz.

Let Claude Code or Codex work in your own Chrome, signed in as you, with you watching. It reads pages, fills forms, clicks, and builds GoHighLevel workflows. Anything that sends, posts, pays or deletes waits for your yes.

Works on Mac and Windows. Works with Claude Code (in the terminal or in the Claude desktop app) and with Codex. No install script and nothing registered with Chrome: you load the extension and tell your AI where the folder is.

## Get it

Download the zip from the latest release (Releases, on the right of this page) or press **Code > Download ZIP**. Unzip it somewhere it can stay, for example your Documents folder.

## Set it up (three steps)

The easy way: open Claude Code or Codex **in the unzipped folder** and say *"Install Vyre for Chrome."* It reads [CLAUDE.md](CLAUDE.md) or [CODEX.md](CODEX.md) and does the rest with you.

By hand:

1. **Chrome.** Open `chrome://extensions`, turn on **Developer mode** (top right), press **Load unpacked** and choose the `extension` folder inside the unzipped folder.
2. **Your AI.** Add the server, with the real path of the unzipped folder:
   - Claude Code (terminal or desktop app), Mac: `claude mcp add -s user vyre-chrome -- "/path/to/vyre-chrome/vyre-chrome" mcp`
   - Claude Code, Windows: `claude mcp add -s user vyre-chrome -- "C:\path\to\vyre-chrome\vyre-chrome.cmd" mcp`
   - Codex, Mac: `codex mcp add vyre-chrome -- "/path/to/vyre-chrome/vyre-chrome" mcp`
   - Codex, Windows: `codex mcp add vyre-chrome -- "C:\path\to\vyre-chrome\vyre-chrome.cmd" mcp`
3. **Check.** Restart Claude Code or Codex (quit and reopen the Claude desktop app) and ask it to run `chrome_status`. It says connected. The extension's toolbar icon shows the same.

You need Chrome 116 or newer and Node 22 or newer (https://nodejs.org). The `vyre-chrome` launcher finds Node on its own, also where the Claude desktop app cannot see it (nvm, Volta, fnm, asdf, Homebrew).

## Your organization's rules

Ask your AI, in plain words. For example: *"Set up Vyre for Chrome for our firm: it may only use our GoHighLevel and our website."* See "Set it up for an organization" in [CLAUDE.md](CLAUDE.md).

- **Allowed sites:** when the list has anything on it, every other site is refused. Empty means every site except the never-touch list.
- **Read-only sites:** may be read, never acted on.
- **Blocked sites:** never touched.
- **Always-ask actions and other house rules:** kept in `~/.vyre-chrome/org-policy.md`, which your AI reads before every browser task.

## What it never does

- Sends, posts, payments, publishes and deletes are held. You approve each one.
- Passwords, cookies, tokens and session ids are masked before the AI sees them.
- Banks, password managers and sign-in pages are never read or touched.
- Esc in the page, or Cmd+Shift+E (Ctrl+Shift+E on Windows), stops everything at once.

Chrome shows a "developer mode extensions" warning when it starts, and "started debugging this browser" while a tab is driven. Both are normal.

## Good practice

Use a separate Chrome profile, signed in only to the sites the AI should use, with a staff-level account rather than an owner. Switch the extension off in `chrome://extensions` when you are not using it.

## Known limits (0.3.0)

- One Claude Code or Codex session drives the browser at a time.
- The local link only accepts this extension, and web pages cannot open it, but another program already running under your own account could still talk to it.
- Held actions come from a word list (send, publish, pay, delete, submit, deploy, invite and similar). Others, such as Disable, Revoke, Transfer or Make admin, are held only when your organization's policy file tells your AI to ask (see CLAUDE.md).

## Licence

Copyright (c) 2026 Clearfield Labs. Third-party notices are in [NOTICE](NOTICE).
