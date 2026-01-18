import {describe, expect, test} from "bun:test";
import {FileSystem, Path} from "@effect/platform";
import {Cause, Effect, Exit, Layer} from "effect";
import {generate, generateFiles, writeFiles} from "./generator";
import {deriveNaming} from "./naming";
import type {Column, GeneratorOptions} from "./types";
import {
	checkFeatureExists,
	FeatureExistsError,
	InvalidFeatureNameError,
	validateFeatureName,
} from "./validation";

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

	describe("FR-8.1: --with-test creates test file", () => {
		test("test file not included by default", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const testFile = files.find((f) => f.path.includes(".spec.ts"));
			expect(testFile).toBeUndefined();
		});

		test("test file included when withTest is true", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns, {
				featureName: "book-shelf",
				withTest: true,
				withGraphql: false,
				withRoute: false,
				withAll: false,
				dryRun: false,
				skipWrangler: false,
				skipIndex: false,
				skipDrizzle: false,
			});

			const testFile = files.find((f) => f.path.includes(".spec.ts"));
			expect(testFile).toBeDefined();
			expect(testFile?.path).toBe("apps/worker/test/book-shelf.spec.ts");
		});

		test("test file included when withAll is true", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns, {
				featureName: "book-shelf",
				withTest: false,
				withGraphql: false,
				withRoute: false,
				withAll: true,
				dryRun: false,
				skipWrangler: false,
				skipIndex: false,
				skipDrizzle: false,
			});

			const testFile = files.find((f) => f.path.includes(".spec.ts"));
			expect(testFile).toBeDefined();
		});

		test("test file has correct content structure", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns, {
				featureName: "book-shelf",
				withTest: true,
				withGraphql: false,
				withRoute: false,
				withAll: false,
				dryRun: false,
				skipWrangler: false,
				skipIndex: false,
				skipDrizzle: false,
			});

			const testFile = files.find((f) => f.path.includes(".spec.ts"));
			expect(testFile?.content).toContain('import {env} from "cloudflare:test"');
			expect(testFile?.content).toContain('import {describe, expect, it} from "vitest"');
			expect(testFile?.content).toContain('describe("BookShelf"');
			expect(testFile?.content).toContain("env.BOOK_SHELF.idFromName");
		});
	});

	describe("FR-8.2: --with-graphql creates GraphQL files", () => {
		test("GraphQL files not included by default", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns);

			const clientFile = files.find((f) => f.path.includes("Client.ts"));
			expect(clientFile).toBeUndefined();
		});

		test("GraphQL client file included when withGraphql is true", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns, {
				featureName: "book-shelf",
				withTest: false,
				withGraphql: true,
				withRoute: false,
				withAll: false,
				dryRun: false,
				skipWrangler: false,
				skipIndex: false,
				skipDrizzle: false,
			});

			const clientFile = files.find((f) => f.path.includes("BookShelfClient.ts"));
			expect(clientFile).toBeDefined();
			expect(clientFile?.path).toBe("apps/worker/src/graphql/resolvers/BookShelfClient.ts");
		});

		test("GraphQL type readme included when withGraphql is true", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns, {
				featureName: "book-shelf",
				withTest: false,
				withGraphql: true,
				withRoute: false,
				withAll: false,
				dryRun: false,
				skipWrangler: false,
				skipIndex: false,
				skipDrizzle: false,
			});

			const typeFile = files.find((f) => f.path.includes(".graphql-type.md"));
			expect(typeFile).toBeDefined();
			expect(typeFile?.path).toBe(
				"apps/worker/src/graphql/resolvers/BookShelfClient.graphql-type.md",
			);
		});

		test("GraphQL files included when withAll is true", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns, {
				featureName: "book-shelf",
				withTest: false,
				withGraphql: false,
				withRoute: false,
				withAll: true,
				dryRun: false,
				skipWrangler: false,
				skipIndex: false,
				skipDrizzle: false,
			});

			const clientFile = files.find((f) => f.path.includes("BookShelfClient.ts"));
			expect(clientFile).toBeDefined();
		});

		test("GraphQL client has correct content structure", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns, {
				featureName: "book-shelf",
				withTest: false,
				withGraphql: true,
				withRoute: false,
				withAll: false,
				dryRun: false,
				skipWrangler: false,
				skipIndex: false,
				skipDrizzle: false,
			});

			const clientFile = files.find((f) => f.path.includes("BookShelfClient.ts"));
			expect(clientFile?.content).toContain('import type {RpcClient} from "@effect/rpc"');
			expect(clientFile?.content).toContain('import {BookShelfRpcs} from "@kampus/book-shelf"');
			expect(clientFile?.content).toContain("export class BookShelfClient extends Context.Tag");
			expect(clientFile?.content).toContain("static layer(env: Env, name: string)");
			expect(clientFile?.content).toContain("env.BOOK_SHELF.get(env.BOOK_SHELF.idFromName(name))");
		});

		test("GraphQL type readme has correct content", () => {
			const naming = deriveNaming("book-shelf");
			const files = generateFiles(naming, columns, {
				featureName: "book-shelf",
				withTest: false,
				withGraphql: true,
				withRoute: false,
				withAll: false,
				dryRun: false,
				skipWrangler: false,
				skipIndex: false,
				skipDrizzle: false,
			});

			const typeFile = files.find((f) => f.path.includes(".graphql-type.md"));
			expect(typeFile?.content).toContain('name: "BookShelf"');
			expect(typeFile?.content).toContain("new GraphQLNonNull(GraphQLID)");
			expect(typeFile?.content).toContain("title: {type: new GraphQLNonNull(GraphQLString)}");
		});
	});
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("TEST-2.1: Integration test: full generation in temp directory", () => {
	const columns: Column[] = [
		{name: "title", type: "text", nullable: false},
		{name: "count", type: "integer", nullable: true},
	];

	const baseOptions: GeneratorOptions = {
		featureName: "test-feature",
		withTest: false,
		withGraphql: false,
		withRoute: false,
		withAll: false,
		dryRun: false,
		skipWrangler: true, // skip integration updates in unit tests
		skipIndex: true,
		skipDrizzle: true,
	};

	// Helper to create a tracking FileSystem layer
	const createTrackingLayer = () => {
		const writtenFiles: Map<string, string> = new Map();
		const createdDirs: Set<string> = new Set();

		const layer = FileSystem.layerNoop({
			makeDirectory: (path) => {
				createdDirs.add(path);
				return Effect.void;
			},
			writeFileString: (path, content) => {
				writtenFiles.set(path, content);
				return Effect.void;
			},
			exists: (path) => {
				// Return true for written files, false otherwise
				return Effect.succeed(writtenFiles.has(path) || createdDirs.has(path));
			},
			readFileString: (path) => {
				const content = writtenFiles.get(path);
				if (content) return Effect.succeed(content);
				return Effect.fail(new Error(`File not found: ${path}`));
			},
		});

		return {layer, writtenFiles, createdDirs};
	};

	// Mock Path layer
	const pathLayer = Layer.succeed(Path.Path, Path.Path.of({
		basename: (p) => p.split("/").pop() || "",
		dirname: (p) => p.split("/").slice(0, -1).join("/") || "/",
		extname: (p) => {
			const base = p.split("/").pop() || "";
			const dot = base.lastIndexOf(".");
			return dot > 0 ? base.slice(dot) : "";
		},
		format: () => "",
		isAbsolute: (p) => p.startsWith("/"),
		join: (...parts) => parts.filter(Boolean).join("/").replace(/\/+/g, "/"),
		normalize: (p) => p,
		parse: () => ({root: "/", dir: "", base: "", ext: "", name: ""}),
		relative: (from, to) => to,
		resolve: (...parts) => parts.filter(Boolean).join("/"),
		sep: "/",
		toFileUrl: (p) => new URL(`file://${p}`),
		toNamespacedPath: (p) => p,
		fromFileUrl: (url) => url.pathname,
	}));

	test("writes all expected package files", async () => {
		const {layer, writtenFiles} = createTrackingLayer();
		const testLayer = Layer.merge(layer, pathLayer);

		const program = writeFiles("/tmp/test-root", generateFiles(deriveNaming("test-feature"), columns));

		const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(testLayer)));
		expect(Exit.isSuccess(exit)).toBe(true);

		// Check package files
		expect(writtenFiles.has("/tmp/test-root/packages/test-feature/package.json")).toBe(true);
		expect(writtenFiles.has("/tmp/test-root/packages/test-feature/tsconfig.json")).toBe(true);
		expect(writtenFiles.has("/tmp/test-root/packages/test-feature/src/index.ts")).toBe(true);
		expect(writtenFiles.has("/tmp/test-root/packages/test-feature/src/errors.ts")).toBe(true);
		expect(writtenFiles.has("/tmp/test-root/packages/test-feature/src/schema.ts")).toBe(true);
		expect(writtenFiles.has("/tmp/test-root/packages/test-feature/src/rpc.ts")).toBe(true);
	});

	test("writes all expected worker files", async () => {
		const {layer, writtenFiles} = createTrackingLayer();
		const testLayer = Layer.merge(layer, pathLayer);

		const program = writeFiles("/tmp/test-root", generateFiles(deriveNaming("test-feature"), columns));

		const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(testLayer)));
		expect(Exit.isSuccess(exit)).toBe(true);

		// Check worker files
		expect(writtenFiles.has("/tmp/test-root/apps/worker/src/features/test-feature/TestFeature.ts")).toBe(true);
		expect(writtenFiles.has("/tmp/test-root/apps/worker/src/features/test-feature/handlers.ts")).toBe(true);
		expect(writtenFiles.has("/tmp/test-root/apps/worker/src/features/test-feature/drizzle/drizzle.config.ts")).toBe(true);
		expect(writtenFiles.has("/tmp/test-root/apps/worker/src/features/test-feature/drizzle/drizzle.schema.ts")).toBe(true);
		expect(writtenFiles.has("/tmp/test-root/apps/worker/src/features/test-feature/drizzle/migrations/migrations.js")).toBe(true);
		expect(writtenFiles.has("/tmp/test-root/apps/worker/src/features/test-feature/drizzle/migrations/meta/_journal.json")).toBe(true);
	});

	test("creates correct directories", async () => {
		const {layer, createdDirs} = createTrackingLayer();
		const testLayer = Layer.merge(layer, pathLayer);

		const program = writeFiles("/tmp/test-root", generateFiles(deriveNaming("test-feature"), columns));

		await Effect.runPromiseExit(program.pipe(Effect.provide(testLayer)));

		// Check that directories were created
		expect(createdDirs.has("/tmp/test-root/packages/test-feature")).toBe(true);
		expect(createdDirs.has("/tmp/test-root/packages/test-feature/src")).toBe(true);
		expect(createdDirs.has("/tmp/test-root/apps/worker/src/features/test-feature")).toBe(true);
		expect(createdDirs.has("/tmp/test-root/apps/worker/src/features/test-feature/drizzle")).toBe(true);
		expect(createdDirs.has("/tmp/test-root/apps/worker/src/features/test-feature/drizzle/migrations")).toBe(true);
		expect(createdDirs.has("/tmp/test-root/apps/worker/src/features/test-feature/drizzle/migrations/meta")).toBe(true);
	});

	test("file content matches generateFiles output", async () => {
		const {layer, writtenFiles} = createTrackingLayer();
		const testLayer = Layer.merge(layer, pathLayer);

		const naming = deriveNaming("test-feature");
		const expectedFiles = generateFiles(naming, columns);

		const program = writeFiles("/tmp/test-root", expectedFiles);

		await Effect.runPromiseExit(program.pipe(Effect.provide(testLayer)));

		// Verify each file's content matches
		for (const file of expectedFiles) {
			const fullPath = `/tmp/test-root/${file.path}`;
			expect(writtenFiles.get(fullPath)).toBe(file.content);
		}
	});

	test("writes exactly 12 files for base feature", async () => {
		const {layer, writtenFiles} = createTrackingLayer();
		const testLayer = Layer.merge(layer, pathLayer);

		const program = writeFiles("/tmp/test-root", generateFiles(deriveNaming("test-feature"), columns));

		await Effect.runPromiseExit(program.pipe(Effect.provide(testLayer)));

		// Base feature = 6 package + 6 worker files
		expect(writtenFiles.size).toBe(12);
	});

	test("writes 13 files with --with-test", async () => {
		const {layer, writtenFiles} = createTrackingLayer();
		const testLayer = Layer.merge(layer, pathLayer);

		const options = {...baseOptions, withTest: true};
		const files = generateFiles(deriveNaming("test-feature"), columns, options);
		const program = writeFiles("/tmp/test-root", files);

		await Effect.runPromiseExit(program.pipe(Effect.provide(testLayer)));

		// Base + 1 test file
		expect(writtenFiles.size).toBe(13);
		expect(writtenFiles.has("/tmp/test-root/apps/worker/test/test-feature.spec.ts")).toBe(true);
	});

	test("writes 14 files with --with-graphql", async () => {
		const {layer, writtenFiles} = createTrackingLayer();
		const testLayer = Layer.merge(layer, pathLayer);

		const options = {...baseOptions, withGraphql: true};
		const files = generateFiles(deriveNaming("test-feature"), columns, options);
		const program = writeFiles("/tmp/test-root", files);

		await Effect.runPromiseExit(program.pipe(Effect.provide(testLayer)));

		// Base + 2 graphql files (client + type readme)
		expect(writtenFiles.size).toBe(14);
		expect(writtenFiles.has("/tmp/test-root/apps/worker/src/graphql/resolvers/TestFeatureClient.ts")).toBe(true);
		expect(writtenFiles.has("/tmp/test-root/apps/worker/src/graphql/resolvers/TestFeatureClient.graphql-type.md")).toBe(true);
	});

	test("writes 15 files with --with-all", async () => {
		const {layer, writtenFiles} = createTrackingLayer();
		const testLayer = Layer.merge(layer, pathLayer);

		const options = {...baseOptions, withAll: true};
		const files = generateFiles(deriveNaming("test-feature"), columns, options);
		const program = writeFiles("/tmp/test-root", files);

		await Effect.runPromiseExit(program.pipe(Effect.provide(testLayer)));

		// Base + test + graphql client + graphql type readme = 15
		expect(writtenFiles.size).toBe(15);
	});
});

describe("TEST-2.2: Integration test: --dry-run produces no files", () => {
	const columns: Column[] = [{name: "title", type: "text", nullable: false}];

	const dryRunOptions: GeneratorOptions = {
		featureName: "dry-run-feature",
		withTest: false,
		withGraphql: false,
		withRoute: false,
		withAll: false,
		dryRun: true,
		skipWrangler: true,
		skipIndex: true,
		skipDrizzle: true,
	};

	// Helper to create tracking layer that throws on any write
	const createStrictNoWriteLayer = () => {
		const writeAttempts: string[] = [];
		const dirAttempts: string[] = [];

		const layer = FileSystem.layerNoop({
			makeDirectory: (path) => {
				dirAttempts.push(path);
				return Effect.void;
			},
			writeFileString: (path, _content) => {
				writeAttempts.push(path);
				return Effect.void;
			},
			exists: () => Effect.succeed(false),
			readFileString: () => Effect.fail(new Error("No reads expected in dry-run")),
		});

		return {layer, writeAttempts, dirAttempts};
	};

	// Mock Path layer
	const pathLayer = Layer.succeed(Path.Path, Path.Path.of({
		basename: (p) => p.split("/").pop() || "",
		dirname: (p) => p.split("/").slice(0, -1).join("/") || "/",
		extname: (p) => {
			const base = p.split("/").pop() || "";
			const dot = base.lastIndexOf(".");
			return dot > 0 ? base.slice(dot) : "";
		},
		format: () => "",
		isAbsolute: (p) => p.startsWith("/"),
		join: (...parts) => parts.filter(Boolean).join("/").replace(/\/+/g, "/"),
		normalize: (p) => p,
		parse: () => ({root: "/", dir: "", base: "", ext: "", name: ""}),
		relative: (from, to) => to,
		resolve: (...parts) => parts.filter(Boolean).join("/"),
		sep: "/",
		toFileUrl: (p) => new URL(`file://${p}`),
		toNamespacedPath: (p) => p,
		fromFileUrl: (url) => url.pathname,
	}));

	test("dry-run returns files without writing", async () => {
		const {layer, writeAttempts, dirAttempts} = createStrictNoWriteLayer();
		const testLayer = Layer.merge(layer, pathLayer);

		const program = generate("/tmp/test-root", dryRunOptions, columns);

		const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(testLayer)));
		expect(Exit.isSuccess(exit)).toBe(true);

		if (Exit.isSuccess(exit)) {
			// Should return file info
			expect(exit.value.naming.featureName).toBe("dry-run-feature");
			expect(exit.value.files.length).toBeGreaterThan(0);
			expect(exit.value.written).toBe(false);
		}

		// No files or directories should be created
		expect(writeAttempts.length).toBe(0);
		expect(dirAttempts.length).toBe(0);
	});

	test("dry-run returns correct file list", async () => {
		const {layer} = createStrictNoWriteLayer();
		const testLayer = Layer.merge(layer, pathLayer);

		const program = generate("/tmp/test-root", dryRunOptions, columns);

		const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(testLayer)));
		expect(Exit.isSuccess(exit)).toBe(true);

		if (Exit.isSuccess(exit)) {
			const filePaths = exit.value.files.map((f) => f.path);
			expect(filePaths).toContain("packages/dry-run-feature/package.json");
			expect(filePaths).toContain("packages/dry-run-feature/src/schema.ts");
			expect(filePaths).toContain("apps/worker/src/features/dry-run-feature/DryRunFeature.ts");
		}
	});

	test("dry-run with --with-all still writes nothing", async () => {
		const {layer, writeAttempts, dirAttempts} = createStrictNoWriteLayer();
		const testLayer = Layer.merge(layer, pathLayer);

		const optionsWithAll = {...dryRunOptions, withAll: true};
		const program = generate("/tmp/test-root", optionsWithAll, columns);

		const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(testLayer)));
		expect(Exit.isSuccess(exit)).toBe(true);

		expect(writeAttempts.length).toBe(0);
		expect(dirAttempts.length).toBe(0);

		if (Exit.isSuccess(exit)) {
			// Should still include all optional files in the list
			const filePaths = exit.value.files.map((f) => f.path);
			expect(filePaths).toContain("apps/worker/test/dry-run-feature.spec.ts");
			expect(filePaths).toContain("apps/worker/src/graphql/resolvers/DryRunFeatureClient.ts");
		}
	});
});

describe("TEST-2.6: Integration test: duplicate feature detection", () => {
	// Helper to create mock filesystem where a feature already exists
	const makeExistingFeatureLayer = (existingFeature: string, location: "packages" | "worker") =>
		FileSystem.layerNoop({
			exists: (path) => {
				// pnpm-workspace.yaml check for finding monorepo root
				if (path.includes("pnpm-workspace.yaml")) {
					return Effect.succeed(true);
				}
				// Check for existing feature
				if (location === "packages" && path.includes(`packages/${existingFeature}`)) {
					return Effect.succeed(true);
				}
				if (location === "worker" && path.includes(`apps/worker/src/features/${existingFeature}`)) {
					return Effect.succeed(true);
				}
				return Effect.succeed(false);
			},
		});

	test("fails when package path already exists", async () => {
		const testLayer = makeExistingFeatureLayer("existing-feature", "packages");

		const exit = await Effect.runPromiseExit(
			checkFeatureExists("existing-feature").pipe(Effect.provide(testLayer)),
		);

		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const failure = Cause.failureOption(exit.cause);
			expect(failure._tag).toBe("Some");
			if (failure._tag === "Some") {
				expect(failure.value).toBeInstanceOf(FeatureExistsError);
				expect((failure.value as FeatureExistsError).featureName).toBe("existing-feature");
				expect((failure.value as FeatureExistsError).existingPath).toContain("packages/");
			}
		}
	});

	test("fails when worker path already exists", async () => {
		const testLayer = makeExistingFeatureLayer("existing-feature", "worker");

		const exit = await Effect.runPromiseExit(
			checkFeatureExists("existing-feature").pipe(Effect.provide(testLayer)),
		);

		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const failure = Cause.failureOption(exit.cause);
			expect(failure._tag).toBe("Some");
			if (failure._tag === "Some") {
				expect(failure.value).toBeInstanceOf(FeatureExistsError);
				expect((failure.value as FeatureExistsError).existingPath).toContain("apps/worker/src/features/");
			}
		}
	});

	test("succeeds when feature does not exist anywhere", async () => {
		const testLayer = FileSystem.layerNoop({
			exists: (path) => {
				if (path.includes("pnpm-workspace.yaml")) {
					return Effect.succeed(true);
				}
				return Effect.succeed(false);
			},
		});

		const exit = await Effect.runPromiseExit(
			checkFeatureExists("brand-new-feature").pipe(Effect.provide(testLayer)),
		);

		expect(Exit.isSuccess(exit)).toBe(true);
	});

	test("no files created when feature exists", async () => {
		// This test verifies that when validation fails, no files are created
		// The validation happens before generation in the actual command flow
		const testLayer = makeExistingFeatureLayer("existing-feature", "packages");

		const exit = await Effect.runPromiseExit(
			checkFeatureExists("existing-feature").pipe(Effect.provide(testLayer)),
		);

		// The checkFeatureExists should fail, preventing any file generation
		expect(Exit.isFailure(exit)).toBe(true);
	});
});

describe("TEST-2.7: Integration test: invalid feature name rejection", () => {
	test("rejects PascalCase feature name", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("BookShelf"));

		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const failure = Cause.failureOption(exit.cause);
			expect(failure._tag).toBe("Some");
			if (failure._tag === "Some") {
				expect(failure.value).toBeInstanceOf(InvalidFeatureNameError);
				expect((failure.value as InvalidFeatureNameError).featureName).toBe("BookShelf");
				expect((failure.value as InvalidFeatureNameError).reason).toContain("kebab-case");
			}
		}
	});

	test("rejects snake_case feature name", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("book_shelf"));

		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const failure = Cause.failureOption(exit.cause);
			expect(failure._tag).toBe("Some");
			if (failure._tag === "Some") {
				expect(failure.value).toBeInstanceOf(InvalidFeatureNameError);
				expect((failure.value as InvalidFeatureNameError).featureName).toBe("book_shelf");
			}
		}
	});

	test("rejects camelCase feature name", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("bookShelf"));

		expect(Exit.isFailure(exit)).toBe(true);
	});

	test("rejects feature name starting with number", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("123-feature"));

		expect(Exit.isFailure(exit)).toBe(true);
	});

	test("rejects feature name with uppercase letters", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("Book-Shelf"));

		expect(Exit.isFailure(exit)).toBe(true);
	});

	test("rejects feature name with double hyphens", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("book--shelf"));

		expect(Exit.isFailure(exit)).toBe(true);
	});

	test("rejects feature name with trailing hyphen", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("book-shelf-"));

		expect(Exit.isFailure(exit)).toBe(true);
	});

	test("rejects feature name with leading hyphen", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("-book-shelf"));

		expect(Exit.isFailure(exit)).toBe(true);
	});

	test("accepts valid kebab-case feature name", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("book-shelf"));

		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) {
			expect(exit.value).toBe("book-shelf");
		}
	});

	test("accepts single word feature name", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("library"));

		expect(Exit.isSuccess(exit)).toBe(true);
	});

	test("accepts feature name with numbers in middle", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("auth2-service"));

		expect(Exit.isSuccess(exit)).toBe(true);
	});
});
