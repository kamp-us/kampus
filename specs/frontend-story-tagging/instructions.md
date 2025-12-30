# Frontend Story Tagging - Instructions

## Feature Overview

Build frontend functionality to enable users to add tags to their library stories. The backend tagging system already exists (Library DO with full tag CRUD and story-tag relationships); this feature focuses on creating the core UI components and GraphQL integration for tagging.

**Why this is needed:**
- Users currently have no way to organize or categorize their saved stories
- Tags provide flexible, multi-dimensional organization (stories can belong to multiple categories)
- This is the foundation for future filtering and tag management features

**Scope:** This feature covers tag creation, applying tags to stories, and displaying tags. Filtering by tags and tag management (rename/delete) are separate future features.

## User Stories

### In Scope

**As a user saving a new story, I want to:**
- Add one or more tags when creating a story
- Quickly select from my existing tags using keyboard shortcuts
- Create new tags inline without interrupting my workflow
- See my existing tag vocabulary to maintain consistency

**As a user browsing my library, I want to:**
- See what tags are applied to each story at a glance

**As a user editing an existing story, I want to:**
- Add new tags to a story I previously saved
- Remove tags that are no longer relevant
- Use the same tag selection interface as when creating stories

### Out of Scope (Future Features)

**Tag Filtering** (separate feature):
- Filter story list by clicking a tag
- Inline filter row UI
- Clear filter functionality

**Tag Management** (separate feature):
- Dedicated tag management page
- Rename tags
- Change tag colors
- Delete tags

## Acceptance Criteria

### Must Have (MVP)

#### Tag Display
- [ ] Tags appear on each story row in the library list
- [ ] Tags display inline with domain and date metadata
- [ ] Each tag shows its configured color (subtle treatment: small dot or 10-15% opacity background)
- [ ] Tags are visually distinct from surrounding metadata (chip/pill design)
- [ ] If a story has more than 3 tags, show first 3 plus "+N more" indicator

#### Tag Input Component
- [ ] Combo input component displays selected tags as removable chips
- [ ] Typing filters available tags alphabetically
- [ ] Dropdown shows all existing tags when empty
- [ ] Dropdown includes "Create [typed text]" option when no exact match exists
- [ ] Enter key selects highlighted option or creates new tag
- [ ] Tab key selects option and stays in field (for rapid multi-tag entry)
- [ ] Backspace on empty input removes last selected tag
- [ ] Escape key closes dropdown and clears typed text
- [ ] Each tag chip shows small × icon for removal

#### Story Creation
- [ ] "Add Story" form includes Tags field below Title field
- [ ] Tag input works with keyboard-only workflow (Tab to navigate, type to filter, Enter/Tab to select)
- [ ] Creating a new tag inline assigns a default color (from preset palette)
- [ ] Tags are saved with the story when Save button is clicked

#### Story Editing
- [ ] Edit mode includes Tags field with same functionality as creation
- [ ] Previously applied tags are pre-populated as chips
- [ ] Tags can be added or removed before saving
- [ ] Saving updates story-tag relationships

#### GraphQL Integration
- [ ] Create GraphQL schema for Tag type (id, name, color, createdAt) implementing Node interface
- [ ] Implement `createTag` mutation
- [ ] Implement `listTags` query
- [ ] Update Story type to include `tags` field
- [ ] Update `createStory` mutation to accept optional `tagIds`
- [ ] Update `updateStory` mutation to accept optional `tagIds` (replaces all tags)
- [ ] Update `node` query to handle Tag type

### Nice to Have (Can be deferred)

- Tag usage counts visible in dropdown during selection
- Recent tags shown first in dropdown (before alphabetical list)

### Out of Scope (Future Features)

- **Tag Filtering**: Click-to-filter on tags, TagFilterRow, storiesByTag query
- **Tag Management**: updateTag/deleteTag mutations, rename, recolor, delete UI
- Multi-tag filtering (AND/OR logic)
- Tag hierarchy or tag groups
- Tag-based sidebar navigation panel
- Bulk tag operations
- Tag import/export
- Tag suggestions based on content

## Constraints

### Technical Constraints
- **Desktop only**: No mobile/responsive design required
- **Cloudflare Workers**: GraphQL API runs in worker, uses Durable Objects
- **Relay pattern**: Must follow global ID patterns
- **Effect Schema**: Backend uses Effect Schema for validation
- **GQLoom**: GraphQL schema uses @gqloom/core and @gqloom/effect
- **Base UI components**: Extend Base UI primitives
- **Design system**: Follow existing phoenix design tokens

### UX Constraints
- **Keyboard-first**: Tag input must be fully functional with keyboard alone
- **Low friction**: Tagging workflow must be fast, simple, obvious
- **No modals**: Prefer inline workflows for tag creation
- **Color is subtle**: Tag colors should aid visual scanning, not dominate

### Business Constraints
- **User data isolation**: Tags scoped by Library DO (keyed by user ID)
- **Case-insensitive uniqueness**: Tag names unique per user

## Dependencies

### Backend (Already Complete)
- ✅ Library Durable Object with SQLite storage
- ✅ Tag schema (id, name, color, createdAt)
- ✅ Story-tag junction table (storyTag)
- ✅ Tag methods: createTag, listTags, getTag
- ✅ Story-tag methods: getTagsForStory
- ✅ Tag validation (name uniqueness, color hex format)

### Backend (To Be Built)
- `setStoryTags(storyId, tagIds)` method on Library DO (replaces all tags atomically)
- GraphQL schema for Tag type (implementing Node interface)
- GraphQL resolvers: createTag, listTags
- Update createStory/updateStory to accept tagIds
- Story.tags field resolver
- Update node query to handle Tag type

### Frontend (Existing)
- React with Relay
- Library.tsx page with story CRUD
- Design system components (Button, Field, Fieldset, Input)
- Base UI primitives

### Frontend (To Be Built)
- TagChip component
- TagInput component
- TagDropdown component

## Implementation Notes

### Component Build Order
1. **TagChip** - Standalone display component
2. **TagDropdown** - Filterable dropdown for selection
3. **TagInput** - Combo input combining chips + dropdown
4. **GraphQL schema & resolvers** - Wire up backend
5. **Story form integration** - Add Tags field to create/edit
6. **Story row integration** - Display tags on list items

### Default Color Palette
When creating tags inline, assign colors from this preset list (cycle through):

```
FF6B6B (red)
4ECDC4 (teal)
45B7D1 (blue)
FFA07A (orange)
98D8C8 (mint)
F7DC6F (yellow)
BB8FCE (purple)
85C1E2 (sky)
```

### GraphQL Patterns
- Tags use Relay global IDs (encode/decode with NodeType.Tag)
- Tag lists returned as arrays (not paginated at this scale)
- Story type includes `tags` field returning array of tags
- Mutations return payload types with error handling

### Tag Name Validation
- Minimum length: 1 character
- Maximum length: 50 characters
- Trim whitespace on creation
- Case-insensitive uniqueness check

## Success Metrics

- User can tag a new story in under 3 seconds using keyboard alone
- Tag colors aid visual scanning without creating UI clutter
- No user confusion about how to create, apply, or remove tags
- Zero GraphQL errors related to tag operations

## Related Specs

- **[library-tags](../library-tags/)** - Backend implementation (complete)
- **[user-library-page](../user-library-page/)** - Existing story CRUD UI
- **Future: frontend-tag-filtering** - Filter stories by tag
- **Future: frontend-tag-management** - Rename, recolor, delete tags
