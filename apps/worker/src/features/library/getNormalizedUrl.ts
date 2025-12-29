import normalizeUrl from "normalize-url";

export function getNormalizedUrl(url: string) {
	let normalized = normalizeUrl(url, {
		stripProtocol: true,
		stripHash: true,
		removeDirectoryIndex: true,
		removeQueryParameters: [/^utm_/i, "fbclid", "gclid"],
	});

	// YouTube
	normalized = normalized.replace(/^m\.youtube\.com\//, "youtube.com/");
	normalized = normalized.replace(/^youtu\.be\/(.+)/, "youtube.com/watch?v=$1");
	normalized = normalized.replace(
		/^youtube\.com\/.*v=([A-Za-z0-9\-_]+).*/,
		"youtube.com/watch?v=$1",
	);

	// arXiv
	normalized = normalized.replace(
		/^arxiv\.org\/(?:abs|html|pdf)\/(\d{4}\.\d{4,5}(?:v\d)?)(?:\.pdf)?/,
		"arxiv.org/abs/$1",
	);

	return normalized;
}
