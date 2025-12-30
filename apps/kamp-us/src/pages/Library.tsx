import {Component, type ReactNode, Suspense, useState} from "react";
import {graphql, useLazyLoadQuery, useMutation} from "react-relay";
import {Navigate} from "react-router";
import type {LibraryCreateStoryMutation} from "../__generated__/LibraryCreateStoryMutation.graphql";
import type {LibraryDeleteStoryMutation} from "../__generated__/LibraryDeleteStoryMutation.graphql";
import type {LibraryQuery as LibraryQueryType} from "../__generated__/LibraryQuery.graphql";
import type {LibraryUpdateStoryMutation} from "../__generated__/LibraryUpdateStoryMutation.graphql";
import {useAuth} from "../auth/AuthContext";
import {AlertDialog} from "../design/AlertDialog";
import {Button} from "../design/Button";
import {Field} from "../design/Field";
import {Fieldset} from "../design/Fieldset";
import {Input} from "../design/Input";
import {MoreHorizontalIcon} from "../design/icons/MoreHorizontalIcon";
import {Menu} from "../design/Menu";
import styles from "./Library.module.css";

const LibraryQuery = graphql`
	query LibraryQuery($first: Float!, $after: String) {
		me {
			library {
				stories(first: $first, after: $after) {
					edges {
						node {
							id
							url
							title
							createdAt
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

const CreateStoryMutation = graphql`
	mutation LibraryCreateStoryMutation($url: String!, $title: String!) {
		createStory(url: $url, title: $title) {
			story {
				id
				url
				title
				createdAt
			}
		}
	}
`;

const UpdateStoryMutation = graphql`
	mutation LibraryUpdateStoryMutation($id: String!, $title: String) {
		updateStory(id: $id, title: $title) {
			story {
				id
				title
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
}: {
	isExpanded: boolean;
	onExpand: () => void;
	onCollapse: () => void;
}) {
	const [url, setUrl] = useState("");
	const [title, setTitle] = useState("");
	const [error, setError] = useState<string | null>(null);

	const [commit, isCreating] = useMutation<LibraryCreateStoryMutation>(CreateStoryMutation);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		commit({
			variables: {url, title},
			onCompleted: (response) => {
				if (response.createStory.story) {
					setUrl("");
					setTitle("");
					onCollapse();
					// Force refetch by reloading - simple approach for now
					window.location.reload();
				}
			},
			onError: (err) => setError(err.message),
		});
	};

	const handleCancel = () => {
		setUrl("");
		setTitle("");
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

function StoryRow({story}: {story: {id: string; url: string; title: string; createdAt: string}}) {
	const domain = extractDomain(story.url);
	const relativeDate = formatRelativeDate(story.createdAt);

	const [isEditing, setIsEditing] = useState(false);
	const [editTitle, setEditTitle] = useState(story.title);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [commitUpdate, isUpdating] = useMutation<LibraryUpdateStoryMutation>(UpdateStoryMutation);
	const [commitDelete, isDeleting] = useMutation<LibraryDeleteStoryMutation>(DeleteStoryMutation);

	const handleEdit = () => {
		setEditTitle(story.title);
		setIsEditing(true);
	};

	const handleCancelEdit = () => {
		setEditTitle(story.title);
		setIsEditing(false);
		setError(null);
	};

	const handleSaveEdit = () => {
		if (editTitle.trim() === "") return;
		if (editTitle === story.title) {
			setIsEditing(false);
			return;
		}

		commitUpdate({
			variables: {id: story.id, title: editTitle},
			onCompleted: (response) => {
				if (response.updateStory.error) {
					setError(response.updateStory.error.message);
				} else {
					setIsEditing(false);
					setError(null);
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
		commitDelete({
			variables: {id: story.id},
			onCompleted: (response) => {
				if (response.deleteStory.error) {
					setError(response.deleteStory.error.message);
					setDeleteDialogOpen(false);
				} else if (response.deleteStory.success) {
					window.location.reload();
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
				</div>
				<Menu.Root>
					<Menu.Trigger>
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
							<Button type="button" onClick={handleDelete} disabled={isDeleting}>
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
	const data = useLazyLoadQuery<LibraryQueryType>(LibraryQuery, {first: 20});

	const stories = data.me.library.stories.edges;
	const hasStories = stories.length > 0;

	const handleExpand = () => setIsFormExpanded(true);
	const handleCollapse = () => setIsFormExpanded(false);

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<h1 className={styles.title}>Library</h1>
			</header>

			<CreateStoryForm
				isExpanded={isFormExpanded}
				onExpand={handleExpand}
				onCollapse={handleCollapse}
			/>

			{hasStories ? (
				<div className={styles.storyList}>
					{stories.map(({node}) => (
						<StoryRow key={node.id} story={node} />
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
