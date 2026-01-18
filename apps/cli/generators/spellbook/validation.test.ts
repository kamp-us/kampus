import {describe, expect, test} from "bun:test";
import {FileSystem} from "@effect/platform";
import {Cause, Effect, Exit} from "effect";
import {
	checkFeatureExists,
	FeatureExistsError,
	InvalidFeatureNameError,
	validateFeatureName,
} from "./validation";

describe("validateFeatureName", () => {
	test("accepts valid kebab-case", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("book-shelf"));
		expect(Exit.isSuccess(exit)).toBe(true);
	});

	test("accepts single word", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("library"));
		expect(Exit.isSuccess(exit)).toBe(true);
	});

	test("accepts kebab-case with numbers", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("feature2"));
		expect(Exit.isSuccess(exit)).toBe(true);
	});

	test("accepts numbers in middle segment", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("auth2-service"));
		expect(Exit.isSuccess(exit)).toBe(true);
	});

	test("rejects PascalCase", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("BookShelf"));
		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const failure = Cause.failureOption(exit.cause);
			expect(failure._tag).toBe("Some");
			if (failure._tag === "Some") {
				expect(failure.value).toBeInstanceOf(InvalidFeatureNameError);
			}
		}
	});

	test("rejects snake_case", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("book_shelf"));
		expect(Exit.isFailure(exit)).toBe(true);
	});

	test("rejects leading number", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("2feature"));
		expect(Exit.isFailure(exit)).toBe(true);
	});

	test("rejects uppercase letters", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("Book-shelf"));
		expect(Exit.isFailure(exit)).toBe(true);
	});

	test("rejects trailing hyphen", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("book-shelf-"));
		expect(Exit.isFailure(exit)).toBe(true);
	});

	test("rejects leading hyphen", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("-book-shelf"));
		expect(Exit.isFailure(exit)).toBe(true);
	});

	test("rejects double hyphens", async () => {
		const exit = await Effect.runPromiseExit(validateFeatureName("book--shelf"));
		expect(Exit.isFailure(exit)).toBe(true);
	});
});

describe("checkFeatureExists", () => {
	// Helper to create mock that finds monorepo root and then checks feature paths
	const makeTestLayer = (featureCheck: (path: string) => boolean) =>
		FileSystem.layerNoop({
			exists: (path) => {
				// pnpm-workspace.yaml check for finding monorepo root
				if (path.includes("pnpm-workspace.yaml")) {
					return Effect.succeed(true);
				}
				// Feature path checks
				return Effect.succeed(featureCheck(path));
			},
		});

	test("passes when feature does not exist", async () => {
		const testLayer = makeTestLayer(() => false);

		const exit = await Effect.runPromiseExit(
			checkFeatureExists("new-feature").pipe(Effect.provide(testLayer)),
		);
		expect(Exit.isSuccess(exit)).toBe(true);
	});

	test("fails when package path exists", async () => {
		const testLayer = makeTestLayer((path) => path.includes("packages/existing"));

		const exit = await Effect.runPromiseExit(
			checkFeatureExists("existing").pipe(Effect.provide(testLayer)),
		);
		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const failure = Cause.failureOption(exit.cause);
			expect(failure._tag).toBe("Some");
			if (failure._tag === "Some") {
				expect(failure.value).toBeInstanceOf(FeatureExistsError);
				expect((failure.value as FeatureExistsError).existingPath).toContain("packages/");
			}
		}
	});

	test("fails when worker path exists", async () => {
		const testLayer = makeTestLayer((path) => path.includes("apps/worker/src/features/existing"));

		const exit = await Effect.runPromiseExit(
			checkFeatureExists("existing").pipe(Effect.provide(testLayer)),
		);
		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const failure = Cause.failureOption(exit.cause);
			expect(failure._tag).toBe("Some");
			if (failure._tag === "Some") {
				expect(failure.value).toBeInstanceOf(FeatureExistsError);
				expect((failure.value as FeatureExistsError).existingPath).toContain(
					"apps/worker/src/features/",
				);
			}
		}
	});

	test("checks package path before worker path", async () => {
		const checkOrder: string[] = [];
		const testLayer = FileSystem.layerNoop({
			exists: (path) => {
				checkOrder.push(path);
				if (path.includes("pnpm-workspace.yaml")) {
					return Effect.succeed(true);
				}
				return Effect.succeed(false);
			},
		});

		await Effect.runPromiseExit(checkFeatureExists("test-feature").pipe(Effect.provide(testLayer)));

		// Should check paths in order: workspace marker, package, worker
		const packageCheck = checkOrder.findIndex((p) => p.includes("packages/"));
		const workerCheck = checkOrder.findIndex((p) => p.includes("apps/worker"));
		expect(packageCheck).toBeLessThan(workerCheck);
	});
});
