# User Library Page - Requirements

Derived from [instructions.md](./instructions.md).

## Functional Requirements

### FR-1: Authentication & Authorization

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1.1 | System SHALL require authentication for `/me/library` route | Must |
| FR-1.2 | System SHALL redirect unauthenticated users to `/login` | Must |
| FR-1.3 | System SHALL use existing Better Auth session for user identification | Must |

### FR-2: Story List Display

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-2.1 | System SHALL display stories in a vertical list ordered by creation date (newest first) | Must |
| FR-2.2 | Each story row SHALL display: title, domain (extracted from URL), relative creation date | Must |
| FR-2.3 | Story title SHALL be clickable and open the URL in a new browser tab | Must |
| FR-2.4 | Each story row SHALL have an overflow menu (⋮) with Edit and Delete actions | Must |
| FR-2.5 | Overflow menu SHALL be visible on hover (desktop) or always visible (mobile) | Must |
| FR-2.6 | System SHALL show empty state when user has no stories | Must |
| FR-2.7 | Empty state SHALL include a CTA button to add first story | Must |

### FR-3: Create Story

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-3.1 | Page SHALL display a collapsed "Add a story..." prompt at the top | Must |
| FR-3.2 | Clicking the prompt SHALL expand an inline form | Must |
| FR-3.3 | Create form SHALL have URL field (required) and Title field (required) | Must |
| FR-3.4 | Form SHALL validate URL format before submission | Must |
| FR-3.5 | Successful creation SHALL prepend story to list and collapse form | Must |
| FR-3.6 | Failed creation SHALL display inline error and keep form open | Must |
| FR-3.7 | Cancel action SHALL collapse form (via button, Escape key, or click outside) | Must |

### FR-4: Edit Story

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-4.1 | Edit action SHALL transform the row into inline edit mode | Must |
| FR-4.2 | Edit mode SHALL allow updating the title only | Must |
| FR-4.3 | Edit mode SHALL display the domain (not editable) for context | Must |
| FR-4.4 | Save action SHALL update the story and exit edit mode | Must |
| FR-4.5 | Cancel action SHALL discard changes and exit edit mode | Must |
| FR-4.6 | Escape key SHALL trigger cancel action | Must |

### FR-5: Delete Story

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-5.1 | Delete action SHALL show inline confirmation (not modal) | Must |
| FR-5.2 | Confirmation SHALL display the story title being deleted | Must |
| FR-5.3 | Confirmed delete SHALL remove the story and animate row out | Must |
| FR-5.4 | Cancel action SHALL dismiss confirmation | Must |

### FR-6: Pagination

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-6.1 | System SHALL use cursor-based pagination (Relay connections) | Must |
| FR-6.2 | System SHALL display "Load more stories" button when more items exist | Must |
| FR-6.3 | System SHALL hide load more button when all items are loaded | Must |
| FR-6.4 | System SHALL append loaded stories below existing list | Must |

### FR-7: Loading States

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-7.1 | Initial page load SHALL display skeleton rows (3-5) | Must |
| FR-7.2 | Create/Edit mutations SHALL show "Saving..." state on button | Must |
| FR-7.3 | Delete mutation SHALL show "Deleting..." state on button | Must |
| FR-7.4 | Load more SHALL show "Loading..." state on button | Must |

---

## Non-Functional Requirements

### NFR-1: Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1.1 | Initial page load (with stories) | < 500ms (excluding network) |
| NFR-1.2 | Create story mutation round-trip | < 300ms |
| NFR-1.3 | Pagination page size | 20 items default |

### NFR-2: Usability

| ID | Requirement |
|----|-------------|
| NFR-2.1 | All interactive elements SHALL have visible focus states |
| NFR-2.2 | Form errors SHALL be displayed inline near the relevant field |
| NFR-2.3 | Destructive actions (delete) SHALL use visual warning color (`--ruby-9`) |
| NFR-2.4 | Desktop-first design; mobile SHALL be functional but secondary |

### NFR-3: Accessibility

| ID | Requirement |
|----|-------------|
| NFR-3.1 | All interactive elements SHALL be keyboard accessible |
| NFR-3.2 | Form inputs SHALL have associated labels |
| NFR-3.3 | Loading states SHALL be announced to screen readers |
| NFR-3.4 | Overflow menu SHALL be accessible via keyboard |

### NFR-4: Maintainability

| ID | Requirement |
|----|-------------|
| NFR-4.1 | Frontend components SHALL use existing design system (Button, Field, Input) |
| NFR-4.2 | Backend SHALL use Effect Schema for type definitions |
| NFR-4.3 | GraphQL SHALL use GQLoom with Effect Weaver |
| NFR-4.4 | Data fetching SHALL use Relay hooks |

---

## Data Requirements

### Story Entity

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | Yes | Generated with `id("story")` prefix |
| url | string | Yes | User-provided URL |
| normalizedUrl | string | Yes | System-generated for deduplication |
| title | string | Yes | User-provided title |
| createdAt | timestamp | Yes | Auto-generated on creation |

### Derived Display Data

| Field | Source | Notes |
|-------|--------|-------|
| domain | Extracted from `url` | Remove protocol, `www.`, path |
| relativeDate | Computed from `createdAt` | "3 days ago", "Jan 15" for older |

---

## API Requirements

### GraphQL Schema Structure

```graphql
type Query {
  me: User  # Nullable - returns null when not authenticated
}

type User {
  id: String!
  email: String!
  name: String
  library: Library!
}

type Library {
  stories(first: Int, after: String): StoryConnection!
}

type StoryConnection {
  edges: [StoryEdge!]!
  pageInfo: PageInfo!
}

type StoryEdge {
  node: Story!
  cursor: String!
}

type Story {
  id: String!
  url: String!
  title: String!
  createdAt: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

### GraphQL Queries

| Query Path | Input | Output |
|------------|-------|--------|
| `me.library.stories` | `first: Int`, `after: String` | `StoryConnection` |

### GraphQL Mutations

| Mutation | Input | Output |
|----------|-------|--------|
| `createStory` | `url: String!`, `title: String!` | `CreateStoryPayload` |
| `updateStory` | `id: String!`, `title: String` | `UpdateStoryPayload` |
| `deleteStory` | `id: String!` | `DeleteStoryPayload` |

### Mutation Payload Types

```graphql
type CreateStoryPayload {
  story: Story!
}

type UpdateStoryPayload {
  story: Story
  error: StoryNotFoundError
}

type DeleteStoryPayload {
  success: Boolean!
  deletedStoryId: String
  error: StoryNotFoundError
}

type StoryNotFoundError {
  code: String!  # "STORY_NOT_FOUND"
  message: String!
  storyId: String!
}
```

### Library DO Methods (to add)

| Method | Signature | Returns |
|--------|-----------|---------|
| `listStories` | `(options?: {first?: number; after?: string})` | `{edges, hasNextPage, endCursor}` |
| `getStory` | `(id: string)` | `Story \| null` |
| `updateStory` | `(id: string, updates: {title?: string})` | `Story \| null` |
| `deleteStory` | `(id: string)` | `void` |

---

## Constraints Summary

| Constraint | Detail |
|------------|--------|
| No description field | Deferred to future iteration |
| No tags | Separate feature (library-tags) |
| No search/filter | Future feature |
| No bulk operations | Single item operations only |
| No URL editing | Editing URL = different resource |
| Forward-only pagination | No `before`/`last` cursor support |

---

## Acceptance Test Scenarios

### Scenario 1: First-time user experience
```
GIVEN I am logged in
AND I have no stories saved
WHEN I navigate to /me/library
THEN I see the empty state with "No stories saved yet"
AND I see a CTA button "Add your first story"
```

### Scenario 2: Add a story
```
GIVEN I am on /me/library
WHEN I click "Add a story..."
THEN the form expands inline
WHEN I enter a valid URL and title
AND I click "Save Story"
THEN the story appears at the top of the list
AND the form collapses
```

### Scenario 3: Edit a story title
```
GIVEN I have stories in my library
WHEN I hover over a story row
AND I click the overflow menu (⋮)
AND I click "Edit"
THEN the row transforms to edit mode
WHEN I change the title
AND I click "Save"
THEN the row updates with the new title
AND edit mode exits
```

### Scenario 4: Delete a story
```
GIVEN I have stories in my library
WHEN I click the overflow menu (⋮) on a story
AND I click "Delete"
THEN I see inline confirmation "Delete [title]?"
WHEN I click "Delete" to confirm
THEN the row animates out
AND the story is removed from my library
```

### Scenario 5: Pagination
```
GIVEN I have more than 20 stories
WHEN I load /me/library
THEN I see the first 20 stories
AND I see a "Load more stories" button
WHEN I click "Load more stories"
THEN additional stories append to the list
```

### Scenario 6: Unauthenticated access
```
GIVEN I am not logged in
WHEN I navigate to /me/library
THEN I am redirected to /login
```
