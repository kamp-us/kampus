import {FileSystem} from "@effect/platform";
import {Data, Effect} from "effect";

export class FeatureExistsError extends Data.TaggedError("FeatureExistsError")<{
	featureName: string;
	existingPath: string;
}> {}

export class InvalidFeatureNameError extends Data.TaggedError("InvalidFeatureNameError")<{
	featureName: string;
	reason: string;
}> {}

const KEBAB_CASE_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const validateFeatureName = (name: string) =>
	Effect.gen(function* () {
		if (!KEBAB_CASE_REGEX.test(name)) {
			return yield* Effect.fail(
				new InvalidFeatureNameError({
					featureName: name,
					reason: "Must be kebab-case (e.g., 'book-shelf', 'user-profile')",
				}),
			);
		}
		return name;
	});

const findMonorepoRoot = (fs: FileSystem.FileSystem) =>
	Effect.gen(function* () {
		let dir = process.cwd();
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const markerPath = `${dir}/pnpm-workspace.yaml`;
			const exists = yield* fs.exists(markerPath);
			if (exists) return dir;

			const parent = dir.substring(0, dir.lastIndexOf("/"));
			if (parent === dir || parent === "") {
				return yield* Effect.fail(
					new Error("Could not find monorepo root (pnpm-workspace.yaml)"),
				);
			}
			dir = parent;
		}
	});

export const checkFeatureExists = (featureName: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const root = yield* findMonorepoRoot(fs);
		const packagePath = `${root}/packages/${featureName}`;
		const workerPath = `${root}/apps/worker/src/features/${featureName}`;

		const packageExists = yield* fs.exists(packagePath);
		if (packageExists) {
			return yield* Effect.fail(
				new FeatureExistsError({
					featureName,
					existingPath: `packages/${featureName}`,
				}),
			);
		}

		const workerExists = yield* fs.exists(workerPath);
		if (workerExists) {
			return yield* Effect.fail(
				new FeatureExistsError({
					featureName,
					existingPath: `apps/worker/src/features/${featureName}`,
				}),
			);
		}

		return true;
	});
