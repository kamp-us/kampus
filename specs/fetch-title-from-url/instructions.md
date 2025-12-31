# Fetch Title from URL

## Feature Overview

Add functionality to automatically fetch the title and description from a URL when users submit stories to their library. Similar to Lobsters' "Fetch Title" button, this provides a convenient way to auto-populate form fields by extracting metadata from the target webpage.

**Reference:** Lobsters submit page has a "Fetch Title" button next to the URL field that extracts the page title when clicked.

## User Stories

### Primary User Story
As a user submitting a story to my library, I want metadata to be automatically fetched when I paste a URL so that the title and description fields are populated with minimal effort.

### Secondary User Stories
- As a user, I want to see a loading state while metadata is being fetched so I know the action is in progress
- As a user, I want to see an error message if the fetch fails (e.g., invalid URL, unreachable site) so I can take corrective action
- As a user, I want the ability to edit the auto-populated title/description so I can customize it if needed
- As a user, I want a warning before my manually-edited content is overwritten by a fetch
- As a user, I want to see the description on hover when browsing my saved stories
- As a user, I want to edit the description when editing a story

## Behavior Decisions

- **Trigger mechanism:** Auto-fetch on URL paste (500ms debounce) + manual "Fetch" button as fallback
- **Fields populated:** Both title and description
- **Overwrite behavior:** Always overwrite, UNLESS field was manually edited (dirty state) - show confirmation hint
- **Button naming:** "Fetch" (not "Fetch Title" - it fetches both title and description)
- **Field order:** URL → Title → Tags → Description (put action items first, description is "nice to have")
- **Description display:** Hover/tooltip reveal on story rows (not inline in list)
- **Edit panel:** Include description field with same fetch capability

## Acceptance Criteria

### Must Have
- [ ] "Fetch" button appears next to the URL input field
- [ ] Auto-fetch triggers on URL paste (500ms debounce)
- [ ] Clicking the button fetches metadata from the entered URL
- [ ] Title field is auto-populated with the page's `<title>` or `og:title`
- [ ] Description field is auto-populated with `meta[name="description"]` or `og:description`
- [ ] Fetched data overwrites existing values (unless field is dirty)
- [ ] Dirty fields show confirmation hint before overwrite ("Replace?")
- [ ] Loading state is displayed while fetching
- [ ] Error state is displayed if fetch fails
- [ ] User can still manually edit the auto-populated fields
- [ ] Form field order: URL → Title → Tags → Description
- [ ] Edit panel includes description field
- [ ] Description visible on hover/tooltip in story list

### Should Have
- [ ] Button is disabled when URL field is empty or invalid
- [ ] Graceful handling of sites that block scraping
- [ ] Reasonable timeout for slow sites (e.g., 10 seconds)
- [ ] Edit panel has "Fetch" button for re-fetching metadata

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
