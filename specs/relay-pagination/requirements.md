# Relay Pagination - Requirements

## Functional Requirements

### FR-1: Load More Button
| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1.1 | Display "Load More" button when `hasNextPage` is true | Must |
| FR-1.2 | Hide button when all items are loaded (`hasNextPage` is false) | Must |
| FR-1.3 | Show loading indicator while fetching next page | Must |
| FR-1.4 | Disable button during loading to prevent double-clicks | Must |
| FR-1.5 | Append new stories to existing list (not replace) | Must |

### FR-2: Pagination State
| ID | Requirement | Priority |
|----|-------------|----------|
| FR-2.1 | Maintain cursor position across page loads (via Relay store) | Must |
| FR-2.2 | Reset pagination when switching between filtered/unfiltered views | Must |
| FR-2.3 | Preserve loaded stories when navigating away and back | Should |

### FR-3: Filtered Pagination
| ID | Requirement | Priority |
|----|-------------|----------|
| FR-3.1 | Support pagination for `storiesByTag` filtered queries | Must |
| FR-3.2 | Each filter (tag) maintains separate pagination state | Must |
| FR-3.3 | Clearing filter returns to unfiltered paginated view | Must |

### FR-4: Mutation Integration
| ID | Requirement | Priority |
|----|-------------|----------|
| FR-4.1 | New stories appear at top of list after creation | Must |
| FR-4.2 | Deleted stories are removed from paginated list | Must |
| FR-4.3 | Updated stories reflect changes in-place | Must |
| FR-4.4 | Use `@appendEdge` / `@prependEdge` or updater functions | Should |

## Non-Functional Requirements

### NFR-1: Performance
| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1.1 | Initial page load time | < 500ms for first 20 stories |
| NFR-1.2 | Load more response time | < 300ms per page |
| NFR-1.3 | No UI jank during pagination | Smooth append animation |

### NFR-2: User Experience
| ID | Requirement | Target |
|----|-------------|--------|
| NFR-2.1 | Clear visual feedback during loading | Spinner or text change |
| NFR-2.2 | Button placement | Below story list, centered |
| NFR-2.3 | Accessible button with proper ARIA | role="button", aria-busy |

### NFR-3: Code Quality
| ID | Requirement | Target |
|----|-------------|--------|
| NFR-3.1 | Use idiomatic Relay patterns | `usePaginationFragment` |
| NFR-3.2 | Type safety | Full TypeScript coverage |
| NFR-3.3 | No eslint/biome warnings | Clean lint pass |

## Component Mapping

| Requirement | Affected Component | Changes |
|-------------|-------------------|---------|
| FR-1.* | `AllStoriesView` | Add `usePaginationFragment`, LoadMore button |
| FR-3.* | `FilteredLibraryView` | Add `usePaginationFragment`, LoadMore button |
| FR-4.* | `CreateStoryForm` | Update mutation updater for connections |
| FR-4.* | `StoryRow` | Update delete mutation updater |

## GraphQL Schema Requirements

### Fragment Structure
```
LibraryQuery (root query)
  └── me
      └── library
          └── LibraryStoriesFragment (@refetchable, @connection)
              └── stories(first, after)
                  └── edges
                      └── node: StoryFragment
```

### Required Directives
- `@refetchable(queryName: "...")` - Enables `usePaginationFragment`
- `@connection(key: "...")` - Enables Relay connection handling
- `@argumentDefinitions` - Defines pagination arguments

## Acceptance Tests

### AT-1: Basic Pagination
1. User has 50 stories saved
2. Initial load shows 20 stories
3. "Load More" button is visible
4. Click "Load More"
5. 40 stories now visible
6. Click "Load More" again
7. All 50 stories visible
8. "Load More" button hidden

### AT-2: Filtered Pagination
1. User has 30 stories tagged "javascript"
2. Click "javascript" tag filter
3. Initial load shows 20 filtered stories
4. "Load More" button visible
5. Click "Load More"
6. All 30 filtered stories visible
7. Clear filter
8. Returns to unfiltered view with pagination reset

### AT-3: Mutation with Pagination
1. User has loaded 40 stories (2 pages)
2. Create new story
3. New story appears at top
4. Total count is now 41
5. Delete a story from page 2
6. Story removed, list updates correctly
