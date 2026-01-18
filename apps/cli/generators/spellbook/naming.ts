import type {Naming} from "./types";

export const deriveNaming = (
	featureName: string,
	tableOverride?: string,
	idPrefixOverride?: string,
): Naming => {
	const className = featureName
		.split("-")
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join("");

	const tableName = tableOverride ?? featureName.replace(/-/g, "_");

	const bindingName = tableName.toUpperCase();

	const idPrefix =
		idPrefixOverride ??
		featureName
			.split("-")
			.map((s) => s.charAt(0))
			.join("")
			.slice(0, 4);

	return {
		featureName,
		className,
		tableName,
		bindingName,
		idPrefix,
		packageName: `@kampus/${featureName}`,
	};
};
