# Approval Mode Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An omp extension that switches `tools.approvalMode` between `always-ask`, `write`, and `yolo` at runtime via `/mode` command, `alt+shift+m` shortcut, and picker dialog, without restarting the session.

**Architecture:** Two source files. `src/mode-logic.ts` holds the pure logic (arg parsing, override apply, status/notify formatting, selection application) with the Settings and UI surfaces injected as structural interfaces — fully unit-testable outside the omp runtime. `src/index.ts` is thin registration glue: `/mode` command, `alt+shift+m` shortcut, `session_start` status seed. It cannot be unit-tested locally because `@oh-my-pi/pi-coding-agent` only exists inside the omp process — it is verified live against a real omp TUI (Task 4).

**Tech Stack:** TypeScript executed directly by omp's Bun runtime (no build step), `@oh-my-pi/pi-coding-agent` public API (`ExtensionAPI`, `SettingsManager`), `node:test` for unit tests (Node 24 system runtime, `node --test test/`), `tsc --noEmit` for type checking.

**Spec:** `docs/superpowers/specs/2026-09-21-approval-mode-switcher-design.md`

## Global Constraints

- omp 18.2.7 API (verified against `main` of can1357/oh-my-pi on 2026-09-21). Import from `@oh-my-pi/pi-coding-agent` inside extension code; the runtime import resolves only inside the omp process — never at test time. Type-only imports are erased and safe everywhere.
- Modes are exactly `"always-ask" | "write" | "yolo"` (plus `reset` as a command argument that maps to `clearOverride`).
- Persistence: session-scoped `settings.override()` ONLY. NEVER call `settings.set()` — it writes the global config file.
- Command name: `mode` (verified: no built-in `/mode` exists in omp 18.2.7's slash-command registry). Shortcut: literal KeyId `"alt+shift+m"` (verified: not in `ExtensionRunner#RESERVED_SHORTCUTS`; `alt+m` IS reserved and must not be used).
- `registerCommand(name, { description, getArgumentCompletions?, handler })` — options object with `handler`, NOT a bare function.
- `registerShortcut(keyId, { description, handler })` — handler type `(ctx: ExtensionContext) => Promise<void> | void`, so an `async` handler is directly allowed; no fire-and-forget wrapper needed.
- `SettingsManager.create(cwd?: string, agentDir?: string): Settings` — synchronous; returns the ACTIVE session's Settings when called inside a handler (all extension handlers run inside `withActiveSettings`), so every `SettingsManager.create` call MUST happen inside a handler body, never at module top level or factory registration time.
- Status bar: `ctx.ui.setStatus(key: string, text: string | undefined)` — keyed slot; pass `undefined` to clear. Notify: `ctx.ui.notify(message, type?)`. `ctx.hasUI` is false in print/headless mode — guard status-bar and picker usage with it.
- Lint rules (project-enforced on every edit): `import type` for type-only imports; no `any`/`as any`; no dynamic import of literal modules; no one-expression wrapper functions; no unchecked member casts — use `in`/`typeof` narrowing or named casts with a reason.
- Commit after every green step. TAB indentation throughout (matches omp source style).

## Review Focus

The five uncovered input classes / failure modes most likely to bite a real user:

1. **Gibberish `/mode` arguments** (`/mode full-auto`, `/mode YOLO`, trailing whitespace): expected — trimmed lowercase parse falls through to the picker (TUI) or a clear error notify (non-TUI), never silently no-ops and never crashes. Test: `test/mode-logic.test.ts` parseModeArg cases (Task 2).
2. **`settings.get("tools.approvalMode")` returning a non-mode value** (config hand-edited to a bogus string): expected — status rendering degrades to showing the raw value instead of throwing; `applyMode` still accepts only the three literals. Test: `formatStatus("weird-value")` (Task 2).
3. **User cancels the picker** (`ui.select` resolves `undefined`, e.g. ESC): expected — no override mutation, no status change, no notify, no error. Test: `test/apply-selected.test.ts` cancel no-op (Task 3).
4. **Non-TUI modes (`print`, headless)**: expected — `/mode <mode>` still switches via notify only (no status write), bare `/mode` reports a clear error, shortcut warns, `ui.select` never invoked. Test: `test/apply-selected.test.ts` headless no-status (Task 3).
5. **`reset` when no override is active**: expected — `clearOverride` is idempotent; status shows the configured default; notify names "configured default" rather than implying a change. Test: `test/mode-logic.test.ts` reset idempotence (Task 2).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: a `test` script (`node --test test/`), a `typecheck` script (`tsc --noEmit`), and the `omp.extensions` manifest entry `["./src/index.ts"]` that later tasks implement.

- [ ] **Step 1: Create `package.json`**

```json
{
	"name": "omp-approval-mode-switcher",
	"version": "0.1.0",
	"description": "omp extension: switch tools.approvalMode (always-ask / write / yolo) at runtime",
	"private": true,
	"type": "module",
	"main": "src/index.ts",
	"scripts": {
		"test": "node --test test/",
		"typecheck": "tsc --noEmit"
	},
	"omp": {
		"extensions": ["./src/index.ts"]
	},
	"devDependencies": {
		"typescript": "^5.9.0",
		"@types/node": "^24.0.0",
		"@oh-my-pi/pi-coding-agent": "18.2.7"
	}
}
```

Note: `@oh-my-pi/pi-coding-agent` as a devDependency provides TYPES ONLY for local `tsc --noEmit`; omp remaps the specifier to its in-process runtime at extension load time (omp 18.2.7 ships as a Mach-O binary; the extension-loading docs confirm `@oh-my-pi/*` specifier remapping). `npm view @oh-my-pi/pi-coding-agent version` confirmed 18.2.7 is published. The `omp.extensions` manifest enables `omp plugin install <repo-path>` / `omp plugin link <repo-path>`.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
	"compilerOptions": {
		"target": "es2024",
		"module": "node18",
		"moduleResolution": "bundler",
		"strict": true,
		"noUncheckedIndexedAccess": true,
		"exactOptionalPropertyTypes": true,
		"skipLibCheck": true,
		"noEmit": true,
		"types": ["node"]
	},
	"include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
*.log
```

- [ ] **Step 4: Install and verify the scaffold compiles**

```bash
bun install
bun run typecheck
```

Expected: `bun install` succeeds; `tsc --noEmit` succeeds with zero errors (no TS sources yet beyond the empty dirs is fine — if tsc errors on empty include, create `src/` and `test/` directories with a `touch src/.gitkeep`-style placeholder that Task 2/3 replace).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold omp approval-mode-switcher package"
```

### Task 2: Mode logic module (pure, testable)

**Files:**
- Create: `src/mode-logic.ts`
- Create: `test/mode-logic.test.ts`

**Interfaces:**
- Consumes: `Settings` type (type-only import from `@oh-my-pi/pi-coding-agent` — erased at runtime, so tests never load the omp runtime).
- Produces (exact signatures Task 3 consumes):
  - `ApprovalMode = "always-ask" | "write" | "yolo"`, `ModeArg = ApprovalMode | "reset"` (type exports)
  - `MODES: readonly ApprovalMode[]` — `["always-ask", "write", "yolo"]`, display order for picker and completions
  - `parseModeArg(raw: string): ModeArg | undefined` — trims, lowercases, accepts the three modes + `reset`, else `undefined`
  - `formatStatus(current: string): string` — status-bar text
  - `notifyText(mode: ModeArg, currentAfter: string): string` — toast text for a completed switch
  - `applyMode(mode: ModeArg, settings: SettingsSurface): string` — applies override/clear, returns effective mode from `settings.get`
  - `SettingsSurface` (exported type) — `Pick<Settings, "override" | "clearOverride" | "get">`, the subset of Settings mode switching touches; tests pass a structural stand-in (not a runtime cast of unknown data)

- [ ] **Step 1: Write the failing tests**

Create `test/mode-logic.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	applyMode,
	type ApprovalMode,
	formatStatus,
	MODES,
	notifyText,
	parseModeArg,
} from "../src/mode-logic";

/** Structural stand-in for the Settings surface applyMode touches. */
interface FakeSettings {
	get(path: "tools.approvalMode"): string;
	override(path: "tools.approvalMode", value: string): void;
	clearOverride(path: "tools.approvalMode"): void;
}

function makeFake(initial: string): FakeSettings {
	let current = initial;
	let hasOverride = false;
	return {
		get: () => current,
		override: (_path, value) => {
			current = value;
			hasOverride = true;
		},
		clearOverride: () => {
			if (hasOverride) current = "write"; // configured default in the fake
			hasOverride = false;
		},
	};
}

test("parseModeArg accepts the three modes and reset, case-insensitive, trimmed", () => {
	assert.equal(parseModeArg("yolo"), "yolo");
	assert.equal(parseModeArg("  Always-Ask "), "always-ask");
	assert.equal(parseModeArg("WRITE"), "write");
	assert.equal(parseModeArg("reset"), "reset");
});

test("parseModeArg rejects unknown arguments", () => {
	assert.equal(parseModeArg("full-auto"), undefined);
	assert.equal(parseModeArg(""), undefined);
	assert.equal(parseModeArg("yolo!"), undefined);
});

test("MODES lists the three modes in display order", () => {
	assert.deepEqual<readonly ApprovalMode[]>(MODES, ["always-ask", "write", "yolo"]);
});

test("formatStatus prefixes the current mode and degrades on unknown values", () => {
	assert.equal(formatStatus("write"), "mode: write");
	assert.equal(formatStatus("weird-value"), "mode: weird-value");
});

test("applyMode sets an override and returns the effective mode", () => {
	const fake = makeFake("write");
	assert.equal(applyMode("yolo", fake), "yolo");
	assert.equal(fake.get("tools.approvalMode"), "yolo");
});

test("applyMode reset clears the override and is idempotent", () => {
	const fake = makeFake("always-ask");
	assert.equal(applyMode("reset", fake), "write");
	// reset with no active override: still fine, still reports the default
	assert.equal(applyMode("reset", fake), "write");
});

test("notifyText names the mode for switches, 'configured default' for reset", () => {
	assert.equal(notifyText("yolo", "yolo"), "Approval mode: yolo");
	assert.equal(notifyText("reset", "write"), "Approval mode: reset to configured default (write)");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test`
Expected: FAIL — cannot import `applyMode`/`parseModeArg`/etc. from `../src/mode-logic` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/mode-logic.ts`:

```ts
import type { Settings } from "@oh-my-pi/pi-coding-agent";

export type ApprovalMode = "always-ask" | "write" | "yolo";
export type ModeArg = ApprovalMode | "reset";

/** The subset of Settings that mode switching touches. */
export type SettingsSurface = Pick<Settings, "override" | "clearOverride" | "get">;

export const MODES: readonly ApprovalMode[] = ["always-ask", "write", "yolo"];

const MODE_ARGS: readonly ModeArg[] = [...MODES, "reset"];

export function parseModeArg(raw: string): ModeArg | undefined {
	const normalized = raw.trim().toLowerCase();
	return MODE_ARGS.find((arg) => arg === normalized);
}

export function formatStatus(current: string): string {
	return `mode: ${current}`;
}

export function notifyText(mode: ModeArg, currentAfter: string): string {
	if (mode === "reset") {
		return `Approval mode: reset to configured default (${currentAfter})`;
	}
	return `Approval mode: ${mode}`;
}

export function applyMode(mode: ModeArg, settings: SettingsSurface): string {
	if (mode === "reset") {
		settings.clearOverride("tools.approvalMode");
	} else {
		settings.override("tools.approvalMode", mode);
	}
	return settings.get("tools.approvalMode");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test`
Expected: PASS — all 7 tests.

Run: `bun run typecheck`
Expected: PASS — zero type errors.

- [ ] **Step 5: Commit**

```bash
git add src/mode-logic.ts test/mode-logic.test.ts
git commit -m "feat: mode-logic — parse args, apply override/clear, format status"
```

### Task 3: Selection application (pure, testable)

**Files:**
- Modify: `src/mode-logic.ts` (append `applySelected`, `ApplySelectedCtx`, `STATUS_KEY`)
- Create: `test/apply-selected.test.ts`

**Interfaces:**
- Consumes: `applyMode`, `parseModeArg`, `formatStatus`, `notifyText`, `SettingsSurface` from `src/mode-logic` (exact signatures from Task 2).
- Produces (exact signatures Task 4 consumes):
  - `STATUS_KEY = "mode-switcher"` (const)
  - `ApplySelectedCtx` (exported interface) — `{ ui: { notify(message: string, type?: "info" | "warning" | "error"): void; setStatus(key: string, text: string | undefined): void }; hasUI: boolean }` — structurally satisfied by `ExtensionContext`
  - `applySelected(selected: string | undefined, ctx: ApplySelectedCtx, settings: SettingsSurface): string | undefined` — parses the selection, applies it, notifies, and updates status (status only when `ctx.hasUI`); `undefined`/unparseable selection → complete no-op returning `undefined`

- [ ] **Step 1: Write the failing tests**

Create `test/apply-selected.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { applySelected, STATUS_KEY } from "../src/mode-logic";

/** Structural stand-in for ExtensionContext's UI + hasUI surface. */
interface FakeCtx {
	ui: {
		notify(message: string, type?: "info" | "warning" | "error"): void;
		setStatus(key: string, text: string | undefined): void;
	};
	hasUI: boolean;
}

interface FakeSettings {
	get(path: "tools.approvalMode"): string;
	override(path: "tools.approvalMode", value: string): void;
	clearOverride(path: "tools.approvalMode"): void;
}

function makeFakeCtx(hasUI: boolean): FakeCtx & { notifications: string[]; statuses: Map<string, string | undefined> } {
	const notifications: string[] = [];
	const statuses = new Map<string, string | undefined>();
	return {
		hasUI,
		notifications,
		statuses,
		ui: {
			notify: (message) => notifications.push(message),
			setStatus: (key, text) => statuses.set(key, text),
		},
	};
}

function makeFakeSettings(initial: string): FakeSettings {
	let current = initial;
	let hasOverride = false;
	return {
		get: () => current,
		override: (_path, value) => {
			current = value;
			hasOverride = true;
		},
		clearOverride: () => {
			if (hasOverride) current = "write";
			hasOverride = false;
		},
	};
}

test("applySelected applies a chosen mode, notifies, and updates status", () => {
	const ctx = makeFakeCtx(true);
	const settings = makeFakeSettings("write");
	const result = applySelected("yolo", ctx, settings);
	assert.equal(result, "yolo");
	assert.equal(settings.get("tools.approvalMode"), "yolo");
	assert.deepEqual(ctx.notifications, ["Approval mode: yolo"]);
	assert.equal(ctx.statuses.get(STATUS_KEY), "mode: yolo");
});

test("applySelected with undefined (cancelled picker) is a full no-op", () => {
	const ctx = makeFakeCtx(true);
	const settings = makeFakeSettings("write");
	const result = applySelected(undefined, ctx, settings);
	assert.equal(result, undefined);
	assert.equal(settings.get("tools.approvalMode"), "write");
	assert.deepEqual(ctx.notifications, []);
	assert.equal(ctx.statuses.has(STATUS_KEY), false);
});

test("applySelected reset notifies 'configured default' text", () => {
	const ctx = makeFakeCtx(true);
	const settings = makeFakeSettings("always-ask");
	settings.override("tools.approvalMode", "always-ask");
	const result = applySelected("reset", ctx, settings);
	assert.equal(result, "write");
	assert.deepEqual(ctx.notifications, ["Approval mode: reset to configured default (write)"]);
	assert.equal(ctx.statuses.get(STATUS_KEY), "mode: write");
});

test("applySelected skips the status bar when hasUI is false (headless)", () => {
	const ctx = makeFakeCtx(false);
	const settings = makeFakeSettings("write");
	const result = applySelected("yolo", ctx, settings);
	assert.equal(result, "yolo");
	assert.deepEqual(ctx.notifications, ["Approval mode: yolo"]);
	assert.equal(ctx.statuses.has(STATUS_KEY), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test`
Expected: FAIL — `applySelected`/`STATUS_KEY` not exported from `../src/mode-logic`.

- [ ] **Step 3: Implement in `src/mode-logic.ts`**

Append to `src/mode-logic.ts`:

```ts
/** Context/UI surface applySelected needs; structurally satisfied by ExtensionContext. */
export interface ApplySelectedCtx {
	ui: {
		notify(message: string, type?: "info" | "warning" | "error"): void;
		setStatus(key: string, text: string | undefined): void;
	};
	hasUI: boolean;
}

export const STATUS_KEY = "mode-switcher";

/**
 * Apply a picker/command selection: mutate settings, notify, update status.
 * `undefined` or an unparseable selection (cancelled dialog) is a complete no-op.
 */
export function applySelected(
	selected: string | undefined,
	ctx: ApplySelectedCtx,
	settings: SettingsSurface,
): string | undefined {
	const mode = parseModeArg(selected ?? "");
	if (mode === undefined) return undefined;
	const currentAfter = applyMode(mode, settings);
	ctx.ui.notify(notifyText(mode, currentAfter));
	if (ctx.hasUI) {
		ctx.ui.setStatus(STATUS_KEY, formatStatus(currentAfter));
	}
	return currentAfter;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test` && `bun run typecheck`
Expected: PASS — all 11 tests (Task 2's 7 + Task 3's 4), zero type errors.

- [ ] **Step 5: Commit**

```bash
git add src/mode-logic.ts test/apply-selected.test.ts
git commit -m "feat: applySelected — apply + notify + status with cancel no-op and headless guard"
```

### Task 4: Extension registration glue (`src/index.ts`)

**Files:**
- Create: `src/index.ts`

**Interfaces:**
- Consumes: `applySelected`, `formatStatus`, `MODES`, `parseModeArg`, `STATUS_KEY` from `./mode-logic`; `SettingsManager` (value import), `ExtensionAPI`, `ExtensionContext`, `Settings` (type imports) from `@oh-my-pi/pi-coding-agent`.
- Produces: the omp extension entry — `package.json#omp.extensions` points at this file; default export is the factory `approvalModeSwitcher(pi: ExtensionAPI): void`.

- [ ] **Step 1: Write the extension factory**

Create `src/index.ts`:

```ts
import { SettingsManager } from "@oh-my-pi/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, Settings } from "@oh-my-pi/pi-coding-agent";
import {
	applySelected,
	formatStatus,
	MODES,
	type ModeArg,
	parseModeArg,
	STATUS_KEY,
} from "./mode-logic";

const RESET_LABEL = "reset (configured default)";
const PICKER_TITLE = "Approval mode";

function descriptionFor(mode: ModeArg): string {
	switch (mode) {
		case "always-ask":
			return "Prompt before every tool call";
		case "write":
			return "Auto-approve read/write tools, prompt for exec-tier";
		case "yolo":
			return "Auto-approve everything";
	}
}

/**
 * Open the mode picker; returns the selected ModeArg, or undefined on cancel.
 * `settings.get` may return a hand-edited non-mode value — indexOf then finds
 * nothing and the cursor lands on the first entry (Math.max(0, -1) === 0),
 * which is the documented degradation.
 */
async function openPicker(ctx: ExtensionContext, settings: Settings): Promise<ModeArg | undefined> {
	const current = settings.get("tools.approvalMode");
	const options = [
		...MODES.map((mode) => ({
			label: mode === current ? `${mode} (current)` : mode,
			description: descriptionFor(mode),
		})),
		{
			label: RESET_LABEL,
			description: "Clear the session override, restore the configured default",
		},
	];
	const selected = await ctx.ui.select(PICKER_TITLE, options, {
		initialIndex: Math.max(0, MODES.indexOf(current as ModeArg)),
	});
	if (selected === undefined || selected === RESET_LABEL) {
		return selected === undefined ? undefined : "reset";
	}
	return parseModeArg(selected.replace(" (current)", ""));
}

export default function approvalModeSwitcher(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		// Inside a handler: findScopedSettings resolves the active session's
		// Settings instance via AsyncLocalStorage.
		const settings = SettingsManager.create(ctx.cwd);
		if (ctx.hasUI) {
			ctx.ui.setStatus(STATUS_KEY, formatStatus(settings.get("tools.approvalMode")));
		}
	});

	pi.registerCommand("mode", {
		description: "Switch approval mode (always-ask / write / yolo), or open a picker with no argument",
		getArgumentCompletions: async (partial: string) => {
			const normalized = partial.trim().toLowerCase();
			const args: ModeArg[] = [...MODES, "reset"];
			return args.filter((arg) => arg.startsWith(normalized));
		},
		handler: async (args: string, ctx: ExtensionContext) => {
			const settings = SettingsManager.create(ctx.cwd);
			const explicit = parseModeArg(args);
			if (explicit !== undefined) {
				applySelected(explicit, ctx, settings);
				return;
			}
			if (ctx.hasUI) {
				const selected = await openPicker(ctx, settings);
				applySelected(selected, ctx, settings);
				return;
			}
			ctx.ui.notify(
				`Unknown mode "${args.trim()}". Use: always-ask, write, yolo, or reset.`,
				"error",
			);
		},
	});

	pi.registerShortcut("alt+shift+m", {
		description: "Switch approval mode",
		handler: async (ctx: ExtensionContext) => {
			const settings = SettingsManager.create(ctx.cwd);
			if (!ctx.hasUI) {
				ctx.ui.notify("Mode picker is unavailable in this mode.", "warning");
				return;
			}
			const selected = await openPicker(ctx, settings);
			applySelected(selected, ctx, settings);
		},
	});
}
```

Notes:
- `MODES.indexOf(current as ModeArg)` is a NARROWING cast of a settings value to the union `indexOf` expects — justified because `indexOf` treats non-members as `-1` (no false positive possible; the degradation is documented in the handoff spec edge cases). If the project lint rule rejects even this named cast, replace with `const currentAsMode = MODES.find((m) => m === current); const initialIndex = currentAsMode === undefined ? 0 : MODES.indexOf(currentAsMode);` — no cast at all.
- `registerShortcut`'s handler type is `(ctx: ExtensionContext) => Promise<void> | void`, so `async` handlers are directly allowed — no fire-and-forget wrapper.
- Every `SettingsManager.create` call is inside a handler body (Global Constraint).

- [ ] **Step 2: Type check**

Run: `bun run typecheck`
Expected: PASS — confirms against the npm-published 18.2.7 type definitions that `SettingsManager`/`Settings` are exported from `@oh-my-pi/pi-coding-agent`, and that `pi.on("session_start", ...)`, `registerCommand`, `registerShortcut`, `ctx.ui.select(title, items, { initialIndex })` match. If the npm package's entry point differs from the GitHub tree (e.g. `Settings` not re-exported), inspect `node_modules/@oh-my-pi/pi-coding-agent/src/index.ts` and adjust the import to the subpath that does export them — the omp runtime remaps `@oh-my-pi/*` specifiers, so only the TYPE import source changes, never runtime behavior.

- [ ] **Step 3: Live verification against a real omp TUI**

This deliverable is only complete when the extension loads and behaves in a real omp process — no unit test can cover it (the module only exists in-process).

```bash
mkdir -p /tmp/omp-mode-verify && cd /tmp/omp-mode-verify && git init -q 2>/dev/null; true
```

Then via the harness hub (start with `application: "omp"`, `args: ["-e", "/Users/neitzert/dev/pi-mode-switcher/src/index.ts"]`, `cwd: "/tmp/omp-mode-verify"`, `pty: true`, `ready: { "log": "Welcome", "timeout": 60 }`), drive and observe in `hub logs`:

1. `/mode` + Enter → picker dialog appears with three modes + reset, current (`write`) marked `(current)`.
2. Select `yolo` → notify "Approval mode: yolo", status bar shows `mode: yolo`.
3. Prompt the agent: `run this with bash and tell me output: echo verify-yolo-1` → tool runs with NO approval prompt, output `verify-yolo-1`.
4. `/mode always-ask` → notify "Approval mode: always-ask".
5. Prompt: `run this with bash: echo verify-ask-2` → "Allow tool: bash" dialog appears → approve it.
6. `/mode reset` → notify "Approval mode: reset to configured default (write)", status `mode: write`.
7. Press `alt+shift+m` → picker opens; ESC → cancel → no notify, no change (cancel no-op).
8. `/mode garbage` → picker opens (fallback for unknown arg in TUI).

Expected: all eight behaviors observed in the TUI log; no extension-load errors in stderr.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: /mode command + alt+shift+m shortcut + session status seed"
```

### Task 5: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything shipped.
- Produces: user-facing install/usage docs.

- [ ] **Step 1: Write `README.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with usage and install instructions"
```
