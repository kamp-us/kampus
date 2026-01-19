# kamp-us

React 19 frontend with Relay for data fetching.

## Stack

- **React 19** - UI framework
- **Vite** - Build tool
- **Relay** - GraphQL data fetching
- **effect-atom** - URL search param sync
- **react-router** - Routing (import from `react-router`, not `react-router-dom`)
- **Base UI** - Unstyled component primitives
- **CSS Modules** - Scoped styling

## Relay

Primary data layer. Colocate fragments with components.

```typescript
const LibraryStoriesFragment = graphql`
  fragment Library_stories on Library
  @argumentDefinitions(first: {type: "Int", defaultValue: 10})
  @refetchable(queryName: "LibraryStoriesPaginationQuery") {
    stories(first: $first) @connection(key: "Library_stories") {
      edges { node { id } }
    }
  }
`;
```

- `useLazyLoadQuery` for root queries
- `useFragment` / `usePaginationFragment` for children
- Optimistic responses + store updaters for mutations
- Run `pnpm relay` after schema/query changes
- Generated types in `__generated__/` (excluded from biome)

## Search Params

Use `Atom.searchParam()` from effect-atom, inline in page components:

```typescript
const tagFilterAtom = Atom.searchParam("tag");

function useTagFilter() {
  const [tagId, setTagId] = useAtom(tagFilterAtom);
  return {tagId: tagId || null, setTagFilter: (id) => setTagId(id ?? "")};
}
```

## Design System

Components in `src/design/`:

- `.tsx` paired with `.module.css`
- Extend Base UI primitives (`@base-ui/react/*`)
- Props **omit `className`** - intentional, don't override
- State styling via data attributes: `[data-focused]`, `[data-invalid]`
- Tokens in `phoenix.ts` / `phoenix.css`

## Auth

React Context + localStorage. Use `useAuth()` hook, `getStoredToken()` for headers.

## Data Strategy: Relay vs Effect RPC

| Use Case | Tool |
|----------|------|
| UI data fetching, pagination, optimistic updates | **Relay** |
| Non-UI operations (tag management, admin actions) | **Effect RPC** |

Relay is the primary data layer. Effect RPC exists for edge cases where GraphQL doesn't fit.
