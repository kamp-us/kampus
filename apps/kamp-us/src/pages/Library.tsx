import {useAtom} from "@effect-atom/atom-react";
import {type FormEvent, Suspense, useMemo, useState} from "react";
import {
	graphql,
	useFragment,
	useLazyLoadQuery,
	useMutation,
	usePaginationFragment,
} from "react-relay";
import {Link, Navigate} from "react-router";
import type {Library_stories$key} from "../__generated__/Library_stories.graphql";
import type {Library_storiesByTag$key} from "../__generated__/Library_storiesByTag.graphql";
import type {Library_story$key} from "../__generated__/Library_story.graphql";
import type {LibraryByTagPaginationQuery} from "../__generated__/LibraryByTagPaginationQuery.graphql";
import type {LibraryByTagQuery as LibraryByTagQueryType} from "../__generated__/LibraryByTagQuery.graphql";
import type {LibraryCreateStoryMutation} from "../__generated__/LibraryCreateStoryMutation.graphql";
import type {LibraryCreateTagMutation} from "../__generated__/LibraryCreateTagMutation.graphql";
import type {LibraryDeleteStoryMutation} from "../__generated__/LibraryDeleteStoryMutation.graphql";
import type {LibraryQuery as LibraryQueryType} from "../__generated__/LibraryQuery.graphql";
import type {LibraryStoriesPaginationQuery} from "../__generated__/LibraryStoriesPaginationQuery.graphql";
import type {LibraryUpdateStoryMutation} from "../__generated__/LibraryUpdateStoryMutation.graphql";
import {useAuth} from "../auth/AuthContext";
import {AlertDialog} from "../design/AlertDialog";
import {Button} from "../design/Button";
import {Field} from "../design/Field";
import {Fieldset} from "../design/Fieldset";
import {Input} from "../design/Input";
import {MoreHorizontalIcon} from "../design/icons/MoreHorizontalIcon";
import {Menu} from "../design/Menu";
import {TagChip} from "../design/TagChip";
import {type Tag, TagInput} from "../design/TagInput";
import {Textarea} from "../design/Textarea";
import {tagFilterAtom} from "../rpc/atoms";
import styles from "./Library.module.css";

// Default color palette for new tags
const TAG_COLORS = [
	"FF6B6B", // red
	"4ECDC4", // teal
	"45B7D1", // blue
	"FFA07A", // orange
	"98D8C8", // mint
	"F7DC6F", // yellow
	"BB8FCE", // purple
	"85C1E2", // sky
];

function getNextTagColor(existingTags: readonly Tag[]): string {
	const index = existingTags.length % TAG_COLORS.length;
	return TAG_COLORS[index];
}

// Helper to format relative dates
function formatRelativeDate(dateStr: string) {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	if (diffDays < 7) return `${diffDays} days ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
	return date.toLocaleDateString("en-US", {month: "short", day: "numeric"});
}

// Helper to extract domain from URL
function extractDomain(url: string) {
	try {
		return new URL(url).hostname.replace("www.", "");
	} catch {
		return url;
	}
}

// Hook to manage tag filter via URL search params (using effect-atom)
function useTagFilter() {
	const [tagId, setTagId] = useAtom(tagFilterAtom);

	const setTagFilter = (newTagId: string | null) => {
		setTagId(newTagId ?? "");
	};

	const clearFilter = () => setTagId("");

	return {tagId: tagId || null, setTagFilter, clearFilter};
}

// ===== GraphQL Definitions =====

const LibraryQuery = graphql`
	query LibraryQuery($first: Int!) {
		me {
			library {
				...Library_stories @arguments(first: $first)
				tags {
					id
					name
					color
				}
			}
		}
	}
`;

const LibraryByTagQuery = graphql`
	query LibraryByTagQuery($tagName: String!, $first: Int!) {
		me {
			library {
				...Library_storiesByTag @arguments(tagName: $tagName, first: $first)
				tags {
					id
					name
					color
				}
			}
		}
	}
`;

const LibraryStoriesFragment = graphql`
	fragment Library_stories on Library
	@argumentDefinitions(
		first: {type: "Int", defaultValue: 10}
		after: {type: "String"}
	)
	@refetchable(queryName: "LibraryStoriesPaginationQuery") {
		stories(first: $first, after: $after) @connection(key: "Library_stories") {
			edges {
				node {
					id
					...Library_story
				}
			}
			pageInfo {
				hasNextPage
				endCursor
			}
			totalCount
		}
	}
`;

const LibraryStoriesByTagFragment = graphql`
	fragment Library_storiesByTag on Library
	@argumentDefinitions(
		tagName: {type: "String!"}
		first: {type: "Int", defaultValue: 10}
		after: {type: "String"}
	)
	@refetchable(queryName: "LibraryByTagPaginationQuery") {
		storiesByTag(tagName: $tagName, first: $first, after: $after) @connection(key: "Library_storiesByTag") {
			edges {
				node {
					id
					...Library_story
				}
			}
			pageInfo {
				hasNextPage
				endCursor
			}
			totalCount
		}
	}
`;

const LibraryStoryFragment = graphql`
	fragment Library_story on Story {
		id
		url
		title
		description
		createdAt
		tags {
			id
			name
			color
		}
	}
`;

const CreateStoryMutation = graphql`
	mutation LibraryCreateStoryMutation($input: CreateStoryInput!) {
		createStory(input: $input) {
			story {
				id
				...Library_story
			}
		}
	}
`;

const UpdateStoryMutation = graphql`
	mutation LibraryUpdateStoryMutation($input: UpdateStoryInput!) {
		updateStory(input: $input) {
			story {
				id
				...Library_story
			}
			error {
				... on StoryNotFoundError {
					message
				}
			}
		}
	}
`;

const DeleteStoryMutation = graphql`
	mutation LibraryDeleteStoryMutation($input: DeleteStoryInput!) {
		deleteStory(input: $input) {
			deletedStoryId @deleteRecord
			success
			error {
				message
			}
		}
	}
`;

const CreateTagMutation = graphql`
	mutation LibraryCreateTagMutation($input: CreateTagInput!) {
		createTag(input: $input) {
			tag {
				id
				name
				color
			}
			error {
				... on InvalidTagNameError {
					message
				}
				... on TagNameExistsError {
					message
				}
			}
		}
	}
`;

// ===== Components =====

function TagFilterBar({
	tags,
	selectedTagId,
	onTagSelect,
	onClearFilter,
	totalCount,
}: {
	tags: readonly Tag[];
	selectedTagId: string | null;
	onTagSelect: (tagId: string) => void;
	onClearFilter: () => void;
	totalCount: number;
}) {
	const selectedTag = selectedTagId ? tags.find((t) => t.id === selectedTagId) : null;
	const storyLabel = totalCount === 1 ? "story" : "stories";

	if (selectedTag) {
		return (
			<div className={styles.tagFilterRow}>
				<div className={styles.activeFilter}>
					<TagChip name={selectedTag.name} color={selectedTag.color} />
					<button type="button" className={styles.clearFilter} onClick={onClearFilter}>
						× Clear filter
					</button>
				</div>
				<span className={styles.storyCount}>
					{totalCount} {storyLabel}
				</span>
			</div>
		);
	}

	return (
		<div className={styles.tagFilterSection}>
			<div className={styles.tagFilterRow}>
				<span className={styles.filterLabel}>All stories</span>
				<span className={styles.storyCount}>
					{totalCount} {storyLabel}
				</span>
			</div>
			{tags.length > 0 && (
				<div className={styles.tagFilterList}>
					{tags.map((tag) => (
						<button
							key={tag.id}
							type="button"
							className={styles.tagFilterButton}
							onClick={() => onTagSelect(tag.id)}
						>
							<TagChip name={tag.name} color={tag.color} />
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function EmptyState({onAddClick}: {onAddClick: () => void}) {
	return (
		<div className={styles.emptyState}>
			<div className={styles.emptyIcon}>📚</div>
			<h2 className={styles.emptyTitle}>No stories saved yet</h2>
			<p className={styles.emptyText}>Save articles, docs, and links to revisit later.</p>
			<Button onClick={onAddClick}>Add your first story</Button>
		</div>
	);
}

function LoadMoreButton({onClick, isLoading}: {onClick: () => void; isLoading: boolean}) {
	return (
		<div className={styles.loadMoreContainer}>
			<Button onClick={onClick} disabled={isLoading}>
				{isLoading ? "Loading..." : "Load More"}
			</Button>
		</div>
	);
}

function CreateStoryForm({
	isExpanded,
	onExpand,
	onCollapse,
	availableTags,
	connectionId,
}: {
	isExpanded: boolean;
	onExpand: () => void;
	onCollapse: () => void;
	availableTags: readonly Tag[];
	connectionId: string;
}) {
	const [url, setUrl] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [selectedTags, setSelectedTags] = useState<readonly Tag[]>([]);
	const [isFetching, setIsFetching] = useState(false);
	const [fetchError, setFetchError] = useState<string | null>(null);

	const [commitCreateStory, isCreating] =
		useMutation<LibraryCreateStoryMutation>(CreateStoryMutation);
	const [commitCreateTag] = useMutation<LibraryCreateTagMutation>(CreateTagMutation);

	// Check if URL is valid for fetch
	const isValidUrl = useMemo(() => {
		try {
			const parsed = new URL(url);
			return ["http:", "https:"].includes(parsed.protocol);
		} catch {
			return false;
		}
	}, [url]);

	const handleFetchMetadata = async () => {
		if (!url || !isValidUrl) return;
		setIsFetching(true);
		setFetchError(null);

		try {
			const response = await fetch("/graphql", {
				method: "POST",
				headers: {"Content-Type": "application/json"},
				body: JSON.stringify({
					query: `query FetchUrlMetadata($url: String!) { fetchUrlMetadata(url: $url) { title description error } }`,
					variables: {url},
				}),
			});
			const result = await response.json();
			const metadata = result.data?.fetchUrlMetadata;
			if (metadata?.error) {
				setFetchError(metadata.error);
			} else {
				if (metadata?.title) setTitle(metadata.title);
				if (metadata?.description) setDescription(metadata.description);
			}
		} catch (e) {
			setFetchError(String(e));
		} finally {
			setIsFetching(false);
		}
	};

	const handleCreateTag = (name: string) => {
		const color = getNextTagColor(availableTags);
		commitCreateTag({
			variables: {input: {name, color}},
			updater: (store) => {
				const payload = store.getRootField("createTag");
				const newTag = payload?.getLinkedRecord("tag");
				if (!newTag) return;

				// Add new tag to library.tags list
				const root = store.getRoot();
				const me = root.getLinkedRecord("me");
				const library = me?.getLinkedRecord("library");
				if (!library) return;

				const existingTags = library.getLinkedRecords("tags") || [];
				library.setLinkedRecords([...existingTags, newTag], "tags");
			},
			onCompleted: (response) => {
				if (response.createTag.tag) {
					// Add the new tag to selected tags
					setSelectedTags([...selectedTags, response.createTag.tag]);
				}
			},
		});
	};

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (!url.trim() || !title.trim()) return;

		const tagIds = selectedTags.length > 0 ? selectedTags.map((t) => t.id) : undefined;

		commitCreateStory({
			variables: {
				input: {
					url: url.trim(),
					title: title.trim(),
					description: description.trim() || undefined,
					tagIds,
				},
			},
			optimisticResponse: {
				createStory: {
					story: {
						id: `temp-${Date.now()}`,
						url: url.trim(),
						title: title.trim(),
						description: description.trim() || null,
						createdAt: new Date().toISOString(),
						tags: selectedTags.map((t) => ({id: t.id, name: t.name, color: t.color})),
					},
				},
			},
			updater: (store) => {
				const payload = store.getRootField("createStory");
				const newStory = payload?.getLinkedRecord("story");
				if (!newStory) return;

				const connection = store.get(connectionId);
				if (!connection) return;

				// Create new edge
				const newEdge = store.create(`edge-${newStory.getDataID()}`, "StoryEdge");
				newEdge.setLinkedRecord(newStory, "node");
				newEdge.setValue(newStory.getDataID(), "cursor");

				// Prepend to connection
				const edges = connection.getLinkedRecords("edges") || [];
				connection.setLinkedRecords([newEdge, ...edges], "edges");
			},
			onCompleted: () => {
				setUrl("");
				setTitle("");
				setDescription("");
				setSelectedTags([]);
				onCollapse();
			},
		});
	};

	const handleCancel = () => {
		setUrl("");
		setTitle("");
		setDescription("");
		setSelectedTags([]);
		setFetchError(null);
		onCollapse();
	};

	if (!isExpanded) {
		return (
			<button type="button" className={styles.addPrompt} onClick={onExpand}>
				+ Add a story...
			</button>
		);
	}

	return (
		<form onSubmit={handleSubmit} className={styles.createForm}>
			<Fieldset.Root>
				<Fieldset.Legend>Add Story</Fieldset.Legend>

				<Field
					label="URL"
					error={fetchError ?? undefined}
					control={
						<div className={styles.urlFieldContainer}>
							<Input
								type="url"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								required
								autoFocus
							/>
							<Button
								type="button"
								onClick={handleFetchMetadata}
								disabled={!isValidUrl || isFetching}
							>
								{isFetching ? "Fetching..." : "Fetch"}
							</Button>
						</div>
					}
				/>

				<Field
					label="Title"
					control={
						<Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
					}
				/>

				<Field
					label="Tags"
					control={
						<TagInput
							selectedTags={selectedTags}
							availableTags={availableTags}
							onChange={setSelectedTags}
							onCreate={handleCreateTag}
							placeholder="Add tags..."
						/>
					}
				/>

				<Field
					label="Description"
					control={
						<Textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Optional description..."
							rows={3}
						/>
					}
				/>
			</Fieldset.Root>

			<div className={styles.formActions}>
				<Button type="button" onClick={handleCancel}>
					Cancel
				</Button>
				<Button type="submit" disabled={isCreating}>
					{isCreating ? "Saving..." : "Save Story"}
				</Button>
			</div>
		</form>
	);
}

function StoryRow({
	story: storyRef,
	availableTags,
}: {
	story: Library_story$key;
	availableTags: readonly Tag[];
}) {
	const story = useFragment(LibraryStoryFragment, storyRef);
	const domain = extractDomain(story.url);
	const relativeDate = formatRelativeDate(story.createdAt);

	const [isEditing, setIsEditing] = useState(false);
	const [editTitle, setEditTitle] = useState(story.title);
	const [editDescription, setEditDescription] = useState(story.description ?? "");
	const [editTags, setEditTags] = useState<readonly Tag[]>(story.tags);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const [commitUpdateStory, isUpdating] =
		useMutation<LibraryUpdateStoryMutation>(UpdateStoryMutation);
	const [commitDeleteStory, isDeleting] =
		useMutation<LibraryDeleteStoryMutation>(DeleteStoryMutation);
	const [commitCreateTag] = useMutation<LibraryCreateTagMutation>(CreateTagMutation);

	const handleEdit = () => {
		setEditTitle(story.title);
		setEditDescription(story.description ?? "");
		setEditTags(story.tags);
		setIsEditing(true);
	};

	const handleCancelEdit = () => {
		setEditTitle(story.title);
		setEditDescription(story.description ?? "");
		setEditTags(story.tags);
		setIsEditing(false);
	};

	const handleCreateTag = (name: string) => {
		const color = getNextTagColor(availableTags);
		commitCreateTag({
			variables: {input: {name, color}},
			updater: (store) => {
				const payload = store.getRootField("createTag");
				const newTag = payload?.getLinkedRecord("tag");
				if (!newTag) return;

				// Add new tag to library.tags list
				const root = store.getRoot();
				const me = root.getLinkedRecord("me");
				const library = me?.getLinkedRecord("library");
				if (!library) return;

				const existingTags = library.getLinkedRecords("tags") || [];
				library.setLinkedRecords([...existingTags, newTag], "tags");
			},
			onCompleted: (response) => {
				if (response.createTag.tag) {
					setEditTags([...editTags, response.createTag.tag]);
				}
			},
		});
	};

	const handleSaveEdit = () => {
		const trimmedTitle = editTitle.trim();
		if (trimmedTitle === "") return;

		// Check if anything changed
		const titleChanged = trimmedTitle !== story.title;
		const descriptionChanged = editDescription !== (story.description ?? "");
		const currentTagIds = story.tags.map((t) => t.id).sort();
		const newTagIds = editTags.map((t) => t.id).sort();
		const tagsChanged = JSON.stringify(currentTagIds) !== JSON.stringify(newTagIds);

		if (!titleChanged && !descriptionChanged && !tagsChanged) {
			setIsEditing(false);
			return;
		}

		commitUpdateStory({
			variables: {
				input: {
					id: story.id,
					title: titleChanged ? trimmedTitle : undefined,
					description: descriptionChanged ? editDescription : undefined,
					tagIds: tagsChanged ? editTags.map((t) => t.id) : undefined,
				},
			},
			optimisticResponse: {
				updateStory: {
					story: {
						id: story.id,
						url: story.url,
						title: titleChanged ? trimmedTitle : story.title,
						description: descriptionChanged ? editDescription : story.description,
						createdAt: story.createdAt,
						tags: tagsChanged
							? editTags.map((t) => ({id: t.id, name: t.name, color: t.color}))
							: story.tags,
					},
					error: null,
				},
			},
			onCompleted: () => {
				setIsEditing(false);
			},
		});
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSaveEdit();
		} else if (e.key === "Escape") {
			handleCancelEdit();
		}
	};

	const handleDelete = () => {
		commitDeleteStory({
			variables: {input: {id: story.id}},
			optimisticResponse: {
				deleteStory: {
					deletedStoryId: story.id,
					success: true,
					error: null,
				},
			},
			onCompleted: () => {
				setDeleteDialogOpen(false);
			},
		});
	};

	if (isEditing) {
		return (
			<article className={styles.storyRow}>
				<div className={styles.editRow}>
					<input
						type="text"
						value={editTitle}
						onChange={(e) => setEditTitle(e.target.value)}
						onKeyDown={handleKeyDown}
						className={styles.editInput}
						placeholder="Title"
						// biome-ignore lint/a11y/noAutofocus: Focus is intentional when user clicks Edit
						autoFocus
					/>
					<TagInput
						selectedTags={editTags}
						availableTags={availableTags}
						onChange={setEditTags}
						onCreate={handleCreateTag}
						placeholder="Add tags..."
					/>
					<Textarea
						value={editDescription}
						onChange={(e) => setEditDescription(e.target.value)}
						placeholder="Description (optional)"
						rows={3}
					/>
					<div className={styles.editActions}>
						<Button onClick={handleCancelEdit}>Cancel</Button>
						<Button onClick={handleSaveEdit} disabled={isUpdating}>
							{isUpdating ? "Saving..." : "Save"}
						</Button>
					</div>
				</div>
				<div className={styles.storyMeta}>
					{domain} · {relativeDate}
				</div>
			</article>
		);
	}

	const storyTags = story.tags;

	return (
		<article className={styles.storyRow}>
			<div className={styles.storyContent}>
				<div className={styles.storyMain}>
					<a
						href={story.url}
						target="_blank"
						rel="noopener noreferrer"
						className={styles.storyTitle}
						title={story.description ?? undefined}
					>
						{story.title}
					</a>
					<div className={styles.storyMeta}>
						{domain} · {relativeDate}
					</div>
					{storyTags.length > 0 && (
						<div className={styles.storyTags}>
							{storyTags.slice(0, 3).map((tag) => (
								<TagChip key={tag.id} name={tag.name} color={tag.color} />
							))}
							{storyTags.length > 3 && (
								<span className={styles.moreTags}>+{storyTags.length - 3} more</span>
							)}
						</div>
					)}
				</div>
				<Menu.Root>
					<Menu.Trigger aria-label={`Options for ${story.title}`}>
						<MoreHorizontalIcon />
					</Menu.Trigger>
					<Menu.Portal>
						<Menu.Positioner>
							<Menu.Popup>
								<Menu.Item onClick={handleEdit}>Edit</Menu.Item>
								<Menu.Separator />
								<Menu.Item data-danger onClick={() => setDeleteDialogOpen(true)}>
									Delete
								</Menu.Item>
							</Menu.Popup>
						</Menu.Positioner>
					</Menu.Portal>
				</Menu.Root>
			</div>

			<AlertDialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialog.Portal>
					<AlertDialog.Backdrop />
					<AlertDialog.Popup>
						<AlertDialog.Title>Delete story?</AlertDialog.Title>
						<AlertDialog.Description>
							This will permanently delete "{story.title}". This action cannot be undone.
						</AlertDialog.Description>
						<div className={styles.dialogActions}>
							<AlertDialog.Close render={<Button />}>Cancel</AlertDialog.Close>
							<Button onClick={handleDelete} disabled={isDeleting}>
								{isDeleting ? "Deleting..." : "Delete"}
							</Button>
						</div>
					</AlertDialog.Popup>
				</AlertDialog.Portal>
			</AlertDialog.Root>
		</article>
	);
}

function AllStoriesListRelay({
	libraryRef,
	availableTags,
	onTagSelect,
	onFormExpand,
}: {
	libraryRef: Library_stories$key;
	availableTags: readonly Tag[];
	onTagSelect: (tagId: string) => void;
	onFormExpand: () => void;
}) {
	const {data, loadNext, hasNext, isLoadingNext} = usePaginationFragment<
		LibraryStoriesPaginationQuery,
		Library_stories$key
	>(LibraryStoriesFragment, libraryRef);

	const stories = data.stories.edges;
	const totalCount = data.stories.totalCount;
	const hasStories = stories.length > 0;

	const handleLoadMore = () => {
		if (hasNext && !isLoadingNext) {
			loadNext(10);
		}
	};

	return (
		<>
			<TagFilterBar
				tags={availableTags}
				selectedTagId={null}
				onTagSelect={onTagSelect}
				onClearFilter={() => {}}
				totalCount={totalCount}
			/>

			{hasStories ? (
				<>
					<div className={styles.storyList}>
						{stories
							.filter(({node}) => node != null)
							.map(({node}) => (
								<StoryRow key={node.id} story={node} availableTags={availableTags} />
							))}
					</div>
					{hasNext && <LoadMoreButton onClick={handleLoadMore} isLoading={isLoadingNext} />}
				</>
			) : (
				<EmptyState onAddClick={onFormExpand} />
			)}
		</>
	);
}

function FilteredStoriesListRelay({
	libraryRef,
	availableTags,
	selectedTagId,
	onTagSelect,
	onClearFilter,
}: {
	libraryRef: Library_storiesByTag$key;
	availableTags: readonly Tag[];
	selectedTagId: string;
	onTagSelect: (tagId: string) => void;
	onClearFilter: () => void;
}) {
	const {data, loadNext, hasNext, isLoadingNext} = usePaginationFragment<
		LibraryByTagPaginationQuery,
		Library_storiesByTag$key
	>(LibraryStoriesByTagFragment, libraryRef);

	const stories = data.storiesByTag.edges;
	const totalCount = data.storiesByTag.totalCount;
	const hasStories = stories.length > 0;

	const handleLoadMore = () => {
		if (hasNext && !isLoadingNext) {
			loadNext(10);
		}
	};

	return (
		<>
			<TagFilterBar
				tags={availableTags}
				selectedTagId={selectedTagId}
				onTagSelect={onTagSelect}
				onClearFilter={onClearFilter}
				totalCount={totalCount}
			/>

			{hasStories ? (
				<>
					<div className={styles.storyList}>
						{stories
							.filter(({node}) => node != null)
							.map(({node}) => (
								<StoryRow key={node.id} story={node} availableTags={availableTags} />
							))}
					</div>
					{hasNext && <LoadMoreButton onClick={handleLoadMore} isLoading={isLoadingNext} />}
				</>
			) : (
				<div className={styles.emptyState}>
					<p className={styles.emptyText}>No stories with this tag yet.</p>
					<Button onClick={onClearFilter}>Show all stories</Button>
				</div>
			)}
		</>
	);
}

function FilteredLibraryContent({
	tagName,
	tagId,
	onTagSelect,
	onClearFilter,
}: {
	tagName: string;
	tagId: string;
	onTagSelect: (tagId: string) => void;
	onClearFilter: () => void;
}) {
	const data = useLazyLoadQuery<LibraryByTagQueryType>(LibraryByTagQuery, {
		tagName,
		first: 10,
	});

	const availableTags = data.me.library.tags;

	return (
		<FilteredStoriesListRelay
			libraryRef={data.me.library}
			availableTags={availableTags}
			selectedTagId={tagId}
			onTagSelect={onTagSelect}
			onClearFilter={onClearFilter}
		/>
	);
}

function AuthenticatedLibrary() {
	const [isFormExpanded, setIsFormExpanded] = useState(false);
	const {tagId, setTagFilter, clearFilter} = useTagFilter();

	const data = useLazyLoadQuery<LibraryQueryType>(LibraryQuery, {
		first: 10,
	});

	const availableTags = data.me.library.tags;

	// Look up tag name from tagId
	const selectedTag = tagId ? availableTags.find((t) => t.id === tagId) : null;

	// Get connection ID for updater
	const connectionId = `client:${data.me.library.__id}:__Library_stories_connection`;

	const handleExpand = () => setIsFormExpanded(true);
	const handleCollapse = () => setIsFormExpanded(false);

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<h1 className={styles.title}>Library</h1>
				<Link to="/me/library/tags" className={styles.manageTagsLink}>
					Manage Tags
				</Link>
			</header>

			<CreateStoryForm
				isExpanded={isFormExpanded}
				onExpand={handleExpand}
				onCollapse={handleCollapse}
				availableTags={availableTags}
				connectionId={connectionId}
			/>

			{selectedTag ? (
				<Suspense fallback={<div className={styles.loading}>Loading...</div>}>
					<FilteredLibraryContent
						tagName={selectedTag.name}
						tagId={selectedTag.id}
						onTagSelect={setTagFilter}
						onClearFilter={clearFilter}
					/>
				</Suspense>
			) : (
				<AllStoriesListRelay
					libraryRef={data.me.library}
					availableTags={availableTags}
					onTagSelect={setTagFilter}
					onFormExpand={handleExpand}
				/>
			)}
		</div>
	);
}

function LibraryContent() {
	return (
		<Suspense fallback={<div className={styles.loading}>Loading...</div>}>
			<AuthenticatedLibrary />
		</Suspense>
	);
}

export function Library() {
	const {isAuthenticated} = useAuth();

	if (!isAuthenticated) {
		return <Navigate to="/login" replace />;
	}

	return <LibraryContent />;
}
