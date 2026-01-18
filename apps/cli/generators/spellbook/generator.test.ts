import {describe, expect, test} from "bun:test";
import {generateFiles} from "./generator";
import {deriveNaming} from "./naming";
import type {Column} from "./types";

describe("generateFiles", () => {
	const columns: Column[] = [
		{name: "title", type: "text", nullable: false},
		{name: "count", type: "integer", nullable: true},
	];

	describe("FR-2.1: PascalCase for class names", () => {
		test("book-shelf -> BookShelf in DO class file", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const doClassFile = files.find((f) => f.path.endsWith("/BookShelf.ts"));
			expect(doClassFile).toBeDefined();
			expect(doClassFile?.content).toContain("export const BookShelf = Spellbook.make");
		});
	});

	describe("FR-2.2: snake_case for table names", () => {
		test("book-shelf -> book_shelf in drizzle schema", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const schemaFile = files.find((f) => f.path.endsWith("/drizzle.schema.ts"));
			expect(schemaFile).toBeDefined();
			expect(schemaFile?.content).toContain("export const book_shelf = sqliteTable(");
			expect(schemaFile?.content).toContain('"book_shelf"');
		});
	});

	describe("FR-2.3: SCREAMING_SNAKE for bindings", () => {
		test("book-shelf -> BOOK_SHELF binding name", () => {
			const naming = deriveNaming("book-shelf");
			expect(naming.bindingName).toBe("BOOK_SHELF");
		});
	});

	describe("FR-2.4: ID prefix derivation", () => {
		test("book-shelf -> bs prefix", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const schemaFile = files.find((f) => f.path.endsWith("/drizzle.schema.ts"));
			expect(schemaFile?.content).toContain('id("bs")');
		});

		test("user-profile-settings -> ups prefix", () => {
			const naming = deriveNaming("user-profile-settings");
			expect(naming.idPrefix).toBe("ups");
		});
	});

	describe("FR-2.5: --table override", () => {
		test("custom table name in drizzle schema", () => {
			const naming = deriveNaming("book-shelf", "custom_books");
			const files = generateFiles(naming, columns);

			const schemaFile = files.find((f) => f.path.endsWith("/drizzle.schema.ts"));
			expect(schemaFile?.content).toContain("export const custom_books = sqliteTable(");
			expect(schemaFile?.content).toContain('"custom_books"');
			expect(schemaFile?.content).not.toContain("book_shelf");
		});
	});

	describe("FR-2.6: --id-prefix override", () => {
		test("custom id prefix in drizzle schema", () => {
			const naming = deriveNaming("book-shelf", undefined, "bk");
			const files = generateFiles(naming, columns);

			const schemaFile = files.find((f) => f.path.endsWith("/drizzle.schema.ts"));
			expect(schemaFile?.content).toContain('id("bk")');
			expect(schemaFile?.content).not.toContain('id("bs")');
		});
	});

	describe("FR-4.1: Package JSON with @kampus scope", () => {
		test("contains correct package name", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const pkgFile = files.find((f) => f.path.endsWith("package.json"));
			expect(pkgFile?.content).toContain('"name": "@kampus/book-shelf"');
		});

		test("contains required dependencies", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const pkgFile = files.find((f) => f.path.endsWith("package.json"));
			expect(pkgFile?.content).toContain('"@effect/rpc"');
			expect(pkgFile?.content).toContain('"effect"');
		});
	});

	describe("FR-4.2: tsconfig.json", () => {
		test("exists at correct path", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const tsconfig = files.find((f) => f.path === "packages/book-shelf/tsconfig.json");
			expect(tsconfig).toBeDefined();
		});
	});

	describe("FR-4.3: index.ts with re-exports", () => {
		test("exports from errors, rpc, schema", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const indexFile = files.find((f) => f.path === "packages/book-shelf/src/index.ts");
			expect(indexFile?.content).toContain('from "./errors.js"');
			expect(indexFile?.content).toContain('from "./rpc.js"');
			expect(indexFile?.content).toContain('from "./schema.js"');
		});
	});

	describe("FR-4.4: errors.ts scaffold", () => {
		test("contains Schema.TaggedError example", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const errorsFile = files.find((f) => f.path === "packages/book-shelf/src/errors.ts");
			expect(errorsFile?.content).toContain('import {Schema} from "effect"');
			expect(errorsFile?.content).toContain("TaggedError");
		});
	});

	describe("FR-4.5: schema.ts with columns", () => {
		test("contains id, createdAt, updatedAt", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const schemaFile = files.find((f) => f.path === "packages/book-shelf/src/schema.ts");
			expect(schemaFile?.content).toContain("id: Schema.String");
			expect(schemaFile?.content).toContain("createdAt: Schema.String");
			expect(schemaFile?.content).toContain("updatedAt: Schema.NullOr(Schema.String)");
		});

		test("contains user-defined columns with correct types", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const schemaFile = files.find((f) => f.path === "packages/book-shelf/src/schema.ts");
			expect(schemaFile?.content).toContain("title: Schema.String");
			expect(schemaFile?.content).toContain("count: Schema.NullOr(Schema.Int)");
		});
	});

	describe("FR-4.6: rpc.ts with get/list RPCs", () => {
		test("contains RpcGroup with get and list methods", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const rpcFile = files.find((f) => f.path === "packages/book-shelf/src/rpc.ts");
			expect(rpcFile?.content).toContain("RpcGroup.make(");
			expect(rpcFile?.content).toContain('"getBookShelf"');
			expect(rpcFile?.content).toContain('"listBookShelfs"');
		});
	});

	describe("FR-5.1: DO class with Spellbook.make()", () => {
		test("imports from package and uses Spellbook.make", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const doFile = files.find((f) => f.path.endsWith("/BookShelf.ts"));
			expect(doFile?.content).toContain('from "@kampus/book-shelf"');
			expect(doFile?.content).toContain('import * as Spellbook from "../../shared/Spellbook"');
			expect(doFile?.content).toContain("export const BookShelf = Spellbook.make({");
		});
	});

	describe("FR-5.2: handlers.ts with get/list handlers", () => {
		test("contains handlers using Effect.gen", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const handlersFile = files.find((f) => f.path.endsWith("/handlers.ts"));
			expect(handlersFile?.content).toContain("SqliteDrizzle");
			expect(handlersFile?.content).toContain("export const getBookShelf");
			expect(handlersFile?.content).toContain("export const listBookShelfs");
			expect(handlersFile?.content).toContain("Effect.gen(function* ()");
		});
	});

	describe("FR-5.3: drizzle.config.ts", () => {
		test("contains correct dialect and paths", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const configFile = files.find((f) => f.path.endsWith("/drizzle.config.ts"));
			expect(configFile?.content).toContain('dialect: "sqlite"');
			expect(configFile?.content).toContain('driver: "durable-sqlite"');
			expect(configFile?.content).toContain("book-shelf/drizzle/drizzle.schema.ts");
			expect(configFile?.content).toContain("book-shelf/drizzle/migrations");
		});
	});

	describe("FR-5.4: drizzle.schema.ts with columns", () => {
		test("contains sqliteTable with id, createdAt, updatedAt", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const schemaFile = files.find((f) => f.path.endsWith("/drizzle.schema.ts"));
			expect(schemaFile?.content).toContain("sqliteTable");
			expect(schemaFile?.content).toContain('text("id")');
			expect(schemaFile?.content).toContain(".primaryKey()");
			expect(schemaFile?.content).toContain('timestamp("created_at")');
			expect(schemaFile?.content).toContain('timestamp("updated_at")');
		});

		test("contains index on createdAt", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const schemaFile = files.find((f) => f.path.endsWith("/drizzle.schema.ts"));
			expect(schemaFile?.content).toContain("index(");
			expect(schemaFile?.content).toContain("table.createdAt");
		});

		test("contains user-defined columns with correct Drizzle types", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const schemaFile = files.find((f) => f.path.endsWith("/drizzle.schema.ts"));
			expect(schemaFile?.content).toContain('text("title").notNull()');
			expect(schemaFile?.content).toContain('integer("count")');
		});
	});

	describe("FR-5.5: migrations folder scaffolds", () => {
		test("migrations.js exists with journal import", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const migrationsFile = files.find((f) => f.path.endsWith("/migrations.js"));
			expect(migrationsFile).toBeDefined();
			expect(migrationsFile?.content).toContain('import journal from "./meta/_journal.json"');
			expect(migrationsFile?.content).toContain("migrations: {}");
		});

		test("_journal.json exists with correct structure", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const journalFile = files.find((f) => f.path.endsWith("/_journal.json"));
			expect(journalFile).toBeDefined();
			expect(journalFile?.content).toContain('"version"');
			expect(journalFile?.content).toContain('"dialect": "sqlite"');
			expect(journalFile?.content).toContain('"entries": []');
		});
	});

	describe("file paths", () => {
		test("package files at correct paths", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const paths = files.map((f) => f.path);
			expect(paths).toContain("packages/book-shelf/package.json");
			expect(paths).toContain("packages/book-shelf/tsconfig.json");
			expect(paths).toContain("packages/book-shelf/src/index.ts");
			expect(paths).toContain("packages/book-shelf/src/errors.ts");
			expect(paths).toContain("packages/book-shelf/src/schema.ts");
			expect(paths).toContain("packages/book-shelf/src/rpc.ts");
		});

		test("worker files at correct paths", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const paths = files.map((f) => f.path);
			expect(paths).toContain("apps/worker/src/features/book-shelf/BookShelf.ts");
			expect(paths).toContain("apps/worker/src/features/book-shelf/handlers.ts");
			expect(paths).toContain("apps/worker/src/features/book-shelf/drizzle/drizzle.config.ts");
			expect(paths).toContain("apps/worker/src/features/book-shelf/drizzle/drizzle.schema.ts");
			expect(paths).toContain(
				"apps/worker/src/features/book-shelf/drizzle/migrations/migrations.js",
			);
			expect(paths).toContain(
				"apps/worker/src/features/book-shelf/drizzle/migrations/meta/_journal.json",
			);
		});
	});
});
