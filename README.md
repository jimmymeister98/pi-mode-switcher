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

Switches are session-scoped: they apply a runtime settings override that dies
with the session. Your `~/.omp/agent/config.yml` is never modified. `reset`
restores the configured default.

## Install

Requires omp 18.2.7+.

    omp plugin install /path/to/omp-approval-mode-switcher

or for development:

    omp plugin link /path/to/omp-approval-mode-switcher

The `omp.extensions` manifest in `package.json` points at `src/index.ts`.
