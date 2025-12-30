# Implementation Plan: Relay Node Interface

Derived from [design.md](./design.md).

## Progress Tracker

| Task | Status |
|------|--------|
| 1. Create relay.ts utilities | ✅ Complete |
| 2. Define Node interface schema | ✅ Complete |
| 3. Update Story to implement Node | ✅ Complete |
| 4. Create node query resolver | ✅ Complete |
| 5. Update Story resolvers to use global IDs | ✅ Complete |
| 6. Update mutation input handling | ✅ Complete |
| 7. Add nodeResolver to schema weave | ✅ Complete |
| 8. Run type check and lint | ✅ Complete |
| 9. Run tests | ✅ Complete (34 passed) |
| 10. Test frontend schema fetch | ✅ Complete - Node interface working with Relay |

## Implementation Tasks

### Task 1: Create relay.ts utilities

**File:** `apps/worker/src/graphql/relay.ts` (NEW)

**Actions:**
1. Create `apps/worker/src/graphql/` directory
2. Create `relay.ts` with:
   - `encodeGlobalId(type: string, id: string): string`
   - `decodeGlobalId(globalId: string): {type: string; id: string} | null`
   - `NodeType` constant object
   - `NodeTypeName` type export

**Code:**
```typescript
export function encodeGlobalId(type: string, id: string): string {
  return btoa(`${type}:${id}`);
}

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

export const NodeType = {
  Story: "Story",
} as const;

export type NodeTypeName = (typeof NodeType)[keyof typeof NodeType];
```

---

### Task 2: Define Node interface schema

**File:** `apps/worker/src/index.ts`

**Actions:**
1. Add import for `asObjectType` from `@gqloom/effect`
2. Add `Node` schema definition before `Story`

**Code:**
```typescript
import {asObjectType} from "@gqloom/effect";

const Node = Schema.Struct({
  __typename: Schema.optional(Schema.Literal("Node")),
  id: Schema.String,
}).annotations({
  title: "Node",
  description: "An object with a globally unique ID",
});
```

---

### Task 3: Update Story to implement Node

**File:** `apps/worker/src/index.ts`

**Actions:**
1. Add `__typename` field to Story schema
2. Add `[asObjectType]: {interfaces: [Node]}` annotation

**Before:**
```typescript
const Story = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  createdAt: Schema.String,
}).annotations({title: "Story"});
```

**After:**
```typescript
const Story = Schema.Struct({
  __typename: Schema.optional(Schema.Literal("Story")),
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  createdAt: Schema.String,
}).annotations({
  title: "Story",
  [asObjectType]: {interfaces: [Node]},
});
```

---

### Task 4: Create node query resolver

**File:** `apps/worker/src/index.ts`

**Actions:**
1. Add import for relay utilities
2. Create `nodeResolver` with `node` query

**Code:**
```typescript
import {decodeGlobalId, encodeGlobalId, NodeType} from "./graphql/relay";

const nodeResolver = resolver({
  node: query(standard(Schema.NullOr(Node)))
    .input({
      id: standard(Schema.String),
    })
    .resolve(async ({id: globalId}) => {
      const ctx = useContext<GQLContext>();

      if (!ctx.pasaport.user?.id) {
        return null;
      }

      const decoded = decodeGlobalId(globalId);
      if (!decoded) {
        return null;
      }

      const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
      const lib = ctx.env.LIBRARY.get(libraryId);

      switch (decoded.type) {
        case NodeType.Story: {
          const story = await lib.getStory(decoded.id);
          if (!story) return null;

          return {
            __typename: "Story" as const,
            id: globalId,
            url: story.url,
            title: story.title,
            createdAt: story.createdAt,
          };
        }
        default:
          return null;
      }
    }),
});
```

---

### Task 5: Update Story resolvers to use global IDs

**File:** `apps/worker/src/index.ts`

**Actions:**
1. Add helper function `toStoryNode`
2. Update `libraryResolver.stories` to use global IDs
3. Update `storyResolver.createStory` to use global IDs

**Helper:**
```typescript
function toStoryNode(story: {id: string; url: string; title: string; createdAt: string}) {
  return {
    __typename: "Story" as const,
    id: encodeGlobalId(NodeType.Story, story.id),
    url: story.url,
    title: story.title,
    createdAt: story.createdAt,
  };
}
```

**libraryResolver.stories changes:**
- `node: toStoryNode(story)` instead of inline object
- `cursor: encodeGlobalId(NodeType.Story, story.id)` for cursors
- Update `startCursor` and `endCursor` to use global IDs

**storyResolver.createStory changes:**
- Return `story: toStoryNode(story)`

---

### Task 6: Update mutation input handling

**File:** `apps/worker/src/index.ts`

**Actions:**
1. Update `updateStory` to decode global ID input
2. Update `deleteStory` to decode global ID input

**Pattern for both:**
```typescript
const decoded = decodeGlobalId(id);
if (!decoded || decoded.type !== NodeType.Story) {
  return { /* error response */ };
}
// Use decoded.id for Library DO call
```

---

### Task 7: Add nodeResolver to schema weave

**File:** `apps/worker/src/index.ts`

**Actions:**
1. Add `nodeResolver` to `weave()` call

**Before:**
```typescript
const schema = weave(
  EffectWeaver,
  asyncContextProvider,
  helloResolver,
  userResolver,
  libraryResolver,
  storyResolver,
);
```

**After:**
```typescript
const schema = weave(
  EffectWeaver,
  asyncContextProvider,
  helloResolver,
  userResolver,
  libraryResolver,
  storyResolver,
  nodeResolver,
);
```

---

### Task 8: Run type check and lint

**Commands:**
```bash
pnpm --filter worker exec tsc --noEmit
pnpm biome check --write apps/worker/src
```

**Expected:** No errors

---

### Task 9: Test node query manually

**Method:** Use GraphiQL at `/graphql`

**Test queries:**

1. Create a story and capture ID:
```graphql
mutation {
  createStory(url: "https://example.com", title: "Test") {
    story { id title }
  }
}
```

2. Fetch via node query:
```graphql
query {
  node(id: "<captured-id>") {
    ... on Story {
      id
      title
      url
    }
  }
}
```

3. Test invalid ID returns null:
```graphql
query {
  node(id: "invalid-id") {
    ... on Story { id }
  }
}
```

---

### Task 10: Test frontend schema fetch

**Commands:**
```bash
pnpm --filter kamp-us run schema:fetch
pnpm --filter kamp-us run relay
```

**Verify:**
- Schema includes `interface Node { id: ID! }`
- Schema includes `type Story implements Node`
- Schema includes `node(id: ID!): Node` query
- Relay compiler succeeds

---

## Verification Checklist

After all tasks complete:

- [ ] `apps/worker/src/graphql/relay.ts` exists with utilities
- [ ] GraphQL schema has Node interface
- [ ] Story type shows `implements Node` in SDL
- [ ] `node(id)` query works for Story
- [ ] All Story mutations accept global IDs
- [ ] Type check passes
- [ ] Lint passes
- [ ] Frontend schema fetch succeeds
- [ ] Relay compiler succeeds

## Rollback Plan

If issues arise during implementation:

1. All changes are in a single feature branch
2. No database migrations involved
3. Revert branch if needed: `git checkout main`

## Post-Implementation

After successful implementation:

1. Update `specs/README.md` to mark feature complete
2. Create PR for review
3. Test `@refetchable` on frontend (follow-up task)
