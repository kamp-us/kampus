import {createCliRenderer, TextAttributes} from "@opentui/core";
import {createRoot, useKeyboard} from "@opentui/react";
import {Effect} from "effect";
import * as React from "react";
import {useState} from "react";
import type {GeneratedFile} from "../../../generators/spellbook/generator";
import type {Column, GeneratorOptions, Naming} from "../../../generators/spellbook/types";
import {SpellbookApp} from "./SpellbookApp";

export type TuiResult = {
	columns: Column[];
	cancelled: boolean;
};

/**
 * Renders the TUI to collect columns from the user.
 * Returns the columns array, or cancelled: true if user cancelled.
 */
export const renderApp = (options: GeneratorOptions): Effect.Effect<TuiResult> =>
	Effect.async<TuiResult>((resume) => {
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
					onColumnsReady={(columns) => {
						cleanup();
						resume(Effect.succeed({columns, cancelled: false}));
					}}
					onCancel={() => {
						cleanup();
						resume(Effect.succeed({columns: [], cancelled: true}));
					}}
				/>,
			);
		});

		return Effect.sync(cleanup);
	});

export type ProgressResult = {
	acknowledged: boolean;
};

type ProgressPhase =
	| {type: "generating"; progress: string[]}
	| {type: "success"; naming: Naming; files: GeneratedFile[]}
	| {type: "error"; message: string};

type ProgressAppProps = {
	naming: Naming;
	dryRun: boolean;
	onDone: () => void;
};

const ProgressApp = ({naming, dryRun, onDone}: ProgressAppProps) => {
	const [phase, setPhase] = useState<ProgressPhase>({type: "generating", progress: []});

	// Expose phase setter globally so command can update it
	React.useEffect(() => {
		(globalThis as GlobalWithProgress).__spellbookProgressUpdate = (event: ProgressUpdateEvent) => {
			if (event.type === "file") {
				setPhase((p) =>
					p.type === "generating" ? {...p, progress: [...p.progress, `✓ ${event.path}`]} : p,
				);
			} else if (event.type === "integration") {
				setPhase((p) =>
					p.type === "generating"
						? {...p, progress: [...p.progress, `✓ ${event.name} (updated)`]}
						: p,
				);
			} else if (event.type === "complete") {
				setPhase({type: "success", naming: event.naming, files: event.files});
			} else if (event.type === "error") {
				setPhase({type: "error", message: event.message});
			}
		};

		return () => {
			delete (globalThis as GlobalWithProgress).__spellbookProgressUpdate;
		};
	}, []);

	useKeyboard((key) => {
		if (phase.type === "success" || phase.type === "error") {
			if (key.name === "return" || key.name === "q" || key.name === "escape") {
				onDone();
			}
		}
	});

	return (
		<box style={{flexDirection: "column", padding: 1}}>
			{phase.type === "generating" && (
				<box style={{flexDirection: "column"}}>
					<text
						content="Generating files..."
						style={{attributes: TextAttributes.BOLD, marginBottom: 1, fg: "#4a90d9"}}
					/>
					{phase.progress.map((item, i) => (
						<text key={i} content={`  ${item}`} style={{fg: "#00aa00"}} />
					))}
					{phase.progress.length === 0 && <text content="  Starting..." style={{fg: "#888888"}} />}
				</box>
			)}
			{phase.type === "success" && (
				<box style={{flexDirection: "column"}}>
					<text
						content={dryRun ? "[Dry Run] Files that would be created:" : "Files created:"}
						style={{
							attributes: TextAttributes.BOLD,
							marginBottom: 1,
							fg: dryRun ? "#ffaa00" : "#00aa00",
						}}
					/>
					{phase.files.map((file, i) => (
						<text
							key={i}
							content={`  ${dryRun ? "○" : "✓"} ${file.path}`}
							style={{fg: dryRun ? "#888888" : "#00aa00"}}
						/>
					))}
					<text content="" />
					<text
						content={
							dryRun
								? "No files were written (dry run mode)"
								: `Spellbook "${naming.className}" created successfully!`
						}
						style={{fg: dryRun ? "#ffaa00" : "#00aa00", attributes: TextAttributes.BOLD}}
					/>
					<text content="" />
					<text content="Press Enter to exit" style={{fg: "#666666"}} />
				</box>
			)}
			{phase.type === "error" && (
				<box style={{flexDirection: "column"}}>
					<text content="Error:" style={{attributes: TextAttributes.BOLD, fg: "#ff0000"}} />
					<text content={`  ${phase.message}`} style={{fg: "#ff0000"}} />
					<text content="" />
					<text content="Press Enter to exit" style={{fg: "#666666"}} />
				</box>
			)}
		</box>
	);
};

export type ProgressUpdateEvent =
	| {type: "file"; path: string}
	| {type: "integration"; name: string}
	| {type: "complete"; naming: Naming; files: GeneratedFile[]}
	| {type: "error"; message: string};

type GlobalWithProgress = typeof globalThis & {
	__spellbookProgressUpdate?: (event: ProgressUpdateEvent) => void;
};

/**
 * Sends a progress update to the TUI.
 */
export const sendProgressUpdate = (event: ProgressUpdateEvent): void => {
	const fn = (globalThis as GlobalWithProgress).__spellbookProgressUpdate;
	if (fn) {
		fn(event);
	}
};

/**
 * Renders progress TUI and waits for user acknowledgment.
 */
export const renderProgress = (naming: Naming, dryRun: boolean): Effect.Effect<ProgressResult> =>
	Effect.async<ProgressResult>((resume) => {
		let root: ReturnType<typeof createRoot> | undefined;

		const cleanup = () => {
			if (root) {
				root.unmount();
			}
		};

		createCliRenderer().then((renderer) => {
			root = createRoot(renderer);
			root.render(
				<ProgressApp
					naming={naming}
					dryRun={dryRun}
					onDone={() => {
						cleanup();
						resume(Effect.succeed({acknowledged: true}));
					}}
				/>,
			);
		});

		return Effect.sync(cleanup);
	});
