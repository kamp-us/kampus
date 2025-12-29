import {defineConfig} from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	driver: "durable-sqlite",
	schema: "./src/features/story/drizzle/drizzle.schema.ts",
	out: "./src/features/story/drizzle/migrations",
});
