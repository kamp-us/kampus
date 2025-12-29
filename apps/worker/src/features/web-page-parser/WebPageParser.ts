import {DurableObject} from "cloudflare:workers";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";
import {fetchPageMetadata} from "./fetchPageMetadata";
import {PageMetadata} from "./schema";

export class WebPageParser extends DurableObject<Env> {
	db = drizzle(this.ctx.storage, {schema});

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			await migrate(this.db, migrations);
		});
	}

	async init(url: string) {
		await this.ctx.storage.put("url", url);
	}

	async $url() {
		const url = await this.ctx.storage.get<string>("url");
		if (!url) {
			throw new Error("WebPageParser is not initialized, call stub.init(url) first");
		}
		return url;
	}

	async lastResult() {
		const result = await this.db.query.fetchlog.findFirst({
			orderBy: ({createdAt}, {desc}) => desc(createdAt),
		});
		return result ? new FetchLog(result) : undefined;
	}

	async getMetadata(options?: {forceFetch?: boolean}) {
		const result = await this.lastResult();
		if (result?.isRecent() && !options?.forceFetch) {
			console.log("found last result, and it's recent, returning", result.toPageMetadata());
			return result.toPageMetadata();
		}

		console.log("no recent results, gonna start fetching new metadata");

		const metadata = await fetchPageMetadata(await this.$url());
		console.log("fetched metatada", metadata);

		const [newResult] = await this.db
			.insert(schema.fetchlog)
			.values({
				title: metadata.title,
				description: metadata.description,
			})
			.returning();

		console.log("saved metadata to fetchlog", newResult);

		return PageMetadata.make(newResult);
	}
}

type FetchLogRecord = typeof schema.fetchlog.$inferSelect;

class FetchLog {
	constructor(private record: FetchLogRecord) {}

	isRecent() {
		return (
			this.record.createdAt && this.record.createdAt > new Date(Date.now() - 1000 * 60 * 60 * 24)
		);
	}

	toPageMetadata() {
		return PageMetadata.make(this.record);
	}
}
