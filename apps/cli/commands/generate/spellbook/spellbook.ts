import {Args, Command, Options} from "@effect/cli";
import {Console, Effect, Fiber, Option, Stream} from "effect";
import {generateWithProgress} from "../../../generators/spellbook/generator";
import {deriveNaming} from "../../../generators/spellbook/naming";
import type {GeneratorOptions} from "../../../generators/spellbook/types";
import {
	checkFeatureExists,
	FeatureExistsError,
	findMonorepoRoot,
	validateFeatureName,
} from "../../../generators/spellbook/validation";
import {renderApp, renderProgress, sendProgressUpdate} from "./renderApp.js";

const runGenerator = (
	args: {
		featureName: string;
		table: Option.Option<string>;
		idPrefix: Option.Option<string>;
		skipWrangler: boolean;
		skipIndex: boolean;
		skipDrizzle: boolean;
		withTest: boolean;
		withGraphql: boolean;
		withRoute: boolean;
		withAll: boolean;
		dryRun: boolean;
		noTui: boolean;
	},
	rootDir: string,
) =>
	Effect.gen(function* () {
		const options: GeneratorOptions = {
			featureName: args.featureName,
			table: Option.getOrUndefined(args.table),
			idPrefix: Option.getOrUndefined(args.idPrefix),
			skipWrangler: args.skipWrangler,
			skipIndex: args.skipIndex,
			skipDrizzle: args.skipDrizzle,
			withTest: args.withTest,
			withGraphql: args.withGraphql,
			withRoute: args.withRoute,
			withAll: args.withAll,
			dryRun: args.dryRun,
		};

		const naming = deriveNaming(options.featureName, options.table, options.idPrefix);

		// Get columns from TUI or use empty array if --no-tui is passed
		const tuiResult = args.noTui ? {columns: [], cancelled: false} : yield* renderApp(options);

		if (tuiResult.cancelled) {
			yield* Console.log("Generation cancelled.");
			return;
		}

		const columns = tuiResult.columns;

		if (args.noTui) {
			// Non-TUI mode: use Console.log for output
			const stream = generateWithProgress(rootDir, options, columns);

			yield* Stream.runForEach(stream, (event) =>
				Effect.gen(function* () {
					if (event.type === "file_written") {
						yield* Console.log(`  ✓ ${event.path}`);
					} else if (event.type === "integration_updated") {
						yield* Console.log(`  ✓ ${event.name} (updated)`);
					} else if (event.type === "drizzle_start") {
						yield* Console.log("\nRunning drizzle-kit generate...");
					} else if (event.type === "drizzle_output") {
						yield* Console.log(`  ${event.line}`);
					} else if (event.type === "drizzle_complete") {
						if (event.success) {
							yield* Console.log("✓ drizzle-kit complete");
						} else {
							yield* Console.log("✗ drizzle-kit failed");
						}
					} else if (event.type === "complete") {
						if (args.dryRun) {
							yield* Console.log("\n[Dry Run] No files were written.");
						} else {
							yield* Console.log(`\nSpellbook "${event.naming.className}" created successfully!`);
						}
					}
				}),
			);
		} else {
			// TUI mode: show progress in TUI
			const progressFiber = yield* Effect.fork(renderProgress(naming, args.dryRun));

			// Run generator and send progress events to TUI
			const stream = generateWithProgress(rootDir, options, columns);

			yield* Stream.runForEach(stream, (event) =>
				Effect.sync(() => {
					if (event.type === "file_written") {
						sendProgressUpdate({type: "file", path: event.path});
					} else if (event.type === "integration_updated") {
						sendProgressUpdate({type: "integration", name: event.name});
					} else if (event.type === "drizzle_start") {
						sendProgressUpdate({type: "drizzle_start"});
					} else if (event.type === "drizzle_output") {
						sendProgressUpdate({type: "drizzle_output", line: event.line});
					} else if (event.type === "drizzle_complete") {
						sendProgressUpdate({type: "drizzle_complete", success: event.success});
					} else if (event.type === "complete") {
						sendProgressUpdate({type: "complete", naming: event.naming, files: event.files});
					}
				}),
			).pipe(
				Effect.catchAll((error) =>
					Effect.sync(() => {
						sendProgressUpdate({type: "error", message: String(error)});
					}),
				),
			);

			// Wait for user to acknowledge
			yield* Fiber.join(progressFiber);
		}
	});

export const spellbook = Command.make(
	"spellbook",
	{
		featureName: Args.text({name: "feature-name"}),
		table: Options.text("table").pipe(Options.optional),
		idPrefix: Options.text("id-prefix").pipe(Options.optional),
		skipWrangler: Options.boolean("skip-wrangler").pipe(Options.withDefault(false)),
		skipIndex: Options.boolean("skip-index").pipe(Options.withDefault(false)),
		skipDrizzle: Options.boolean("skip-drizzle").pipe(Options.withDefault(false)),
		withTest: Options.boolean("with-test").pipe(Options.withDefault(false)),
		withGraphql: Options.boolean("with-graphql").pipe(Options.withDefault(false)),
		withRoute: Options.boolean("with-route").pipe(Options.withDefault(false)),
		withAll: Options.boolean("with-all").pipe(Options.withDefault(false)),
		dryRun: Options.boolean("dry-run").pipe(Options.withDefault(false)),
		noTui: Options.boolean("no-tui").pipe(Options.withDefault(false)),
	},
	(args) =>
		Effect.gen(function* () {
			// Validation phase
			const nameResult = yield* validateFeatureName(args.featureName).pipe(Effect.either);
			if (nameResult._tag === "Left") {
				const e = nameResult.left;
				if (e._tag === "InvalidFeatureNameError") {
					yield* Console.error(`Error: ${e.reason}\nReceived: "${e.featureName}"`);
					return;
				}
				return yield* Effect.fail(e);
			}

			const existsResult = yield* checkFeatureExists(args.featureName).pipe(Effect.either);
			if (existsResult._tag === "Left") {
				const e = existsResult.left;
				if (e instanceof FeatureExistsError) {
					yield* Console.error(
						`Error: Feature "${e.featureName}" already exists at ${e.existingPath}/`,
					);
					return;
				}
				return yield* Effect.fail(e);
			}

			const rootDir = yield* findMonorepoRoot;

			// Generator phase - platform errors handled separately
			yield* runGenerator(args, rootDir).pipe(
				Effect.catchAll((error) => Console.error(`Error: ${String(error)}`)),
			);
		}),
).pipe(Command.withDescription("Generate a new Spellbook feature"));
