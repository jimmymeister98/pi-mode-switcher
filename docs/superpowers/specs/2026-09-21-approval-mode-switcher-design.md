# Approval Mode Switcher — Design

Date: 2026-09-21
Status: Approved (user), pending implementation

## Goal

An omp extension that switches the tool approval mode (`tools.approvalMode`) at
runtime between `always-ask`, `write`, and `yolo`, without restarting the
session.

## Mechanism (verified against omp 18.2.7)

- `SettingsManager.create(ctx.cwd)` (imported from
  `@oh-my-pi/pi-coding-agent`) resolves the live session `Settings` instance —
  extension handlers run inside `withActiveSettings(...)`, so the AsyncLocalStorage
  scope returns the correct session-scoped instance.
- `settings.override("tools.approvalMode", mode)` applies an in-memory override
  that is **not persisted** and takes effect on the **next tool call** (approval
  is resolved per-call at execute time via `resolveApprovalFromContext`).
- `settings.clearOverride("tools.approvalMode")` removes the override, restoring
  the configured value.
- Live TUI verification: `always-ask` → bash approval prompt appeared; `yolo` →
  bash executed with no prompt; base config `write` restored after clear.

## Design

### Commands

- `/mode` (no args) — opens a picker dialog (`ctx.ui.select`) with the three
  modes, current mode preselected/highlighted, plus a "reset to configured
  default" entry (clears the override). Selecting applies
  `settings.override()` and shows a notify toast.
- `/mode <always-ask|write|yolo|reset>` — direct switch, no dialog. Invalid
  arguments open the picker.

### Keyboard shortcut

- `Alt+M` (`pi.registerShortcut`) opens the same picker dialog as bare `/mode`.
  Alt+M is not in omp's reserved-shortcut list.

### Persistence

Session-scoped only: `settings.override()`. The config file
(`~/.omp/agent/config.yml`) is never touched; a new session starts from the
configured default. `/mode reset` (or the reset entry in the picker) clears the
override.

### Indicator

- `ctx.ui.setStatus` shows the active mode persistently in the status bar
  (e.g. `mode: yolo`), including at session start (registered via a
  `session_start` handler) and updated on every switch.
- `ctx.ui.notify` toast confirms each switch (e.g. "Approval mode: write").

## Packaging

Single-file extension `src/index.ts` in this repo, exported as default factory:

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
export default (pi: ExtensionAPI) => { ... };
```

Installable either by:

1. Symlinking/copying into `~/.omp/agent/extensions/` (single file, no package
   manifest needed), or
2. A small `package.json` with an `"omp": { "extensions": ["./src/index.ts"] }`
   manifest for `~/.omp/plugins/` installation.

Decision: ship option 2 (package with manifest) as the repo's primary form —
it supports `omp plugin add <path>` — while the single file remains directly
droppable. No marketplace publishing.

## Non-goals

- No per-tool policy management (`tools.approval.<tool>`).
- No persistence of the switch to config (`settings.set` not used).
- No mode-transition rules beyond the three modes + reset.

## Edge cases

- `ctx.ui.select` unavailable (print mode / headless): commands fall back to
  notify-only behavior; shortcut registration is a no-op in non-TUI modes.
- Invalid `/mode` argument: falls back to picker (TUI) or notify error
  (headless).
- Concurrent sessions: the AsyncLocalStorage scope guarantees each session's
  handler resolves its own Settings instance.
