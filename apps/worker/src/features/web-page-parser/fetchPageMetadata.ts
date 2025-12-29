import {Schema} from "effect";
import {PageMetadata} from "./schema";

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

	const res = await fetch(url);
	await rewriter.transform(res).text();

	return Schema.decodeUnknownSync(PageMetadata)(metadata);
}
