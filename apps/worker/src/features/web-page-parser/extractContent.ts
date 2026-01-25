import type {ReaderContent} from "@kampus/web-page-parser";
import {isProbablyReaderable, Readability} from "@mozilla/readability";

const IMAGE_PROXY_BASE = "/api/proxy-image?url=";

export type ContentResult = {
	content: ReaderContent | null;
	strategy: "readability" | "selector" | null;
};

type ExtractionOptions = {
	selectors?: string[];
	minContentLength?: number;
};

const DEFAULT_SELECTORS = [
	"article",
	"main",
	'[role="main"]',
	".post-content",
	".entry-content",
	".article-content",
	"#content",
];

const MIN_CONTENT_LENGTH = 500;

/**
 * Preserve newlines in code blocks before Readability processing.
 * Many sites (Docusaurus, etc.) render code lines as separate divs/spans.
 * Readability collapses these to a single string, losing line breaks.
 * This adds newlines between line-level children of pre/code elements.
 */
const preserveCodeBlockNewlines = (doc: Document): void => {
	for (const pre of doc.querySelectorAll("pre")) {
		const code = pre.querySelector("code");
		const target = code || pre;
		const children = Array.from(target.childNodes);
		if (children.length > 1 && children.some((n) => n.nodeType === 1)) {
			const lines: string[] = [];
			for (const child of children) {
				const text = child.textContent?.trimEnd() ?? "";
				if (text || lines.length > 0) lines.push(text);
			}
			target.textContent = lines.join("\n");
		}
	}
};

const rewriteImageUrls = (html: string, baseUrl: string): string => {
	return html.replace(
		/<img([^>]*?)src=["']([^"']+)["']/gi,
		(_match, before, src) => {
			const absoluteUrl = new URL(src, baseUrl).href;
			return `<img${before}src="${IMAGE_PROXY_BASE}${encodeURIComponent(absoluteUrl)}"`;
		},
	);
};

const calculateStats = (text: string) => {
	const wordCount = text.split(/\s+/).filter(Boolean).length;
	return {wordCount, readingTimeMinutes: Math.ceil(wordCount / 200)};
};

const tryReadability = (doc: Document, url: string): ReaderContent | null => {
	if (!isProbablyReaderable(doc)) return null;

	preserveCodeBlockNewlines(doc);

	const article = new Readability(doc.cloneNode(true) as Document, {
		charThreshold: 100,
		keepClasses: true,
	}).parse();

	if (!article?.content || !article?.textContent || !article?.title) {
		return null;
	}

	const {wordCount, readingTimeMinutes} = calculateStats(article.textContent);

	return {
		title: article.title,
		content: rewriteImageUrls(article.content, url),
		textContent: article.textContent,
		excerpt: article.excerpt ?? null,
		byline: article.byline ?? null,
		siteName: article.siteName ?? null,
		wordCount,
		readingTimeMinutes,
	};
};

const trySelectors = (
	doc: Document,
	url: string,
	options: ExtractionOptions = {},
): ReaderContent | null => {
	const selectors = [...DEFAULT_SELECTORS, ...(options.selectors ?? [])];
	const minLength = options.minContentLength ?? MIN_CONTENT_LENGTH;

	for (const selector of selectors) {
		const el = doc.querySelector(selector);
		if (!el) continue;

		const textContent = el.textContent?.trim() ?? "";
		if (textContent.length < minLength) continue;

		const content = el.innerHTML;
		const {wordCount, readingTimeMinutes} = calculateStats(textContent);
		const title = doc.querySelector("title")?.textContent ?? "Untitled";

		return {
			title,
			content: rewriteImageUrls(content, url),
			textContent,
			excerpt: textContent.slice(0, 200),
			byline: null,
			siteName: null,
			wordCount,
			readingTimeMinutes,
		};
	}

	return null;
};

/**
 * Pure content extraction with strategy chain.
 * Tries Readability first, falls back to selector-based extraction.
 */
export const extractContent = (
	doc: Document,
	url: string,
	options: ExtractionOptions = {},
): ContentResult => {
	// Try Readability first
	const readabilityResult = tryReadability(doc, url);
	if (readabilityResult) {
		return {content: readabilityResult, strategy: "readability"};
	}

	// Fallback to selector-based
	const selectorResult = trySelectors(doc, url, options);
	if (selectorResult) {
		return {content: selectorResult, strategy: "selector"};
	}

	return {content: null, strategy: null};
};
