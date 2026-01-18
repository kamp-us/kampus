import {HttpClient, HttpClientRequest} from "@effect/platform";
import {
	FetchHttpError,
	FetchNetworkError,
	FetchTimeoutError,
	InvalidProtocolError,
	NotReadableError,
	ParseError,
	type ReaderContent,
} from "@kampus/web-page-parser";
import {isProbablyReaderable, Readability} from "@mozilla/readability";
import {Duration, Effect} from "effect";
import {parseHTML} from "linkedom/worker";

const IMAGE_PROXY_BASE = "/api/proxy-image?url=";

// --- Pure helpers ---

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

const rewriteImageUrls = (html: string, baseUrl: string): string => {
	const {document} = parseHTML(html);
	for (const img of document.querySelectorAll("img[src]")) {
		const src = img.getAttribute("src");
		if (src) {
			const absoluteUrl = new URL(src, baseUrl).href;
			img.setAttribute("src", IMAGE_PROXY_BASE + encodeURIComponent(absoluteUrl));
		}
	}
	return document.toString();
};

const calculateReadingStats = (textContent: string) => {
	const wordCount = textContent.split(/\s+/).filter(Boolean).length;
	return {wordCount, readingTimeMinutes: Math.ceil(wordCount / 200)};
};

// --- Main Effect ---

export const fetchReaderContent = (url: string) =>
	Effect.gen(function* () {
		yield* validateUrl(url);

		const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);

		// Build request with headers
		const request = HttpClientRequest.get(url).pipe(
			HttpClientRequest.setHeaders({
				"User-Agent": "Mozilla/5.0 (compatible; KampusBot/1.0)",
				Accept: "text/html,application/xhtml+xml",
			}),
		);

		// Execute with timeout, map errors to domain errors
		const response = yield* client.execute(request).pipe(
			Effect.timeout(Duration.seconds(15)),
			Effect.catchTag("TimeoutException", () => Effect.fail(new FetchTimeoutError({url}))),
			Effect.catchTag("RequestError", (e) => Effect.fail(new FetchNetworkError({url, message: e.message}))),
			Effect.catchTag("ResponseError", (e) => Effect.fail(new FetchHttpError({url, status: e.response.status}))),
		);

		// Get HTML text
		const html = yield* response.text.pipe(
			Effect.catchTag("ResponseError", () =>
				Effect.fail(new FetchNetworkError({url, message: "Failed to read body"})),
			),
		);

		// Parse with linkedom
		const {document} = yield* Effect.try({
			try: () => parseHTML(html),
			catch: (e) => new ParseError({url, message: String(e)}),
		});

		// Check if readable
		if (!isProbablyReaderable(document)) {
			return yield* Effect.fail(new NotReadableError({url}));
		}

		// Extract with Readability
		const article = yield* Effect.try({
			try: () => new Readability(document.cloneNode(true) as Document, {charThreshold: 100}).parse(),
			catch: (e) => new ParseError({url, message: String(e)}),
		});

		if (!article || !article.content || !article.textContent || !article.title) {
			return yield* Effect.fail(new ParseError({url, message: "Readability returned incomplete result"}));
		}

		// Build result
		const contentWithProxiedImages = rewriteImageUrls(article.content, url);
		const {wordCount, readingTimeMinutes} = calculateReadingStats(article.textContent);

		return {
			title: article.title,
			content: contentWithProxiedImages,
			textContent: article.textContent,
			excerpt: article.excerpt ?? null,
			byline: article.byline ?? null,
			siteName: article.siteName ?? null,
			wordCount,
			readingTimeMinutes,
		} satisfies ReaderContent;
	});

// Type: Effect<ReaderContent, FetchTimeoutError | FetchHttpError | FetchNetworkError | NotReadableError | ParseError | InvalidProtocolError, HttpClient.HttpClient>
// Note: Requires HttpClient service - provide via FetchHttpClient.layer in Cloudflare Workers
