import {describe, expect, test} from "bun:test";
import {updateWorkerIndex, updateWranglerJsonc} from "./integrations";
import type {Naming} from "./types";

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
