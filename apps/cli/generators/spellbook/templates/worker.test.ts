import {describe, expect, test} from "bun:test";
import type {Column, Naming} from "../types";
import {
	columnTypeToDrizzle,
	doClassTs,
	drizzleConfigTs,
	drizzleSchemaTs,
	graphqlClientTs,
	handlersTs,
	journalJson,
	migrationsJs,
	testSpecTs,
} from "./worker";

const mockNaming: Naming = {
	featureName: "book-shelf",
	className: "BookShelf",
	tableName: "book_shelf",
	bindingName: "BOOK_SHELF",
	idPrefix: "bs",
	packageName: "@kampus/book-shelf",
};

describe("columnTypeToDrizzle", () => {
	test("maps text to text()", () => {
		expect(columnTypeToDrizzle("title", "text", false)).toBe('text("title").notNull()');
	});

	test("maps integer to integer()", () => {
		expect(columnTypeToDrizzle("count", "integer", false)).toBe('integer("count").notNull()');
	});

	test("maps boolean to integer with mode", () => {
		expect(columnTypeToDrizzle("active", "boolean", false)).toBe(
			'integer("active", {mode: "boolean"}).notNull()',
		);
	});

	test("maps timestamp to timestamp()", () => {
		expect(columnTypeToDrizzle("publishedAt", "timestamp", false)).toBe(
			'timestamp("publishedAt").notNull()',
		);
	});

	test("omits notNull() for nullable columns", () => {
		expect(columnTypeToDrizzle("description", "text", true)).toBe('text("description")');
		expect(columnTypeToDrizzle("count", "integer", true)).toBe('integer("count")');
	});
});

describe("doClassTs template", () => {
	test("imports Rpcs from package", () => {
		const result = doClassTs(mockNaming);
		expect(result).toContain('import {BookShelfRpcs} from "@kampus/book-shelf"');
	});

	test("imports Spellbook from shared", () => {
		const result = doClassTs(mockNaming);
		expect(result).toContain('import * as Spellbook from "../../shared/Spellbook"');
	});

	test("imports schema, migrations, and handlers", () => {
		const result = doClassTs(mockNaming);
		expect(result).toContain('import * as schema from "./drizzle/drizzle.schema"');
		expect(result).toContain('import migrations from "./drizzle/migrations/migrations"');
		expect(result).toContain('import * as handlers from "./handlers"');
	});

	test("exports DO class with Spellbook.make", () => {
		const result = doClassTs(mockNaming);
		expect(result).toContain("export const BookShelf = Spellbook.make");
	});

	test("passes rpcs, handlers, migrations, schema to Spellbook.make", () => {
		const result = doClassTs(mockNaming);
		expect(result).toContain("rpcs: BookShelfRpcs");
		expect(result).toContain("handlers,");
		expect(result).toContain("migrations,");
		expect(result).toContain("schema,");
	});
});

describe("handlersTs template", () => {
	test("imports SqliteDrizzle", () => {
		const result = handlersTs(mockNaming);
		expect(result).toContain('import {SqliteDrizzle} from "@effect/sql-drizzle/Sqlite"');
	});

	test("imports eq from drizzle-orm", () => {
		const result = handlersTs(mockNaming);
		expect(result).toContain('import {eq} from "drizzle-orm"');
	});

	test("imports Effect", () => {
		const result = handlersTs(mockNaming);
		expect(result).toContain('import {Effect} from "effect"');
	});

	test("imports schema", () => {
		const result = handlersTs(mockNaming);
		expect(result).toContain('import * as schema from "./drizzle/drizzle.schema"');
	});

	test("exports get handler", () => {
		const result = handlersTs(mockNaming);
		expect(result).toContain("export const getBookShelf = ({id}: {id: string})");
	});

	test("get handler uses correct table name", () => {
		const result = handlersTs(mockNaming);
		expect(result).toContain("schema.book_shelf");
	});

	test("get handler returns null for missing row", () => {
		const result = handlersTs(mockNaming);
		expect(result).toContain("if (!row) return null");
	});

	test("get handler formats timestamps", () => {
		const result = handlersTs(mockNaming);
		expect(result).toContain("createdAt: row.createdAt.toISOString()");
		expect(result).toContain("updatedAt: row.updatedAt?.toISOString() ?? null");
	});

	test("exports list handler", () => {
		const result = handlersTs(mockNaming);
		expect(result).toContain("export const listBookShelfs = ()");
	});

	test("list handler maps timestamps", () => {
		const result = handlersTs(mockNaming);
		expect(result).toContain("rows.map((row) => ({");
	});
});

describe("drizzleSchemaTs template", () => {
	test("imports id from @usirin/forge", () => {
		const result = drizzleSchemaTs(mockNaming, []);
		expect(result).toContain('import {id} from "@usirin/forge"');
	});

	test("imports drizzle functions", () => {
		const result = drizzleSchemaTs(mockNaming, []);
		expect(result).toContain(
			'import {index, integer, sqliteTable, text} from "drizzle-orm/sqlite-core"',
		);
	});

	test("defines timestamp helper", () => {
		const result = drizzleSchemaTs(mockNaming, []);
		expect(result).toContain(
			'const timestamp = (name: string) => integer(name, {mode: "timestamp"})',
		);
	});

	test("exports table with correct name", () => {
		const result = drizzleSchemaTs(mockNaming, []);
		expect(result).toContain("export const book_shelf = sqliteTable");
		expect(result).toContain('"book_shelf"');
	});

	test("includes id column with idPrefix", () => {
		const result = drizzleSchemaTs(mockNaming, []);
		expect(result).toContain('id: text("id")');
		expect(result).toContain(".primaryKey()");
		expect(result).toContain('.$defaultFn(() => id("bs"))');
	});

	test("includes createdAt and updatedAt timestamps", () => {
		const result = drizzleSchemaTs(mockNaming, []);
		expect(result).toContain('createdAt: timestamp("created_at")');
		expect(result).toContain(".notNull()");
		expect(result).toContain(".$defaultFn(() => new Date())");
		expect(result).toContain('updatedAt: timestamp("updated_at")');
	});

	test("includes index on createdAt", () => {
		const result = drizzleSchemaTs(mockNaming, []);
		expect(result).toContain('index("idx_book_shelf_created_at").on(table.createdAt)');
	});

	test("includes user-defined columns", () => {
		const columns: Column[] = [
			{name: "title", type: "text", nullable: false},
			{name: "pageCount", type: "integer", nullable: true},
		];
		const result = drizzleSchemaTs(mockNaming, columns);
		expect(result).toContain('text("title").notNull()');
		expect(result).toContain('integer("pageCount")');
	});
});

describe("drizzleConfigTs template", () => {
	test("imports defineConfig", () => {
		const result = drizzleConfigTs(mockNaming);
		expect(result).toContain('import {defineConfig} from "drizzle-kit"');
	});

	test("uses sqlite dialect", () => {
		const result = drizzleConfigTs(mockNaming);
		expect(result).toContain('dialect: "sqlite"');
	});

	test("uses durable-sqlite driver", () => {
		const result = drizzleConfigTs(mockNaming);
		expect(result).toContain('driver: "durable-sqlite"');
	});

	test("points to correct schema path", () => {
		const result = drizzleConfigTs(mockNaming);
		expect(result).toContain('schema: "./src/features/book-shelf/drizzle/drizzle.schema.ts"');
	});

	test("points to correct out path", () => {
		const result = drizzleConfigTs(mockNaming);
		expect(result).toContain('out: "./src/features/book-shelf/drizzle/migrations"');
	});
});

describe("migrationsJs template", () => {
	test("imports journal", () => {
		const result = migrationsJs();
		expect(result).toContain('import journal from "./meta/_journal.json"');
	});

	test("exports journal and empty migrations", () => {
		const result = migrationsJs();
		expect(result).toContain("export default {");
		expect(result).toContain("journal,");
		expect(result).toContain("migrations: {},");
	});
});

describe("journalJson template", () => {
	test("has correct version", () => {
		const result = journalJson();
		expect(result).toContain('"version": "7"');
	});

	test("has sqlite dialect", () => {
		const result = journalJson();
		expect(result).toContain('"dialect": "sqlite"');
	});

	test("has empty entries", () => {
		const result = journalJson();
		expect(result).toContain('"entries": []');
	});
});

describe("testSpecTs template", () => {
	test("imports from cloudflare:test", () => {
		const result = testSpecTs(mockNaming);
		expect(result).toContain('import {env} from "cloudflare:test"');
	});

	test("imports vitest", () => {
		const result = testSpecTs(mockNaming);
		expect(result).toContain('import {describe, expect, it} from "vitest"');
	});

	test("creates describe block with class name", () => {
		const result = testSpecTs(mockNaming);
		expect(result).toContain('describe("BookShelf"');
	});

	test("creates helper to get DO stub", () => {
		const result = testSpecTs(mockNaming);
		expect(result).toContain("const getBookShelf = (name: string)");
		expect(result).toContain("env.BOOK_SHELF.idFromName(name)");
		expect(result).toContain("env.BOOK_SHELF.get(id)");
	});

	test("includes basic test structure", () => {
		const result = testSpecTs(mockNaming);
		expect(result).toContain('describe("basic operations"');
		expect(result).toContain('it("initializes correctly"');
		expect(result).toContain('getBookShelf("test-instance")');
		expect(result).toContain("expect(stub).toBeDefined()");
	});
});

describe("graphqlClientTs template", () => {
	test("imports RpcClient from @effect/rpc", () => {
		const result = graphqlClientTs(mockNaming);
		expect(result).toContain('import type {RpcClient} from "@effect/rpc"');
	});

	test("imports Rpcs from package", () => {
		const result = graphqlClientTs(mockNaming);
		expect(result).toContain('import {BookShelfRpcs} from "@kampus/book-shelf"');
	});

	test("imports Context and Layer from effect", () => {
		const result = graphqlClientTs(mockNaming);
		expect(result).toContain('import {Context, Layer} from "effect"');
	});

	test("imports Spellcaster from shared", () => {
		const result = graphqlClientTs(mockNaming);
		expect(result).toContain('import * as Spellcaster from "../../shared/Spellcaster"');
	});

	test("exports client class with Context.Tag", () => {
		const result = graphqlClientTs(mockNaming);
		expect(result).toContain("export class BookShelfClient extends Context.Tag");
		expect(result).toContain('"@kampus/worker/BookShelfClient"');
	});

	test("uses correct RpcClient type", () => {
		const result = graphqlClientTs(mockNaming);
		expect(result).toContain("RpcClient.FromGroup<typeof BookShelfRpcs>");
	});

	test("includes static layer method", () => {
		const result = graphqlClientTs(mockNaming);
		expect(result).toContain("static layer(env: Env, name: string): Layer.Layer<BookShelfClient>");
	});

	test("layer uses correct binding name", () => {
		const result = graphqlClientTs(mockNaming);
		expect(result).toContain("env.BOOK_SHELF.get(env.BOOK_SHELF.idFromName(name))");
	});

	test("layer uses Spellcaster.make", () => {
		const result = graphqlClientTs(mockNaming);
		expect(result).toContain("Spellcaster.make({");
		expect(result).toContain("rpcs: BookShelfRpcs,");
	});

	test("includes example usage in JSDoc", () => {
		const result = graphqlClientTs(mockNaming);
		expect(result).toContain("yield* BookShelfClient");
		expect(result).toContain("client.getBookShelf({id:");
	});
});
