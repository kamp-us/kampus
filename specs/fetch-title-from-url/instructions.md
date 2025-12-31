# Fetch Title from URL

## Feature Overview

Add functionality to automatically fetch the title and description from a URL when users submit stories to their library. Similar to Lobsters' "Fetch Title" button, this provides a convenient way to auto-populate form fields by extracting metadata from the target webpage.

**Reference:** Lobsters submit page has a "Fetch Title" button next to the URL field that extracts the page title when clicked.

## User Stories

### Primary User Story
As a user submitting a story to my library, I want to be able to click a "Fetch Title" button after entering a URL so that the title (and optionally description) fields are automatically populated with metadata from the webpage.

### Secondary User Stories
- As a user, I want to see a loading state while the title is being fetched so I know the action is in progress
- As a user, I want to see an error message if the fetch fails (e.g., invalid URL, unreachable site) so I can take corrective action
- As a user, I want the ability to edit the auto-populated title/description so I can customize it if needed
- As a user, I want the fetch to only populate empty fields so my existing input isn't overwritten

## Behavior Decisions

- **Trigger mechanism:** Button click only (no auto-fetch on paste)
- **Fields populated:** Both title and description
- **Overwrite behavior:** Only fill empty fields; preserve user-entered content

## Acceptance Criteria

### Must Have
- [ ] "Fetch Title" button appears next to the URL input field
- [ ] Clicking the button fetches metadata from the entered URL
- [ ] Title field is auto-populated with the page's `<title>` or `og:title`
- [ ] Description field is auto-populated with `meta[name="description"]` or `og:description`
- [ ] Only populate fields that are currently empty (preserve user input)
- [ ] Loading state is displayed while fetching
- [ ] Error state is displayed if fetch fails
- [ ] User can still manually edit the auto-populated fields

### Should Have
- [ ] Button is disabled when URL field is empty or invalid
- [ ] Graceful handling of sites that block scraping
- [ ] Reasonable timeout for slow sites (e.g., 10 seconds)

### Could Have
- [ ] Cache fetched metadata to avoid duplicate requests for same URL
- [ ] Truncate overly long titles/descriptions

## Constraints

### Technical Constraints
- Backend runs on Cloudflare Workers (limited to Worker runtime APIs)
- Must handle CORS - fetching external URLs requires server-side proxy
- Should respect rate limits and not abuse external sites
- Some sites may block scraping (handle gracefully)

### Security Constraints
- Must validate URL before fetching (prevent SSRF attacks)
- Should not follow infinite redirects
- Should timeout on slow/hanging requests
- Should sanitize fetched content before displaying

## Dependencies

- Existing story submission form in `apps/kamp-us/src/pages/Library.tsx`
- GraphQL API infrastructure in `apps/worker/`
- Design system components (`Button`, `Input`, etc.)

## Out of Scope

- Fetching favicon/images from the URL
- Full webpage preview/screenshot
- RSS feed detection
- Automatic categorization/tagging based on content
- Rich link previews in the story list
