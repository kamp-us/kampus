import {Result} from "@effect-atom/atom";
import {useAtom, useAtomSet, useAtomValue} from "@effect-atom/atom-react";
import type {Story} from "@kampus/library";
import {type FormEvent, useEffect, useMemo, useState} from "react";
import {Link, Navigate} from "react-router";
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
import {
	createStoryMutation,
	createTagMutation,
	deleteStoryMutation,
	fetchUrlMetadataMutation,
	storiesAtom,
	storiesByTagAtom,
	tagFilterAtom,
	tagsAtom,
	updateStoryMutation,
} from "../rpc/atoms";
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

function LibrarySkeleton() {
	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<h1 className={styles.title}>Library</h1>
			</header>
			<div className={styles.skeleton} />
			<div className={styles.skeleton} />
			<div className={styles.skeleton} />
		</div>
	);
}

// Hook to manage tag filter via URL search params (using effect-atom)
function useTagFilter() {
	const [tagId, setTagId] = useAtom(tagFilterAtom);

	const setTagFilter = (newTagId: string | null) => {
		setTagId(newTagId ?? "");
	};

	const clearFilter = () => setTagId("");

	return {tagId, setTagFilter, clearFilter};
}

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

// Hook to manage available tags state - reactivity handles updates automatically
function useAvailableTags() {
	const tagsResult = useAtomValue(tagsAtom);

	const tags = Result.match(tagsResult, {
		onInitial: () => [] as Tag[],
		onFailure: () => [] as Tag[],
		onSuccess: (success) => success.value,
	});

	return {tags};
}

function CreateStoryForm({
	isExpanded,
	onExpand,
	onCollapse,
	availableTags,
}: {
	isExpanded: boolean;
	onExpand: () => void;
	onCollapse: () => void;
	availableTags: readonly Tag[];
}) {
	const [url, setUrl] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [selectedTags, setSelectedTags] = useState<readonly Tag[]>([]);

	const createStory = useAtomSet(createStoryMutation);
	const createTag = useAtomSet(createTagMutation);
	const [fetchResult, triggerFetch] = useAtom(fetchUrlMetadataMutation);

	// Check if URL is valid for fetch
	const isValidUrl = useMemo(() => {
		try {
			const parsed = new URL(url);
			return ["http:", "https:"].includes(parsed.protocol);
		} catch {
			return false;
		}
	}, [url]);

	// Derive fetch state from Result
	const isFetching = Result.isInitial(fetchResult) ? false : Result.isWaiting(fetchResult);
	const fetchError = Result.match(fetchResult, {
		onInitial: () => null,
		onSuccess: (s) => s.value.error,
		onFailure: (f) => String(f.cause),
	});

	// Apply fetched metadata to form
	useEffect(() => {
		if (Result.isSuccess(fetchResult)) {
			const metadata = fetchResult.value;
			if (metadata.title) setTitle(metadata.title);
			if (metadata.description) setDescription(metadata.description);
		}
	}, [fetchResult]);

	const handleFetchMetadata = () => {
		if (!url) return;
		triggerFetch({payload: {url}});
	};

	// Fire and forget - reactivity handles tag list update
	const handleCreateTag = (name: string) => {
		const color = getNextTagColor(availableTags);
		createTag({payload: {name, color}, reactivityKeys: ["tags", "stories"]});
	};

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (!url.trim() || !title.trim()) return;

		const tagIds = selectedTags.length > 0 ? selectedTags.map((t) => t.id) : undefined;

		// Fire and forget - reactivity handles story list update
		createStory({
			payload: {
				url: url.trim(),
				title: title.trim(),
				description: description.trim() || undefined,
				tagIds,
			},
			reactivityKeys: ["stories", "tags"],
		});

		// Reset form
		setUrl("");
		setTitle("");
		setDescription("");
		setSelectedTags([]);
		onCollapse();
	};

	const handleCancel = () => {
		setUrl("");
		setTitle("");
		setDescription("");
		setSelectedTags([]);
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
				<Button type="submit">Save Story</Button>
			</div>
		</form>
	);
}

function StoryRow({story, availableTags}: {story: Story; availableTags: readonly Tag[]}) {
	const domain = extractDomain(story.url);
	const relativeDate = formatRelativeDate(story.createdAt);

	const [isEditing, setIsEditing] = useState(false);
	const [editTitle, setEditTitle] = useState(story.title);
	const [editDescription, setEditDescription] = useState(story.description ?? "");
	const [editTags, setEditTags] = useState<readonly Tag[]>(story.tags ?? []);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const updateStory = useAtomSet(updateStoryMutation);
	const deleteStory = useAtomSet(deleteStoryMutation);
	const createTag = useAtomSet(createTagMutation);

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

	// Fire and forget - reactivity handles tag list update
	const handleCreateTag = (name: string) => {
		const color = getNextTagColor(availableTags);
		createTag({payload: {name, color}, reactivityKeys: ["tags", "stories"]});
	};

	const handleSaveEdit = () => {
		const trimmedTitle = editTitle.trim();
		if (trimmedTitle === "") return;

		// Check if anything changed
		const titleChanged = trimmedTitle !== story.title;
		const descriptionChanged = editDescription !== (story.description ?? "");
		const currentTagIds = (story.tags ?? []).map((t) => t.id).sort();
		const newTagIds = editTags.map((t) => t.id).sort();
		const tagsChanged = JSON.stringify(currentTagIds) !== JSON.stringify(newTagIds);

		if (!titleChanged && !descriptionChanged && !tagsChanged) {
			setIsEditing(false);
			return;
		}

		// Fire and forget - reactivity handles story list update
		updateStory({
			payload: {
				id: story.id,
				title: titleChanged ? trimmedTitle : undefined,
				description: descriptionChanged ? editDescription : undefined,
				tagIds: tagsChanged ? editTags.map((t) => t.id) : undefined,
			},
			reactivityKeys: ["stories", "tags"],
		});
		setIsEditing(false);
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
		// Fire and forget - reactivity handles story list update
		deleteStory({payload: {id: story.id}, reactivityKeys: ["stories", "tags"]});
		setDeleteDialogOpen(false);
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
						<Button onClick={handleSaveEdit}>Save</Button>
					</div>
				</div>
				<div className={styles.storyMeta}>
					{domain} · {relativeDate}
				</div>
			</article>
		);
	}

	const storyTags = story.tags ?? [];

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
							<Button onClick={handleDelete}>Delete</Button>
						</div>
					</AlertDialog.Popup>
				</AlertDialog.Portal>
			</AlertDialog.Root>
		</article>
	);
}

function AllStoriesList({
	onFormExpand,
	tags,
	onTagSelect,
}: {
	onFormExpand: () => void;
	tags: readonly Tag[];
	onTagSelect: (tagId: string) => void;
}) {
	const storiesResult = useAtomValue(storiesAtom());
	const [isLoadingMore, setIsLoadingMore] = useState(false);

	return Result.match(storiesResult, {
		onInitial: () => <LibrarySkeleton />,
		onFailure: (failure) => <div className={styles.error}>Error: {String(failure.cause)}</div>,
		onSuccess: (success) => {
			const stories = success.value.stories;
			const hasStories = stories.length > 0;
			const hasNextPage = success.value.hasNextPage;

			return (
				<>
					<TagFilterBar
						tags={tags}
						selectedTagId={null}
						onTagSelect={onTagSelect}
						onClearFilter={() => {}}
						totalCount={success.value.totalCount}
					/>

					{hasStories ? (
						<>
							<div className={styles.storyList}>
								{stories.map((story) => (
									<StoryRow key={story.id} story={story} availableTags={tags} />
								))}
							</div>
							{hasNextPage && (
								<LoadMoreButton
									onClick={() => {
										// TODO: Implement pagination with cursor
										setIsLoadingMore(true);
										setTimeout(() => setIsLoadingMore(false), 1000);
									}}
									isLoading={isLoadingMore}
								/>
							)}
						</>
					) : (
						<EmptyState onAddClick={onFormExpand} />
					)}
				</>
			);
		},
	});
}

function FilteredStoriesList({
	tagId,
	tags,
	onTagSelect,
	onClearFilter,
}: {
	tagId: string;
	tags: readonly Tag[];
	onTagSelect: (tagId: string) => void;
	onClearFilter: () => void;
}) {
	const storiesResult = useAtomValue(storiesByTagAtom(tagId));
	const [isLoadingMore, setIsLoadingMore] = useState(false);

	return Result.match(storiesResult, {
		onInitial: () => <LibrarySkeleton />,
		onFailure: (failure) => <div className={styles.error}>Error: {String(failure.cause)}</div>,
		onSuccess: (success) => {
			const stories = success.value.stories;
			const hasStories = stories.length > 0;
			const hasNextPage = success.value.hasNextPage;

			return (
				<>
					<TagFilterBar
						tags={tags}
						selectedTagId={tagId}
						onTagSelect={onTagSelect}
						onClearFilter={onClearFilter}
						totalCount={success.value.totalCount}
					/>

					{hasStories ? (
						<>
							<div className={styles.storyList}>
								{stories.map((story) => (
									<StoryRow key={story.id} story={story} availableTags={tags} />
								))}
							</div>
							{hasNextPage && (
								<LoadMoreButton
									onClick={() => {
										// TODO: Implement pagination with cursor
										setIsLoadingMore(true);
										setTimeout(() => setIsLoadingMore(false), 1000);
									}}
									isLoading={isLoadingMore}
								/>
							)}
						</>
					) : (
						<div className={styles.emptyState}>
							<p className={styles.emptyText}>No stories with this tag yet.</p>
							<Button onClick={onClearFilter}>Show all stories</Button>
						</div>
					)}
				</>
			);
		},
	});
}

function AuthenticatedLibrary() {
	const [isFormExpanded, setIsFormExpanded] = useState(false);
	const {tags: availableTags} = useAvailableTags();
	const {tagId, setTagFilter, clearFilter} = useTagFilter();

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
			/>

			{tagId ? (
				<FilteredStoriesList
					tagId={tagId}
					tags={availableTags}
					onTagSelect={setTagFilter}
					onClearFilter={clearFilter}
				/>
			) : (
				<AllStoriesList
					onFormExpand={handleExpand}
					tags={availableTags}
					onTagSelect={setTagFilter}
				/>
			)}
		</div>
	);
}

export function LibraryRpc() {
	const {isAuthenticated} = useAuth();

	if (!isAuthenticated) {
		return <Navigate to="/login" replace />;
	}

	return <AuthenticatedLibrary />;
}
