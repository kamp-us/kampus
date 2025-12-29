import {defineConfig} from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	driver: "durable-sqlite",
	schema: "./src/features/web-page-parser/drizzle/drizzle.schema.ts",
	out: "./src/features/web-page-parser/drizzle/migrations",
});
