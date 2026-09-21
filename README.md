# omp-approval-mode-switcher

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

    omp plugin install /path/to/omp-approval-mode-switcher

or for development:

    omp plugin link /path/to/omp-approval-mode-switcher

The `omp.extensions` manifest in `package.json` points at `src/index.ts`.
