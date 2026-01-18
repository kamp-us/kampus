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

export const checkFeatureExists = (featureName: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const packagePath = `packages/${featureName}`;
		const workerPath = `apps/worker/src/features/${featureName}`;

		const packageExists = yield* fs.exists(packagePath);
		if (packageExists) {
			return yield* Effect.fail(
				new FeatureExistsError({
					featureName,
					existingPath: packagePath,
				}),
			);
		}

		const workerExists = yield* fs.exists(workerPath);
		if (workerExists) {
			return yield* Effect.fail(
				new FeatureExistsError({
					featureName,
					existingPath: workerPath,
				}),
			);
		}

		return true;
	});
