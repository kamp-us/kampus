#!/usr/bin/env -S tsx --no-warnings

import {Command, Options} from "@effect/cli"
import {NodeContext, NodeRuntime} from "@effect/platform-node"
import {NodeSocketServer} from "@effect/platform-node"
import * as SocketServer from "@effect/platform/SocketServer"
import {Console, Effect, Layer} from "effect"
import {SessionStore} from "./SessionStore.ts"
import {handleConnection} from "./WormholeServer.ts"

const port = Options.integer("port").pipe(Options.withDefault(8787))
const host = Options.text("host").pipe(Options.withDefault("0.0.0.0"))

const start = Command.make("start", {port, host}, ({port, host}) =>
	Effect.gen(function* () {
		yield* Console.log(`Starting wormhole on ws://${host}:${port}...`)
		const server = yield* SocketServer.SocketServer
		yield* Console.log(`wormhole listening on ws://${host}:${port}`)
		yield* server.run(handleConnection)
	}).pipe(Effect.provide(NodeSocketServer.layerWebSocket({port, host}))),
)

const command = Command.make("wormhole", {}, () =>
	Console.log("wormhole — PTY multiplexer daemon. Use 'start' subcommand."),
).pipe(Command.withSubcommands([start]))

const cli = Command.run(command, {
	name: "wormhole",
	version: "0.0.1",
})

const WormholeLive = Layer.mergeAll(SessionStore.Default, NodeContext.layer)

cli(process.argv).pipe(Effect.provide(WormholeLive), NodeRuntime.runMain)
