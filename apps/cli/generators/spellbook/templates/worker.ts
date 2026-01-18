import type {Column, Naming} from "../types";

/**
 * Maps column type to Drizzle column definition string
 */
export const columnTypeToDrizzle = (
	columnName: string,
	type: Column["type"],
	nullable: boolean,
): string => {
	const columnCall = {
		text: `text("${columnName}")`,
		integer: `integer("${columnName}")`,
		boolean: `integer("${columnName}", {mode: "boolean"})`,
		timestamp: `timestamp("${columnName}")`,
	}[type];

	return nullable ? columnCall : `${columnCall}.notNull()`;
};

export const doClassTs = (
	naming: Naming,
): string => `import {${naming.className}Rpcs} from "${naming.packageName}";
import * as Spellbook from "../../shared/Spellbook";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";
import * as handlers from "./handlers";

export const ${naming.className} = Spellbook.make({
	rpcs: ${naming.className}Rpcs,
	handlers,
	migrations,
	schema,
});
`;

export const handlersTs = (
	naming: Naming,
): string => `import {SqliteDrizzle} from "@effect/sql-drizzle/Sqlite";
import {eq} from "drizzle-orm";
import {Effect} from "effect";
import * as schema from "./drizzle/drizzle.schema";

export const get${naming.className} = ({id}: {id: string}) =>
	Effect.gen(function* () {
		const db = yield* SqliteDrizzle;
		const [row] = yield* db.select().from(schema.${naming.tableName}).where(eq(schema.${naming.tableName}.id, id));
		if (!row) return null;
		return {
			...row,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt?.toISOString() ?? null,
		};
	});

export const list${naming.className}s = () =>
	Effect.gen(function* () {
		const db = yield* SqliteDrizzle;
		const rows = yield* db.select().from(schema.${naming.tableName});
		return rows.map((row) => ({
			...row,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt?.toISOString() ?? null,
		}));
	});
`;

export const drizzleSchemaTs = (naming: Naming, columns: Column[]): string => {
	const columnDefs = columns
		.map((col) => `\t\t${columnTypeToDrizzle(col.name, col.type, col.nullable)},`)
		.join("\n");

	return `import {id} from "@usirin/forge";
import {index, integer, sqliteTable, text} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, {mode: "timestamp"});

export const ${naming.tableName} = sqliteTable(
	"${naming.tableName}",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => id("${naming.idPrefix}")),
${columnDefs}
		createdAt: timestamp("created_at")
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: timestamp("updated_at"),
	},
	(table) => [index("idx_${naming.tableName}_created_at").on(table.createdAt)],
);
`;
};

export const drizzleConfigTs = (
	naming: Naming,
): string => `import {defineConfig} from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	driver: "durable-sqlite",
	schema: "./src/features/${naming.featureName}/drizzle/drizzle.schema.ts",
	out: "./src/features/${naming.featureName}/drizzle/migrations",
});
`;

export const migrationsJs = (): string => `import journal from "./meta/_journal.json";

export default {
	journal,
	migrations: {},
};
`;

export const journalJson = (): string => `{
	"version": "7",
	"dialect": "sqlite",
	"entries": []
}
`;

export const testSpecTs = (naming: Naming): string => `import {env} from "cloudflare:test";
import {describe, expect, it} from "vitest";

describe("${naming.className}", () => {
	const get${naming.className} = (name: string) => {
		const id = env.${naming.bindingName}.idFromName(name);
		return env.${naming.bindingName}.get(id);
	};

	describe("basic operations", () => {
		it("initializes correctly", async () => {
			const stub = get${naming.className}("test-instance");
			expect(stub).toBeDefined();
		});
	});
});
`;

/**
 * Generates the GraphQL client service file for the feature.
 * This provides a typed RPC client for use in GraphQL resolvers.
 */
export const graphqlClientTs = (
	naming: Naming,
): string => `import type {RpcClient} from "@effect/rpc";
import {${naming.className}Rpcs} from "${naming.packageName}";
import {Context, Layer} from "effect";
import * as Spellcaster from "../../shared/Spellcaster";

/**
 * Service that provides a typed ${naming.className} RPC client.
 *
 * The client is scoped to a specific ${naming.className} Durable Object,
 * enabling batched and typed RPC calls from GraphQL resolvers.
 *
 * @example
 * \`\`\`ts
 * const program = Effect.gen(function* () {
 *   const client = yield* ${naming.className}Client;
 *   const item = yield* client.get${naming.className}({id: "${naming.idPrefix}_123"});
 *   return item;
 * });
 *
 * // Provide the layer for a specific instance
 * await Effect.runPromise(program.pipe(Effect.provide(${naming.className}Client.layer(env, instanceName))));
 * \`\`\`
 */
export class ${naming.className}Client extends Context.Tag("@kampus/worker/${naming.className}Client")<
	${naming.className}Client,
	RpcClient.FromGroup<typeof ${naming.className}Rpcs>
>() {
	/**
	 * Creates a Layer that provides ${naming.className}Client for the specified instance.
	 *
	 * @param env - Cloudflare environment with ${naming.bindingName} binding
	 * @param name - Instance name for DO routing
	 */
	static layer(env: Env, name: string): Layer.Layer<${naming.className}Client> {
		return Layer.effect(
			${naming.className}Client,
			Spellcaster.make({
				rpcs: ${naming.className}Rpcs,
				stub: env.${naming.bindingName}.get(env.${naming.bindingName}.idFromName(name)),
			}),
		);
	}
}
`;
