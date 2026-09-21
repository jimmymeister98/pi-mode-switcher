import { SettingsManager } from "@oh-my-pi/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, Settings } from "@oh-my-pi/pi-coding-agent";
import {
	applySelected,
	formatStatus,
	MODES,
	type ApprovalMode,
	type ModeArg,
	parseModeArg,
	STATUS_KEY,
} from "./mode-logic.ts";

const RESET_LABEL = "reset (configured default)";
const PICKER_TITLE = "Approval mode";

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
 * `settings.get` may return a hand-edited non-mode value — `find` then misses
 * and the cursor lands on the first entry, which is the documented degradation.
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
	const currentAsMode = MODES.find((m) => m === current);
	const selected = await ctx.ui.select(PICKER_TITLE, options, {
		initialIndex: currentAsMode === undefined ? 0 : MODES.indexOf(currentAsMode),
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
		getArgumentCompletions: (partial: string) => {
			const normalized = partial.trim().toLowerCase();
			const args: ModeArg[] = [...MODES, "reset"];
			const matches = args.filter((arg) => arg.startsWith(normalized));
			return matches.map((arg) => ({ value: arg, label: arg }));
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
