# pi-mode-switcher

An [omp (Oh My Pi)](https://github.com/can1357/oh-my-pi) extension that switches
the tool approval mode at runtime — no restart, no config edits.

## Modes

- `always-ask` — prompt before every tool call
- `write` — auto-approve read/write tools, prompt for exec-tier
- `yolo` — auto-approve everything

## Usage

- `/mode` — opens a picker (current mode preselected)
- `/mode <always-ask|write|yolo|reset>` — direct switch
- `alt+shift+m` — opens the picker

### macOS / iTerm note

Stock iTerm ("Option Key Sends: Normal") doesn't emit a real escape sequence
for `⌥⇧M` — it sends the printable `Ø` character. This extension watches for
exactly that, so the shortcut works out of the box with no terminal settings
changes. A standalone `Ø` (the key chord itself) opens the picker; `Ø` typed as
part of normal text or a paste passes through untouched. On terminals that do
send real alt escape sequences, the native `alt+shift+m` keybinding handles it
instead. Both paths are active simultaneously.

Switches are session-scoped: they apply a runtime settings override that dies
with the session. Your `~/.omp/agent/config.yml` is never modified. `reset`
restores the configured default.

## Install

Requires omp 18.2.7+.

Install permanently (user scope, enabled across all sessions):

    omp plugin install https://github.com/jimmymeister98/pi-mode-switcher

Or link for development — omp loads the entry directly from your working
copy, so changes are picked up on the next session start:

    omp plugin link /path/to/pi-mode-switcher

To try it out without installing anything:

    omp -e /path/to/pi-mode-switcher/src/index.ts

`omp plugin list` shows what's installed; `--scope=project` installs into
the current project instead of user scope. The `omp.extensions` manifest in
`package.json` points at `src/index.ts`.
