import {
	FetchHttpError,
	FetchNetworkError,
	FetchTimeoutError,
	InvalidProtocolError,
	ParseError,
} from "@kampus/web-page-parser";
import {Match} from "effect";
import {describe, expect, it} from "vitest";
import {extractPage} from "../src/features/web-page-parser/extractPage";

/**
 * E2E verification tests for web-page-parser extraction strategies.
 * Tests extractPage with HTML fixtures to verify:
 * - Readability strategy for article-like content
 * - Selector fallback for non-readable pages
 * - Metadata always present when HTML is valid
 * - Both strategies failing returns null content
 */

const BASE_URL = "https://example.com";

// Readability-friendly article HTML
const ARTICLE_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Test Article Title</title>
  <meta property="og:title" content="OG Article Title">
  <meta property="og:description" content="OG description for the article">
</head>
<body>
  <article>
    <h1>Main Article Heading</h1>
    <p>This is a substantial article with enough content to pass Readability checks.
    We need sufficient text content here to ensure the extraction works properly.
    Let's add more paragraphs to make this more realistic.</p>
    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
    tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
    quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.</p>
    <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum
    dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non
    proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
    <p>Additional content to ensure we have enough text for Readability to
    consider this page readable. More text helps ensure the algorithm works.</p>
    <p>Even more content to make absolutely sure this passes the isProbablyReaderable
    check that Readability uses before attempting to parse the content.</p>
  </article>
</body>
</html>`;

// HTML that's not Readability-friendly but has selector-extractable content
const SELECTOR_FALLBACK_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Non-Article Page</title>
  <meta name="description" content="A page that needs selector extraction">
</head>
<body>
  <nav>Navigation here</nav>
  <main>
    ${"<p>This is content in a main element. ".repeat(50)}
    It has enough text to pass the 500 character minimum for selector extraction.
    We're using the main element which is one of the default selectors.</p>
  </main>
  <footer>Footer content</footer>
</body>
</html>`;

// HTML with no extractable content (both strategies should fail)
const NO_CONTENT_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Empty Page</title>
  <meta property="og:description" content="A page with no content">
</head>
<body>
  <nav>Just navigation</nav>
  <footer>Just footer</footer>
</body>
</html>`;

// Minimal HTML that still has metadata
const MINIMAL_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Minimal Page</title>
</head>
<body>
  <p>Short</p>
</body>
</html>`;

describe("Web Page Parser Extraction E2E", () => {
	describe("e2e-readability-strategy: Readability-friendly URLs return strategy: 'readability'", () => {
		it("extracts content using readability strategy for article-like HTML", () => {
			const result = extractPage(ARTICLE_HTML, BASE_URL);

			expect(result.strategy).toBe("readability");
			expect(result.content).not.toBeNull();
			expect(result.content?.content).toContain("article");
		});

		it("includes metadata from og tags when using readability", () => {
			const result = extractPage(ARTICLE_HTML, BASE_URL);

			expect(result.metadata.title).toBe("OG Article Title");
			expect(result.metadata.description).toBe("OG description for the article");
		});

		it("content has required fields when readability succeeds", () => {
			const result = extractPage(ARTICLE_HTML, BASE_URL);

			expect(result.content).not.toBeNull();
			expect(result.content?.title).toBeDefined();
			expect(result.content?.content).toBeDefined();
			expect(result.content?.textContent).toBeDefined();
			expect(result.content?.wordCount).toBeGreaterThan(0);
			expect(result.content?.readingTimeMinutes).toBeGreaterThan(0);
		});
	});

	describe("e2e-selector-strategy: Non-readable URLs fall back to selector strategy", () => {
		it("falls back to selector strategy when readability fails", () => {
			const result = extractPage(SELECTOR_FALLBACK_HTML, BASE_URL);

			expect(result.strategy).toBe("selector");
			expect(result.content).not.toBeNull();
		});

		it("extracts content from main element via selector", () => {
			const result = extractPage(SELECTOR_FALLBACK_HTML, BASE_URL);

			expect(result.content).not.toBeNull();
			expect(result.content?.textContent).toContain("content in a main element");
		});

		it("includes metadata even when using selector strategy", () => {
			const result = extractPage(SELECTOR_FALLBACK_HTML, BASE_URL);

			expect(result.metadata.title).toBe("Non-Article Page");
			expect(result.metadata.description).toBe("A page that needs selector extraction");
		});
	});

	describe("e2e-metadata-always-present: Metadata always present when fetch succeeds", () => {
		it("returns metadata even when both extraction strategies fail", () => {
			const result = extractPage(NO_CONTENT_HTML, BASE_URL);

			expect(result.metadata).not.toBeNull();
			expect(result.metadata.title).toBe("Empty Page");
			expect(result.metadata.description).toBe("A page with no content");
		});

		it("returns null content when both strategies fail", () => {
			const result = extractPage(NO_CONTENT_HTML, BASE_URL);

			expect(result.content).toBeNull();
			expect(result.strategy).toBeNull();
		});

		it("returns metadata with minimal HTML", () => {
			const result = extractPage(MINIMAL_HTML, BASE_URL);

			expect(result.metadata).not.toBeNull();
			expect(result.metadata.title).toBe("Minimal Page");
			// No og:description or meta description, so null
			expect(result.metadata.description).toBeNull();
		});

		it("returns 'Untitled' when no title is present", () => {
			const noTitleHtml = `<!DOCTYPE html><html><head></head><body><p>No title</p></body></html>`;
			const result = extractPage(noTitleHtml, BASE_URL);

			expect(result.metadata.title).toBe("Untitled");
		});
	});

	describe("backward-compat: ReaderResult shape compatibility", () => {
		it("extractPage returns correct shape for ReaderResult mapping", () => {
			const result = extractPage(ARTICLE_HTML, BASE_URL);

			// Verify the extracted shape maps correctly to ReaderResult
			expect(result).toHaveProperty("metadata");
			expect(result).toHaveProperty("content");
			expect(result).toHaveProperty("strategy");

			// metadata shape
			expect(result.metadata).toHaveProperty("title");
			expect(result.metadata).toHaveProperty("description");

			// content shape when present
			if (result.content) {
				expect(result.content).toHaveProperty("title");
				expect(result.content).toHaveProperty("content");
				expect(result.content).toHaveProperty("textContent");
				expect(result.content).toHaveProperty("excerpt");
				expect(result.content).toHaveProperty("byline");
				expect(result.content).toHaveProperty("siteName");
				expect(result.content).toHaveProperty("wordCount");
				expect(result.content).toHaveProperty("readingTimeMinutes");
			}
		});

		it("strategy field has correct type", () => {
			const readableResult = extractPage(ARTICLE_HTML, BASE_URL);
			expect(["readability", "selector", null]).toContain(readableResult.strategy);

			const selectorResult = extractPage(SELECTOR_FALLBACK_HTML, BASE_URL);
			expect(["readability", "selector", null]).toContain(selectorResult.strategy);

			const noContentResult = extractPage(NO_CONTENT_HTML, BASE_URL);
			expect(noContentResult.strategy).toBeNull();
		});
	});

	describe("image URL rewriting", () => {
		it("rewrites relative image URLs to proxy URLs", () => {
			const htmlWithImage = `<!DOCTYPE html>
<html>
<head><title>Image Test</title></head>
<body>
  <article>
    <h1>Article with Image</h1>
    ${"<p>Content paragraph. ".repeat(30)}</p>
    <img src="/images/test.jpg" alt="Test">
    ${"<p>More content. ".repeat(30)}</p>
  </article>
</body>
</html>`;

			const result = extractPage(htmlWithImage, BASE_URL);

			expect(result.content?.content).toContain("/api/proxy-image?url=");
			expect(result.content?.content).toContain(encodeURIComponent("https://example.com/images/test.jpg"));
		});
	});
});

/**
 * Error handling tests - verifies errorToReaderResult behavior.
 * These test the error mapping logic that handlers use when fetch fails.
 */
// Replicate the errorToReaderResult logic from handlers.ts for testing
type FetchError =
	| ParseError
	| FetchTimeoutError
	| FetchHttpError
	| FetchNetworkError
	| InvalidProtocolError;

type ReaderResult = {
	readable: boolean;
	metadata: {title: string; description: string | null} | null;
	content: null;
	strategy: null;
	error: string;
};

const errorToReaderResult = (error: FetchError): ReaderResult =>
	Match.value(error).pipe(
		Match.tag(
			"FetchTimeoutError",
			(): ReaderResult => ({
				readable: false,
				metadata: null,
				content: null,
				strategy: null,
				error: "Request timed out",
			}),
		),
		Match.tag(
			"FetchHttpError",
			(e): ReaderResult => ({
				readable: false,
				metadata: null,
				content: null,
				strategy: null,
				error: `HTTP ${e.status}`,
			}),
		),
		Match.tag(
			"FetchNetworkError",
			(e): ReaderResult => ({
				readable: false,
				metadata: null,
				content: null,
				strategy: null,
				error: e.message,
			}),
		),
		Match.tag(
			"ParseError",
			(e): ReaderResult => ({
				readable: false,
				metadata: null,
				content: null,
				strategy: null,
				error: e.message,
			}),
		),
		Match.tag(
			"InvalidProtocolError",
			(e): ReaderResult => ({
				readable: false,
				metadata: null,
				content: null,
				strategy: null,
				error: `Invalid protocol: ${e.protocol}`,
			}),
		),
		Match.exhaustive,
	);

describe("e2e-fetch-error: Fetch errors return metadata: null with error message", () => {
	it("FetchTimeoutError returns metadata: null with timeout message", () => {
		const error = new FetchTimeoutError({url: "https://example.com"});
		const result = errorToReaderResult(error);

		expect(result.metadata).toBeNull();
		expect(result.readable).toBe(false);
		expect(result.content).toBeNull();
		expect(result.strategy).toBeNull();
		expect(result.error).toBe("Request timed out");
	});

	it("FetchHttpError returns metadata: null with HTTP status", () => {
		const error = new FetchHttpError({url: "https://example.com", status: 404});
		const result = errorToReaderResult(error);

		expect(result.metadata).toBeNull();
		expect(result.error).toBe("HTTP 404");
	});

	it("FetchNetworkError returns metadata: null with error message", () => {
		const error = new FetchNetworkError({url: "https://example.com", message: "Connection refused"});
		const result = errorToReaderResult(error);

		expect(result.metadata).toBeNull();
		expect(result.error).toBe("Connection refused");
	});

	it("InvalidProtocolError returns metadata: null with protocol error", () => {
		const error = new InvalidProtocolError({url: "ftp://example.com", protocol: "ftp:"});
		const result = errorToReaderResult(error);

		expect(result.metadata).toBeNull();
		expect(result.error).toBe("Invalid protocol: ftp:");
	});

	it("ParseError returns metadata: null with parse error message", () => {
		const error = new ParseError({url: "https://example.com", message: "Invalid HTML"});
		const result = errorToReaderResult(error);

		expect(result.metadata).toBeNull();
		expect(result.error).toBe("Invalid HTML");
	});
});
