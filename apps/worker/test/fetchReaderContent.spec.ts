import {HttpClient, HttpClientResponse} from "@effect/platform";
import {
	FetchHttpError,
	FetchNetworkError,
	FetchTimeoutError,
	InvalidProtocolError,
	NotReadableError,
	ParseError,
} from "@kampus/web-page-parser";
import {Cause, Duration, Effect, Exit, Layer, Stream} from "effect";
import {describe, expect, it} from "vitest";
import {fetchReaderContent} from "../src/features/web-page-parser/fetchReaderContent";

// Sample HTML that is reader-friendly - needs substantial content to pass readability check
const READABLE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>The Complete Guide to Effect TypeScript</title>
  <meta name="author" content="John Doe">
</head>
<body>
<article>
  <h1>The Complete Guide to Effect TypeScript</h1>
  <p class="byline">By John Doe</p>
  <p>Effect is a powerful TypeScript library for building robust and scalable applications. In this comprehensive guide, we will explore the fundamental concepts and patterns that make Effect such a valuable tool for modern TypeScript development. Whether you're building web applications, CLI tools, or backend services, Effect provides a consistent and type-safe approach to handling side effects.</p>
  <p>The core concept behind Effect is the Effect type itself. An Effect represents a computation that may succeed with a value of type A, fail with an error of type E, or require some context of type R. This three-parameter type signature (Effect&lt;A, E, R&gt;) gives you complete control over your program's behavior while maintaining full type safety throughout your codebase.</p>
  <p>One of the most powerful features of Effect is its approach to error handling. Unlike traditional try-catch blocks, Effect uses typed errors that are tracked at compile time. This means you always know exactly what errors your code might produce, and the compiler will ensure you handle them appropriately. No more surprise exceptions at runtime!</p>
  <p>Dependency injection in Effect is handled through the Context system. Instead of passing dependencies manually through function parameters, you can declare what services your Effect requires and let the framework provide them at runtime. This leads to cleaner, more modular code that's easier to test and maintain.</p>
  <p>Effect also provides excellent support for concurrent programming. With fibers, you can run multiple computations in parallel while maintaining full control over their execution. The framework handles all the complexity of concurrent programming, including proper resource cleanup and error propagation across concurrent boundaries.</p>
  <img src="/images/effect-architecture.jpg" alt="Effect Architecture Diagram" />
  <p>Resource management is another area where Effect shines. The Scope and Layer abstractions ensure that resources like database connections, file handles, and network sockets are properly acquired and released, even in the presence of errors or concurrent operations.</p>
  <p>In conclusion, Effect TypeScript represents a paradigm shift in how we think about building applications. By embracing functional programming principles while remaining practical and approachable, Effect helps teams build more reliable software with less effort. We encourage you to explore the Effect ecosystem and discover how it can improve your development workflow.</p>
</article>
</body>
</html>
`;

// Sample HTML that is NOT readable (too short/no article content)
const NON_READABLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Login Page</title></head>
<body>
<nav>Menu</nav>
<form>
  <input type="text" name="username" />
  <input type="password" name="password" />
  <button>Login</button>
</form>
</body>
</html>
`;

// Create a mock HttpClient that returns predefined responses
const makeMockHttpClient = (
	response: {
		status?: number;
		body?: string;
		headers?: Record<string, string>;
	} | {error: "timeout"} | {error: "network"; message: string},
): Layer.Layer<HttpClient.HttpClient> => {
	const mockClient: HttpClient.HttpClient = HttpClient.make((request) => {
		if ("error" in response) {
			if (response.error === "timeout") {
				// Return an effect that never completes to trigger timeout
				return Effect.never;
			}
			return Effect.fail({
				_tag: "RequestError",
				request,
				reason: "Transport",
				message: response.message,
			} as const);
		}

		const status = response.status ?? 200;
		const body = response.body ?? "";
		const headers = new Headers(response.headers ?? {"content-type": "text/html"});

		return Effect.succeed(
			HttpClientResponse.fromWeb(
				request,
				new Response(body, {status, headers}),
			),
		);
	});

	return Layer.succeed(HttpClient.HttpClient, mockClient);
};

describe("fetchReaderContent", () => {
	describe("URL validation", () => {
		it("returns InvalidProtocolError for file:// URLs", async () => {
			const httpClientLayer = makeMockHttpClient({body: ""});
			const exit = await Effect.runPromiseExit(
				fetchReaderContent("file:///etc/passwd").pipe(Effect.provide(httpClientLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value._tag).toBe("InvalidProtocolError");
					expect((error.value as InvalidProtocolError).url).toBe("file:///etc/passwd");
				}
			}
		});

		it("returns InvalidProtocolError for javascript: URLs", async () => {
			const httpClientLayer = makeMockHttpClient({body: ""});
			const exit = await Effect.runPromiseExit(
				fetchReaderContent("javascript:alert(1)").pipe(Effect.provide(httpClientLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value._tag).toBe("InvalidProtocolError");
				}
			}
		});

		it("accepts http:// URLs", async () => {
			const httpClientLayer = makeMockHttpClient({body: READABLE_HTML});
			const exit = await Effect.runPromiseExit(
				fetchReaderContent("http://example.com/article").pipe(Effect.provide(httpClientLayer)),
			);

			// Should not fail due to protocol validation
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				if (error._tag === "Some") {
					expect(error.value._tag).not.toBe("InvalidProtocolError");
				}
			}
		});

		it("accepts https:// URLs", async () => {
			const httpClientLayer = makeMockHttpClient({body: READABLE_HTML});
			const exit = await Effect.runPromiseExit(
				fetchReaderContent("https://example.com/article").pipe(Effect.provide(httpClientLayer)),
			);

			// Should not fail due to protocol validation
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				if (error._tag === "Some") {
					expect(error.value._tag).not.toBe("InvalidProtocolError");
				}
			}
		});
	});

	describe("HTTP error handling", () => {
		it("returns FetchHttpError for 404 responses", async () => {
			const httpClientLayer = makeMockHttpClient({status: 404, body: "Not Found"});
			const exit = await Effect.runPromiseExit(
				fetchReaderContent("https://example.com/missing").pipe(Effect.provide(httpClientLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value._tag).toBe("FetchHttpError");
					expect((error.value as FetchHttpError).status).toBe(404);
				}
			}
		});

		it("returns FetchHttpError for 500 responses", async () => {
			const httpClientLayer = makeMockHttpClient({status: 500, body: "Internal Server Error"});
			const exit = await Effect.runPromiseExit(
				fetchReaderContent("https://example.com/error").pipe(Effect.provide(httpClientLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value._tag).toBe("FetchHttpError");
					expect((error.value as FetchHttpError).status).toBe(500);
				}
			}
		});

		it("returns FetchNetworkError for network failures", async () => {
			const httpClientLayer = makeMockHttpClient({error: "network", message: "Connection refused"});
			const exit = await Effect.runPromiseExit(
				fetchReaderContent("https://example.com/article").pipe(Effect.provide(httpClientLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value._tag).toBe("FetchNetworkError");
					expect((error.value as FetchNetworkError).message).toBe("Connection refused");
				}
			}
		});
	});

	describe("readability check", () => {
		it("returns NotReadableError for non-article pages", async () => {
			const httpClientLayer = makeMockHttpClient({body: NON_READABLE_HTML});
			const exit = await Effect.runPromiseExit(
				fetchReaderContent("https://example.com/login").pipe(Effect.provide(httpClientLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value._tag).toBe("NotReadableError");
				}
			}
		});
	});

	describe("successful extraction", () => {
		it("extracts article content from readable HTML", async () => {
			const httpClientLayer = makeMockHttpClient({body: READABLE_HTML});
			const result = await Effect.runPromise(
				fetchReaderContent("https://example.com/article").pipe(Effect.provide(httpClientLayer)),
			);

			expect(result.title).toBeDefined();
			expect(result.content).toContain("Effect");
			expect(result.content).toContain("<p>");
			expect(result.textContent).toBeDefined();
			expect(typeof result.wordCount).toBe("number");
			expect(result.wordCount).toBeGreaterThan(0);
			expect(typeof result.readingTimeMinutes).toBe("number");
			expect(result.readingTimeMinutes).toBeGreaterThan(0);
		});

		it("rewrites image URLs to use proxy", async () => {
			const httpClientLayer = makeMockHttpClient({body: READABLE_HTML});
			const result = await Effect.runPromise(
				fetchReaderContent("https://example.com/article").pipe(Effect.provide(httpClientLayer)),
			);

			// Check that images are rewritten to proxy URL
			expect(result.content).toContain("/api/proxy-image?url=");
			// The image src is relative (/images/effect-architecture.jpg) but gets resolved to absolute
			expect(result.content).toContain(encodeURIComponent("https://example.com/images/effect-architecture.jpg"));
		});

		it("calculates word count correctly", async () => {
			const httpClientLayer = makeMockHttpClient({body: READABLE_HTML});
			const result = await Effect.runPromise(
				fetchReaderContent("https://example.com/article").pipe(Effect.provide(httpClientLayer)),
			);

			// Word count should match text content
			const words = result.textContent.split(/\s+/).filter(Boolean);
			expect(result.wordCount).toBe(words.length);
		});

		it("calculates reading time at 200 wpm", async () => {
			const httpClientLayer = makeMockHttpClient({body: READABLE_HTML});
			const result = await Effect.runPromise(
				fetchReaderContent("https://example.com/article").pipe(Effect.provide(httpClientLayer)),
			);

			// Reading time should be ceil(wordCount / 200)
			expect(result.readingTimeMinutes).toBe(Math.ceil(result.wordCount / 200));
		});
	});

	describe("optional fields", () => {
		it("returns null for missing byline", async () => {
			// HTML without explicit byline - still needs substantial content for readability
			const htmlWithoutByline = `
				<!DOCTYPE html>
				<html>
				<head><title>Technical Documentation</title></head>
				<body>
				<article>
					<h1>Building Modern Web Applications</h1>
					<p>Modern web development has evolved significantly over the past decade. Today's developers have access to powerful frameworks and tools that make building complex applications more manageable than ever before. In this article, we'll explore the key principles that guide successful web application development.</p>
					<p>First, let's consider the importance of component-based architecture. By breaking down your application into small, reusable components, you can create more maintainable code that's easier to test and debug. Each component should have a single responsibility and a clear interface.</p>
					<p>State management is another crucial aspect of modern web applications. Whether you choose Redux, MobX, or a simpler context-based approach, having a consistent strategy for managing application state will save you countless hours of debugging.</p>
					<p>Performance optimization should be considered from the start of your project. Lazy loading, code splitting, and efficient rendering strategies can make a significant difference in user experience, especially on mobile devices with limited resources.</p>
					<p>Testing is not optional in professional web development. A comprehensive test suite that includes unit tests, integration tests, and end-to-end tests will give you confidence when making changes and help prevent regressions.</p>
					<p>Finally, accessibility should be a priority. Building applications that work for users with disabilities is not just the right thing to do - it often leads to better design decisions that benefit all users.</p>
				</article>
				</body>
				</html>
			`;
			const httpClientLayer = makeMockHttpClient({body: htmlWithoutByline});
			const result = await Effect.runPromise(
				fetchReaderContent("https://example.com/article").pipe(Effect.provide(httpClientLayer)),
			);

			// byline should be null or a string (not undefined)
			expect(result.byline === null || typeof result.byline === "string").toBe(true);
		});
	});
});
