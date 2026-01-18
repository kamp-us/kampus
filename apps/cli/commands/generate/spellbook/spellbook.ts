import {Args, Command} from "@effect/cli";
import {Console, Effect, Match} from "effect";
import {
	checkFeatureExists,
	validateFeatureName,
} from "../../../generators/spellbook/validation";

export const spellbook = Command.make(
	"spellbook",
	{
		featureName: Args.text({name: "feature-name"}),
	},
	({featureName}) =>
		Effect.gen(function* () {
			yield* validateFeatureName(featureName);
			yield* checkFeatureExists(featureName);
			yield* Console.log(`Creating spellbook for feature: ${featureName}`);
		}).pipe(
			Effect.catchAll((error) =>
				Match.value(error).pipe(
					Match.tag("InvalidFeatureNameError", (e) =>
						Console.error(`Error: ${e.reason}\nReceived: "${e.featureName}"`),
					),
					Match.tag("FeatureExistsError", (e) =>
						Console.error(
							`Error: Feature "${e.featureName}" already exists at ${e.existingPath}/`,
						),
					),
					Match.orElse(() => Effect.fail(error)),
				),
			),
		),
).pipe(Command.withDescription("Generate a new Spellbook feature"));
