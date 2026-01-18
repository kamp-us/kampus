import {Args, Command, Options} from "@effect/cli";
import {Console, Effect, Match, Option} from "effect";
import {generate} from "../../../generators/spellbook/generator";
import type {GeneratorOptions} from "../../../generators/spellbook/types";
import {
	checkFeatureExists,
	findMonorepoRoot,
	validateFeatureName,
} from "../../../generators/spellbook/validation";
import {renderApp} from "./renderApp.js";

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
			yield* validateFeatureName(args.featureName);
			yield* checkFeatureExists(args.featureName);

			const rootDir = yield* findMonorepoRoot;

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

			// Get columns from TUI or use empty array if --no-tui is passed
			const columns = args.noTui ? [] : yield* renderApp(options);

			const result = yield* generate(rootDir, options, columns);

			if (args.dryRun) {
				yield* Console.log("\n[Dry Run] Files that would be created:");
				for (const file of result.files) {
					yield* Console.log(`  - ${file.path}`);
				}
			} else {
				yield* Console.log("\nFiles created:");
				for (const file of result.files) {
					yield* Console.log(`  ✓ ${file.path}`);
				}
				yield* Console.log(`\nSpellbook "${result.naming.className}" created successfully!`);
			}
		}).pipe(
			Effect.catchAll((error) =>
				Match.value(error).pipe(
					Match.tag("InvalidFeatureNameError", (e) =>
						Console.error(`Error: ${e.reason}\nReceived: "${e.featureName}"`),
					),
					Match.tag("FeatureExistsError", (e) =>
						Console.error(`Error: Feature "${e.featureName}" already exists at ${e.existingPath}/`),
					),
					Match.orElse(() => Effect.fail(error)),
				),
			),
		),
).pipe(Command.withDescription("Generate a new Spellbook feature"));
