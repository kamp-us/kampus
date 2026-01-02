import {type Client, createClient} from "graphql-ws";
import {
	Component,
	type ReactNode,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	fetchQuery,
	graphql,
	useLazyLoadQuery,
	useMutation,
	usePaginationFragment,
	useRefetchableFragment,
	useRelayEnvironment,
} from "react-relay";
import {Link, Navigate, useSearchParams} from "react-router";
import type {LibraryCreateStoryMutation} from "../__generated__/LibraryCreateStoryMutation.graphql";
import type {LibraryCreateTagMutation} from "../__generated__/LibraryCreateTagMutation.graphql";
import type {LibraryDeleteStoryMutation} from "../__generated__/LibraryDeleteStoryMutation.graphql";
import type {LibraryFetchUrlMetadataQuery} from "../__generated__/LibraryFetchUrlMetadataQuery.graphql";
import type {LibraryFilteredQuery as LibraryFilteredQueryType} from "../__generated__/LibraryFilteredQuery.graphql";
import type {LibraryFilteredStoriesFragment$key} from "../__generated__/LibraryFilteredStoriesFragment.graphql";
import type {LibraryFilteredStoriesPaginationQuery} from "../__generated__/LibraryFilteredStoriesPaginationQuery.graphql";
import type {LibraryQuery as LibraryQueryType} from "../__generated__/LibraryQuery.graphql";
import type {LibraryStoriesFragment$key} from "../__generated__/LibraryStoriesFragment.graphql";
import type {LibraryStoriesPaginationQuery} from "../__generated__/LibraryStoriesPaginationQuery.graphql";
import type {LibraryStoryFragment$key} from "../__generated__/LibraryStoryFragment.graphql";
import type {LibraryTagsQuery as LibraryTagsQueryType} from "../__generated__/LibraryTagsQuery.graphql";
import type {LibraryUpdateStoryMutation} from "../__generated__/LibraryUpdateStoryMutation.graphql";
import {getStoredToken, useAuth} from "../auth/AuthContext";
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
import styles from "./Library.module.css";

const DEFAULT_PAGE_SIZE = 20;

// --- Library Channel Subscription Hook ---

interface LibraryChangeEvent {
	type: "library:change";
	totalStories: number;
	totalTags: number;
}

interface StoryPayload {
	id: string;
	url: string;
	title: string;
	description: string | null;
	createdAt: string;
}

interface StoryCreateEvent {
	type: "story:create";
	story: StoryPayload;
}

interface StoryDeleteEvent {
	type: "story:delete";
	deletedStoryId: string;
}

interface LibraryEvent {
	type: string;
	[key: string]: unknown;
}

function getWebSocketUrl(): string {
	const token = getStoredToken();
	const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";

	// In development, connect directly to the backend worker
	// In production, use the same host (proxied through kamp-us worker)
	if (import.meta.env.DEV) {
		return `ws://localhost:8787/graphql${tokenParam}`;
	}
	return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/graphql${tokenParam}`;
}

/**
 * Hook to subscribe to library channel events and update the Relay store.
 * Uses graphql-ws directly since we don't have subscription types in the schema yet.
 */
function useLibrarySubscription(connectionId: string | null) {
	const environment = useRelayEnvironment();
	const clientRef = useRef<Client | null>(null);

	useEffect(() => {
		if (!connectionId) return;

		// Create WebSocket client
		const client = createClient({
			url: getWebSocketUrl(),
			retryAttempts: Infinity,
			shouldRetry: () => true,
			retryWait: (retryCount) => {
				const delay = Math.min(1000 * 2 ** retryCount, 30000);
				return new Promise((resolve) => setTimeout(resolve, delay));
			},
		});
		clientRef.current = client;

		// Subscribe to library channel
		// The query format matches what UserChannel DO expects
		const unsubscribe = client.subscribe(
			{
				query: 'subscription { channel(name: "library") { type } }',
			},
			{
				next: (result) => {
					console.log("[Library Subscription] Received:", result);
					const event = (result.data as {channel: LibraryEvent} | undefined)?.channel;
					console.log("[Library Subscription] Parsed event:", event);
					if (!event) return;

					// Handle library:change event - update totalCount in Relay store
					if (event.type === "library:change") {
						const changeEvent = event as LibraryChangeEvent;
						console.log("[Library Subscription] Updating totalCount to:", changeEvent.totalStories);
						environment.commitUpdate((store) => {
							const connection = store.get(connectionId);
							if (connection) {
								connection.setValue(changeEvent.totalStories, "totalCount");
							}
						});
					}

					// Handle story:create event - add story to connection
					if (event.type === "story:create") {
						const createEvent = event as StoryCreateEvent;
						console.log("[Library Subscription] Adding story:", createEvent.story.id);
						environment.commitUpdate((store) => {
							const connection = store.get(connectionId);
							if (!connection) return;

							// Check if story already exists (avoid duplicates from own mutation)
							const edges = connection.getLinkedRecords("edges") || [];
							const exists = edges.some((edge) => {
								const node = edge?.getLinkedRecord("node");
								return node?.getDataID() === createEvent.story.id;
							});
							if (exists) {
								console.log("[Library Subscription] Story already exists, skipping");
								return;
							}

							// Create story record
							const storyRecord = store.create(createEvent.story.id, "Story");
							storyRecord.setValue(createEvent.story.id, "id");
							storyRecord.setValue(createEvent.story.url, "url");
							storyRecord.setValue(createEvent.story.title, "title");
							storyRecord.setValue(createEvent.story.description, "description");
							storyRecord.setValue(createEvent.story.createdAt, "createdAt");
							storyRecord.setLinkedRecords([], "tags");

							// Create edge and prepend to connection
							const edgeId = `client:edge:${createEvent.story.id}`;
							const edge = store.create(edgeId, "StoryEdge");
							edge.setLinkedRecord(storyRecord, "node");
							edge.setValue(createEvent.story.id, "cursor");

							const newEdges = [edge, ...edges];
							connection.setLinkedRecords(newEdges, "edges");
						});
					}

					// Handle story:delete event - remove story from connection
					if (event.type === "story:delete") {
						const deleteEvent = event as StoryDeleteEvent;
						console.log("[Library Subscription] Removing story:", deleteEvent.deletedStoryId);
						environment.commitUpdate((store) => {
							const connection = store.get(connectionId);
							if (!connection) return;

							const edges = connection.getLinkedRecords("edges") || [];
							const newEdges = edges.filter((edge) => {
								const node = edge?.getLinkedRecord("node");
								return node?.getDataID() !== deleteEvent.deletedStoryId;
							});
							connection.setLinkedRecords(newEdges, "edges");
						});
					}
				},
				error: (error) => {
					console.error("[Library Subscription] Error:", error);
				},
				complete: () => {
					console.log("[Library Subscription] Complete");
				},
			},
		);

		return () => {
			unsubscribe();
			client.dispose();
			clientRef.current = null;
		};
	}, [connectionId, environment]);
}

const StoryFragment = graphql`
	fragment LibraryStoryFragment on Story @refetchable(queryName: "LibraryStoryRefetchQuery") {
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

const LibraryStoriesFragment = graphql`
	fragment LibraryStoriesFragment on Library
	@argumentDefinitions(
		first: {type: "Int", defaultValue: 20}
		after: {type: "String"}
	)
	@refetchable(queryName: "LibraryStoriesPaginationQuery") {
		stories(first: $first, after: $after) @connection(key: "Library_stories") {
			__id
			totalCount
			edges {
				node {
          id
					...LibraryStoryFragment
				}
			}
		}
	}
`;

const LibraryFilteredStoriesFragment = graphql`
	fragment LibraryFilteredStoriesFragment on Library
	@argumentDefinitions(
		tagName: {type: "String!"}
		first: {type: "Int", defaultValue: 20}
		after: {type: "String"}
	)
	@refetchable(queryName: "LibraryFilteredStoriesPaginationQuery") {
		storiesByTag(tagName: $tagName, first: $first, after: $after)
		@connection(key: "Library_storiesByTag", filters: ["tagName"]) {
			__id
			totalCount
			edges {
				node {
          id
					...LibraryStoryFragment
				}
			}
		}
	}
`;

const LibraryQuery = graphql`
	query LibraryQuery {
		me {
			library {
				...LibraryStoriesFragment
			}
		}
	}
`;

const LibraryFilteredQuery = graphql`
	query LibraryFilteredQuery($tagName: String!) {
		me {
			library {
				...LibraryFilteredStoriesFragment @arguments(tagName: $tagName)
			}
		}
	}
`;

const ListTagsQuery = graphql`
	query LibraryTagsQuery {
		me {
			library {
				tags {
					id
					name
					color
				}
			}
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
				... on TagNameExistsError {
					code
					message
				}
				... on InvalidTagNameError {
					code
					message
				}
			}
		}
	}
`;

const CreateStoryMutation = graphql`
	mutation LibraryCreateStoryMutation(
		$url: String!
		$title: String!
		$description: String
		$tagIds: [String!]
		$connections: [ID!]!
	) {
		createStory(url: $url, title: $title, description: $description, tagIds: $tagIds) {
			story @prependNode(connections: $connections, edgeTypeName: "StoryEdge") {
				...LibraryStoryFragment
			}
		}
	}
`;

const FetchUrlMetadataQuery = graphql`
	query LibraryFetchUrlMetadataQuery($url: String!) {
		fetchUrlMetadata(url: $url) {
			title
			description
			error
		}
	}
`;

const UpdateStoryMutation = graphql`
	mutation LibraryUpdateStoryMutation($id: String!, $title: String, $description: String, $tagIds: [String!]) {
		updateStory(id: $id, title: $title, description: $description, tagIds: $tagIds) {
			story {
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
			error {
				code
				message
			}
		}
	}
`;

const DeleteStoryMutation = graphql`
	mutation LibraryDeleteStoryMutation($id: String!, $connections: [ID!]!) {
		deleteStory(id: $id) {
			success
			deletedStoryId @deleteEdge(connections: $connections)
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
		const combined = [...data.me.library.tags, ...localTags];
		const seen = new Set<string>();
		return combined.filter((t) => {
			if (seen.has(t.id)) return false;
			seen.add(t.id);
			return true;
		});
	}, [data.me.library.tags, localTags]);

	const addTag = useCallback((tag: Tag) => {
		setLocalTags((prev) => [...prev, tag]);
	}, []);

	return {tags: allTags, addTag};
}

// Hook to read/manage tag filter from URL
function useTagFilter() {
	const [searchParams, setSearchParams] = useSearchParams();

	const activeTag = searchParams.get("tag");

	const clearFilter = useCallback(() => {
		setSearchParams({});
	}, [setSearchParams]);

	return {activeTag, clearFilter};
}

// TagFilterRow - shows current filter state and count
function TagFilterRow({
	activeTag,
	tagDetails,
	storyCount,
	onClearFilter,
}: {
	activeTag: string | null;
	tagDetails: {name: string; color: string} | null;
	storyCount: number;
	onClearFilter: () => void;
}) {
	const storyLabel = storyCount === 1 ? "story" : "stories";

	if (!activeTag) {
		return (
			<div className={styles.tagFilterRow}>
				<span className={styles.filterLabel}>All stories</span>
				<span className={styles.storyCount}>
					{storyCount} {storyLabel}
				</span>
			</div>
		);
	}

	return (
		<div className={styles.tagFilterRow}>
			<span className={styles.filterLabel}>Filtered by</span>
			<TagChip name={activeTag} color={tagDetails?.color ?? "888888"}>
				<button
					type="button"
					className={styles.dismissButton}
					onClick={onClearFilter}
					aria-label={`Clear filter: ${activeTag}`}
				>
					×
				</button>
			</TagChip>
			<span className={styles.storyCount}>
				{storyCount} {storyLabel}
			</span>
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

function FilteredEmptyState({
	tagName,
	onClearFilter,
}: {
	tagName: string;
	onClearFilter: () => void;
}) {
	return (
		<div className={styles.emptyState}>
			<h2 className={styles.emptyTitle}>No stories tagged "{tagName}"</h2>
			<p className={styles.emptyText}>Try a different tag or view all your stories.</p>
			<Button onClick={onClearFilter}>Show all stories</Button>
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
	onTagCreate,
	initialTags = [],
	connectionId,
}: {
	isExpanded: boolean;
	onExpand: () => void;
	onCollapse: () => void;
	availableTags: Tag[];
	onTagCreate: (tag: Tag) => void;
	initialTags?: Tag[];
	connectionId: string | null;
}) {
	const environment = useRelayEnvironment();
	const [url, setUrl] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [selectedTags, setSelectedTags] = useState<Tag[]>(initialTags);
	const [error, setError] = useState<string | null>(null);
	const [isFetching, setIsFetching] = useState(false);
	const [fetchError, setFetchError] = useState<string | null>(null);

	// Dirty state tracking - marked when user manually edits
	const [titleDirty, setTitleDirty] = useState(false);
	const [descriptionDirty, setDescriptionDirty] = useState(false);

	// Pending replacements - shown when fetch returns but field is dirty
	const [pendingTitle, setPendingTitle] = useState<string | null>(null);
	const [pendingDescription, setPendingDescription] = useState<string | null>(null);

	// Debounce timer ref for auto-fetch
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [commitStory, isCreating] = useMutation<LibraryCreateStoryMutation>(CreateStoryMutation);
	const [commitTag] = useMutation<LibraryCreateTagMutation>(CreateTagMutation);

	// Cleanup debounce timer on unmount
	useEffect(() => {
		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, []);

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

	const handleFetchMetadata = async () => {
		if (!url) return;

		setIsFetching(true);
		setFetchError(null);

		try {
			const result = await fetchQuery<LibraryFetchUrlMetadataQuery>(
				environment,
				FetchUrlMetadataQuery,
				{url},
			).toPromise();

			if (result?.fetchUrlMetadata.error) {
				setFetchError(result.fetchUrlMetadata.error);
				return;
			}

			// Handle title with dirty state
			if (result?.fetchUrlMetadata.title) {
				if (titleDirty) {
					setPendingTitle(result.fetchUrlMetadata.title);
				} else {
					setTitle(result.fetchUrlMetadata.title);
				}
			}

			// Handle description with dirty state
			if (result?.fetchUrlMetadata.description) {
				if (descriptionDirty) {
					setPendingDescription(result.fetchUrlMetadata.description);
				} else {
					setDescription(result.fetchUrlMetadata.description);
				}
			}
		} catch {
			setFetchError("Failed to fetch metadata");
		} finally {
			setIsFetching(false);
		}
	};

	// Check if URL is valid for fetch
	const isValidUrl = useMemo(() => {
		try {
			const parsed = new URL(url);
			return ["http:", "https:"].includes(parsed.protocol);
		} catch {
			return false;
		}
	}, [url]);

	// Handle URL change with auto-fetch debounce
	const handleUrlChange = (newUrl: string) => {
		setUrl(newUrl);
		setFetchError(null);

		// Clear any pending debounce
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}

		// Validate and trigger auto-fetch
		try {
			const parsed = new URL(newUrl);
			if (["http:", "https:"].includes(parsed.protocol)) {
				debounceTimerRef.current = setTimeout(() => {
					handleFetchMetadata();
				}, 500);
			}
		} catch {
			// Invalid URL, don't auto-fetch
		}
	};

	const handleTitleChange = (value: string) => {
		setTitle(value);
		setTitleDirty(true);
		setPendingTitle(null); // Dismiss any pending replacement
	};

	const handleDescriptionChange = (value: string) => {
		setDescription(value);
		setDescriptionDirty(true);
		setPendingDescription(null); // Dismiss any pending replacement
	};

	const confirmTitleReplace = () => {
		if (pendingTitle) {
			setTitle(pendingTitle);
			setPendingTitle(null);
			setTitleDirty(false);
		}
	};

	const dismissTitleReplace = () => {
		setPendingTitle(null);
	};

	const confirmDescriptionReplace = () => {
		if (pendingDescription) {
			setDescription(pendingDescription);
			setPendingDescription(null);
			setDescriptionDirty(false);
		}
	};

	const dismissDescriptionReplace = () => {
		setPendingDescription(null);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (!connectionId) {
			setError("Cannot save - please wait for page to load");
			return;
		}

		const tagIds = selectedTags.length > 0 ? selectedTags.map((t) => t.id) : null;

		commitStory({
			variables: {
				url,
				title,
				description: description || null,
				tagIds,
				connections: [connectionId],
			},
			onCompleted: (response) => {
				if (response.createStory.story) {
					setUrl("");
					setTitle("");
					setDescription("");
					setSelectedTags(initialTags);
					setTitleDirty(false);
					setDescriptionDirty(false);
					setPendingTitle(null);
					setPendingDescription(null);
					onCollapse();
				}
			},
			onError: (err) => setError(err.message),
		});
	};

	const handleCancel = () => {
		setUrl("");
		setTitle("");
		setDescription("");
		setSelectedTags(initialTags);
		setError(null);
		setFetchError(null);
		setTitleDirty(false);
		setDescriptionDirty(false);
		setPendingTitle(null);
		setPendingDescription(null);
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
					error={fetchError ?? undefined}
					control={
						<div className={styles.urlFieldContainer}>
							<Input
								type="url"
								value={url}
								onChange={(e) => handleUrlChange(e.target.value)}
								required
								autoFocus
							/>
							<Button onClick={handleFetchMetadata} disabled={!isValidUrl || isFetching}>
								{isFetching ? "Fetching..." : "Fetch"}
							</Button>
						</div>
					}
				/>

				<Field
					label="Title"
					control={
						<div className={styles.fieldWithHint}>
							<Input
								type="text"
								value={title}
								onChange={(e) => handleTitleChange(e.target.value)}
								required
							/>
							{pendingTitle && (
								<div className={styles.replaceHintContainer}>
									<button
										type="button"
										className={styles.replaceHint}
										onClick={confirmTitleReplace}
									>
										Replace?
									</button>
									<button
										type="button"
										className={styles.dismissHint}
										onClick={dismissTitleReplace}
										aria-label="Keep current value"
									>
										×
									</button>
								</div>
							)}
						</div>
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
						<div className={styles.fieldWithHint}>
							<Textarea
								value={description}
								onChange={(e) => handleDescriptionChange(e.target.value)}
								placeholder="Optional description..."
								rows={3}
							/>
							{pendingDescription && (
								<div className={styles.replaceHintContainer}>
									<button
										type="button"
										className={styles.replaceHint}
										onClick={confirmDescriptionReplace}
									>
										Replace?
									</button>
									<button
										type="button"
										className={styles.dismissHint}
										onClick={dismissDescriptionReplace}
										aria-label="Keep current value"
									>
										×
									</button>
								</div>
							)}
						</div>
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
	availableTags,
	onTagCreate,
	connectionId,
}: {
	storyRef: LibraryStoryFragment$key;
	availableTags: Tag[];
	onTagCreate: (tag: Tag) => void;
	connectionId: string;
}) {
	const environment = useRelayEnvironment();
	const [story] = useRefetchableFragment(StoryFragment, storyRef);

	const domain = extractDomain(story.url);
	const relativeDate = formatRelativeDate(story.createdAt);

	const [isEditing, setIsEditing] = useState(false);
	const [editTitle, setEditTitle] = useState(story.title);
	const [editDescription, setEditDescription] = useState(story.description ?? "");
	const [editTags, setEditTags] = useState<Tag[]>([]);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isFetching, setIsFetching] = useState(false);
	const [fetchError, setFetchError] = useState<string | null>(null);

	// Dirty state for edit panel
	const [editTitleDirty, setEditTitleDirty] = useState(false);
	const [editDescriptionDirty, setEditDescriptionDirty] = useState(false);
	const [pendingEditTitle, setPendingEditTitle] = useState<string | null>(null);
	const [pendingEditDescription, setPendingEditDescription] = useState<string | null>(null);

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

	const handleFetchMetadata = async () => {
		setIsFetching(true);
		setFetchError(null);

		try {
			const result = await fetchQuery<LibraryFetchUrlMetadataQuery>(
				environment,
				FetchUrlMetadataQuery,
				{url: story.url},
			).toPromise();

			if (result?.fetchUrlMetadata.error) {
				setFetchError(result.fetchUrlMetadata.error);
				return;
			}

			// Handle title with dirty state
			if (result?.fetchUrlMetadata.title) {
				if (editTitleDirty) {
					setPendingEditTitle(result.fetchUrlMetadata.title);
				} else {
					setEditTitle(result.fetchUrlMetadata.title);
				}
			}

			// Handle description with dirty state
			if (result?.fetchUrlMetadata.description) {
				if (editDescriptionDirty) {
					setPendingEditDescription(result.fetchUrlMetadata.description);
				} else {
					setEditDescription(result.fetchUrlMetadata.description);
				}
			}
		} catch {
			setFetchError("Failed to fetch metadata");
		} finally {
			setIsFetching(false);
		}
	};

	const handleEdit = () => {
		setError(null);
		setFetchError(null);
		setEditTitle(story.title);
		setEditDescription(story.description ?? "");
		setEditTags(story.tags.map((t) => ({id: t.id, name: t.name, color: t.color})));
		setEditTitleDirty(false);
		setEditDescriptionDirty(false);
		setPendingEditTitle(null);
		setPendingEditDescription(null);
		setIsEditing(true);
	};

	const handleCancelEdit = () => {
		setEditTitle(story.title);
		setEditDescription(story.description ?? "");
		setEditTags([]);
		setIsEditing(false);
		setError(null);
		setFetchError(null);
		setEditTitleDirty(false);
		setEditDescriptionDirty(false);
		setPendingEditTitle(null);
		setPendingEditDescription(null);
	};

	const handleEditTitleChange = (value: string) => {
		setEditTitle(value);
		setEditTitleDirty(true);
		setPendingEditTitle(null);
	};

	const handleEditDescriptionChange = (value: string) => {
		setEditDescription(value);
		setEditDescriptionDirty(true);
		setPendingEditDescription(null);
	};

	const confirmEditTitleReplace = () => {
		if (pendingEditTitle) {
			setEditTitle(pendingEditTitle);
			setPendingEditTitle(null);
			setEditTitleDirty(false);
		}
	};

	const confirmEditDescriptionReplace = () => {
		if (pendingEditDescription) {
			setEditDescription(pendingEditDescription);
			setPendingEditDescription(null);
			setEditDescriptionDirty(false);
		}
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

		setError(null);
		commitUpdate({
			variables: {
				id: story.id,
				title: titleChanged ? trimmedTitle : null,
				// null = no change, empty string = clear, value = update
				description: descriptionChanged ? editDescription : null,
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
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSaveEdit();
		} else if (e.key === "Escape") {
			handleCancelEdit();
		}
	};

	const handleDelete = () => {
		setError(null);
		commitDelete({
			variables: {id: story.id, connections: [connectionId]},
			onCompleted: (response) => {
				setDeleteDialogOpen(false);
				if (response.deleteStory.error) {
					setError(response.deleteStory.error.message);
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
				{fetchError && <div className={styles.rowError}>{fetchError}</div>}
				<div className={styles.editRow}>
					<div className={styles.editFieldWithFetch}>
						<div className={styles.fieldWithHint}>
							<input
								type="text"
								value={editTitle}
								onChange={(e) => handleEditTitleChange(e.target.value)}
								onKeyDown={handleKeyDown}
								className={styles.editInput}
								placeholder="Title"
								// biome-ignore lint/a11y/noAutofocus: Focus is intentional when user clicks Edit
								autoFocus
							/>
							{pendingEditTitle && (
								<div className={styles.replaceHintContainer}>
									<button
										type="button"
										className={styles.replaceHint}
										onClick={confirmEditTitleReplace}
									>
										Replace?
									</button>
									<button
										type="button"
										className={styles.dismissHint}
										onClick={() => setPendingEditTitle(null)}
										aria-label="Keep current value"
									>
										×
									</button>
								</div>
							)}
						</div>
						<Button onClick={handleFetchMetadata} disabled={isFetching}>
							{isFetching ? "Fetching..." : "Fetch"}
						</Button>
					</div>
					<TagInput
						selectedTags={editTags}
						availableTags={availableTags}
						onChange={setEditTags}
						onCreate={handleCreateTag}
						placeholder="Add tags..."
					/>
					<div className={styles.fieldWithHint}>
						<Textarea
							value={editDescription}
							onChange={(e) => handleEditDescriptionChange(e.target.value)}
							placeholder="Description (optional)"
							rows={3}
						/>
						{pendingEditDescription && (
							<div className={styles.replaceHintContainer}>
								<button
									type="button"
									className={styles.replaceHint}
									onClick={confirmEditDescriptionReplace}
								>
									Replace?
								</button>
								<button
									type="button"
									className={styles.dismissHint}
									onClick={() => setPendingEditDescription(null)}
									aria-label="Keep current value"
								>
									×
								</button>
							</div>
						)}
					</div>
					<div className={styles.editActions}>
						<Button onClick={handleCancelEdit} disabled={isUpdating}>
							Cancel
						</Button>
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
						title={story.description ?? undefined}
					>
						{story.title}
					</a>
					<div className={styles.storyMeta}>
						{domain} · {relativeDate}
					</div>
					{story.tags.length > 0 && (
						<div className={styles.storyTags}>
							{story.tags.slice(0, 3).map((tag) => (
								<TagChip
									key={tag.id}
									name={tag.name}
									color={tag.color}
									to={`/me/library?tag=${encodeURIComponent(tag.name)}`}
								/>
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
	const [connectionId, setConnectionId] = useState<string | null>(null);
	const {activeTag, clearFilter} = useTagFilter();
	const {tags: availableTags, addTag} = useAvailableTags();

	// Subscribe to library channel for real-time updates
	useLibrarySubscription(connectionId);

	// Find tag details for the active filter
	const activeTagDetails = activeTag
		? (availableTags.find((t) => t.name === activeTag) ?? null)
		: null;

	const handleExpand = () => setIsFormExpanded(true);
	const handleCollapse = () => setIsFormExpanded(false);
	const handleConnectionId = useCallback((id: string) => setConnectionId(id), []);

	// Prepopulate form with active filter tag
	const initialTags = activeTagDetails ? [activeTagDetails] : [];

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<h1 className={styles.title}>Library</h1>
				<Link to="/me/library/tags" className={styles.manageTagsLink}>
					Manage Tags
				</Link>
			</header>

			<CreateStoryForm
				key={activeTag ?? "all"}
				isExpanded={isFormExpanded}
				onExpand={handleExpand}
				onCollapse={handleCollapse}
				availableTags={availableTags}
				onTagCreate={addTag}
				initialTags={initialTags}
				connectionId={connectionId}
			/>

			<Suspense fallback={<LibrarySkeleton />}>
				{activeTag ? (
					<FilteredLibraryView
						tagName={activeTag}
						tagDetails={activeTagDetails}
						availableTags={availableTags}
						addTag={addTag}
						onClearFilter={clearFilter}
						onConnectionId={handleConnectionId}
					/>
				) : (
					<AllStoriesView
						availableTags={availableTags}
						addTag={addTag}
						onFormExpand={handleExpand}
						onConnectionId={handleConnectionId}
					/>
				)}
			</Suspense>
		</div>
	);
}

function AllStoriesView({
	availableTags,
	addTag,
	onFormExpand,
	onConnectionId,
}: {
	availableTags: Tag[];
	addTag: (tag: Tag) => void;
	onFormExpand: () => void;
	onConnectionId: (id: string) => void;
}) {
	const queryData = useLazyLoadQuery<LibraryQueryType>(LibraryQuery, {});

	const {data, loadNext, hasNext, isLoadingNext} = usePaginationFragment<
		LibraryStoriesPaginationQuery,
		LibraryStoriesFragment$key
	>(LibraryStoriesFragment, queryData.me.library);

	const stories = data.stories.edges;
	const hasStories = stories.length > 0;
	const connectionId = data.stories.__id;

	// Report connectionId to parent for CreateStoryForm
	useEffect(() => {
		onConnectionId(connectionId);
	}, [connectionId, onConnectionId]);

	return (
		<>
			<TagFilterRow
				activeTag={null}
				tagDetails={null}
				storyCount={data.stories.totalCount}
				onClearFilter={() => {}}
			/>

			{hasStories ? (
				<>
					<div className={styles.storyList}>
						{stories.map(({node}) => (
							<StoryRow
								key={node.id}
								storyRef={node}
								availableTags={availableTags}
								onTagCreate={addTag}
								connectionId={connectionId}
							/>
						))}
					</div>
					{hasNext && (
						<LoadMoreButton onClick={() => loadNext(DEFAULT_PAGE_SIZE)} isLoading={isLoadingNext} />
					)}
				</>
			) : (
				<EmptyState onAddClick={onFormExpand} />
			)}
		</>
	);
}

function FilteredLibraryView({
	tagName,
	tagDetails,
	availableTags,
	addTag,
	onClearFilter,
	onConnectionId,
}: {
	tagName: string;
	tagDetails: {name: string; color: string} | null;
	availableTags: Tag[];
	addTag: (tag: Tag) => void;
	onClearFilter: () => void;
	onConnectionId: (id: string) => void;
}) {
	const queryData = useLazyLoadQuery<LibraryFilteredQueryType>(LibraryFilteredQuery, {tagName});

	const {data, loadNext, hasNext, isLoadingNext} = usePaginationFragment<
		LibraryFilteredStoriesPaginationQuery,
		LibraryFilteredStoriesFragment$key
	>(LibraryFilteredStoriesFragment, queryData.me.library);

	const stories = data.storiesByTag.edges;
	const hasStories = stories.length > 0;
	const connectionId = data.storiesByTag.__id;

	// Report connectionId to parent for CreateStoryForm
	useEffect(() => {
		onConnectionId(connectionId);
	}, [connectionId, onConnectionId]);

	return (
		<>
			<TagFilterRow
				activeTag={tagName}
				tagDetails={tagDetails}
				storyCount={data.storiesByTag.totalCount}
				onClearFilter={onClearFilter}
			/>

			{hasStories ? (
				<>
					<div className={styles.storyList}>
						{stories.map(({node}) => (
							<StoryRow
								key={node.id}
								storyRef={node}
								availableTags={availableTags}
								onTagCreate={addTag}
								connectionId={connectionId}
							/>
						))}
					</div>
					{hasNext && (
						<LoadMoreButton onClick={() => loadNext(DEFAULT_PAGE_SIZE)} isLoading={isLoadingNext} />
					)}
				</>
			) : (
				<FilteredEmptyState tagName={tagName} onClearFilter={onClearFilter} />
			)}
		</>
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
