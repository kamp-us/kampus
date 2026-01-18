import {Args, Command} from "@effect/cli";
import {Console, Effect} from "effect";

export const spellbook = Command.make(
	"spellbook",
	{
		featureName: Args.text({name: "feature-name"}),
	},
	({featureName}) =>
		Effect.gen(function* () {
			yield* Console.log(`Creating spellbook for feature: ${featureName}`);
		}),
).pipe(Command.withDescription("Generate a new Spellbook feature"));
