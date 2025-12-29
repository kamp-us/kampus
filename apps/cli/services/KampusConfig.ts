import {Context, Data, Effect, Option} from "effect";

export interface Config {
	workerUrl?: string;

	sessionToken?: string;
	user?: {
		id: string;
		email: string;
		name?: string;
	};
}

export class KampusConfigError<Method extends string> extends Data.TaggedError(
	"@kampus/cli/services/KampusConfigError",
)<{
	method: Method;
	cause: unknown;
}> {}

export class KampusConfig extends Context.Tag("@kampus/cli/services/KampusConfig")<
	KampusConfig,
	{
		getConfig: () => Effect.Effect<Config, KampusConfigError<"parseConfig">>;
		saveConfig: (config: Partial<Config>) => Effect.Effect<void>;
		getWorkerUrl: () => Effect.Effect<string>;
		getSessionToken: () => Effect.Effect<Option.Option<string>>;
		clearSession: () => Effect.Effect<void>;
	}
>() {}

const KampusConfigLive = Effect.fn(function* () {
	const config = yield* KampusConfig;

	const token = yield* config.getSessionToken().pipe(Effect.map((t) => Option.getOrUndefined(t)));
});

// - config: /path/to/your/project/.kampus/config.json
//   KAMPUS_WORKER_URL=https://localhost:64646 kampus dev
//
//
// - state:  ~/.kampus/.state.json
