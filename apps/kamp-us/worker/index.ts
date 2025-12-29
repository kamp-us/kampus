interface Env {
	BACKEND: Fetcher;
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		// Proxy GraphQL requests to the backend worker
		if (url.pathname === "/graphql" || url.pathname.startsWith("/graphql/")) {
			return env.BACKEND.fetch(request);
		}

		// Proxy auth requests to the backend worker
		if (url.pathname.startsWith("/api/auth/")) {
			return env.BACKEND.fetch(request);
		}

		// Legacy API endpoint
		if (url.pathname.startsWith("/api/")) {
			return Response.json({
				name: "Umut",
			});
		}

		return new Response(null, {status: 404});
	},
} satisfies ExportedHandler<Env>;
