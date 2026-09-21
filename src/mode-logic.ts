export type ApprovalMode = "always-ask" | "write" | "yolo";
export type ModeArg = ApprovalMode | "reset";

/**
 * The subset of Settings that mode switching touches, specialized to the
 * `tools.approvalMode` path. Declared as an interface (not `Pick<Settings>`)
 * so structural stand-ins match: the real `Settings.override` is generic
 * over all setting paths and a path-specialized fake is not assignable to it.
 */
export interface SettingsSurface {
	get(path: "tools.approvalMode"): string;
	override(path: "tools.approvalMode", value: ApprovalMode): void;
	clearOverride(path: "tools.approvalMode"): void;
}

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

/**
 * True when a raw terminal-input chunk is exactly the bytes stock iTerm
 * (Option key = Normal) sends for macOS Option+Shift+M: the printable char
 * Ø (U+00D8, UTF-8 C3 98). Such terminals never emit an escape sequence for
 * Option combos, so the alt+shift+m shortcut binding cannot fire; this
 * watcher-level trigger is the compatibility path. Only a standalone chunk
 * matches — anything longer is typing/paste and must pass through.
 */
export function isPickerTrigger(chunk: string): boolean {
	return chunk === "\u00D8" || chunk === "\u00C3\u0098";
}

export function applyMode(mode: ModeArg, settings: SettingsSurface): string {
	if (mode === "reset") {
		settings.clearOverride("tools.approvalMode");
	} else {
		settings.override("tools.approvalMode", mode);
	}
	return settings.get("tools.approvalMode");
}

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
