export type ColumnType = "text" | "integer" | "boolean" | "timestamp";

export interface Column {
	name: string;
	type: ColumnType;
	nullable: boolean;
}

export interface Naming {
	featureName: string; // book-shelf (original kebab-case)
	className: string; // BookShelf (PascalCase)
	tableName: string; // book_shelf (snake_case)
	bindingName: string; // BOOK_SHELF (SCREAMING_SNAKE)
	idPrefix: string; // bs (first char of each word)
	packageName: string; // @kampus/book-shelf
}

export interface GeneratorOptions {
	featureName: string;
	table?: string;
	idPrefix?: string;
	skipWrangler: boolean;
	skipIndex: boolean;
	skipDrizzle: boolean;
	withTest: boolean;
	withGraphql: boolean;
	withRoute: boolean;
	withAll: boolean;
	dryRun: boolean;
}
