import {Component, type ReactNode, Suspense, useCallback, useMemo, useState} from "react";
import {graphql, useLazyLoadQuery, useMutation, useRefetchableFragment} from "react-relay";
import {Navigate} from "react-router";
import type {LibraryCreateStoryMutation} from "../__generated__/LibraryCreateStoryMutation.graphql";
import type {LibraryCreateTagMutation} from "../__generated__/LibraryCreateTagMutation.graphql";
import type {LibraryDeleteStoryMutation} from "../__generated__/LibraryDeleteStoryMutation.graphql";
import type {LibraryQuery as LibraryQueryType} from "../__generated__/LibraryQuery.graphql";
import type {LibraryStoryFragment$key} from "../__generated__/LibraryStoryFragment.graphql";
import type {LibraryTagsQuery as LibraryTagsQueryType} from "../__generated__/LibraryTagsQuery.graphql";
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
import styles from "./Library.module.css";

const DEFAULT_PAGE_SIZE = 20;

const StoryFragment = graphql`
	fragment LibraryStoryFragment on Story @refetchable(queryName: "LibraryStoryRefetchQuery") {
		id
		url
		title
		createdAt
		tags {
			id
			name
			color
		}
	}
`;

const LibraryQuery = graphql`
	query LibraryQuery($first: Float!, $after: String) {
		me {
			library {
				stories(first: $first, after: $after) {
					edges {
						node {
							...LibraryStoryFragment
						}
						cursor
					}
					pageInfo {
						hasNextPage
						endCursor
					}
				}
			}
		}
	}
`;

const ListTagsQuery = graphql`
	query LibraryTagsQuery {
		listTags {
			id
			name
			color
		}
	}
`;

const CreateTagMutation = graphql`
	mutation LibraryCreateTagMutation($name: String!, $color: String!) {
		createTag(name: $name, color: $color) {
			tag {
				id
				name
				color
			}
			error {
				code
				message
			}
		}
	}
`;

const CreateStoryMutation = graphql`
	mutation LibraryCreateStoryMutation($url: String!, $title: String!, $tagIds: [String!]) {
		createStory(url: $url, title: $title, tagIds: $tagIds) {
			story {
				id
				url
				title
				createdAt
				tags {
					id
					name
					color
				}
			}
		}
	}
`;

const UpdateStoryMutation = graphql`
	mutation LibraryUpdateStoryMutation($id: String!, $title: String, $tagIds: [String!]) {
		updateStory(id: $id, title: $title, tagIds: $tagIds) {
			story {
				id
				url
				title
				createdAt
				tags {
					id
					name
					color
				}
			}
			error {
				code
				message
			}
		}
	}
`;

const DeleteStoryMutation = graphql`
	mutation LibraryDeleteStoryMutation($id: String!) {
		deleteStory(id: $id) {
			success
			deletedStoryId
			error {
				code
				message
			}
		}
	}
`;

// Error boundary for handling auth errors
class ErrorBoundary extends Component<
	{children: ReactNode; fallback: ReactNode},
	{hasError: boolean}
> {
	constructor(props: {children: ReactNode; fallback: ReactNode}) {
		super(props);
		this.state = {hasError: false};
	}

	static getDerivedStateFromError() {
		return {hasError: true};
	}

	render() {
		if (this.state.hasError) {
			return this.props.fallback;
		}
		return this.props.children;
	}
}

function NotLoggedIn() {
	const handleLogin = () => {
		window.location.href = "/login";
	};

	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<p>Please log in to view your library.</p>
				<Button onClick={handleLogin}>Go to Login</Button>
			</div>
		</div>
	);
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

function formatRelativeDate(isoDate: string): string {
	const date = new Date(isoDate);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	if (diffDays < 7) return `${diffDays} days ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

	return date.toLocaleDateString("en-US", {month: "short", day: "numeric"});
}

function extractDomain(url: string): string {
	try {
		const hostname = new URL(url).hostname;
		return hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

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

function getNextTagColor(existingTags: Tag[]): string {
	const index = existingTags.length % TAG_COLORS.length;
	return TAG_COLORS[index];
}

// Hook to manage available tags state
function useAvailableTags() {
	const data = useLazyLoadQuery<LibraryTagsQueryType>(ListTagsQuery, {});
	const [localTags, setLocalTags] = useState<Tag[]>([]);

	const allTags = useMemo(() => {
		const combined = [...data.listTags, ...localTags];
		const seen = new Set<string>();
		return combined.filter((t) => {
			if (seen.has(t.id)) return false;
			seen.add(t.id);
			return true;
		});
	}, [data.listTags, localTags]);

	const addTag = useCallback((tag: Tag) => {
		setLocalTags((prev) => [...prev, tag]);
	}, []);

	return {tags: allTags, addTag};
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

function CreateStoryForm({
	isExpanded,
	onExpand,
	onCollapse,
	availableTags,
	onTagCreate,
}: {
	isExpanded: boolean;
	onExpand: () => void;
	onCollapse: () => void;
	availableTags: Tag[];
	onTagCreate: (tag: Tag) => void;
}) {
	const [url, setUrl] = useState("");
	const [title, setTitle] = useState("");
	const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
	const [error, setError] = useState<string | null>(null);

	const [commitStory, isCreating] = useMutation<LibraryCreateStoryMutation>(CreateStoryMutation);
	const [commitTag] = useMutation<LibraryCreateTagMutation>(CreateTagMutation);

	const handleCreateTag = async (name: string): Promise<Tag> => {
		const color = getNextTagColor(availableTags);

		return new Promise((resolve, reject) => {
			commitTag({
				variables: {name, color},
				onCompleted: (response) => {
					if (response.createTag.error) {
						reject(new Error(response.createTag.error.message));
					} else if (response.createTag.tag) {
						const newTag = response.createTag.tag;
						onTagCreate(newTag);
						resolve(newTag);
					}
				},
				onError: reject,
			});
		});
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		const tagIds = selectedTags.length > 0 ? selectedTags.map((t) => t.id) : null;

		commitStory({
			variables: {url, title, tagIds},
			onCompleted: (response) => {
				if (response.createStory.story) {
					setUrl("");
					setTitle("");
					setSelectedTags([]);
					onCollapse();
				}
			},
			onError: (err) => setError(err.message),
			updater: (store) => {
				const payload = store.getRootField("createStory");
				const newStory = payload?.getLinkedRecord("story");
				if (!newStory) return;

				const root = store.getRoot();
				const me = root.getLinkedRecord("me");
				const library = me?.getLinkedRecord("library");
				const connection = library?.getLinkedRecord("stories", {first: DEFAULT_PAGE_SIZE});
				if (!connection) return;

				const edges = connection.getLinkedRecords("edges") ?? [];
				const newEdge = store.create(`edge:${newStory.getDataID()}`, "StoryEdge");
				newEdge.setLinkedRecord(newStory, "node");
				newEdge.setValue(newStory.getDataID(), "cursor");
				connection.setLinkedRecords([newEdge, ...edges], "edges");
			},
		});
	};

	const handleCancel = () => {
		setUrl("");
		setTitle("");
		setSelectedTags([]);
		setError(null);
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
			{error && <div className={styles.error}>{error}</div>}

			<Fieldset.Root>
				<Fieldset.Legend>Add Story</Fieldset.Legend>

				<Field
					label="URL"
					control={
						<Input
							type="url"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							required
							autoFocus
						/>
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
	storyRef,
	onStoryDeleted,
	availableTags,
	onTagCreate,
}: {
	storyRef: LibraryStoryFragment$key;
	onStoryDeleted: () => void;
	availableTags: Tag[];
	onTagCreate: (tag: Tag) => void;
}) {
	const [story] = useRefetchableFragment(StoryFragment, storyRef);

	const domain = extractDomain(story.url);
	const relativeDate = formatRelativeDate(story.createdAt);

	const [isEditing, setIsEditing] = useState(false);
	const [editTitle, setEditTitle] = useState(story.title);
	const [editTags, setEditTags] = useState<Tag[]>([]);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [commitUpdate, isUpdating] = useMutation<LibraryUpdateStoryMutation>(UpdateStoryMutation);
	const [commitDelete, isDeleting] = useMutation<LibraryDeleteStoryMutation>(DeleteStoryMutation);
	const [commitTag] = useMutation<LibraryCreateTagMutation>(CreateTagMutation);

	const handleCreateTag = async (name: string): Promise<Tag> => {
		const color = getNextTagColor(availableTags);

		return new Promise((resolve, reject) => {
			commitTag({
				variables: {name, color},
				onCompleted: (response) => {
					if (response.createTag.error) {
						reject(new Error(response.createTag.error.message));
					} else if (response.createTag.tag) {
						const newTag = response.createTag.tag;
						onTagCreate(newTag);
						resolve(newTag);
					}
				},
				onError: reject,
			});
		});
	};

	const handleEdit = () => {
		setError(null);
		setEditTitle(story.title);
		setEditTags(story.tags.map((t) => ({id: t.id, name: t.name, color: t.color})));
		setIsEditing(true);
	};

	const handleCancelEdit = () => {
		setEditTitle(story.title);
		setEditTags([]);
		setIsEditing(false);
		setError(null);
	};

	const handleSaveEdit = () => {
		const trimmedTitle = editTitle.trim();
		if (trimmedTitle === "") return;

		// Check if anything changed
		const titleChanged = trimmedTitle !== story.title;
		const currentTagIds = story.tags.map((t) => t.id).sort();
		const newTagIds = editTags.map((t) => t.id).sort();
		const tagsChanged = JSON.stringify(currentTagIds) !== JSON.stringify(newTagIds);

		if (!titleChanged && !tagsChanged) {
			setIsEditing(false);
			return;
		}

		setError(null);
		commitUpdate({
			variables: {
				id: story.id,
				title: titleChanged ? trimmedTitle : null,
				tagIds: tagsChanged ? editTags.map((t) => t.id) : null,
			},
			onCompleted: (response) => {
				if (response.updateStory.error) {
					setError(response.updateStory.error.message);
				} else {
					setIsEditing(false);
				}
			},
			onError: (err) => setError(err.message),
		});
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleSaveEdit();
		} else if (e.key === "Escape") {
			handleCancelEdit();
		}
	};

	const handleDelete = () => {
		setError(null);
		commitDelete({
			variables: {id: story.id},
			onCompleted: (response) => {
				setDeleteDialogOpen(false);
				if (response.deleteStory.error) {
					setError(response.deleteStory.error.message);
				} else if (response.deleteStory.success) {
					onStoryDeleted();
				}
			},
			onError: (err) => {
				setError(err.message);
				setDeleteDialogOpen(false);
			},
		});
	};

	if (isEditing) {
		return (
			<article className={styles.storyRow}>
				{error && <div className={styles.rowError}>{error}</div>}
				<div className={styles.editRow}>
					<input
						type="text"
						value={editTitle}
						onChange={(e) => setEditTitle(e.target.value)}
						onKeyDown={handleKeyDown}
						className={styles.editInput}
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
					<div className={styles.editActions}>
						<Button type="button" onClick={handleCancelEdit} disabled={isUpdating}>
							Cancel
						</Button>
						<Button type="button" onClick={handleSaveEdit} disabled={isUpdating}>
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

	return (
		<article className={styles.storyRow}>
			{error && <div className={styles.rowError}>{error}</div>}
			<div className={styles.storyContent}>
				<div className={styles.storyMain}>
					<a
						href={story.url}
						target="_blank"
						rel="noopener noreferrer"
						className={styles.storyTitle}
					>
						{story.title}
					</a>
					<div className={styles.storyMeta}>
						{domain} · {relativeDate}
					</div>
					{story.tags.length > 0 && (
						<div className={styles.storyTags}>
							{story.tags.slice(0, 3).map((tag) => (
								<TagChip key={tag.id} name={tag.name} color={tag.color} />
							))}
							{story.tags.length > 3 && (
								<span className={styles.moreTags}>+{story.tags.length - 3} more</span>
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

function AuthenticatedLibrary() {
	const [isFormExpanded, setIsFormExpanded] = useState(false);
	const [fetchKey, setFetchKey] = useState(0);
	const data = useLazyLoadQuery<LibraryQueryType>(
		LibraryQuery,
		{first: DEFAULT_PAGE_SIZE},
		{fetchKey, fetchPolicy: fetchKey > 0 ? "network-only" : "store-or-network"},
	);

	const {tags: availableTags, addTag} = useAvailableTags();

	const stories = data.me.library.stories.edges;
	const hasStories = stories.length > 0;

	const handleExpand = () => setIsFormExpanded(true);
	const handleCollapse = () => setIsFormExpanded(false);

	const handleRefetch = useCallback(() => {
		setFetchKey((k) => k + 1);
	}, []);

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<h1 className={styles.title}>Library</h1>
			</header>

			<CreateStoryForm
				isExpanded={isFormExpanded}
				onExpand={handleExpand}
				onCollapse={handleCollapse}
				availableTags={availableTags}
				onTagCreate={addTag}
			/>

			{hasStories ? (
				<div className={styles.storyList}>
					{stories.map(({node, cursor}) => (
						<StoryRow
							key={cursor}
							storyRef={node}
							onStoryDeleted={handleRefetch}
							availableTags={availableTags}
							onTagCreate={addTag}
						/>
					))}
				</div>
			) : (
				<EmptyState onAddClick={handleExpand} />
			)}
		</div>
	);
}

function LibraryContent() {
	const {isAuthenticated} = useAuth();

	if (!isAuthenticated) {
		return <Navigate to="/login" replace />;
	}

	return <AuthenticatedLibrary />;
}

export function Library() {
	return (
		<ErrorBoundary fallback={<NotLoggedIn />}>
			<Suspense fallback={<LibrarySkeleton />}>
				<LibraryContent />
			</Suspense>
		</ErrorBoundary>
	);
}
