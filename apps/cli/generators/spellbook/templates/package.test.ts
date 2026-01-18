import {describe, expect, test} from "bun:test";
import type {Column, Naming} from "../types";
import {
	columnTypeToSchema,
	errorsTs,
	indexTs,
	packageJson,
	rpcTs,
	schemaTs,
	tsconfigJson,
} from "./package";

const mockNaming: Naming = {
	featureName: "book-shelf",
	className: "BookShelf",
	tableName: "book_shelf",
	bindingName: "BOOK_SHELF",
	idPrefix: "bs",
	packageName: "@kampus/book-shelf",
};

describe("columnTypeToSchema", () => {
	test("maps text to Schema.String", () => {
		expect(columnTypeToSchema("text", false)).toBe("Schema.String");
	});

	test("maps integer to Schema.Int", () => {
		expect(columnTypeToSchema("integer", false)).toBe("Schema.Int");
	});

	test("maps boolean to Schema.Boolean", () => {
		expect(columnTypeToSchema("boolean", false)).toBe("Schema.Boolean");
	});

	test("maps timestamp to Schema.String", () => {
		expect(columnTypeToSchema("timestamp", false)).toBe("Schema.String");
	});

	test("wraps nullable types with Schema.NullOr", () => {
		expect(columnTypeToSchema("text", true)).toBe("Schema.NullOr(Schema.String)");
		expect(columnTypeToSchema("integer", true)).toBe("Schema.NullOr(Schema.Int)");
		expect(columnTypeToSchema("boolean", true)).toBe("Schema.NullOr(Schema.Boolean)");
	});
});

describe("packageJson template", () => {
	test("includes correct package name", () => {
		const result = packageJson(mockNaming);
		expect(result).toContain('"name": "@kampus/book-shelf"');
	});

	test("includes effect dependencies", () => {
		const result = packageJson(mockNaming);
		expect(result).toContain('"@effect/rpc": "catalog:"');
		expect(result).toContain('"effect": "catalog:"');
	});

	test("sets private to true", () => {
		const result = packageJson(mockNaming);
		expect(result).toContain('"private": true');
	});

	test("uses module type", () => {
		const result = packageJson(mockNaming);
		expect(result).toContain('"type": "module"');
	});
});

describe("tsconfigJson template", () => {
	test("targets ES2024", () => {
		const result = tsconfigJson();
		expect(result).toContain('"target": "es2024"');
	});

	test("uses bundler module resolution", () => {
		const result = tsconfigJson();
		expect(result).toContain('"moduleResolution": "Bundler"');
	});

	test("enables strict mode", () => {
		const result = tsconfigJson();
		expect(result).toContain('"strict": true');
	});
});

describe("indexTs template", () => {
	test("exports from errors.js", () => {
		const result = indexTs(mockNaming);
		expect(result).toContain('export * from "./errors.js"');
	});

	test("exports Rpcs from rpc.js", () => {
		const result = indexTs(mockNaming);
		expect(result).toContain('export {BookShelfRpcs} from "./rpc.js"');
	});

	test("exports from schema.js", () => {
		const result = indexTs(mockNaming);
		expect(result).toContain('export * from "./schema.js"');
	});
});

describe("errorsTs template", () => {
	test("contains example error comment", () => {
		const result = errorsTs();
		expect(result).toContain("Schema.TaggedError");
	});

	test("has placeholder export", () => {
		const result = errorsTs();
		expect(result).toContain("export {}");
	});
});

describe("schemaTs template", () => {
	test("includes id field", () => {
		const columns: Column[] = [];
		const result = schemaTs(mockNaming, columns);
		expect(result).toContain("id: Schema.String");
	});

	test("includes createdAt and updatedAt fields", () => {
		const columns: Column[] = [];
		const result = schemaTs(mockNaming, columns);
		expect(result).toContain("createdAt: Schema.String");
		expect(result).toContain("updatedAt: Schema.NullOr(Schema.String)");
	});

	test("generates correct struct name", () => {
		const columns: Column[] = [];
		const result = schemaTs(mockNaming, columns);
		expect(result).toContain("export const BookShelf = Schema.Struct");
	});

	test("exports type alias", () => {
		const columns: Column[] = [];
		const result = schemaTs(mockNaming, columns);
		expect(result).toContain("export type BookShelf = typeof BookShelf.Type");
	});

	test("includes user-defined columns with correct types", () => {
		const columns: Column[] = [
			{name: "title", type: "text", nullable: false},
			{name: "pageCount", type: "integer", nullable: false},
			{name: "isAvailable", type: "boolean", nullable: false},
			{name: "publishedAt", type: "timestamp", nullable: true},
		];
		const result = schemaTs(mockNaming, columns);
		expect(result).toContain("title: Schema.String");
		expect(result).toContain("pageCount: Schema.Int");
		expect(result).toContain("isAvailable: Schema.Boolean");
		expect(result).toContain("publishedAt: Schema.NullOr(Schema.String)");
	});
});

describe("rpcTs template", () => {
	test("imports from @effect/rpc and effect", () => {
		const result = rpcTs(mockNaming);
		expect(result).toContain('import {Rpc, RpcGroup} from "@effect/rpc"');
		expect(result).toContain('import {Schema} from "effect"');
	});

	test("imports entity from schema.js", () => {
		const result = rpcTs(mockNaming);
		expect(result).toContain('import {BookShelf} from "./schema.js"');
	});

	test("creates RpcGroup with correct name", () => {
		const result = rpcTs(mockNaming);
		expect(result).toContain("export const BookShelfRpcs = RpcGroup.make");
	});

	test("includes get RPC", () => {
		const result = rpcTs(mockNaming);
		expect(result).toContain('Rpc.make("getBookShelf"');
		expect(result).toContain("payload: {id: Schema.String}");
		expect(result).toContain("success: Schema.NullOr(BookShelf)");
	});

	test("includes list RPC", () => {
		const result = rpcTs(mockNaming);
		expect(result).toContain('Rpc.make("listBookShelfs"');
		expect(result).toContain("payload: Schema.Void");
		expect(result).toContain("success: Schema.Array(BookShelf)");
	});

	test("exports type alias", () => {
		const result = rpcTs(mockNaming);
		expect(result).toContain("export type BookShelfRpcs = typeof BookShelfRpcs");
	});
});
