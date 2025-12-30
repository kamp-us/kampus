# Design: Relay Node Interface

Derived from [requirements.md](./requirements.md).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GraphQL Schema                           │
├─────────────────────────────────────────────────────────────────┤
│  interface Node { id: ID! }                                     │
│  type Story implements Node { id: ID!, url: String, ... }       │
│  type Query { node(id: ID!): Node, ... }                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Node Query Resolver                          │
├─────────────────────────────────────────────────────────────────┤
│  1. Decode global ID → { type: "Story", id: "story_abc" }       │
│  2. Get userId from context.pasaport.user.id                    │
│  3. Route to appropriate fetcher based on type                  │
│  4. Return node with __typename for type resolution             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Library DO                                 │
├─────────────────────────────────────────────────────────────────┤
│  getStory(id) → Story | null                                    │
│  getTag(id)   → Tag | null  (future)                            │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
apps/worker/src/
├── graphql/
│   └── relay.ts              # NEW: Global ID utilities
├── index.ts                   # MODIFY: Add Node types and query
└── features/
    └── library/
        └── Library.ts         # UNCHANGED: Already has getStory()
```

## Component Design

### 1. Global ID Utilities (`graphql/relay.ts`)

```typescript
// apps/worker/src/graphql/relay.ts

/**
 * Encodes a type and local ID into a globally unique, opaque ID.
 * Format: base64("Type:localId")
 */
export function encodeGlobalId(type: string, id: string): string {
  return btoa(`${type}:${id}`);
}

/**
 * Decodes a global ID into its type and local ID components.
 * Returns null for malformed IDs (graceful degradation).
 */
export function decodeGlobalId(globalId: string): {type: string; id: string} | null {
  try {
    const decoded = atob(globalId);
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return null;

    const type = decoded.slice(0, colonIndex);
    const id = decoded.slice(colonIndex + 1);

    if (!type || !id) return null;
    return {type, id};
  } catch {
    return null;
  }
}

/**
 * Type-safe node type constants.
 * Add new types here as they implement Node.
 */
export const NodeType = {
  Story: "Story",
  // Tag: "Tag",  // Future
} as const;

export type NodeTypeName = (typeof NodeType)[keyof typeof NodeType];
```

### 2. Node Interface Schema

```typescript
// In apps/worker/src/index.ts

import {silk} from "@gqloom/core";
import {asObjectType} from "@gqloom/effect";
import {GraphQLID, GraphQLInterfaceType, GraphQLNonNull} from "graphql";

// Node interface - using native GraphQL interface to avoid duplicate type issues
// When using Effect Schema for both interface declaration AND return type,
// GQLoom creates two types with the same name. Using native GraphQLInterfaceType
// and silk() avoids this.
const NodeInterface = new GraphQLInterfaceType({
  name: "Node",
  description: "An object with a globally unique ID",
  fields: () => ({
    id: {type: new GraphQLNonNull(GraphQLID)},
  }),
});

// Story implements Node
const Story = Schema.Struct({
  __typename: Schema.optional(Schema.Literal("Story")),
  id: Schema.String,  // This will be the global ID
  url: Schema.String,
  title: Schema.String,
  createdAt: Schema.String,
}).annotations({
  title: "Story",
  [asObjectType]: {interfaces: [NodeInterface]},
});
```

### 3. Node Query Resolver

```typescript
// In apps/worker/src/index.ts

import {decodeGlobalId, NodeType} from "./graphql/relay";

const nodeResolver = resolver({
  node: query(silk.nullable(silk<{__typename: string; id: string}>(NodeInterface)))
    .input({
      id: standard(Schema.String),
    })
    .resolve(async ({id: globalId}) => {
      const ctx = useContext<GQLContext>();

      // Require authentication
      if (!ctx.pasaport.user?.id) {
        return null;
      }

      // Decode global ID
      const decoded = decodeGlobalId(globalId);
      if (!decoded) {
        return null;
      }

      // Get user's library
      const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
      const lib = ctx.env.LIBRARY.get(libraryId);

      // Route to appropriate fetcher
      switch (decoded.type) {
        case NodeType.Story: {
          const story = await lib.getStory(decoded.id);
          if (!story) return null;

          return {
            __typename: "Story" as const,
            id: globalId,  // Return the same global ID
            url: story.url,
            title: story.title,
            createdAt: story.createdAt,
          };
        }

        // Future node types:
        // case NodeType.Tag: { ... }

        default:
          return null;
      }
    }),
});
```

### 4. Story Resolver Modifications

All Story-returning resolvers must encode IDs:

```typescript
import {encodeGlobalId, NodeType} from "./graphql/relay";

// Helper to transform story with global ID
function toStoryNode(story: {id: string; url: string; title: string; createdAt: string}) {
  return {
    __typename: "Story" as const,
    id: encodeGlobalId(NodeType.Story, story.id),
    url: story.url,
    title: story.title,
    createdAt: story.createdAt,
  };
}

// In libraryResolver.stories field
return {
  edges: result.edges.map((story) => ({
    node: toStoryNode(story),
    cursor: encodeGlobalId(NodeType.Story, story.id),  // Cursors also use global IDs
  })),
  // ...
};

// In storyResolver.createStory
return {
  story: toStoryNode(story),
};
```

### 5. Mutation Input Handling

Mutations that accept Story IDs must decode them:

```typescript
// In storyResolver.updateStory
.resolve(async ({id: globalId, title}) => {
  const ctx = useContext<GQLContext>();
  if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

  // Decode global ID
  const decoded = decodeGlobalId(globalId);
  if (!decoded || decoded.type !== NodeType.Story) {
    return {
      story: null,
      error: {
        code: "STORY_NOT_FOUND" as const,
        message: `Invalid story ID: "${globalId}"`,
        storyId: globalId,
      },
    };
  }

  const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
  const lib = ctx.env.LIBRARY.get(libraryId);
  const story = await lib.updateStory(decoded.id, {title: title ?? undefined});

  // ... rest of resolver
});
```

## Schema Weaving

```typescript
const schema = weave(
  EffectWeaver,
  asyncContextProvider,
  helloResolver,
  userResolver,
  libraryResolver,
  storyResolver,
  nodeResolver,  // Add node resolver
);
```

## Expected GraphQL Schema Output

```graphql
interface Node {
  id: ID!
}

type Story implements Node {
  id: ID!
  url: String!
  title: String!
  createdAt: String!
}

type Query {
  node(id: ID!): Node
  me: User!
  # ... other queries
}
```

## Type Resolution

GQLoom resolves interface types using the `__typename` field:

1. Node query returns object with `__typename: "Story"`
2. GQLoom/GraphQL sees `__typename` and resolves to Story type
3. Client can use inline fragments: `... on Story { url title }`

This is the standard GraphQL pattern and requires no custom `resolveType` function.

## Error Handling Strategy

| Scenario | Behavior |
|----------|----------|
| Unauthenticated user | Return `null` |
| Malformed global ID | Return `null` |
| Unknown node type | Return `null` |
| Node not found | Return `null` |
| Node belongs to other user | Return `null` (implicit, since we only query user's library) |

All error cases return `null` per Relay spec - the `node` query is nullable by design.

## Migration Strategy

### Breaking Change: Story IDs

Story IDs will change from local IDs (`story_abc123`) to global IDs (`U3RvcnlAc3RvcnlfYWJjMTIz`).

**Impact:**
- Frontend must update any hardcoded story ID references
- Existing bookmarks/links with story IDs will break

**Mitigation:**
- This is an early-stage project, breaking changes are acceptable
- No migration path needed

## Testing Strategy

### Unit Tests (relay.ts)

```typescript
describe("encodeGlobalId", () => {
  it("encodes type and id to base64", () => {
    expect(encodeGlobalId("Story", "story_abc")).toBe("U3Rvcnk6c3RvcnlfYWJj");
  });
});

describe("decodeGlobalId", () => {
  it("decodes valid global ID", () => {
    expect(decodeGlobalId("U3Rvcnk6c3RvcnlfYWJj")).toEqual({
      type: "Story",
      id: "story_abc",
    });
  });

  it("returns null for invalid base64", () => {
    expect(decodeGlobalId("not-valid-base64!!!")).toBeNull();
  });

  it("returns null for missing colon", () => {
    expect(decodeGlobalId(btoa("nocolon"))).toBeNull();
  });
});
```

### Integration Tests (node query)

```typescript
describe("node query", () => {
  it("returns story by global ID", async () => {
    // Create story, get ID
    // Query node(id: storyId)
    // Assert returns Story with matching data
  });

  it("returns null for nonexistent story", async () => {
    const fakeId = encodeGlobalId("Story", "story_nonexistent");
    // Query node(id: fakeId)
    // Assert returns null
  });

  it("returns null when unauthenticated", async () => {
    // Query node without auth headers
    // Assert returns null
  });
});
```

## Frontend Usage

After implementation, fragments can use `@refetchable`:

```tsx
// apps/kamp-us/src/components/StoryCard.tsx
import {graphql, useRefetchableFragment} from "react-relay";

const StoryCardFragment = graphql`
  fragment StoryCard_story on Story @refetchable(queryName: "StoryCardRefetchQuery") {
    id
    title
    url
    createdAt
  }
`;

function StoryCard({storyRef}) {
  const [data, refetch] = useRefetchableFragment(StoryCardFragment, storyRef);

  const handleRefresh = () => {
    refetch({}, {fetchPolicy: "network-only"});
  };

  return (
    <div>
      <h2>{data.title}</h2>
      <a href={data.url}>{data.url}</a>
      <button onClick={handleRefresh}>Refresh</button>
    </div>
  );
}
```

Relay generates `StoryCardRefetchQuery` automatically:

```graphql
query StoryCardRefetchQuery($id: ID!) {
  node(id: $id) {
    ...StoryCard_story
  }
}
```

## Decisions & Trade-offs

### Decision 1: User-scoped node lookups

**Choice:** Node query only searches authenticated user's Library DO.

**Trade-off:** Cannot fetch other users' public content via `node()`.

**Rationale:**
- Simplest implementation, no additional storage
- Implicit authorization (can only fetch own data)
- Public/shared content not in current scope
- Can extend later if needed

### Decision 2: Graceful null for all errors

**Choice:** Return `null` for any error (auth, decode, not found).

**Trade-off:** No error details in response.

**Rationale:**
- Relay spec expects nullable `node` query
- Reduces information leakage (can't probe for existence)
- Consistent behavior simplifies client code

### Decision 3: No batch `nodes` query

**Choice:** Only implement `node(id)`, not `nodes(ids)`.

**Trade-off:** Multiple fetches for multiple nodes.

**Rationale:**
- YAGNI - `@refetchable` only uses single-node query
- Can add later if performance requires
- Simpler initial implementation

## Appendix: GQLoom Interface Pattern Reference

From GQLoom Effect Schema docs:

```typescript
import {Schema} from "effect";
import {asObjectType} from "@gqloom/effect";

// Interface definition
const Node = Schema.Struct({
  __typename: Schema.optional(Schema.Literal("Node")),
  id: Schema.String,
}).annotations({
  title: "Node",
  description: "An object with a globally unique ID",
});

// Implementation
const Story = Schema.Struct({
  __typename: Schema.optional(Schema.Literal("Story")),
  id: Schema.String,
  // additional fields...
}).annotations({
  title: "Story",
  [asObjectType]: {interfaces: [Node]},
});
```

Key points:
- `__typename` as optional literal enables type resolution
- `asObjectType` symbol from `@gqloom/effect` for metadata
- `interfaces` array references the interface schema
