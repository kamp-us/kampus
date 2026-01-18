import {createCliRenderer} from "@opentui/core";
import {createRoot} from "@opentui/react";
import {Effect} from "effect";
import type {Column, GeneratorOptions} from "../../../generators/spellbook/types";
import {SpellbookApp} from "./SpellbookApp";

/**
 * Renders the TUI and returns the columns defined by the user.
 */
export const renderApp = (options: GeneratorOptions): Effect.Effect<Column[]> =>
	Effect.async<Column[]>((resume) => {
		let root: ReturnType<typeof createRoot> | undefined;

		const cleanup = () => {
			if (root) {
				root.unmount();
			}
		};

		createCliRenderer().then((renderer) => {
			root = createRoot(renderer);
			root.render(
				<SpellbookApp
					options={options}
					onComplete={(columns) => {
						cleanup();
						resume(Effect.succeed(columns));
					}}
					onCancel={() => {
						cleanup();
						resume(Effect.succeed([]));
					}}
				/>,
			);
		});

		return Effect.sync(cleanup);
	});
