import {codeToHtml} from "shiki";

/**
 * Highlights code blocks in HTML content using Shiki.
 * Use this for processing HTML strings (e.g., from Readability).
 * Extracts language from class="language-*" on code or pre elements.
 */
export async function highlightHtmlCodeBlocks(html: string): Promise<string> {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");
	const codeBlocks = doc.querySelectorAll("pre code");

	for (const codeEl of codeBlocks) {
		const pre = codeEl.parentElement;
		const code = codeEl.textContent || "";
		if (!code.trim()) continue;

		// Extract language from class="language-*" on code or pre element
		const codeLangClass = Array.from(codeEl.classList).find((c) => c.startsWith("language-"));
		const preLangClass = pre ? Array.from(pre.classList).find((c) => c.startsWith("language-")) : null;
		const lang = codeLangClass?.replace("language-", "") || preLangClass?.replace("language-", "");

		if (!lang) continue; // Skip if no language detected

		try {
			const highlighted = await codeToHtml(code, {
				lang,
				theme: "github-dark",
			});

			// Extract inner content from shiki's output (it wraps in pre>code)
			const tempDoc = parser.parseFromString(highlighted, "text/html");
			const shikiCode = tempDoc.querySelector("pre code");
			if (shikiCode && pre) {
				// Replace the code element's innerHTML
				codeEl.innerHTML = shikiCode.innerHTML;
				codeEl.classList.add("shiki");
				// Copy shiki's pre styles to our pre
				const shikiPre = tempDoc.querySelector("pre");
				if (shikiPre) {
					pre.style.cssText = shikiPre.style.cssText;
				}
			}
		} catch {
			// Keep original if highlighting fails (unknown language, etc.)
		}
	}

	return doc.body.innerHTML;
}
