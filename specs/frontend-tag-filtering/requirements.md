# Frontend Tag Filtering - Requirements

This document defines the structured functional and non-functional requirements derived from the [instructions.md](./instructions.md).

**Scope:** Single-tag filtering only. Multi-tag filtering (AND/OR) is a separate future feature.
**Depends on:** [frontend-story-tagging](../frontend-story-tagging/) must be completed first.

## Requirement Categories

| Category | Prefix | Description |
|----------|--------|-------------|
| Functional - Component | FC | Component behavior and rendering |
| Functional - Interaction | FI | User interaction and input handling |
| Functional - Routing | FR | URL and navigation requirements |
| Functional - API | FA | GraphQL schema and resolver requirements |
| Non-Functional | NF | Performance, usability, design |

---

## 1. TagFilterRow Component Requirements

### FC-1: TagFilterRow Layout

| ID | Requirement | Priority |
|----|-------------|----------|
| FC-1.1 | TagFilterRow SHALL render as an inline row above the story list | Must |
| FC-1.2 | TagFilterRow SHALL render below the "Add Story" form | Must |
| FC-1.3 | TagFilterRow SHALL display the current filter state and story count | Must |

### FC-2: TagFilterRow Unfiltered State

| ID | Requirement | Priority |
|----|-------------|----------|
| FC-2.1 | When no filter is active, TagFilterRow SHALL display "All stories" text | Must |
| FC-2.2 | When no filter is active, TagFilterRow SHALL display total story count (e.g., "12 stories") | Must |

### FC-3: TagFilterRow Filtered State

| ID | Requirement | Priority |
|----|-------------|----------|
| FC-3.1 | When filtering, TagFilterRow SHALL display the active tag as a TagChip | Must |
| FC-3.2 | The active TagChip SHALL be dismissible (show × icon) | Must |
| FC-3.3 | TagFilterRow SHALL display filtered result count (e.g., "5 stories tagged 'productivity'") | Must |
| FC-3.4 | TagFilterRow SHALL show tag color in the active TagChip | Must |

### FC-4: Empty State

| ID | Requirement | Priority |
|----|-------------|----------|
| FC-4.1 | When filter returns zero stories, story list SHALL show empty state message | Must |
| FC-4.2 | Empty state SHALL display "No stories tagged '[tag-name]'" | Must |
| FC-4.3 | Empty state SHALL provide a clear action to remove the filter | Must |

---

## 2. Story Row Enhancement Requirements

### FC-5: Clickable Tags

| ID | Requirement | Priority |
|----|-------------|----------|
| FC-5.1 | Tags displayed on story rows SHALL be clickable | Must |
| FC-5.2 | Tags SHALL have a hover state indicating clickability | Must |
| FC-5.3 | Tags SHALL use cursor: pointer when hovered | Must |
| FC-5.4 | Clicking a tag SHALL NOT trigger the story row's edit/expand action | Must |

---

## 3. Interaction Requirements

### FI-1: Filter Activation

| ID | Requirement | Priority |
|----|-------------|----------|
| FI-1.1 | Clicking a tag on any story row SHALL activate filtering by that tag | Must |
| FI-1.2 | When a filter is already active, clicking a different tag SHALL replace the filter | Must |
| FI-1.3 | Clicking the same tag that is currently filtered SHALL do nothing (filter remains) | Should |

### FI-2: Filter Deactivation

| ID | Requirement | Priority |
|----|-------------|----------|
| FI-2.1 | Clicking × on the active TagChip in TagFilterRow SHALL clear the filter | Must |
| FI-2.2 | Clearing the filter SHALL return to showing all stories | Must |
| FI-2.3 | Clearing the filter SHALL update the URL to remove the tag query param | Must |

---

## 4. Routing Requirements

### FR-1: URL Query Parameter

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1.1 | Active filter SHALL be reflected in URL as `?tag=tag-name` query param | Must |
| FR-1.2 | Tag name in URL SHALL be the tag's actual name (not ID) | Must |
| FR-1.3 | URL SHALL be updated when filter is activated | Must |
| FR-1.4 | URL SHALL be updated when filter is cleared (remove param) | Must |

### FR-2: Direct Navigation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-2.1 | Navigating directly to `/me/library?tag=foo` SHALL apply that filter on load | Must |
| FR-2.2 | If tag name in URL doesn't exist, page SHALL show empty state with tag name | Must |
| FR-2.3 | Navigating to `/me/library` without tag param SHALL show all stories | Must |

### FR-3: Browser Navigation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-3.1 | Browser back button SHALL navigate to previous filter state | Should |
| FR-3.2 | Browser forward button SHALL navigate to next filter state | Should |

---

## 5. GraphQL API Requirements

### FA-1: storiesByTag Query

| ID | Requirement | Priority |
|----|-------------|----------|
| FA-1.1 | Library type SHALL have `storiesByTag(tagName: String!)` field | Must |
| FA-1.2 | `storiesByTag` SHALL return `StoryConnection` type | Must |
| FA-1.3 | `storiesByTag` SHALL accept standard connection args (first, after) | Must |
| FA-1.4 | `storiesByTag` SHALL return stories that have a tag with the given name | Must |
| FA-1.5 | `storiesByTag` SHALL return empty connection if tag name doesn't exist | Must |
| FA-1.6 | `storiesByTag` SHALL order results by createdAt descending (same as stories) | Must |

### FA-2: Backend Library DO

| ID | Requirement | Priority |
|----|-------------|----------|
| FA-2.1 | Library DO SHALL implement `getStoriesByTagName(tagName)` method | Must |
| FA-2.2 | `getStoriesByTagName` SHALL query stories via story_tags join table | Must |
| FA-2.3 | `getStoriesByTagName` SHALL support cursor-based pagination | Must |

---

## 6. Non-Functional Requirements

### NF-1: Performance

| ID | Requirement | Priority |
|----|-------------|----------|
| NF-1.1 | Filter activation SHALL update the story list without full page reload | Must |
| NF-1.2 | Filtered query SHALL use indexed database query (not client-side filter) | Must |
| NF-1.3 | URL updates SHALL use history.pushState (no page reload) | Must |

### NF-2: Usability

| ID | Requirement | Priority |
|----|-------------|----------|
| NF-2.1 | Clickable tags SHALL be keyboard accessible | Should |
| NF-2.2 | Filter clear action SHALL be keyboard accessible | Must |
| NF-2.3 | Active filter state SHALL be visually obvious | Must |

### NF-3: Design

| ID | Requirement | Priority |
|----|-------------|----------|
| NF-3.1 | TagFilterRow SHALL use phoenix design tokens | Must |
| NF-3.2 | Clickable tags SHALL reuse TagChip component from frontend-story-tagging | Must |
| NF-3.3 | Hover states SHALL be consistent with existing interactive elements | Must |

---

## 7. Requirements Summary

| Category | Count |
|----------|-------|
| FC (Component) | 14 |
| FI (Interaction) | 6 |
| FR (Routing) | 7 |
| FA (API) | 8 |
| NF (Non-functional) | 9 |
| **Total** | **44 requirements (~35 Must-haves)** |

---

## 8. Component Dependencies

```
TagFilterRow (new)
├── TagChip (from frontend-story-tagging)
└── useSearchParams (react-router)

StoryRow (enhanced)
└── TagChip (clickable variant)

LibraryPage
├── TagFilterRow
├── StoryList
│   └── StoryRow (with clickable tags)
└── URL state management
```

---

## 9. Data Flow

```
URL ?tag=productivity
        │
        ▼
┌──────────────────┐
│   LibraryPage    │
│ reads tag param  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│  TagFilterRow    │     │   GraphQL Query  │
│ shows active tag │     │ storiesByTag OR  │
│ and count        │     │ stories          │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │    StoryList     │
                         │ filtered results │
                         └──────────────────┘
```

---

## 10. Out of Scope (Confirmed)

These are explicitly excluded from this feature:

- **Multi-tag filtering**: AND/OR logic for filtering by multiple tags
- **Tag sidebar navigation**: Persistent sidebar showing all tags with counts
- **Tag autocomplete search**: Search input to find tags by name
- **Saved filters**: Persisting filter preferences across sessions

---

## 11. Open Items for Design Phase

1. **Relay fragment strategy**: Should `storiesByTag` use a separate fragment or reuse `stories` fragment?
2. **Loading state**: How to show loading while filtered results are fetching?
3. **Tag lookup**: Should TagFilterRow fetch tag details (color) by name, or is it available from stories?
4. **Count source**: Should the count come from connection's totalCount or be computed client-side?
