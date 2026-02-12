import path from "node:path";
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	resolve: {
		alias: [
			{
				find: /^@kampus\/wormhole\/(.+)$/,
				replacement: path.resolve(import.meta.dirname, '../../packages/wormhole/src/$1.ts'),
			},
			{
				find: '@kampus/wormhole',
				replacement: path.resolve(import.meta.dirname, '../../packages/wormhole/src/index.ts'),
			},
		],
	},
	ssr: {
		// @cloudflare/sandbox → @cloudflare/containers can't be resolved by workerd
		// in pnpm's strict node_modules layout. Inlining tells Vite to bundle the
		// dependency (and its transitive deps) so workerd never resolves them.
		noExternal: ['@cloudflare/sandbox', '@cloudflare/containers'],
	},
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
			},
		},
	},
});
