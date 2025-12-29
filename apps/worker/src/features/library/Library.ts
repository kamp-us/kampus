import {DurableObject} from "cloudflare:workers";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";
import {getNormalizedUrl} from "./getNormalizedUrl";

// keyed by user id
export class Library extends DurableObject<Env> {
	db = drizzle(this.ctx.storage, {schema});

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			await migrate(this.db, migrations);
		});
	}

	async init(owner: string) {
		await this.ctx.storage.put("owner", owner);
	}

	async createStory(options: {url: string; title: string; description?: string}) {
		const {url, title, description} = options;

		const [story] = await this.db
			.insert(schema.story)
			.values({url, normalizedUrl: getNormalizedUrl(url), title, description})
			.returning();

		return story;
	}
}
