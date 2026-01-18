import {applyEdits, modify, parseTree} from "jsonc-parser";
import type {Column, Naming} from "./types";

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
	const sortedDeps = Object.fromEntries(
		Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)),
	);
	pkg.dependencies = sortedDeps;

	return `${JSON.stringify(pkg, null, "\t")}\n`;
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
		const line = lines[i];
		if (line?.match(/^export \{.+\} from "\.\/features\/.+";$/)) {
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
			return num?.[1] ? Number.parseInt(num[1], 10) : 0;
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

/**
 * Updates graphql/resolvers/index.ts to export the new client.
 * Returns the updated file content.
 */
export const updateGraphqlResolversIndex = (naming: Naming, content: string): string => {
	const exportLine = `export {${naming.className}Client} from "./${naming.className}Client";`;

	// Check if export already exists
	if (content.includes(exportLine)) {
		return content;
	}

	const lines = content.split("\n");

	// Find last export line
	let lastExportIndex = -1;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line?.match(/^export \{.+\} from ".+";$/)) {
			lastExportIndex = i;
		}
	}

	if (lastExportIndex === -1) {
		// No existing exports, append at end
		lines.push(exportLine);
	} else {
		// Insert after the last export
		lines.splice(lastExportIndex + 1, 0, exportLine);
	}

	return lines.join("\n");
};

/**
 * Maps a column type to a GraphQL type string.
 */
const columnTypeToGraphQL = (type: Column["type"], nullable: boolean): string => {
	const graphQLType = {
		text: "GraphQLString",
		integer: "GraphQLInt",
		boolean: "GraphQLBoolean",
		timestamp: "GraphQLString",
	}[type];

	return nullable ? graphQLType : `new GraphQLNonNull(${graphQLType})`;
};

/**
 * Generates the GraphQL type definition code for a feature.
 * This is meant to be manually added to schema.ts.
 */
export const generateGraphQLTypeCode = (naming: Naming, columns: Column[]): string => {
	const fieldDefs = columns
		.map((col) => {
			const graphQLType = columnTypeToGraphQL(col.type, col.nullable);
			return `		${col.name}: {type: ${graphQLType}},`;
		})
		.join("\n");

	return `// TODO: Add this to apps/worker/src/graphql/schema.ts

const ${naming.className}Type = new GraphQLObjectType({
	name: "${naming.className}",
	fields: () => ({
		id: {type: new GraphQLNonNull(GraphQLID)},
${fieldDefs}
		createdAt: {type: new GraphQLNonNull(GraphQLString)},
		updatedAt: {type: GraphQLString},
	}),
});

// Add to schema types array:
// types: [..., ${naming.className}Type]
`;
};

/**
 * Updates worker/src/index.ts to add an RPC route for the feature.
 * Inserts the route after the last RPC route (app.all("/rpc/...", ...)).
 * Returns the updated file content.
 */
export const updateWorkerIndexWithRoute = (naming: Naming, content: string): string => {
	const routePattern = `app.all("/rpc/${naming.featureName}/*"`;

	// Check if route already exists
	if (content.includes(routePattern)) {
		return content;
	}

	const routeCode = `
// RPC endpoint - auth + route to ${naming.className} DO
app.all("/rpc/${naming.featureName}/*", async (c) => {
	try {
		const pasaport = c.env.PASAPORT.getByName("kampus");
		const sessionData = await pasaport.validateSession(c.req.raw.headers);

		if (!sessionData?.user) {
			return c.json({error: "Unauthorized"}, 401);
		}

		// Route to user's ${naming.className} DO
		const ${naming.featureName.replace(/-/g, "")}Id = c.env.${naming.bindingName}.idFromName(sessionData.user.id);
		const ${naming.featureName.replace(/-/g, "")} = c.env.${naming.bindingName}.get(${naming.featureName.replace(/-/g, "")}Id);

		return ${naming.featureName.replace(/-/g, "")}.fetch(c.req.raw);
	} catch (error) {
		console.error("RPC error:", error);
		return c.json({error: "Internal server error"}, 500);
	}
});`;

	const lines = content.split("\n");

	// Find the last RPC route (app.all("/rpc/...")) closing brace
	let lastRpcEndIndex = -1;
	let braceCount = 0;
	let inRpcRoute = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";

		// Start of an RPC route
		if (line.includes('app.all("/rpc/')) {
			inRpcRoute = true;
			braceCount = 0;
		}

		if (inRpcRoute) {
			// Count braces
			for (const char of line) {
				if (char === "{") braceCount++;
				if (char === "}") braceCount--;
			}

			// When braces balance and we see });, we've found the end
			if (braceCount === 0 && line.includes("});")) {
				lastRpcEndIndex = i;
				inRpcRoute = false;
			}
		}
	}

	if (lastRpcEndIndex === -1) {
		// No existing RPC route, find app definition and add after it
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			if (line.includes("const app = new Hono")) {
				lastRpcEndIndex = i;
				break;
			}
		}
	}

	// Insert the route code after the last RPC route
	lines.splice(lastRpcEndIndex + 1, 0, routeCode);

	return lines.join("\n");
};
