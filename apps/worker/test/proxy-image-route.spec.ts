import {SELF} from "cloudflare:test";
import {describe, expect, it} from "vitest";

describe("/api/proxy-image route", () => {
	describe("parameter validation", () => {
		it("returns 400 for missing url param", async () => {
			const response = await SELF.fetch("https://example.com/api/proxy-image");

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Missing url parameter");
		});

		it("returns 400 for empty url param", async () => {
			const response = await SELF.fetch("https://example.com/api/proxy-image?url=");

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Missing url parameter");
		});
	});

	describe("URL protocol validation", () => {
		it("returns 400 for file:// protocol", async () => {
			const url = encodeURIComponent("file:///etc/passwd");
			const response = await SELF.fetch(`https://example.com/api/proxy-image?url=${url}`);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Invalid URL protocol");
		});

		it("returns 400 for data: protocol", async () => {
			const url = encodeURIComponent("data:image/png;base64,abc123");
			const response = await SELF.fetch(`https://example.com/api/proxy-image?url=${url}`);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Invalid URL protocol");
		});

		it("returns 400 for javascript: protocol", async () => {
			const url = encodeURIComponent("javascript:alert(1)");
			const response = await SELF.fetch(`https://example.com/api/proxy-image?url=${url}`);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Invalid URL protocol");
		});
	});
});
