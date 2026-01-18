import {describe, expect, test} from "bun:test";
import {deriveNaming} from "./naming";

describe("deriveNaming", () => {
	test("converts kebab-case to PascalCase for className", () => {
		expect(deriveNaming("book-shelf").className).toBe("BookShelf");
	});

	test("handles single word", () => {
		expect(deriveNaming("feature").className).toBe("Feature");
	});

	test("handles multi-word names", () => {
		expect(deriveNaming("user-profile-settings").className).toBe("UserProfileSettings");
	});

	test("converts kebab-case to snake_case for tableName", () => {
		expect(deriveNaming("book-shelf").tableName).toBe("book_shelf");
	});

	test("converts to SCREAMING_SNAKE for bindingName", () => {
		expect(deriveNaming("book-shelf").bindingName).toBe("BOOK_SHELF");
	});

	test("derives idPrefix from first chars of words", () => {
		expect(deriveNaming("book-shelf").idPrefix).toBe("bs");
		expect(deriveNaming("user-profile-settings").idPrefix).toBe("ups");
	});

	test("limits idPrefix to 4 chars", () => {
		expect(deriveNaming("a-b-c-d-e").idPrefix).toBe("abcd");
	});

	test("single word idPrefix", () => {
		expect(deriveNaming("library").idPrefix).toBe("l");
	});

	test("respects tableOverride", () => {
		expect(deriveNaming("book-shelf", "custom_table").tableName).toBe("custom_table");
	});

	test("tableOverride affects bindingName", () => {
		expect(deriveNaming("book-shelf", "custom_table").bindingName).toBe("CUSTOM_TABLE");
	});

	test("respects idPrefixOverride", () => {
		expect(deriveNaming("book-shelf", undefined, "bk").idPrefix).toBe("bk");
	});

	test("generates correct packageName", () => {
		expect(deriveNaming("book-shelf").packageName).toBe("@kampus/book-shelf");
	});

	test("preserves original featureName", () => {
		expect(deriveNaming("book-shelf").featureName).toBe("book-shelf");
	});
});
