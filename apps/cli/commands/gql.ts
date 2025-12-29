import {Command} from "@effect/cli";
import {Console, Effect} from "effect";

const schemaPrint = Command.make(
	"schema:print",
	{},
	Effect.fn(function* () {
		yield* Console.log("Printing GraphQL schema...");
	}),
).pipe(Command.withDescription("Print the GraphQL schema"));

export const gql = Command.make("gql").pipe(
	Command.withDescription("commands related to our gql layer"),
	Command.withSubcommands([schemaPrint]),
);
