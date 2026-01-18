import {describe, expect, test} from "bun:test";
import {
	generateGraphQLTypeCode,
	updateGraphqlResolversIndex,
	updateWorkerIndex,
	updateWorkerIndexWithRoute,
	updateWorkerPackageJson,
	updateWranglerJsonc,
} from "./integrations";
import type {Column, Naming} from "./types";

const bookShelfNaming: Naming = {
	featureName: "book-shelf",
	className: "BookShelf",
	tableName: "book_shelf",
	bindingName: "BOOK_SHELF",
	idPrefix: "bs",
	packageName: "@kampus/book-shelf",
};

describe("updateWorkerIndex", () => {
	test("inserts export after last feature export", () => {
		const content = `import {Hono} from "hono";

export {Library} from "./features/library/Library";
export {Pasaport} from "./features/pasaport/pasaport";
export {WebPageParser} from "./features/web-page-parser/WebPageParser";

const app = new Hono();`;

		const result = updateWorkerIndex(bookShelfNaming, content);

		expect(result).toContain('export {BookShelf} from "./features/book-shelf/BookShelf";');
		// Should be after WebPageParser
		const lines = result.split("\n");
		const webParserIndex = lines.findIndex((l) => l.includes("WebPageParser"));
		const bookShelfIndex = lines.findIndex((l) => l.includes("BookShelf"));
		expect(bookShelfIndex).toBe(webParserIndex + 1);
	});

	test("handles file with no existing feature exports", () => {
		const content = `import {Hono} from "hono";

const app = new Hono();`;

		const result = updateWorkerIndex(bookShelfNaming, content);

		expect(result).toContain('export {BookShelf} from "./features/book-shelf/BookShelf";');
	});

	test("does not duplicate existing export", () => {
		const content = `import {Hono} from "hono";

export {Library} from "./features/library/Library";
export {BookShelf} from "./features/book-shelf/BookShelf";

const app = new Hono();`;

		const result = updateWorkerIndex(bookShelfNaming, content);

		const matches = result.match(/export \{BookShelf\}/g);
		expect(matches?.length).toBe(1);
	});
});

describe("updateWranglerJsonc", () => {
	test("adds binding to durable_objects.bindings", () => {
		const content = `{
	"durable_objects": {
		"bindings": [
			{"name": "LIBRARY", "class_name": "Library"}
		]
	},
	"migrations": [
		{"tag": "v1", "new_sqlite_classes": ["Library"]}
	]
}`;

		const result = updateWranglerJsonc(bookShelfNaming, content);

		expect(result).toContain('"name": "BOOK_SHELF"');
		expect(result).toContain('"class_name": "BookShelf"');
	});

	test("adds migration with incremented tag", () => {
		const content = `{
	"durable_objects": {
		"bindings": [
			{"name": "LIBRARY", "class_name": "Library"}
		]
	},
	"migrations": [
		{"tag": "v1", "new_sqlite_classes": ["Library"]}
	]
}`;

		const result = updateWranglerJsonc(bookShelfNaming, content);

		expect(result).toContain('"tag": "v2"');
		expect(result).toContain('"BookShelf"');
	});

	test("preserves comments", () => {
		const content = `/**
 * Header comment
 */
{
	// inline comment
	"durable_objects": {
		"bindings": [
			{"name": "LIBRARY", "class_name": "Library"}
		]
	},
	"migrations": [
		{"tag": "v1", "new_sqlite_classes": ["Library"]}
	]
	// trailing comment
}`;

		const result = updateWranglerJsonc(bookShelfNaming, content);

		expect(result).toContain("Header comment");
		expect(result).toContain("// inline comment");
		expect(result).toContain("// trailing comment");
	});

	test("increments from highest existing tag", () => {
		const content = `{
	"durable_objects": {
		"bindings": []
	},
	"migrations": [
		{"tag": "v1", "new_sqlite_classes": ["A"]},
		{"tag": "v3", "new_sqlite_classes": ["B"]},
		{"tag": "v2", "new_sqlite_classes": ["C"]}
	]
}`;

		const result = updateWranglerJsonc(bookShelfNaming, content);

		expect(result).toContain('"tag": "v4"');
	});

	test("starts at v1 when no migrations exist", () => {
		const content = `{
	"durable_objects": {
		"bindings": []
	},
	"migrations": []
}`;

		const result = updateWranglerJsonc(bookShelfNaming, content);

		expect(result).toContain('"tag": "v1"');
	});
});

describe("updateWorkerPackageJson", () => {
	test("adds dependency to package.json", () => {
		const content = `{
	"name": "worker",
	"dependencies": {
		"@kampus/library": "workspace:*"
	}
}
`;

		const result = updateWorkerPackageJson(bookShelfNaming, content);
		const pkg = JSON.parse(result);

		expect(pkg.dependencies["@kampus/book-shelf"]).toBe("workspace:*");
	});

	test("sorts dependencies alphabetically", () => {
		const content = `{
	"name": "worker",
	"dependencies": {
		"zod": "^3.0.0",
		"@kampus/library": "workspace:*"
	}
}
`;

		const result = updateWorkerPackageJson(bookShelfNaming, content);
		const depKeys = Object.keys(JSON.parse(result).dependencies);

		expect(depKeys[0]).toBe("@kampus/book-shelf");
		expect(depKeys[1]).toBe("@kampus/library");
		expect(depKeys[2]).toBe("zod");
	});

	test("does not duplicate existing dependency", () => {
		const content = `{
	"name": "worker",
	"dependencies": {
		"@kampus/book-shelf": "workspace:*",
		"@kampus/library": "workspace:*"
	}
}
`;

		const result = updateWorkerPackageJson(bookShelfNaming, content);

		// Should return unchanged (or at least not duplicate)
		const pkg = JSON.parse(result);
		expect(Object.keys(pkg.dependencies).filter((k) => k === "@kampus/book-shelf").length).toBe(1);
	});
});

describe("updateGraphqlResolversIndex", () => {
	test("inserts export after last export line", () => {
		const content = `export {LibraryClient} from "./LibraryClient";
export {loadStory, StoryResolver} from "./StoryResolver";
export {loadTag, TagResolver} from "./TagResolver";
export {WebPageParserClient} from "./WebPageParserClient";
`;

		const result = updateGraphqlResolversIndex(bookShelfNaming, content);

		expect(result).toContain('export {BookShelfClient} from "./BookShelfClient";');
		// Should be after WebPageParserClient
		const lines = result.split("\n");
		const webParserIndex = lines.findIndex((l) => l.includes("WebPageParserClient"));
		const bookShelfIndex = lines.findIndex((l) => l.includes("BookShelfClient"));
		expect(bookShelfIndex).toBe(webParserIndex + 1);
	});

	test("handles empty file", () => {
		const content = "";

		const result = updateGraphqlResolversIndex(bookShelfNaming, content);

		expect(result).toContain('export {BookShelfClient} from "./BookShelfClient";');
	});

	test("does not duplicate existing export", () => {
		const content = `export {LibraryClient} from "./LibraryClient";
export {BookShelfClient} from "./BookShelfClient";
`;

		const result = updateGraphqlResolversIndex(bookShelfNaming, content);

		const matches = result.match(/export \{BookShelfClient\}/g);
		expect(matches?.length).toBe(1);
	});
});

describe("generateGraphQLTypeCode", () => {
	test("generates type with id field", () => {
		const result = generateGraphQLTypeCode(bookShelfNaming, []);
		expect(result).toContain('name: "BookShelf"');
		expect(result).toContain("id: {type: new GraphQLNonNull(GraphQLID)}");
	});

	test("generates timestamp fields", () => {
		const result = generateGraphQLTypeCode(bookShelfNaming, []);
		expect(result).toContain("createdAt: {type: new GraphQLNonNull(GraphQLString)}");
		expect(result).toContain("updatedAt: {type: GraphQLString}");
	});

	test("maps text columns to GraphQLString", () => {
		const columns: Column[] = [{name: "title", type: "text", nullable: false}];
		const result = generateGraphQLTypeCode(bookShelfNaming, columns);
		expect(result).toContain("title: {type: new GraphQLNonNull(GraphQLString)}");
	});

	test("maps integer columns to GraphQLInt", () => {
		const columns: Column[] = [{name: "count", type: "integer", nullable: false}];
		const result = generateGraphQLTypeCode(bookShelfNaming, columns);
		expect(result).toContain("count: {type: new GraphQLNonNull(GraphQLInt)}");
	});

	test("maps boolean columns to GraphQLBoolean", () => {
		const columns: Column[] = [{name: "active", type: "boolean", nullable: false}];
		const result = generateGraphQLTypeCode(bookShelfNaming, columns);
		expect(result).toContain("active: {type: new GraphQLNonNull(GraphQLBoolean)}");
	});

	test("handles nullable columns without GraphQLNonNull", () => {
		const columns: Column[] = [{name: "description", type: "text", nullable: true}];
		const result = generateGraphQLTypeCode(bookShelfNaming, columns);
		expect(result).toContain("description: {type: GraphQLString}");
		expect(result).not.toContain("description: {type: new GraphQLNonNull");
	});

	test("includes TODO comment for manual schema update", () => {
		const result = generateGraphQLTypeCode(bookShelfNaming, []);
		expect(result).toContain("// TODO: Add this to apps/worker/src/graphql/schema.ts");
		expect(result).toContain("// Add to schema types array:");
	});
});

describe("updateWorkerIndexWithRoute", () => {
	test("inserts route after last RPC route", () => {
		const content = `import {Hono} from "hono";

export {Library} from "./features/library/Library";

const app = new Hono<{Bindings: Env}>();

// RPC endpoint - auth + route to Library DO
app.all("/rpc/library/*", async (c) => {
	try {
		const pasaport = c.env.PASAPORT.getByName("kampus");
		const sessionData = await pasaport.validateSession(c.req.raw.headers);

		if (!sessionData?.user) {
			return c.json({error: "Unauthorized"}, 401);
		}

		const libraryId = c.env.LIBRARY.idFromName(sessionData.user.id);
		const library = c.env.LIBRARY.get(libraryId);

		return library.fetch(c.req.raw);
	} catch (error) {
		console.error("RPC error:", error);
		return c.json({error: "Internal server error"}, 500);
	}
});

app.get("/graphql/schema", (c) => {
	return c.text(printSchemaSDL());
});`;

		const result = updateWorkerIndexWithRoute(bookShelfNaming, content);

		expect(result).toContain('app.all("/rpc/book-shelf/*"');
		expect(result).toContain("c.env.BOOK_SHELF.idFromName(sessionData.user.id)");
		expect(result).toContain("// Route to user's BookShelf DO");
		// Should be after library route and before graphql
		expect(result.indexOf("/rpc/book-shelf/")).toBeGreaterThan(result.indexOf("/rpc/library/"));
		expect(result.indexOf("/rpc/book-shelf/")).toBeLessThan(result.indexOf("/graphql/schema"));
	});

	test("does not duplicate existing route", () => {
		const content = `const app = new Hono<{Bindings: Env}>();

app.all("/rpc/book-shelf/*", async (c) => {
	// existing route
});`;

		const result = updateWorkerIndexWithRoute(bookShelfNaming, content);

		const matches = result.match(/app\.all\("\/rpc\/book-shelf\/\*"/g);
		expect(matches?.length).toBe(1);
	});

	test("uses correct variable names from naming", () => {
		const content = `const app = new Hono<{Bindings: Env}>();

app.all("/rpc/library/*", async (c) => {
	return c.json({});
});`;

		const result = updateWorkerIndexWithRoute(bookShelfNaming, content);

		// Variable name should be feature name without dashes
		expect(result).toContain("const bookshelfId = c.env.BOOK_SHELF.idFromName");
		expect(result).toContain("const bookshelf = c.env.BOOK_SHELF.get(bookshelfId)");
		expect(result).toContain("return bookshelf.fetch(c.req.raw)");
	});

	test("includes auth check", () => {
		const content = `const app = new Hono<{Bindings: Env}>();`;

		const result = updateWorkerIndexWithRoute(bookShelfNaming, content);

		expect(result).toContain("pasaport.validateSession(c.req.raw.headers)");
		expect(result).toContain('return c.json({error: "Unauthorized"}, 401)');
	});

	test("handles file with no existing RPC routes", () => {
		const content = `import {Hono} from "hono";

const app = new Hono<{Bindings: Env}>();

app.get("/health", (c) => c.text("ok"));`;

		const result = updateWorkerIndexWithRoute(bookShelfNaming, content);

		expect(result).toContain('app.all("/rpc/book-shelf/*"');
		// Should be after app definition
		expect(result.indexOf("/rpc/book-shelf/")).toBeGreaterThan(result.indexOf("const app = new Hono"));
	});
});
