import assert from "node:assert/strict";
import { test } from "node:test";
import { applySelected, STATUS_KEY } from "../src/mode-logic.ts";

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

function makeFakeCtx(
	hasUI: boolean,
): FakeCtx & { notifications: string[]; statuses: Map<string, string | undefined> } {
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
