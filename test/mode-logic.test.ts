import assert from "node:assert/strict";
import { test } from "node:test";
import {
	applyMode,
	type ApprovalMode,
	formatStatus,
	isPickerTrigger,
	MODES,
	notifyText,
	parseModeArg,
} from "../src/mode-logic.ts";
import type { ApprovalSetting } from "../src/mode-logic.ts";

/** Structural stand-in for the registry handle; `scope` is opaque to it. */
function makeFakeSetting(initial: string): ApprovalSetting & { current: string } {
	let current = initial;
	let hasOverride = false;
	return {
		current,
		get: () => current,
		override: (_scope, value) => {
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
	const fake = makeFakeSetting("write");
	assert.equal(applyMode("yolo", fake, "scope"), "yolo");
	assert.equal(fake.get("scope"), "yolo");
});

test("applyMode reset clears an active override and is idempotent", () => {
	const fake = makeFakeSetting("write");
	applyMode("always-ask", fake, "scope"); // establish an override
	assert.equal(applyMode("reset", fake, "scope"), "write");
	// reset with no active override: still fine, still reports the default
	assert.equal(applyMode("reset", fake, "scope"), "write");
});

test("notifyText names the mode for switches, 'configured default' for reset", () => {
	assert.equal(notifyText("yolo", "yolo"), "Approval mode: yolo");
	assert.equal(notifyText("reset", "write"), "Approval mode: reset to configured default (write)");
});

test("isPickerTrigger matches the standalone macOS Option+Shift+M chunk", () => {
	// Decoded UTF-8: iTerm (Option = Normal) turns Option+Shift+M into Ø (U+00D8)
	assert.equal(isPickerTrigger("Ø"), true);
	// Undecoded raw bytes (C3 98 mapped to code points) if input arrives latin1
	assert.equal(isPickerTrigger("Ã\u0098"), true);
	// Chars embedded in larger chunks (typing, paste) must pass through
	assert.equal(isPickerTrigger("Ørest"), false);
	assert.equal(isPickerTrigger("xØ"), false);
	// Near misses
	assert.equal(isPickerTrigger("ø"), false);
	assert.equal(isPickerTrigger("M"), false);
	assert.equal(isPickerTrigger("\u001bM"), false);
	assert.equal(isPickerTrigger(""), false);
});
