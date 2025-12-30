# Frontend Story Tagging - Requirements

This document defines the structured functional and non-functional requirements derived from the [instructions.md](./instructions.md).

**Scope:** Core tagging functionality only. Tag filtering and tag management are separate future features.

## Requirement Categories

| Category | Prefix | Description |
|----------|--------|-------------|
| Functional - Component | FC | Component behavior and rendering |
| Functional - Interaction | FI | User interaction and input handling |
| Functional - API | FA | GraphQL schema and resolver requirements |
| Non-Functional | NF | Performance, usability, design |

---

## 1. Tag Display Requirements

### FC-1: TagChip Component

| ID | Requirement | Priority |
|----|-------------|----------|
| FC-1.1 | TagChip SHALL render a tag as a pill/chip with rounded corners | Must |
| FC-1.2 | TagChip SHALL display the tag name as text content | Must |
| FC-1.3 | TagChip SHALL display the tag's color as a visual indicator (small dot OR background at 10-15% opacity) | Must |
| FC-1.4 | TagChip SHALL accept a `size` prop with values "sm" (for story rows) and "md" (for inputs) | Must |
| FC-1.5 | TagChip SHALL accept a `removable` prop that when true shows a × icon | Must |
| FC-1.6 | TagChip SHALL accept an `onRemove` handler that fires when × is clicked | Must |

### FC-2: Story Row Tag Display

| ID | Requirement | Priority |
|----|-------------|----------|
| FC-2.1 | Story rows SHALL display tags inline after domain and date metadata | Must |
| FC-2.2 | Story rows SHALL use TagChip with size="sm" for each tag | Must |
| FC-2.3 | Story rows SHALL display a maximum of 3 tags visually | Must |
| FC-2.4 | Story rows with more than 3 tags SHALL show "+N more" indicator after the third tag | Must |
| FC-2.5 | Story rows with no tags SHALL not render any tag-related elements | Must |

---

## 2. Tag Input Requirements

### FC-3: TagInput Component

| ID | Requirement | Priority |
|----|-------------|----------|
| FC-3.1 | TagInput SHALL render as a container that looks like a text input field | Must |
| FC-3.2 | TagInput SHALL display selected tags as removable TagChip components inside the container | Must |
| FC-3.3 | TagInput SHALL include a text input for typing after the selected tag chips | Must |
| FC-3.4 | TagInput SHALL accept `selectedTags` prop (array of tag objects) | Must |
| FC-3.5 | TagInput SHALL accept `availableTags` prop (array of all available tags) | Must |
| FC-3.6 | TagInput SHALL accept `onChange` callback when selection changes | Must |
| FC-3.7 | TagInput SHALL accept `onCreate` callback when a new tag is created | Must |
| FC-3.8 | TagInput SHALL show TagDropdown when the input is focused | Must |
| FC-3.9 | TagInput SHALL hide TagDropdown when Escape is pressed or focus is lost | Must |

### FC-4: TagDropdown Component

| ID | Requirement | Priority |
|----|-------------|----------|
| FC-4.1 | TagDropdown SHALL render as a positioned dropdown below TagInput | Must |
| FC-4.2 | TagDropdown SHALL list all available tags that are not already selected | Must |
| FC-4.3 | TagDropdown SHALL sort tags alphabetically by name | Must |
| FC-4.4 | TagDropdown SHALL filter visible tags based on typed text (prefix or substring match) | Must |
| FC-4.5 | TagDropdown SHALL show each tag with a color dot indicator | Must |
| FC-4.6 | TagDropdown SHALL include a "Create [typed text]" option when no exact name match exists | Must |
| FC-4.7 | TagDropdown "Create" option SHALL NOT appear when input is empty | Must |
| FC-4.8 | TagDropdown SHALL highlight one option as "active" for keyboard navigation | Must |
| FC-4.9 | TagDropdown SHALL scroll to keep the active option visible | Should |

### FI-1: Tag Input Keyboard Interactions

| ID | Requirement | Priority |
|----|-------------|----------|
| FI-1.1 | Typing characters SHALL filter the dropdown to matching tags | Must |
| FI-1.2 | Arrow Down SHALL move the active highlight to the next option | Must |
| FI-1.3 | Arrow Up SHALL move the active highlight to the previous option | Must |
| FI-1.4 | Enter key SHALL select the currently highlighted option | Must |
| FI-1.5 | Enter key on "Create [text]" option SHALL create a new tag with that name | Must |
| FI-1.6 | Tab key SHALL select the currently highlighted option and keep focus in the input | Must |
| FI-1.7 | Backspace on empty input text SHALL remove the last selected tag chip | Must |
| FI-1.8 | Escape key SHALL close the dropdown and clear the typed text | Must |
| FI-1.9 | When dropdown opens, first option SHALL be highlighted by default | Must |

### FI-2: Tag Chip Removal Interactions

| ID | Requirement | Priority |
|----|-------------|----------|
| FI-2.1 | Clicking × on a selected tag chip SHALL remove it from selection | Must |
| FI-2.2 | Removing a tag SHALL return focus to the text input | Should |
| FI-2.3 | Removed tags SHALL become available again in the dropdown | Must |

---

## 3. Story Form Requirements

### FC-5: Create Story Form with Tags

| ID | Requirement | Priority |
|----|-------------|----------|
| FC-5.1 | Create Story form SHALL include a "Tags" field below the "Title" field | Must |
| FC-5.2 | Tags field SHALL use the TagInput component | Must |
| FC-5.3 | Tags field label SHALL be "Tags" | Must |
| FC-5.4 | Tags field SHALL be optional (stories can be saved without tags) | Must |
| FC-5.5 | Saving a story SHALL include the selected tag IDs in the mutation | Must |
| FC-5.6 | After successful save, the form SHALL reset including clearing selected tags | Must |

### FC-6: Edit Story Form with Tags

| ID | Requirement | Priority |
|----|-------------|----------|
| FC-6.1 | Edit Story form SHALL include a "Tags" field | Must |
| FC-6.2 | Edit Story form Tags field SHALL be pre-populated with the story's existing tags | Must |
| FC-6.3 | Users SHALL be able to add new tags to an existing story | Must |
| FC-6.4 | Users SHALL be able to remove tags from an existing story | Must |
| FC-6.5 | Saving edits SHALL update the story's tag associations | Must |
| FC-6.6 | Canceling edits SHALL revert tag selection to the original state | Must |

---

## 4. GraphQL API Requirements

### FA-1: Tag Type Schema

| ID | Requirement | Priority |
|----|-------------|----------|
| FA-1.1 | GraphQL schema SHALL define a Tag type | Must |
| FA-1.2 | Tag type SHALL implement Node interface | Must |
| FA-1.3 | Tag type SHALL have field `id` (ID!, global ID format) | Must |
| FA-1.4 | Tag type SHALL have field `name` (String!) | Must |
| FA-1.5 | Tag type SHALL have field `color` (String!, 6-digit hex) | Must |
| FA-1.6 | Tag type SHALL have field `createdAt` (String!, ISO format) | Must |
| FA-1.7 | `node(id: ...)` query SHALL resolve Tag types | Must |

### FA-2: Tag Queries

| ID | Requirement | Priority |
|----|-------------|----------|
| FA-2.1 | Schema SHALL define `listTags` query returning [Tag!]! | Must |
| FA-2.2 | `listTags` SHALL return all tags for the authenticated user | Must |
| FA-2.3 | `listTags` SHALL require authentication | Must |

### FA-3: Tag Mutations

| ID | Requirement | Priority |
|----|-------------|----------|
| FA-3.1 | Schema SHALL define `createTag` mutation | Must |
| FA-3.2 | `createTag` SHALL accept `name` (String!) and `color` (String!) inputs | Must |
| FA-3.3 | `createTag` SHALL return CreateTagPayload with `tag` field | Must |
| FA-3.4 | `createTag` SHALL return error if name already exists | Must |
| FA-3.5 | `createTag` SHALL require authentication | Must |

### FA-4: Story-Tag Relationship

| ID | Requirement | Priority |
|----|-------------|----------|
| FA-4.1 | Story type SHALL include `tags` field returning [Tag!]! | Must |
| FA-4.2 | Story `tags` field SHALL resolve to tags associated with the story | Must |

### FA-5: Story Mutations with Tags

| ID | Requirement | Priority |
|----|-------------|----------|
| FA-5.1 | `createStory` mutation SHALL accept optional `tagIds` ([String!]) input | Must |
| FA-5.2 | If `tagIds` provided, `createStory` SHALL associate tags with the new story | Must |
| FA-5.3 | `updateStory` mutation SHALL accept optional `tagIds` ([String!]) input | Must |
| FA-5.4 | If `tagIds` provided, `updateStory` SHALL replace all story tags with the provided list | Must |
| FA-5.5 | If `tagIds` is empty array, `updateStory` SHALL remove all tags from story | Must |
| FA-5.6 | If `tagIds` is null/undefined, `updateStory` SHALL not modify tags | Must |

### FA-6: Backend Library DO

| ID | Requirement | Priority |
|----|-------------|----------|
| FA-6.1 | Library DO SHALL implement `setStoryTags(storyId, tagIds)` method | Must |
| FA-6.2 | `setStoryTags` SHALL atomically replace all tags for a story | Must |
| FA-6.3 | `setStoryTags` SHALL validate that all provided tagIds exist | Must |

---

## 5. Non-Functional Requirements

### NF-1: Performance

| ID | Requirement | Priority |
|----|-------------|----------|
| NF-1.1 | Tag dropdown SHALL render within 100ms of focus | Should |
| NF-1.2 | Filtering dropdown by typing SHALL update within 50ms | Should |
| NF-1.3 | Tag operations SHALL not cause full page reload | Must |

### NF-2: Usability

| ID | Requirement | Priority |
|----|-------------|----------|
| NF-2.1 | Tag input SHALL be fully operable using keyboard only | Must |
| NF-2.2 | TagChip SHALL have sufficient color contrast for accessibility | Must |
| NF-2.3 | Interactive elements SHALL have visible focus indicators | Must |
| NF-2.4 | Error messages SHALL be clear and actionable | Must |

### NF-3: Design

| ID | Requirement | Priority |
|----|-------------|----------|
| NF-3.1 | All components SHALL use phoenix design tokens | Must |
| NF-3.2 | Components SHALL follow existing design system patterns | Must |
| NF-3.3 | Tag colors SHALL be applied subtly (not full saturation backgrounds) | Must |
| NF-3.4 | TagDropdown SHALL follow Menu component styling from Base UI | Must |

---

## 6. Requirements Summary

| Category | Count |
|----------|-------|
| FC (Component) | 24 |
| FI (Interaction) | 12 |
| FA (API) | 18 |
| NF (Non-functional) | 11 |
| **Total** | **~35 core Must-haves** |

---

## 7. Component Dependencies

```
TagChip
└── (standalone)

TagDropdown
└── TagChip (for option rendering)

TagInput
├── TagChip (for selected tags)
└── TagDropdown (for selection)

CreateStoryForm
└── TagInput

EditStoryForm (StoryRow edit mode)
└── TagInput

StoryRow
└── TagChip (for tag display)
```

---

## 8. Out of Scope (Confirmed)

These requirements are explicitly excluded and will be separate features:

**Tag Filtering Feature:**
- TagFilterRow component
- Click-to-filter on story row tags
- storiesByTag query
- Filter state management

**Tag Management Feature:**
- Tag management page
- updateTag mutation
- deleteTag mutation
- ColorPicker component
- Rename, recolor, delete UI

---

## 9. Open Items for Design Phase

1. **State management**: How to share available tags across components
2. **Relay fragments**: How to fetch tags with stories efficiently
3. **Optimistic updates**: Whether to show tag immediately on create
4. **Default color assignment**: Algorithm for cycling through preset colors
