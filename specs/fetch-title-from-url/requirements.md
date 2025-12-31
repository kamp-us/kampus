# Requirements: Fetch Title from URL

**Status:** Phase 2 - Requirements Analysis
**Source:** [instructions.md](./instructions.md)

## Current State Analysis

### Existing Components
- **Frontend form:** `apps/kamp-us/src/pages/Library.tsx` - `CreateStoryForm` component
  - Has `url` and `title` fields, no `description` field currently
  - Uses design system: `Fieldset`, `Field`, `Input`, `Button`
- **GraphQL mutation:** `createStory(url, title, tagIds)` - does NOT accept description
- **Backend DO:** `Library.createStory({url, title, description?})` - DOES accept description
- **Database schema:** `story` table has `description` column (nullable)

### Gap Analysis
| Component | Current | Required |
|-----------|---------|----------|
| Frontend form | No description field | Add description textarea |
| GraphQL mutation | No description input | Add description input |
| Backend DO | Accepts description | No change needed |
| New query | N/A | Add `fetchUrlMetadata` query |

---

## Functional Requirements

### FR-1: URL Metadata Fetching Service
**Priority:** Must Have

The system shall provide a GraphQL query to fetch metadata from a given URL.

**Input:**
- `url: String!` - The URL to fetch metadata from

**Output:**
- `title: String` - Page title (from `<title>` or `og:title`)
- `description: String` - Page description (from `meta[name="description"]` or `og:description`)
- `error: String` - Error message if fetch failed

**Acceptance Criteria:**
- AC-1.1: Query validates URL format before fetching
- AC-1.2: Query fetches the HTML content from the URL
- AC-1.3: Query parses and extracts title using priority: `og:title` > `<title>`
- AC-1.4: Query parses and extracts description using priority: `og:description` > `meta[name="description"]`
- AC-1.5: Query returns error message for invalid URLs, unreachable sites, or timeouts
- AC-1.6: Query does not require authentication (public endpoint)

### FR-2: Fetch Button UI
**Priority:** Must Have

The story submission form shall display a "Fetch" button next to the URL input field.

**Acceptance Criteria:**
- AC-2.1: Button appears inline with or adjacent to the URL input
- AC-2.2: Button text reads "Fetch" (not "Fetch Title" - it fetches both)
- AC-2.3: Button is disabled when URL field is empty
- AC-2.4: Button is disabled when URL is invalid (fails URL validation)
- AC-2.5: Button triggers the `fetchUrlMetadata` GraphQL query on click

### FR-3: Auto-Fetch on Paste
**Priority:** Must Have

The form shall automatically fetch metadata when a URL is pasted.

**Acceptance Criteria:**
- AC-3.1: Pasting a URL triggers metadata fetch after 500ms debounce
- AC-3.2: Debounce resets if user continues typing
- AC-3.3: Only triggers if pasted content is a valid URL (http/https)
- AC-3.4: Manual "Fetch" button serves as fallback

### FR-4: Form Field Population with Dirty State
**Priority:** Must Have

When metadata is successfully fetched, the form shall populate fields with smart overwrite behavior.

**Acceptance Criteria:**
- AC-4.1: Fetched values overwrite existing field values by default
- AC-4.2: Fields manually edited by user are marked as "dirty"
- AC-4.3: Dirty fields show confirmation hint ("Replace?") before overwrite
- AC-4.4: User can confirm to overwrite dirty field, or dismiss to keep value
- AC-4.5: Fetched values do NOT mark fields as dirty (only user edits do)
- AC-4.6: Populated fields remain editable by the user

### FR-5: Loading State
**Priority:** Must Have

The UI shall indicate when a fetch operation is in progress.

**Acceptance Criteria:**
- AC-5.1: Button shows loading indicator (spinner or "Fetching...")
- AC-5.2: Button is disabled during fetch
- AC-5.3: Form remains interactive (user can edit other fields)

### FR-6: Error Handling
**Priority:** Must Have

The UI shall display errors when fetch operations fail.

**Acceptance Criteria:**
- AC-6.1: Error message is displayed near the URL field or button
- AC-6.2: Error message describes the failure reason
- AC-6.3: Error is dismissible (clears on next fetch attempt)
- AC-6.4: Form remains usable after error (user can manually enter data)

### FR-7: Description Field in Create Form
**Priority:** Must Have

The story submission form shall include a description field.

**Acceptance Criteria:**
- AC-7.1: Description field appears AFTER Tags field (field order: URL → Title → Tags → Description)
- AC-7.2: Description field is optional (not required)
- AC-7.3: Description field uses a textarea (multi-line input)
- AC-7.4: Description is saved with the story on form submission

### FR-8: Description Field in Edit Panel
**Priority:** Must Have

The story edit panel shall include a description field with fetch capability.

**Acceptance Criteria:**
- AC-8.1: Edit panel includes description textarea
- AC-8.2: Description is pre-populated with current story description
- AC-8.3: Edit panel has "Fetch" button for re-fetching metadata
- AC-8.4: Same dirty state behavior applies as create form
- AC-8.5: Updated description is saved when edit is submitted

### FR-9: Description Hover Display
**Priority:** Must Have

Story descriptions shall be visible on hover in the story list.

**Acceptance Criteria:**
- AC-9.1: Hovering over a story row reveals description in tooltip/popover
- AC-9.2: Description is NOT shown inline in list (preserves scanning UX)
- AC-9.3: Tooltip appears with slight delay (150-200ms) to avoid flicker
- AC-9.4: Stories without description show no tooltip
- AC-9.5: Tooltip is keyboard accessible (focus reveal)

---

## Non-Functional Requirements

### NFR-1: Performance
| Requirement | Target | Rationale |
|-------------|--------|-----------|
| Fetch timeout | 10 seconds | Prevent hanging on slow sites |
| Response size limit | 1 MB | Prevent memory issues with large pages |
| Parse time | < 500ms | Keep UI responsive |

### NFR-2: Security
| Requirement | Implementation |
|-------------|----------------|
| URL validation | Validate URL format before fetching |
| SSRF prevention | Only allow http/https schemes |
| Redirect limit | Follow max 5 redirects |
| Content sanitization | Strip HTML tags from extracted text |
| No script execution | Parse HTML as text, don't execute JS |

### NFR-3: Reliability
| Scenario | Expected Behavior |
|----------|-------------------|
| Site unreachable | Return error: "Could not reach URL" |
| Site blocks scraping | Return error: "Could not fetch metadata" |
| No title found | Return null for title field |
| No description found | Return null for description field |
| Timeout | Return error: "Request timed out" |
| Invalid HTML | Best-effort parse, return what's found |

### NFR-4: Accessibility
- Button must be keyboard accessible
- Loading state must be announced to screen readers
- Error messages must be associated with the URL field

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (kamp-us)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────┐    │
│  │ URL Input   │───▶│ Paste Event  │───▶│ Debounce (500ms)    │    │
│  │             │    │ or onClick   │    │                     │    │
│  └─────────────┘    └──────────────┘    └──────────┬──────────┘    │
│        │                   │                        │               │
│        │            ┌──────┴──────┐                 │               │
│        │            │ Fetch Button│                 │               │
│        │            │ (fallback)  │─────────────────┤               │
│        │            └─────────────┘                 │               │
│        │                                            ▼               │
│        │                              ┌─────────────────────┐       │
│        │                              │ GraphQL Query       │       │
│        │                              │ fetchUrlMetadata    │       │
│        │                              └──────────┬──────────┘       │
│        │                                         │                  │
│        │                   ┌─────────────────────┘                  │
│        │                   ▼                                        │
│  ┌─────┴───────────────────────────────────────────────────────┐   │
│  │ Response Handler (with Dirty State Logic)                    │   │
│  │ - If title:                                                  │   │
│  │   - If titleDirty → show "Replace?" hint, await confirmation │   │
│  │   - Else → setTitle(title)                                   │   │
│  │ - If description:                                            │   │
│  │   - If descDirty → show "Replace?" hint, await confirmation  │   │
│  │   - Else → setDescription(desc)                              │   │
│  │ - If error → setError(error)                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (worker)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ GraphQL Resolver: fetchUrlMetadata                          │   │
│  │ 1. Validate URL (format, scheme)                            │   │
│  │ 2. Fetch URL with timeout                                   │   │
│  │ 3. Parse HTML response                                      │   │
│  │ 4. Extract og:title or <title>                              │   │
│  │ 5. Extract og:description or meta description               │   │
│  │ 6. Return { title, description, error }                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       EXTERNAL URL                                  │
├─────────────────────────────────────────────────────────────────────┤
│  HTTP GET request to user-provided URL                              │
│  Returns: HTML document                                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## API Contract

### GraphQL Query

```graphql
type Query {
  fetchUrlMetadata(url: String!): UrlMetadata!
}

type UrlMetadata {
  """Page title from og:title or <title> tag"""
  title: String

  """Page description from og:description or meta description"""
  description: String

  """Error message if fetch failed"""
  error: String
}
```

### Example Usage

**Request:**
```graphql
query FetchMetadata($url: String!) {
  fetchUrlMetadata(url: $url) {
    title
    description
    error
  }
}
```

**Success Response:**
```json
{
  "data": {
    "fetchUrlMetadata": {
      "title": "Example Article - Example Site",
      "description": "This is an example article about...",
      "error": null
    }
  }
}
```

**Error Response:**
```json
{
  "data": {
    "fetchUrlMetadata": {
      "title": null,
      "description": null,
      "error": "Could not reach URL"
    }
  }
}
```

---

## UI States

### Button States

| State | Appearance | Behavior |
|-------|------------|----------|
| **Default** | "Fetch" | Clickable |
| **Disabled (empty URL)** | Grayed out | Not clickable |
| **Disabled (invalid URL)** | Grayed out | Not clickable |
| **Loading** | "Fetching..." or spinner | Not clickable |
| **Success** | Returns to default | Fields populated |
| **Error** | Returns to default | Error message shown |

### Field Dirty States

| State | Appearance | Behavior |
|-------|------------|----------|
| **Clean** | Normal | Fetch overwrites without prompt |
| **Dirty** | Normal | Fetch shows "Replace?" hint |
| **Pending Replace** | Field highlighted, "Replace?" visible | Click to confirm, elsewhere to dismiss |

### Form Layout (Field Order: URL → Title → Tags → Description)

```
┌────────────────────────────────────────────────────────────┐
│ Add Story                                                  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ URL                                                        │
│ ┌──────────────────────────────────────────┐ ┌───────┐    │
│ │ https://example.com/article              │ │ Fetch │    │
│ └──────────────────────────────────────────┘ └───────┘    │
│   ↑ Auto-fetches on paste (500ms debounce)                │
│                                                            │
│ Title *                                     [Replace?]     │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ Auto-populated or user-entered title                 │  │
│ └──────────────────────────────────────────────────────┘  │
│   ↑ Shows "Replace?" if dirty when fetch returns          │
│                                                            │
│ Tags                                                       │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ [tag1] [tag2] Add tags...                            │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                            │
│ Description                                 [Replace?]     │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ Auto-populated or user-entered description           │  │
│ │                                                      │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                            │
│                              ┌────────┐ ┌────────────┐    │
│                              │ Cancel │ │ Save Story │    │
│                              └────────┘ └────────────┘    │
└────────────────────────────────────────────────────────────┘
```

---

## Metadata Extraction Priority

### Title Extraction
1. `<meta property="og:title" content="...">` (Open Graph)
2. `<title>...</title>` (HTML title tag)
3. `null` if neither found

### Description Extraction
1. `<meta property="og:description" content="...">` (Open Graph)
2. `<meta name="description" content="...">` (Standard meta)
3. `null` if neither found

---

## Dependencies

### New Dependencies
- None required - Cloudflare Workers have built-in `fetch()` and `HTMLRewriter` for parsing

### Existing Dependencies Used
- GraphQL Yoga (query resolver)
- Effect Schema (input/output validation)
- Design system components (Button, Input, Textarea)
- Relay (frontend GraphQL client)

---

## Open Questions

1. **Should we add `description` input to `createStory` mutation?**
   - Current: Backend DO supports it, but GraphQL mutation doesn't accept it
   - Recommendation: Yes, add it as part of this feature

2. **Should the query require authentication?**
   - Recommendation: No, keep it public to allow pre-login UX exploration
   - Risk: Potential abuse for scraping
   - Mitigation: Rate limiting at Cloudflare level if needed

3. **Should we cache fetched metadata?**
   - Could Have in instructions.md
   - Recommendation: Defer to future iteration unless needed for performance
