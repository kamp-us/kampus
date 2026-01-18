import {Command} from "@effect/cli";
import {Console} from "effect";
import {spellbook} from "./spellbook/spellbook";

export const generate = Command.make("generate", {}, () =>
	Console.log("Usage: kampus generate <subcommand>"),
).pipe(Command.withSubcommands([spellbook]), Command.withDescription("Generate code scaffolds"));
