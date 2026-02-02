import type {PageMetadata} from "@kampus/web-page-parser";

const getMetaContent = (doc: Document, selectors: string[]): string | null => {
	for (const sel of selectors) {
		const el = doc.querySelector(sel);
		const content = el?.getAttribute?.("content") ?? el?.textContent;
		if (content?.trim()) return content.trim();
	}
	return null;
};

/**
 * Pure function to extract metadata from a Document.
 * Extracts title (og:title > title tag, fallback "Untitled") and description.
 */
export const extractMetadata = (doc: Document): PageMetadata => {
	const title =
		getMetaContent(doc, ['meta[property="og:title"]', "title"]) ?? "Untitled";

	const description = getMetaContent(doc, [
		'meta[property="og:description"]',
		'meta[name="description"]',
	]);

	return {title, description};
};
