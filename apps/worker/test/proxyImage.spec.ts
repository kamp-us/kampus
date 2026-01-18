import {HttpClient, HttpClientResponse} from "@effect/platform";
import {
	FetchHttpError,
	FetchNetworkError,
	FetchTimeoutError,
	InvalidProtocolError,
} from "@kampus/web-page-parser";
import {Cause, Effect, Exit, Layer} from "effect";
import {describe, expect, it} from "vitest";
import {proxyImage} from "../src/features/web-page-parser/proxyImage";

// Create a mock HttpClient that returns predefined responses
const makeMockHttpClient = (
	response:
		| {
				status?: number;
				body?: BodyInit;
				headers?: Record<string, string>;
		  }
		| {error: "timeout"}
		| {error: "network"; message: string},
): Layer.Layer<HttpClient.HttpClient> => {
	const mockClient: HttpClient.HttpClient = HttpClient.make((request) => {
		if ("error" in response) {
			if (response.error === "timeout") {
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
		const body = response.body ?? new Uint8Array([1, 2, 3, 4]);
		const headers = new Headers(response.headers ?? {"content-type": "image/png"});

		return Effect.succeed(
			HttpClientResponse.fromWeb(request, new Response(body, {status, headers})),
		);
	});

	return Layer.succeed(HttpClient.HttpClient, mockClient);
};

describe("proxyImage", () => {
	describe("URL validation", () => {
		it("returns InvalidProtocolError for file:// URLs", async () => {
			const httpClientLayer = makeMockHttpClient({body: new Uint8Array()});
			const exit = await Effect.runPromiseExit(
				proxyImage("file:///etc/passwd").pipe(Effect.provide(httpClientLayer)),
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

		it("returns InvalidProtocolError for data: URLs", async () => {
			const httpClientLayer = makeMockHttpClient({body: new Uint8Array()});
			const exit = await Effect.runPromiseExit(
				proxyImage("data:image/png;base64,abc123").pipe(Effect.provide(httpClientLayer)),
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
			const httpClientLayer = makeMockHttpClient({body: new Uint8Array([1, 2, 3])});
			const result = await Effect.runPromise(
				proxyImage("http://example.com/image.png").pipe(Effect.provide(httpClientLayer)),
			);

			expect(result).toBeInstanceOf(Response);
		});

		it("accepts https:// URLs", async () => {
			const httpClientLayer = makeMockHttpClient({body: new Uint8Array([1, 2, 3])});
			const result = await Effect.runPromise(
				proxyImage("https://example.com/image.png").pipe(Effect.provide(httpClientLayer)),
			);

			expect(result).toBeInstanceOf(Response);
		});
	});

	describe("HTTP error handling", () => {
		it("returns FetchHttpError for 404 responses", async () => {
			const httpClientLayer = makeMockHttpClient({status: 404});
			const exit = await Effect.runPromiseExit(
				proxyImage("https://example.com/missing.png").pipe(Effect.provide(httpClientLayer)),
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
			const httpClientLayer = makeMockHttpClient({status: 500});
			const exit = await Effect.runPromiseExit(
				proxyImage("https://example.com/error.png").pipe(Effect.provide(httpClientLayer)),
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
				proxyImage("https://example.com/image.png").pipe(Effect.provide(httpClientLayer)),
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

	describe("successful proxy", () => {
		it("returns response with Cache-Control header", async () => {
			const httpClientLayer = makeMockHttpClient({
				body: new Uint8Array([1, 2, 3, 4]),
				headers: {"content-type": "image/jpeg"},
			});
			const result = await Effect.runPromise(
				proxyImage("https://example.com/photo.jpg").pipe(Effect.provide(httpClientLayer)),
			);

			expect(result.headers.get("Cache-Control")).toBe("public, max-age=86400");
		});

		it("preserves Content-Type from upstream", async () => {
			const httpClientLayer = makeMockHttpClient({
				body: new Uint8Array([1, 2, 3, 4]),
				headers: {"content-type": "image/webp"},
			});
			const result = await Effect.runPromise(
				proxyImage("https://example.com/photo.webp").pipe(Effect.provide(httpClientLayer)),
			);

			expect(result.headers.get("Content-Type")).toBe("image/webp");
		});

		it("defaults to image/png when Content-Type missing", async () => {
			const httpClientLayer = makeMockHttpClient({
				body: new Uint8Array([1, 2, 3, 4]),
				headers: {},
			});
			const result = await Effect.runPromise(
				proxyImage("https://example.com/image").pipe(Effect.provide(httpClientLayer)),
			);

			expect(result.headers.get("Content-Type")).toBe("image/png");
		});

		it("streams the response body", async () => {
			const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic bytes
			const httpClientLayer = makeMockHttpClient({
				body: imageBytes,
				headers: {"content-type": "image/png"},
			});
			const result = await Effect.runPromise(
				proxyImage("https://example.com/test.png").pipe(Effect.provide(httpClientLayer)),
			);

			const body = await result.arrayBuffer();
			expect(new Uint8Array(body)).toEqual(imageBytes);
		});
	});
});
