import {Args, Command} from "@effect/cli";
import {Console, Effect, Match} from "effect";
import {validateFeatureName} from "../../../generators/spellbook/validation";

export const spellbook = Command.make(
	"spellbook",
	{
		featureName: Args.text({name: "feature-name"}),
	},
	({featureName}) =>
		Effect.gen(function* () {
			yield* validateFeatureName(featureName);
			yield* Console.log(`Creating spellbook for feature: ${featureName}`);
		}).pipe(
			Effect.catchAll((error) =>
				Match.value(error).pipe(
					Match.tag("InvalidFeatureNameError", (e) =>
						Console.error(`Error: ${e.reason}\nReceived: "${e.featureName}"`),
					),
					Match.orElse(() => Effect.fail(error)),
				),
			),
		),
).pipe(Command.withDescription("Generate a new Spellbook feature"));
