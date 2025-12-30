# User Library Page

## Feature Overview

Build a user-facing library page where authenticated users can view and manage their saved stories. This is the primary interface for users to interact with their personal library content.

### Why is this feature needed?

The Library Durable Object already supports story storage and retrieval, but there's no user interface for users to interact with their library. This feature bridges that gap by providing a complete frontend experience for story management.

## User Stories

### As an authenticated user:

1. **View my library** - I want to see a list of all stories I've saved so I can browse my collection
2. **Add a story** - I want to save a new story with a URL and title so I can build my library
3. **Edit a story** - I want to update the title of an existing story to correct mistakes
4. **Delete a story** - I want to remove a story from my library when it's no longer relevant
5. **Navigate efficiently** - I want to load more stories as I scroll so I can browse a large library without performance issues

### As an unauthenticated user:

1. **Be redirected** - I should be redirected to the login page if I try to access the library

## Acceptance Criteria

### Library Page Display

- [ ] Page accessible at `/me/library` route
- [ ] Displays user's stories in a simple row-based list (not cards)
- [ ] Each story row shows: title (clickable, opens URL), domain + relative date
- [ ] Stories ordered by creation date (newest first)
- [ ] Empty state shown when user has no stories (centered, minimal, with CTA)

### Story Row Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Title of the Story                                    [⋮]     │
│  example.com · Saved 3 days ago                                │
├─────────────────────────────────────────────────────────────────┤
```

- Title: Primary, clickable (opens URL in new tab), hover shows underline
- Domain + Date: Tertiary, extracted from URL, relative time for recent items
- Overflow menu (⋮): Visible on hover (desktop), always visible (mobile)
- Rows separated by subtle border (`--color-gray-6`)

### Create Story

- [ ] Collapsed prompt at top: "Add a story..." that expands inline on click
- [ ] Expanded form with fields: URL (required), Title (required)
- [ ] Cancel collapses form (also: click outside, Escape key)
- [ ] Success: story prepends to list, form collapses
- [ ] Error: inline error message, form stays open

**Expanded form layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  URL                                                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ https://                                                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Title                                                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│                                    [Cancel]  [Save Story]       │
└─────────────────────────────────────────────────────────────────┘
```

### Edit Story

- [ ] Triggered from overflow menu (⋮) → "Edit"
- [ ] Transforms row into inline edit mode
- [ ] Can update: title only (URL not editable - it's a different resource)
- [ ] Save/Cancel buttons; Escape key cancels
- [ ] Success: exits edit mode, row updates in place

**Inline edit layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Title of the Story                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│  example.com (not editable)                                     │
│                                         [Cancel]  [Save]        │
└─────────────────────────────────────────────────────────────────┘
```

### Delete Story

- [ ] Triggered from overflow menu (⋮) → "Delete"
- [ ] Shows inline confirmation (no modal)
- [ ] Delete button uses destructive color (`--color-ruby-9`)
- [ ] Success: row animates out

**Inline confirmation layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Delete "Title of the Story"?                                   │
│                                         [Cancel]  [Delete]      │
└─────────────────────────────────────────────────────────────────┘
```

### Pagination

- [ ] Uses cursor-based pagination (Relay connections)
- [ ] "Load more stories" button at bottom when more exist
- [ ] Button shows "Loading..." while fetching
- [ ] Hide button when no more items (don't show "No more stories")

### Loading States

- [ ] Initial load: Show 3-5 skeleton rows matching row structure
- [ ] Mutations: Button shows "Saving..." / "Deleting..." while in progress
- [ ] Errors: Inline error messages (no toasts for form errors)

### Empty State

```
            ┌─────────────────────────┐
            │      (bookmark icon)    │
            │   No stories saved yet  │
            │   Save articles, docs,  │
            │   and links to revisit  │
            │   later.                │
            │   [+ Add your first     │
            │      story]             │
            └─────────────────────────┘
```

- Centered in viewport
- CTA button expands the "Add a story" form

### Authentication

- [ ] Page requires authentication
- [ ] Unauthenticated users redirected to `/login`

## Constraints

### Technical

- Must use existing design system components (Button, Field, Fieldset, Input)
- Must use Relay for GraphQL data fetching
- Must use Effect Schema for backend types
- Backend methods must return `null` for not-found (not throw)
- Follow existing patterns in `apps/kamp-us/src/pages/` for page structure
- Desktop-first design (mobile secondary)

### Scope

- **In scope:** Story CRUD (Create, Read, Update, Delete) with URL + Title only
- **Out of scope:** Description field (deferred for future iteration)
- **Out of scope:** Tagging functionality (separate feature: library-tags)
- **Out of scope:** Search/filter functionality
- **Out of scope:** Bulk operations

## Dependencies

### Existing Infrastructure (Ready)

- Library Durable Object with `createStory()` method
- Drizzle schema with `story` table
- Better Auth for authentication
- Design system components
- Relay environment configured

### To Be Built

- Library DO: `listStories()`, `getStory()`, `updateStory()`, `deleteStory()`
- GraphQL: Story type, queries, mutations
- Frontend: Library page component, routing

## Out of Scope

The following are explicitly NOT part of this feature:

1. **Description field** - Deferred for future iteration based on user feedback
2. **Tags** - Covered by separate `library-tags` feature
3. **Search** - May be added in a future feature
4. **Sorting options** - Stories always sorted by creation date (newest first)
5. **Bulk delete** - Users delete one story at a time
6. **URL metadata fetching** - User provides title manually (auto-fetch may be added later)
7. **Sharing** - Library is private to the user

## Design Tokens Reference

| Element | Token |
|---------|-------|
| Row padding | `--space-16` |
| Row separator | `1px solid var(--gray-6)` |
| Title | `--font-size-16`, `--font-weight-medium`, `--gray-12` |
| Title hover | `--sky-11` with underline |
| Domain + Date | `--font-size-13`, `--gray-10` |
| Destructive action | `--ruby-9` |
| Empty state icon | `48px`, `--gray-9` |
| Empty state headline | `--font-size-18`, `--font-weight-semibold` |
| Empty state subtext | `--font-size-14`, `--gray-11` |
