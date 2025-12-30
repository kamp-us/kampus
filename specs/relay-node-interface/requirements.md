# Requirements: Relay Node Interface

Derived from [instructions.md](./instructions.md).

## Functional Requirements

### FR-1: Node Interface Definition

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1.1 | Schema SHALL define a `Node` interface with a single `id: ID!` field | Must |
| FR-1.2 | Node interface SHALL use Effect Schema with `asObjectType` annotation pattern | Must |
| FR-1.3 | Interface SHALL include `__typename` literal for GQLoom type resolution | Must |

### FR-2: Story Type Implementation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-2.1 | `Story` type SHALL implement the Node interface | Must |
| FR-2.2 | Story's `id` field SHALL return a globally unique, opaque ID | Must |
| FR-2.3 | Story type SHALL declare Node as interface via `[asObjectType]: { interfaces: [Node] }` | Must |

### FR-3: Global ID Encoding

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-3.1 | Global IDs SHALL be base64-encoded strings in format `Type:localId` | Must |
| FR-3.2 | `encodeGlobalId(type: string, id: string): string` function SHALL encode IDs | Must |
| FR-3.3 | `decodeGlobalId(globalId: string): { type: string, id: string }` function SHALL decode IDs | Must |
| FR-3.4 | `decodeGlobalId` SHALL throw/return error for malformed IDs | Must |
| FR-3.5 | Utilities SHALL be exported from `apps/worker/src/graphql/relay.ts` | Must |

### FR-4: Node Query

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-4.1 | Schema SHALL expose `node(id: ID!): Node` query at root | Must |
| FR-4.2 | Query SHALL decode the global ID to extract type and local ID | Must |
| FR-4.3 | Query SHALL return `null` if user is not authenticated | Must |
| FR-4.4 | Query SHALL fetch from authenticated user's Library DO | Must |
| FR-4.5 | Query SHALL return `null` if node not found in user's library | Must |
| FR-4.6 | Query SHALL resolve correct concrete type (Story returns as Story) | Must |
| FR-4.7 | Query SHALL return `null` for unknown/unsupported node types | Should |

### FR-5: Resolver Integration

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-5.1 | Story resolver SHALL encode `id` field using `encodeGlobalId("Story", localId)` | Must |
| FR-5.2 | All Story queries/mutations SHALL return encoded global IDs | Must |
| FR-5.3 | Mutations accepting Story IDs SHALL accept global IDs and decode them | Must |

## Non-Functional Requirements

### NFR-1: Performance

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1.1 | Global ID encoding/decoding SHALL have O(1) complexity | Must |
| NFR-1.2 | Node query SHALL require at most one DO RPC call | Should |

### NFR-2: Compatibility

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-2.1 | Implementation SHALL work with GQLoom's `EffectWeaver` | Must |
| NFR-2.2 | Schema SHALL be compatible with Relay compiler | Must |
| NFR-2.3 | `@refetchable` directive SHALL work on Story fragments | Must |
| NFR-2.4 | Schema fetch (`pnpm --filter kamp-us run schema:fetch`) SHALL succeed | Must |

### NFR-3: Security

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-3.1 | Node query SHALL only return nodes owned by authenticated user | Must |
| NFR-3.2 | Global IDs SHALL NOT leak sensitive information (user IDs, etc.) | Must |
| NFR-3.3 | Malformed global IDs SHALL NOT cause server errors (graceful null) | Must |

### NFR-4: Maintainability

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-4.1 | Adding new Node-implementing types SHALL require minimal boilerplate | Should |
| NFR-4.2 | Type resolution logic SHALL be centralized in node query resolver | Should |
| NFR-4.3 | Global ID utilities SHALL be reusable across the codebase | Must |

## Technical Constraints

### TC-1: GQLoom Effect Schema Pattern

Interface definition pattern (from GQLoom docs):

```typescript
import {Schema} from "effect";
import {asObjectType} from "@gqloom/effect";

// Define interface
const Node = Schema.Struct({
  __typename: Schema.optional(Schema.Literal("Node")),
  id: Schema.String,
}).annotations({
  title: "Node",
  description: "An object with a globally unique ID",
});

// Implement interface
const Story = Schema.Struct({
  __typename: Schema.optional(Schema.Literal("Story")),
  id: Schema.String,
  // ... other fields
}).annotations({
  title: "Story",
  [asObjectType]: {interfaces: [Node]},
});
```

### TC-2: Library DO Method Availability

The `Library` DO already provides:
- `getStory(id: string)` - returns story or `null` (line 74-84 of Library.ts)
- `getTag(id: string)` - returns tag or `null` (available for future Node types)

### TC-3: Global ID Format

```
Encoding: base64("Story:story_abc123") → "U3Rvcnk6c3RvcnlfYWJjMTIz"
Decoding: "U3Rvcnk6c3RvcnlfYWJjMTIz" → { type: "Story", id: "story_abc123" }
```

### TC-4: Context Access

Node query resolver has access to:
- `context.pasaport.user.id` - authenticated user ID
- `context.env.LIBRARY` - Library DO binding

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| Library DO `getStory(id)` | Internal | ✅ Exists |
| GQLoom `asObjectType` symbol | External | ✅ Available in `@gqloom/effect` |
| Effect Schema annotations | External | ✅ Available |
| Relay compiler | Frontend | ✅ Configured |

## Acceptance Tests

### AT-1: Schema Validation
- [ ] GraphQL schema includes `interface Node { id: ID! }`
- [ ] Story type shows `implements Node` in schema SDL
- [ ] `node(id: ID!): Node` query exists in schema

### AT-2: Node Query Behavior
- [ ] `node(id: <valid-story-id>)` returns Story with correct data
- [ ] `node(id: <invalid-id>)` returns `null`
- [ ] `node(id: <other-users-story>)` returns `null` (auth scoping)
- [ ] Unauthenticated request to `node()` returns `null`

### AT-3: Global ID Roundtrip
- [ ] Story created via `createStory` has encoded global ID
- [ ] Same ID passed to `node()` returns the story
- [ ] `updateStory(id: <global-id>)` works correctly
- [ ] `deleteStory(id: <global-id>)` works correctly

### AT-4: Relay Frontend
- [ ] `@refetchable` compiles on Story fragment
- [ ] Generated refetch query uses `node(id: $id)`
- [ ] Refetch works at runtime
