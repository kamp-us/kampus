#!/usr/bin/env bun

import {Command} from "@effect/cli";
import {BunContext, BunRuntime} from "@effect/platform-bun";
import {Console, Effect, Layer} from "effect";
import {gql} from "../commands/gql";
import {login} from "../commands/login";
import {KampusStateStorage} from "../services/KampusStateStorage";

// Define the top-level command
const command = Command.make("kampus", {}, () =>
	Effect.gen(function* () {
		yield* Console.log("kampus cli - use a subcommand to get started");
	}),
).pipe(Command.withSubcommands([login, gql]));

// Set up the CLI application
const cli = Command.run(command, {
	name: "kampus cli - entrypoint to your kampus applications",
	version: "v0.0.0",
});

const CliLive = Layer.mergeAll(KampusStateStorage.Default, BunContext.layer);

const program = cli(process.argv).pipe(Effect.provide(CliLive));

BunRuntime.runMain(program);
