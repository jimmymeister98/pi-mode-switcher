/**
 * Ambient module augmentation: `SettingsManager` is exported by the omp
 * runtime's legacy-Pi shim (the runtime remaps the `@oh-my-pi/pi-coding-agent`
 * root specifier to the in-process shim, which re-exports it), but the npm
 * package's published type barrel (`dist/types/index.d.ts`) does not declare
 * it. This augmentation adds the type so `tsc --noEmit` accepts the import
 * without changing runtime resolution.
 *
 * Mirrors `SettingsManager` in omp's
 * `src/extensibility/legacy-pi-coding-agent-shim.ts`.
 */
import type { Settings } from "@oh-my-pi/pi-coding-agent";

declare module "@oh-my-pi/pi-coding-agent" {
	export const SettingsManager: {
		create(cwd?: string, agentDir?: string): Settings;
		inMemory(): Settings;
	};
}
