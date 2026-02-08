import {handleConnection, SessionStore} from "@kampus/wormhole"
import {NodeContext, NodeRuntime, NodeSocketServer} from "@effect/platform-node"
import * as SocketServer from "@effect/platform/SocketServer"
import {Console, Effect, Layer} from "effect"

const PORT = Number(process.env.PORT) || 8787

const program = Effect.gen(function* () {
	yield* Console.log(`wormhole listening on ws://0.0.0.0:${PORT}`)
	const server = yield* SocketServer.SocketServer
	yield* server.run(handleConnection)
})

const WormholeLive = Layer.mergeAll(
	NodeSocketServer.layerWebSocket({port: PORT, host: "0.0.0.0"}),
	SessionStore.Default,
	NodeContext.layer,
)

program.pipe(Effect.provide(WormholeLive), NodeRuntime.runMain)
