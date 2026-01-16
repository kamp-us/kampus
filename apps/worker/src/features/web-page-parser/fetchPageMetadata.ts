import {PageMetadata} from "@kampus/web-page-parser";
import {Schema} from "effect";

export async function fetchPageMetadata(url: string) {
	const metadata: Record<string, string | null> = {};
	const rewriter = new HTMLRewriter()
		.on("title", {
			text(text) {
				metadata.title = (metadata.title || "") + text.text;
			},
		})
		.on('meta[property="og:title"]', {
			element(el) {
				metadata.title = el.getAttribute("content") || metadata.title;
			},
		})
		.on('meta[name="description"]', {
			element(el) {
				metadata.description = el.getAttribute("content");
			},
		})
		.on('meta[property="og:description"]', {
			element(el) {
				metadata.description = el.getAttribute("content") || metadata.description;
			},
		});

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000);

	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; KampusBot/1.0)",
			},
		});
		clearTimeout(timeoutId);

		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}

		await rewriter.transform(res).text();
		return Schema.decodeUnknownSync(PageMetadata)(metadata);
	} catch (err) {
		clearTimeout(timeoutId);
		if (err instanceof Error && err.name === "AbortError") {
			throw new Error("Request timed out");
		}
		throw err;
	}
}
