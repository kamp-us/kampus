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
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
			},
		},
	},
});
