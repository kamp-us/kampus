import {applyEdits, modify, parseTree} from "jsonc-parser";
import type {Naming} from "./types";

/**
 * Updates worker's package.json to add the new package as a dependency.
 * Returns the updated file content.
 */
export const updateWorkerPackageJson = (naming: Naming, content: string): string => {
	const pkg = JSON.parse(content);
	const depKey = naming.packageName;

	// Check if already exists
	if (pkg.dependencies?.[depKey]) {
		return content;
	}

	// Add dependency
	if (!pkg.dependencies) {
		pkg.dependencies = {};
	}
	pkg.dependencies[depKey] = "workspace:*";

	// Sort dependencies alphabetically for consistency
	const sortedDeps = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)));
	pkg.dependencies = sortedDeps;

	return JSON.stringify(pkg, null, "\t") + "\n";
};

/**
 * Updates worker/src/index.ts to export the new DO class.
 * Returns the updated file content.
 */
export const updateWorkerIndex = (naming: Naming, content: string): string => {
	const exportLine = `export {${naming.className}} from "./features/${naming.featureName}/${naming.className}";`;

	// Check if export already exists
	if (content.includes(exportLine)) {
		return content;
	}

	const lines = content.split("\n");

	// Find the last feature export line (export {X} from "./features/...)
	let lastExportIndex = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].match(/^export \{.+\} from "\.\/features\/.+";$/)) {
			lastExportIndex = i;
		}
	}

	if (lastExportIndex === -1) {
		// No existing exports, find the first empty line after imports
		for (let i = 0; i < lines.length; i++) {
			if (lines[i] === "" && i > 0) {
				lastExportIndex = i - 1;
				break;
			}
		}
	}

	// Insert after the last export
	lines.splice(lastExportIndex + 1, 0, exportLine);

	return lines.join("\n");
};

/**
 * Updates wrangler.jsonc to add DO binding and migration.
 * Preserves comments using jsonc-parser.
 * Returns the updated file content.
 */
export const updateWranglerJsonc = (naming: Naming, content: string): string => {
	const tree = parseTree(content);
	if (!tree) {
		throw new Error("Failed to parse wrangler.jsonc");
	}

	const formatOptions = {
		tabSize: 1,
		insertSpaces: false,
	};

	// Add to durable_objects.bindings
	const newBinding = {
		name: naming.bindingName,
		class_name: naming.className,
	};

	let edits = modify(content, ["durable_objects", "bindings", -1], newBinding, {
		formattingOptions: formatOptions,
	});
	content = applyEdits(content, edits);

	// Parse the migrations to find the last tag
	const updatedTree = parseTree(content);
	if (!updatedTree) {
		throw new Error("Failed to parse updated wrangler.jsonc");
	}

	// Find migrations array to determine next tag
	let nextTagNumber = 1;
	const migrationsMatch = content.match(/"tag":\s*"v(\d+)"/g);
	if (migrationsMatch) {
		const tagNumbers = migrationsMatch.map((m) => {
			const num = m.match(/v(\d+)/);
			return num ? Number.parseInt(num[1], 10) : 0;
		});
		nextTagNumber = Math.max(...tagNumbers) + 1;
	}

	// Add new migration
	const newMigration = {
		tag: `v${nextTagNumber}`,
		new_sqlite_classes: [naming.className],
	};

	edits = modify(content, ["migrations", -1], newMigration, {
		formattingOptions: formatOptions,
	});
	content = applyEdits(content, edits);

	return content;
};
