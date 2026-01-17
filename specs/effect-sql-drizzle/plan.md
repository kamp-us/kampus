# Plan: @effect/sql-drizzle Migration

## Tasks

### Phase 1: Setup
- [ ] ESD-100: Add @effect/sql-drizzle dependency
- [ ] ESD-101: Update Spellbook.ts with schema param and SqliteDrizzle layer

### Phase 2: Library Feature
- [ ] ESD-200: Delete models.ts
- [ ] ESD-201: Migrate getStory handler
- [ ] ESD-202: Migrate listStories handler
- [ ] ESD-203: Migrate listStoriesByTag handler
- [ ] ESD-204: Migrate createStory handler
- [ ] ESD-205: Migrate updateStory handler
- [ ] ESD-206: Migrate deleteStory handler
- [ ] ESD-207: Migrate tag handlers (listTags, createTag, updateTag, deleteTag)
- [ ] ESD-208: Migrate getTagsForStory, setStoryTags handlers
- [ ] ESD-209: Update Library.ts to pass schema
- [ ] ESD-210: Remove format helpers (formatStory, formatTag, etc.)

### Phase 3: web-page-parser Feature
- [ ] ESD-300: Migrate web-page-parser handlers
- [ ] ESD-301: Update WebPageParser.ts to pass schema

### Phase 4: Verification
- [ ] ESD-400: Run tests, fix any failures
- [ ] ESD-401: Run typecheck
- [ ] ESD-402: Run lint

## Progress

_No progress yet_
