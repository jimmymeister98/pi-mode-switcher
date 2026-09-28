import assert from "node:assert/strict";
import { test } from "node:test";
import { applySelected, STATUS_KEY, type ApprovalSetting } from "../src/mode-logic.ts";

/** Structural stand-in for ExtensionContext's UI + hasUI surface. */
interface FakeCtx {
	ui: {
		notify(message: string, type?: "info" | "warning" | "error"): void;
		setStatus(key: string, text: string | undefined): void;
	};
	hasUI: boolean;
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

function makeFakeSetting(initial: string): ApprovalSetting {
	let current = initial;
	let hasOverride = false;
	return {
		get: () => current,
		override: (_scope, value) => {
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
	const setting = makeFakeSetting("write");
	const result = applySelected("yolo", ctx, setting, "scope");
	assert.equal(result, "yolo");
	assert.equal(setting.get("scope"), "yolo");
	assert.deepEqual(ctx.notifications, ["Approval mode: yolo"]);
	assert.equal(ctx.statuses.get(STATUS_KEY), "mode: yolo");
});

test("applySelected with undefined (cancelled picker) is a full no-op", () => {
	const ctx = makeFakeCtx(true);
	const setting = makeFakeSetting("write");
	const result = applySelected(undefined, ctx, setting, "scope");
	assert.equal(result, undefined);
	assert.equal(setting.get("scope"), "write");
	assert.deepEqual(ctx.notifications, []);
	assert.equal(ctx.statuses.has(STATUS_KEY), false);
});

test("applySelected reset notifies 'configured default' text", () => {
	const ctx = makeFakeCtx(true);
	const setting = makeFakeSetting("always-ask");
	setting.override("scope", "always-ask");
	const result = applySelected("reset", ctx, setting, "scope");
	assert.equal(result, "write");
	assert.deepEqual(ctx.notifications, ["Approval mode: reset to configured default (write)"]);
	assert.equal(ctx.statuses.get(STATUS_KEY), "mode: write");
});

test("applySelected skips the status bar when hasUI is false (headless)", () => {
	const ctx = makeFakeCtx(false);
	const setting = makeFakeSetting("write");
	const result = applySelected("yolo", ctx, setting, "scope");
	assert.equal(result, "yolo");
	assert.deepEqual(ctx.notifications, ["Approval mode: yolo"]);
	assert.equal(ctx.statuses.has(STATUS_KEY), false);
});
