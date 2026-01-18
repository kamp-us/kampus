import {FileSystem, Path} from "@effect/platform";
import type {PlatformError} from "@effect/platform/Error";
import {Effect, Stream} from "effect";
import {updateWorkerIndex, updateWorkerPackageJson, updateWranglerJsonc} from "./integrations";
import {deriveNaming} from "./naming";
import * as packageTemplates from "./templates/package";
import * as workerTemplates from "./templates/worker";
import type {Column, GeneratorOptions, Naming} from "./types";

export interface GeneratedFile {
	path: string;
	content: string;
}

export type ProgressEvent =
	| {type: "file_written"; path: string}
	| {type: "integration_updated"; name: string}
	| {type: "complete"; naming: Naming; files: GeneratedFile[]};

/**
 * Generates all file contents for a spellbook feature.
 * Pure function - no side effects.
 */
export const generateFiles = (naming: Naming, columns: Column[]): GeneratedFile[] => {
	const packageDir = `packages/${naming.featureName}`;
	const workerDir = `apps/worker/src/features/${naming.featureName}`;

	return [
		// Package layer
		{path: `${packageDir}/package.json`, content: packageTemplates.packageJson(naming)},
		{path: `${packageDir}/tsconfig.json`, content: packageTemplates.tsconfigJson()},
		{path: `${packageDir}/src/index.ts`, content: packageTemplates.indexTs(naming)},
		{path: `${packageDir}/src/errors.ts`, content: packageTemplates.errorsTs()},
		{path: `${packageDir}/src/schema.ts`, content: packageTemplates.schemaTs(naming, columns)},
		{path: `${packageDir}/src/rpc.ts`, content: packageTemplates.rpcTs(naming)},
		// Worker layer
		{path: `${workerDir}/${naming.className}.ts`, content: workerTemplates.doClassTs(naming)},
		{path: `${workerDir}/handlers.ts`, content: workerTemplates.handlersTs(naming)},
		{
			path: `${workerDir}/drizzle/drizzle.config.ts`,
			content: workerTemplates.drizzleConfigTs(naming),
		},
		{
			path: `${workerDir}/drizzle/drizzle.schema.ts`,
			content: workerTemplates.drizzleSchemaTs(naming, columns),
		},
		{
			path: `${workerDir}/drizzle/migrations/migrations.js`,
			content: workerTemplates.migrationsJs(),
		},
		{
			path: `${workerDir}/drizzle/migrations/meta/_journal.json`,
			content: workerTemplates.journalJson(),
		},
	];
};

/**
 * Writes all generated files to disk.
 */
export const writeFiles = (rootDir: string, files: GeneratedFile[]) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		for (const file of files) {
			const fullPath = path.join(rootDir, file.path);
			const dir = path.dirname(fullPath);

			// Ensure directory exists
			yield* fs.makeDirectory(dir, {recursive: true});

			// Write file
			yield* fs.writeFileString(fullPath, file.content);
		}
	});

/**
 * Writes files and emits progress events as a stream.
 */
export const writeFilesWithProgress = (rootDir: string, files: GeneratedFile[]) =>
	Stream.asyncEffect<ProgressEvent, PlatformError, FileSystem.FileSystem | Path.Path>((emit) =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;

			for (const file of files) {
				const fullPath = path.join(rootDir, file.path);
				const dir = path.dirname(fullPath);

				// Ensure directory exists
				yield* fs.makeDirectory(dir, {recursive: true});

				// Write file
				yield* fs.writeFileString(fullPath, file.content);

				// Emit progress
				emit.single({type: "file_written", path: file.path});
			}

			emit.end();
		}),
	);

/**
 * Updates existing project files (index.ts, wrangler.jsonc, package.json).
 */
export const updateIntegrations = (rootDir: string, naming: Naming) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		// Update worker index.ts
		const indexPath = path.join(rootDir, "apps/worker/src/index.ts");
		const indexContent = yield* fs.readFileString(indexPath);
		const updatedIndex = updateWorkerIndex(naming, indexContent);
		yield* fs.writeFileString(indexPath, updatedIndex);

		// Update wrangler.jsonc
		const wranglerPath = path.join(rootDir, "apps/worker/wrangler.jsonc");
		const wranglerContent = yield* fs.readFileString(wranglerPath);
		const updatedWrangler = updateWranglerJsonc(naming, wranglerContent);
		yield* fs.writeFileString(wranglerPath, updatedWrangler);

		// Update worker package.json to add dependency
		const workerPackageJsonPath = path.join(rootDir, "apps/worker/package.json");
		const workerPackageJsonContent = yield* fs.readFileString(workerPackageJsonPath);
		const updatedWorkerPackageJson = updateWorkerPackageJson(naming, workerPackageJsonContent);
		yield* fs.writeFileString(workerPackageJsonPath, updatedWorkerPackageJson);
	});

/**
 * Main generator function that orchestrates the entire generation process.
 */
export const generate = (rootDir: string, options: GeneratorOptions, columns: Column[]) =>
	Effect.gen(function* () {
		const naming = deriveNaming(options.featureName, options.table, options.idPrefix);

		// Generate file contents
		const files = generateFiles(naming, columns);

		if (options.dryRun) {
			// Just return the files that would be created
			return {naming, files, written: false};
		}

		// Write files to disk
		yield* writeFiles(rootDir, files);

		// Update integrations (unless skipped)
		if (!options.skipIndex || !options.skipWrangler) {
			yield* updateIntegrations(rootDir, naming);
		}

		return {naming, files, written: true};
	});

/**
 * Generator that emits progress events as a stream.
 * Used by TUI to show real-time progress.
 */
export const generateWithProgress = (
	rootDir: string,
	options: GeneratorOptions,
	columns: Column[],
) =>
	Stream.asyncEffect<ProgressEvent, PlatformError, FileSystem.FileSystem | Path.Path>((emit) =>
		Effect.gen(function* () {
			const naming = deriveNaming(options.featureName, options.table, options.idPrefix);
			const files = generateFiles(naming, columns);

			if (options.dryRun) {
				// Just emit complete with files that would be created
				emit.single({type: "complete", naming, files});
				emit.end();
				return;
			}

			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;

			// Write each file and emit progress
			for (const file of files) {
				const fullPath = path.join(rootDir, file.path);
				const dir = path.dirname(fullPath);

				yield* fs.makeDirectory(dir, {recursive: true});
				yield* fs.writeFileString(fullPath, file.content);
				emit.single({type: "file_written", path: file.path});
			}

			// Update integrations
			if (!options.skipIndex || !options.skipWrangler) {
				const indexPath = path.join(rootDir, "apps/worker/src/index.ts");
				const indexContent = yield* fs.readFileString(indexPath);
				const updatedIndex = updateWorkerIndex(naming, indexContent);
				yield* fs.writeFileString(indexPath, updatedIndex);
				emit.single({type: "integration_updated", name: "apps/worker/src/index.ts"});

				const wranglerPath = path.join(rootDir, "apps/worker/wrangler.jsonc");
				const wranglerContent = yield* fs.readFileString(wranglerPath);
				const updatedWrangler = updateWranglerJsonc(naming, wranglerContent);
				yield* fs.writeFileString(wranglerPath, updatedWrangler);
				emit.single({type: "integration_updated", name: "apps/worker/wrangler.jsonc"});

				const workerPackageJsonPath = path.join(rootDir, "apps/worker/package.json");
				const workerPackageJsonContent = yield* fs.readFileString(workerPackageJsonPath);
				const updatedWorkerPackageJson = updateWorkerPackageJson(naming, workerPackageJsonContent);
				yield* fs.writeFileString(workerPackageJsonPath, updatedWorkerPackageJson);
				emit.single({type: "integration_updated", name: "apps/worker/package.json"});
			}

			emit.single({type: "complete", naming, files});
			emit.end();
		}),
	);
