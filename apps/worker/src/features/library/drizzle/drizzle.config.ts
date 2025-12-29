import {defineConfig} from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	driver: "durable-sqlite",
	schema: "./src/features/library/drizzle/drizzle.schema.ts",
	out: "./src/features/library/drizzle/migrations",
});
