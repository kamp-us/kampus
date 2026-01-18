import type {Column, Naming} from "../types";

/**
 * Maps column type to Effect Schema type string
 */
export const columnTypeToSchema = (type: Column["type"], nullable: boolean): string => {
	const baseType = {
		text: "Schema.String",
		integer: "Schema.Int",
		boolean: "Schema.Boolean",
		timestamp: "Schema.String",
	}[type];

	return nullable ? `Schema.NullOr(${baseType})` : baseType;
};

export const packageJson = (naming: Naming): string => `{
	"name": "${naming.packageName}",
	"version": "0.0.1",
	"private": true,
	"type": "module",
	"exports": {
		".": {
			"types": "./src/index.ts",
			"default": "./src/index.ts"
		}
	},
	"dependencies": {
		"@effect/rpc": "catalog:",
		"effect": "catalog:"
	}
}
`;

export const tsconfigJson = (): string => `{
	"compilerOptions": {
		"target": "es2024",
		"lib": ["es2024"],
		"module": "es2022",
		"moduleResolution": "Bundler",
		"resolveJsonModule": true,
		"allowJs": true,
		"checkJs": false,
		"noEmit": true,
		"isolatedModules": true,
		"allowSyntheticDefaultImports": true,
		"forceConsistentCasingInFileNames": true,
		"strict": true,
		"skipLibCheck": true
	},
	"include": ["src/**/*.ts"]
}
`;

export const indexTs = (naming: Naming): string => `export * from "./errors.js";
export {${naming.className}Rpcs} from "./rpc.js";
export * from "./schema.js";
`;

export const errorsTs = (): string => `// Add custom errors for this feature here.
// Example:
// import {Schema} from "effect";
// export class MyError extends Schema.TaggedError<MyError>()("MyError", {
// 	message: Schema.String,
// }) {}

// Placeholder export to make this a valid module
export {};
`;

export const schemaTs = (naming: Naming, columns: Column[]): string => {
	const columnFields = columns
		.map((col) => `\t${col.name}: ${columnTypeToSchema(col.type, col.nullable)},`)
		.join("\n");

	return `import {Schema} from "effect";

export const ${naming.className} = Schema.Struct({
	id: Schema.String,
${columnFields}
	createdAt: Schema.String,
	updatedAt: Schema.NullOr(Schema.String),
});

export type ${naming.className} = typeof ${naming.className}.Type;
`;
};

export const rpcTs = (naming: Naming): string => `import {Rpc, RpcGroup} from "@effect/rpc";
import {Schema} from "effect";
import {${naming.className}} from "./schema.js";

export const ${naming.className}Rpcs = RpcGroup.make(
	Rpc.make("get${naming.className}", {
		payload: {id: Schema.String},
		success: Schema.NullOr(${naming.className}),
	}),

	Rpc.make("list${naming.className}s", {
		payload: Schema.Void,
		success: Schema.Array(${naming.className}),
	}),
);

export type ${naming.className}Rpcs = typeof ${naming.className}Rpcs;
`;
