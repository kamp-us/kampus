import * as Os from "node:os";
import * as Path from "node:path";
import {KeyValueStore} from "@effect/platform/KeyValueStore";
import {BunKeyValueStore} from "@effect/platform-bun";
import {Effect, Option, Redacted, Schema} from "effect";

const User = Schema.Struct({
	id: Schema.String,
	email: Schema.String,
	name: Schema.String.pipe(Schema.optional),
});

const KampusState = Schema.Struct({
	sessionToken: Schema.Redacted(Schema.String).pipe(Schema.optional),
	user: User.pipe(Schema.optional),
});

const KAMPUS_DIR = Path.join(Os.homedir(), ".kampus");

export class KampusStateStorage extends Effect.Service<KampusStateStorage>()(
	"cli/services/KampusStateStorage",
	{
		dependencies: [BunKeyValueStore.layerFileSystem(KAMPUS_DIR)],
		effect: Effect.gen(function* () {
			const kv = (yield* KeyValueStore).forSchema(KampusState);

			const loadState = Effect.fn("KampusStateStorage.getConfig")(function* () {
				return (yield* kv.get("state")).pipe(Option.getOrElse(() => KampusState.make({})));
			});

			const saveState = Effect.fn("KampusStateStorage.saveConfig")(function* (
				config: Partial<typeof KampusState.Type>,
			) {
				const cfg = yield* loadState();
				yield* kv.set("state", {...cfg, ...config});
			});

			const getSessionToken = Effect.fn("KampusStateStorage.getSessionToken")(function* () {
				return (yield* loadState()).sessionToken;
			});

			const setSessionToken = Effect.fn("KampusStateStorage.setSessionToken")(function* (
				sessionToken: string,
			) {
				return yield* saveState({sessionToken: Redacted.make(sessionToken)});
			});

			const clearSession = Effect.fn("KampusStateStorage.clearSession")(function* () {
				const cfg = yield* loadState();
				const {sessionToken, user, ...rest} = cfg;
				yield* saveState(rest);
			});

			return {
				getSessionToken,
				setSessionToken,
				clearSession,
			};
		}),
	},
) {}
