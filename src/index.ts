import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import {
	applySelected,
	type ApprovalMode,
	type ApprovalSetting,
	formatStatus,
	isPickerTrigger,
	MODE_EMOJI,
	MODES,
	type ModeArg,
	parseModeArg,
	STATUS_KEY,
} from "./mode-logic.ts";

const RESET_LABEL = "reset (configured default)";
const PICKER_TITLE = "Approval mode";

const approvalMode = lookup("tools.approvalMode") as ApprovalSetting | undefined;

function descriptionFor(mode: ApprovalMode): string {
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
 * `handle.get` may return a hand-edited non-mode value — `find` then misses
 * and the cursor lands on the first entry, which is the documented degradation.
 */
async function openPicker(ctx: ExtensionContext, setting: ApprovalSetting, scope: unknown): Promise<ModeArg | undefined> {
	const current = setting.get(scope);
	const options = [
		...MODES.map((mode) => ({
			label: mode === current ? `${MODE_EMOJI[mode]} ${mode} (current)` : `${MODE_EMOJI[mode]} ${mode}`,
			description: descriptionFor(mode),
		})),
		{
			label: RESET_LABEL,
			description: "Clear the session override, restore the configured default",
		},
	];
	const currentAsMode = MODES.find((m) => m === current);
	const selected = await ctx.ui.select(PICKER_TITLE, options, {
		initialIndex: currentAsMode === undefined ? 0 : MODES.indexOf(currentAsMode),
	});
	if (selected === undefined || selected === RESET_LABEL) {
		return selected === undefined ? undefined : "reset";
	}
	// Selected labels carry an emoji prefix and possibly " (current)"; strip
	// both before parsing the mode argument.
	const stripped = selected
		.replace(/ \(\w+\)$/, "")
		.replace(new RegExp(`^(${Object.values(MODE_EMOJI).join("|")}) `), "");
	return parseModeArg(stripped);
}

/**
 * Stock macOS terminals (iTerm with Option key = Normal) never send an escape
 * sequence for Option+Shift+M — they send the printable char Ø (U+00D8), which
 * the KeyId-based shortcut system cannot bind. This raw-input watcher catches
 * exactly that standalone chunk, consumes it, and opens the picker instead.
 * Terminals that do deliver real alt sequences still use the alt+shift+m
 * binding; both paths coexist. Registered per session, interactive only.
 */
function registerMacOptionWatcher(
	ctx: ExtensionContext,
	setting: ApprovalSetting,
	scope: unknown,
): void {
	let pickerOpen = false;
	ctx.ui.onTerminalInput((data) => {
		if (!isPickerTrigger(data) || pickerOpen) return undefined;
		pickerOpen = true;
		void (async () => {
			try {
				const selected = await openPicker(ctx, setting, scope);
				applySelected(selected, ctx, setting, scope);
			} finally {
				pickerOpen = false;
			}
		})();
		return { consume: true };
	});
}

export default function approvalModeSwitcher(pi: ExtensionAPI): void {
	const scope = pi.pi.settings;

	pi.on("session_start", (_event, ctx) => {
		if (!approvalMode || !ctx.hasUI) return;
		ctx.ui.setStatus(STATUS_KEY, formatStatus(approvalMode.get(scope)));
		registerMacOptionWatcher(ctx, approvalMode, scope);
	});

	pi.registerCommand("mode", {
		description: "Switch approval mode (always-ask / write / yolo), or open a picker with no argument",
		getArgumentCompletions: (partial: string) => {
			const normalized = partial.trim().toLowerCase();
			const args: ModeArg[] = [...MODES, "reset"];
			const matches = args.filter((arg) => arg.startsWith(normalized));
			return matches.map((arg) => ({ value: arg, label: arg }));
		},
		handler: async (args: string, ctx: ExtensionContext) => {
			if (!approvalMode) {
				ctx.ui.notify(
					`This omp version does not register the tools.approvalMode setting; mode switching is unavailable.`,
					"error",
				);
				return;
			}
			const explicit = parseModeArg(args);
			if (explicit !== undefined) {
				applySelected(explicit, ctx, approvalMode, scope);
				return;
			}
			if (ctx.hasUI) {
				const selected = await openPicker(ctx, approvalMode, scope);
				applySelected(selected, ctx, approvalMode, scope);
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
			if (!approvalMode) {
				ctx.ui.notify("Mode picker is unavailable in this mode.", "warning");
				return;
			}
			if (!ctx.hasUI) {
				ctx.ui.notify("Mode picker is unavailable in this mode.", "warning");
				return;
			}
			const selected = await openPicker(ctx, approvalMode, scope);
			applySelected(selected, ctx, approvalMode, scope);
		},
	});
}
