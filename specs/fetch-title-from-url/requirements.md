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

### FR-2: Fetch Title Button UI
**Priority:** Must Have

The story submission form shall display a "Fetch Title" button next to the URL input field.

**Acceptance Criteria:**
- AC-2.1: Button appears inline with or adjacent to the URL input
- AC-2.2: Button text reads "Fetch" or "Fetch Title"
- AC-2.3: Button is disabled when URL field is empty
- AC-2.4: Button is disabled when URL is invalid (fails URL validation)
- AC-2.5: Button triggers the `fetchUrlMetadata` GraphQL query on click

### FR-3: Form Field Population
**Priority:** Must Have

When metadata is successfully fetched, the form shall populate empty fields.

**Acceptance Criteria:**
- AC-3.1: Title field is populated only if currently empty
- AC-3.2: Description field is populated only if currently empty
- AC-3.3: Fields with existing user input are NOT overwritten
- AC-3.4: Populated fields remain editable by the user

### FR-4: Loading State
**Priority:** Must Have

The UI shall indicate when a fetch operation is in progress.

**Acceptance Criteria:**
- AC-4.1: Button shows loading indicator (spinner or "Fetching...")
- AC-4.2: Button is disabled during fetch
- AC-4.3: Form remains interactive (user can edit other fields)

### FR-5: Error Handling
**Priority:** Must Have

The UI shall display errors when fetch operations fail.

**Acceptance Criteria:**
- AC-5.1: Error message is displayed near the URL field or button
- AC-5.2: Error message describes the failure reason
- AC-5.3: Error is dismissible (clears on next fetch attempt)
- AC-5.4: Form remains usable after error (user can manually enter data)

### FR-6: Description Field Addition
**Priority:** Must Have

The story submission form shall include a description field.

**Acceptance Criteria:**
- AC-6.1: Description field appears below title field
- AC-6.2: Description field is optional (not required)
- AC-6.3: Description field uses a textarea (multi-line input)
- AC-6.4: Description is saved with the story on form submission

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
│  │ URL Input   │───▶│ Fetch Button │───▶│ GraphQL Query       │    │
│  │             │    │ (onClick)    │    │ fetchUrlMetadata    │    │
│  └─────────────┘    └──────────────┘    └──────────┬──────────┘    │
│                                                     │               │
│                            ┌────────────────────────┘               │
│                            ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Response Handler                                             │   │
│  │ - If title && !formTitle → setTitle(title)                  │   │
│  │ - If description && !formDescription → setDescription(desc) │   │
│  │ - If error → setError(error)                                │   │
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
| **Default** | "Fetch Title" | Clickable |
| **Disabled (empty URL)** | Grayed out | Not clickable |
| **Disabled (invalid URL)** | Grayed out | Not clickable |
| **Loading** | "Fetching..." or spinner | Not clickable |
| **Success** | Returns to default | Fields populated |
| **Error** | Returns to default | Error message shown |

### Form Layout

```
┌────────────────────────────────────────────────────────────┐
│ Add Story                                                  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ URL                                                        │
│ ┌──────────────────────────────────────────┐ ┌───────────┐│
│ │ https://example.com/article              │ │Fetch Title││
│ └──────────────────────────────────────────┘ └───────────┘│
│                                                            │
│ Title *                                                    │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ Auto-populated or user-entered title                 │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                            │
│ Description                                                │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ Auto-populated or user-entered description           │  │
│ │                                                      │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                            │
│ Tags                                                       │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ [tag1] [tag2] Add tags...                            │  │
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
