import {
	GraphQLBoolean,
	GraphQLInt,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLString,
} from "graphql";

/**
 * Relay-spec PageInfo type for cursor-based pagination.
 */
export const PageInfoType = new GraphQLObjectType({
	name: "PageInfo",
	fields: {
		hasNextPage: {type: new GraphQLNonNull(GraphQLBoolean)},
		hasPreviousPage: {type: new GraphQLNonNull(GraphQLBoolean)},
		startCursor: {type: GraphQLString},
		endCursor: {type: GraphQLString},
	},
});

/**
 * Factory for creating Relay-style Edge and Connection types.
 */
export const createConnectionTypes = <TNode extends GraphQLObjectType>(
	nodeName: string,
	nodeType: TNode,
) => {
	const EdgeType = new GraphQLObjectType({
		name: `${nodeName}Edge`,
		fields: {
			node: {type: new GraphQLNonNull(nodeType)},
			cursor: {type: new GraphQLNonNull(GraphQLString)},
		},
	});

	const ConnectionType = new GraphQLObjectType({
		name: `${nodeName}Connection`,
		fields: {
			edges: {type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(EdgeType)))},
			pageInfo: {type: new GraphQLNonNull(PageInfoType)},
			totalCount: {type: new GraphQLNonNull(GraphQLInt)},
		},
	});

	return {EdgeType, ConnectionType};
};

/**
 * Transform RPC paginated response to Relay connection format.
 */
export const toConnection = <T extends {id: string}>(data: {
	readonly stories: readonly T[];
	readonly hasNextPage: boolean;
	readonly endCursor: string | null;
	readonly totalCount: number;
}) => ({
	edges: data.stories.map((node) => ({
		node,
		cursor: node.id,
	})),
	pageInfo: {
		hasNextPage: data.hasNextPage,
		hasPreviousPage: false, // not implemented
		startCursor: data.stories[0]?.id ?? null,
		endCursor: data.endCursor,
	},
	totalCount: data.totalCount,
});
