# Vyre for Chrome

By Clearfield Labs. Made by Irfad Imtiaz.

Let Claude Code or Codex work in your own Chrome, signed in as you, with you watching. It reads pages, fills forms, clicks, and builds GoHighLevel workflows. Anything that sends, posts, pays or deletes waits for your yes.

Works on Mac and Windows. Works with Claude Code (in the terminal or in the Claude desktop app) and with Codex. No install script and nothing registered with Chrome: you load the extension and tell your AI where the folder is.

## Get it

**Download page:** https://clearfield-labs.github.io/vyre-chrome/ (a button for Mac and for Windows, and a prompt to paste into Claude Code or Codex).

Or download `vyre-chrome-mac.zip` or `vyre-chrome-windows.zip` from the latest release (Releases, on the right of this page). Node is included, so there is nothing else to install. Do not use **Code > Download ZIP**: that copy has no Node inside.

## Set it up

The easy way: paste this into Claude Code (or the Code tab of the Claude desktop app) or Codex, and do the one click in Chrome it asks for:

> Install Vyre for Chrome for me. Download the right zip for this computer from https://github.com/clearfield-labs/vyre-chrome/releases/latest (vyre-chrome-mac.zip on a Mac, vyre-chrome-windows.zip on Windows) and unzip it into my Documents folder, which makes a folder called "Vyre for Chrome". Then read CLAUDE.md in that folder and follow its install steps. Do every step yourself and only ask me for the clicks in Chrome. When it is done, check it with chrome_status.

(For Codex, say CODEX.md.) Behind the scenes it runs one command, `vyre-chrome setup`, which adds Vyre for Chrome to Claude Code, the Claude desktop app and Codex, whichever you have. The one thing only you can do is load the extension: in Chrome open `chrome://extensions`, turn on **Developer mode**, press **Load unpacked** and choose the `extension` folder inside "Vyre for Chrome". Then restart the app and ask it to run `chrome_status`.

You need Chrome 116 or newer and Claude Code or Codex.

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

## Daily runs

Ask Claude Code or Codex: "check these cases on these sites every weekday at 7 am and put the results in a file." It saves the task and the computer runs it on schedule, even when you are not working. Staff without Claude just open the results file (`~/.vyre-chrome/jobs/<name>/latest.md`).

- It reads and reports. It never sends, submits, pays or deletes.
- The computer must be on and logged in, with Chrome allowed to run. It uses the Chrome and the Claude Code or Codex sign-in of the person on that computer.
- Commands: `vyre-chrome job add | list | run | last | remove`. Your AI sets it up for you and runs it once while you watch.
- Tested on Linux with a fake engine. Not yet tried on a real Mac or Windows schedule.

## Known limits (0.4.1)

- One Claude Code or Codex session drives the browser at a time.
- The local link only accepts this extension, and web pages cannot open it, but another program already running under your own account could still talk to it.
- Held actions come from a word list (send, publish, pay, delete, submit, deploy, invite and similar). Others, such as Disable, Revoke, Transfer or Make admin, are held only when your organization's policy file tells your AI to ask (see CLAUDE.md).

## Licence

Copyright (c) 2026 Clearfield Labs. Third-party notices are in [NOTICE](NOTICE).
