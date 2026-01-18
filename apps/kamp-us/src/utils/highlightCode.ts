import {codeToHtml} from "shiki";

export async function highlightCodeBlocks(html: string): Promise<string> {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");
	const codeBlocks = doc.querySelectorAll("pre code");

	for (const codeEl of codeBlocks) {
		const pre = codeEl.parentElement;
		if (!pre) continue;

		// Extract language from class="language-*" or data-lang attribute
		const langClass = Array.from(codeEl.classList).find((c) => c.startsWith("language-"));
		const dataLang = codeEl.getAttribute("data-lang");
		const lang = langClass?.replace("language-", "") || dataLang;

		// Skip highlighting if no language detected - better than wrong colors
		if (!lang) continue;

		const code = codeEl.textContent || "";

		try {
			const highlighted = await codeToHtml(code, {
				lang,
				theme: "github-dark",
			});
			pre.outerHTML = highlighted;
		} catch {
			// Keep original if language not supported
		}
	}

	return doc.body.innerHTML;
}
