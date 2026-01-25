import type {PageMetadata, ReaderContent} from "@kampus/web-page-parser";
import {parseHTML} from "linkedom/worker";
import {extractContent} from "./extractContent";
import {extractMetadata} from "./extractMetadata";

export type ExtractedPage = {
	metadata: PageMetadata;
	content: ReaderContent | null;
	strategy: "readability" | "selector" | null;
};

/**
 * Pure extraction function - takes HTML string, returns extracted data.
 * No network, no effects - fully testable with fixtures.
 *
 * @param html - Raw HTML string
 * @param baseUrl - Used for resolving relative URLs (images, links)
 */
export const extractPage = (html: string, baseUrl: string): ExtractedPage => {
	const {document} = parseHTML(html);

	const metadata = extractMetadata(document);
	const {content, strategy} = extractContent(document, baseUrl);

	return {metadata, content, strategy};
};
