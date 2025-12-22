import {defineConfig} from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	driver: "durable-sqlite",
	schema: "./src/features/pasaport/drizzle/drizzle.schema.ts",
	out: "./src/features/pasaport/drizzle/migrations",
});
