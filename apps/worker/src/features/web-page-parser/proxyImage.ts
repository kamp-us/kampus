import {HttpClient, HttpClientRequest} from "@effect/platform";
import {
	FetchHttpError,
	FetchNetworkError,
	FetchTimeoutError,
	InvalidProtocolError,
} from "@kampus/web-page-parser";
import {Duration, Effect} from "effect";

// --- URL validation ---

const validateUrl = (url: string) =>
	Effect.try({
		try: () => {
			const parsed = new URL(url);
			if (!["http:", "https:"].includes(parsed.protocol)) {
				throw parsed.protocol;
			}
			return parsed;
		},
		catch: (e) => new InvalidProtocolError({url, protocol: String(e)}),
	});

// --- Main Effect ---

export const proxyImage = (url: string) =>
	Effect.gen(function* () {
		yield* validateUrl(url);

		const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);

		const request = HttpClientRequest.get(url).pipe(
			HttpClientRequest.setHeaders({
				"User-Agent": "Mozilla/5.0 (compatible; KampusBot/1.0)",
			}),
		);

		const response = yield* client.execute(request).pipe(
			Effect.timeout(Duration.seconds(10)),
			Effect.catchTag("TimeoutException", () => Effect.fail(new FetchTimeoutError({url}))),
			Effect.catchTag("RequestError", (e) => Effect.fail(new FetchNetworkError({url, message: e.message}))),
			Effect.catchTag("ResponseError", (e) => Effect.fail(new FetchHttpError({url, status: e.response.status}))),
		);

		const contentType = response.headers["content-type"] ?? "image/png";

		// Get body as ArrayBuffer
		const body = yield* response.arrayBuffer.pipe(
			Effect.catchTag("ResponseError", () => Effect.fail(new FetchNetworkError({url, message: "Failed to read body"}))),
		);

		// Return response with cache headers
		return new Response(body, {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=86400", // 24h
			},
		});
	});

// Type: Effect<Response, FetchTimeoutError | FetchHttpError | FetchNetworkError | InvalidProtocolError, HttpClient.HttpClient>
