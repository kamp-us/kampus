import {Component, type ReactNode, Suspense, useRef, useState} from "react";
import {graphql, useLazyLoadQuery, useMutation} from "react-relay";
import {Link, Navigate} from "react-router";
import type {TagManagementDeleteTagMutation} from "../../__generated__/TagManagementDeleteTagMutation.graphql";
import type {TagManagementQuery as TagManagementQueryType} from "../../__generated__/TagManagementQuery.graphql";
import type {TagManagementUpdateTagMutation} from "../../__generated__/TagManagementUpdateTagMutation.graphql";
import {useAuth} from "../../auth/AuthContext";
import {AlertDialog} from "../../design/AlertDialog";
import {Button} from "../../design/Button";
import {ColorPicker} from "../../design/ColorPicker";
import {Input} from "../../design/Input";
import {MoreHorizontalIcon} from "../../design/icons/MoreHorizontalIcon";
import {Menu} from "../../design/Menu";
import {TagChip} from "../../design/TagChip";
import styles from "./TagManagement.module.css";

const TagManagementQuery = graphql`
	query TagManagementQuery {
		me {
			library {
				tags {
					id
					name
					color
					stories(first: 0) {
						totalCount
					}
				}
			}
		}
	}
`;

const UpdateTagMutation = graphql`
	mutation TagManagementUpdateTagMutation($id: String!, $name: String, $color: String) {
		updateTag(id: $id, name: $name, color: $color) {
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
				... on TagNotFoundError {
					code
					message
				}
			}
		}
	}
`;

const DeleteTagMutation = graphql`
	mutation TagManagementDeleteTagMutation($id: String!) {
		deleteTag(id: $id) {
			success
			deletedTagId
			error {
				code
				message
			}
		}
	}
`;

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
				<p>Please log in to manage your tags.</p>
				<Button onClick={handleLogin}>Go to Login</Button>
			</div>
		</div>
	);
}

function TagManagementSkeleton() {
	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<h1 className={styles.title}>Manage Tags</h1>
			</header>
			<div className={styles.skeleton} />
			<div className={styles.skeleton} />
			<div className={styles.skeleton} />
		</div>
	);
}

type TagRowState =
	| {mode: "view"}
	| {mode: "rename"; value: string}
	| {mode: "color-picker"}
	| {mode: "delete-confirm"};

type TagData = {
	readonly id: string;
	readonly name: string;
	readonly color: string;
	readonly stories: {
		readonly totalCount: number;
	};
};

function TagRow({tag, onDeleted}: {tag: TagData; onDeleted: () => void}) {
	const [state, setState] = useState<TagRowState>({mode: "view"});
	const [error, setError] = useState<string | null>(null);
	const menuTriggerRef = useRef<HTMLButtonElement>(null);

	const [commitUpdate, isUpdating] = useMutation<TagManagementUpdateTagMutation>(UpdateTagMutation);
	const [commitDelete, isDeleting] = useMutation<TagManagementDeleteTagMutation>(DeleteTagMutation);

	const handleRename = (newName: string) => {
		const trimmed = newName.trim();
		if (!trimmed || trimmed === tag.name) {
			setState({mode: "view"});
			return;
		}

		setError(null);
		commitUpdate({
			variables: {id: tag.id, name: trimmed, color: null},
			onCompleted: (response) => {
				if (response.updateTag.error) {
					setError(response.updateTag.error.message ?? "Failed to rename tag");
				} else {
					setState({mode: "view"});
				}
			},
			onError: (err) => setError(err.message),
		});
	};

	const handleColorChange = (newColor: string) => {
		if (newColor.toLowerCase() === tag.color.toLowerCase()) {
			setState({mode: "view"});
			return;
		}

		setError(null);
		commitUpdate({
			variables: {id: tag.id, name: null, color: newColor},
			onCompleted: (response) => {
				if (response.updateTag.error) {
					setError(response.updateTag.error.message ?? "Failed to update color");
				}
				setState({mode: "view"});
			},
			onError: (err) => {
				setError(err.message);
				setState({mode: "view"});
			},
		});
	};

	const handleDelete = () => {
		setError(null);
		commitDelete({
			variables: {id: tag.id},
			onCompleted: (response) => {
				if (response.deleteTag.error) {
					setError(response.deleteTag.error.message);
					setState({mode: "view"});
				} else if (response.deleteTag.success) {
					onDeleted();
				}
			},
			onError: (err) => {
				setError(err.message);
				setState({mode: "view"});
			},
		});
	};

	const storyLabel = tag.stories.totalCount === 1 ? "story" : "stories";

	return (
		<div className={styles.tagRow}>
			{error && <div className={styles.rowError}>{error}</div>}

			<div className={styles.tagContent}>
				<div className={styles.tagInfo}>
					{state.mode === "rename" ? (
						<InlineRenameInput
							value={state.value}
							onSave={handleRename}
							onCancel={() => setState({mode: "view"})}
							isLoading={isUpdating}
						/>
					) : (
						<>
							<TagChip name={tag.name} color={tag.color} />
							<span className={styles.storyCount}>
								{tag.stories.totalCount} {storyLabel}
							</span>
						</>
					)}
				</div>

				<Menu.Root>
					<Menu.Trigger ref={menuTriggerRef} aria-label={`Options for ${tag.name}`}>
						<MoreHorizontalIcon />
					</Menu.Trigger>
					<Menu.Portal>
						<Menu.Positioner>
							<Menu.Popup>
								<Menu.Item onClick={() => setState({mode: "rename", value: tag.name})}>
									Rename
								</Menu.Item>
								<Menu.Item onClick={() => setState({mode: "color-picker"})}>Change color</Menu.Item>
								<Menu.Separator />
								<Menu.Item data-danger onClick={() => setState({mode: "delete-confirm"})}>
									Delete
								</Menu.Item>
							</Menu.Popup>
						</Menu.Positioner>
					</Menu.Portal>
				</Menu.Root>
			</div>

			<ColorPicker
				open={state.mode === "color-picker"}
				onOpenChange={(open) => !open && setState({mode: "view"})}
				selectedColor={tag.color}
				onSelect={handleColorChange}
				anchor={menuTriggerRef}
			/>

			<AlertDialog.Root
				open={state.mode === "delete-confirm"}
				onOpenChange={(open) => !open && setState({mode: "view"})}
			>
				<AlertDialog.Portal>
					<AlertDialog.Backdrop />
					<AlertDialog.Popup>
						<AlertDialog.Title>Delete "{tag.name}"?</AlertDialog.Title>
						<AlertDialog.Description>
							This will remove the tag from {tag.stories.totalCount} {storyLabel}. The stories
							themselves will not be deleted.
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
		</div>
	);
}

function InlineRenameInput({
	value,
	onSave,
	onCancel,
	isLoading,
}: {
	value: string;
	onSave: (name: string) => void;
	onCancel: () => void;
	isLoading: boolean;
}) {
	const [inputValue, setInputValue] = useState(value);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			onSave(inputValue);
		} else if (e.key === "Escape") {
			onCancel();
		}
	};

	return (
		<div className={styles.renameForm}>
			<Input
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
				onKeyDown={handleKeyDown}
				disabled={isLoading}
				autoFocus
			/>
			<div className={styles.renameActions}>
				<Button onClick={onCancel} disabled={isLoading}>
					Cancel
				</Button>
				<Button onClick={() => onSave(inputValue)} disabled={isLoading}>
					{isLoading ? "Saving..." : "Save"}
				</Button>
			</div>
		</div>
	);
}

function EmptyState() {
	return (
		<div className={styles.emptyState}>
			<div className={styles.emptyIcon}>🏷️</div>
			<h2 className={styles.emptyTitle}>No tags yet</h2>
			<p className={styles.emptyText}>
				Create tags when adding or editing stories in your library.
			</p>
			<Link to="/me/library">
				<Button>Go to Library</Button>
			</Link>
		</div>
	);
}

function AuthenticatedTagManagement() {
	const [fetchKey, setFetchKey] = useState(0);
	const data = useLazyLoadQuery<TagManagementQueryType>(
		TagManagementQuery,
		{},
		{fetchKey, fetchPolicy: fetchKey > 0 ? "network-only" : "store-or-network"},
	);

	const tags = [...data.me.library.tags].sort((a, b) => a.name.localeCompare(b.name));
	const hasTags = tags.length > 0;

	const handleRefetch = () => {
		setFetchKey((k) => k + 1);
	};

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<div className={styles.headerLeft}>
					<Link to="/me/library" className={styles.backLink}>
						← Library
					</Link>
					<h1 className={styles.title}>Manage Tags</h1>
				</div>
				<span className={styles.tagCount}>{tags.length} tags</span>
			</header>

			{hasTags ? (
				<div className={styles.tagList}>
					{tags.map((tag) => (
						<TagRow key={tag.id} tag={tag} onDeleted={handleRefetch} />
					))}
				</div>
			) : (
				<EmptyState />
			)}
		</div>
	);
}

function TagManagementContent() {
	const {isAuthenticated} = useAuth();

	if (!isAuthenticated) {
		return <Navigate to="/login" replace />;
	}

	return <AuthenticatedTagManagement />;
}

export function TagManagement() {
	return (
		<ErrorBoundary fallback={<NotLoggedIn />}>
			<Suspense fallback={<TagManagementSkeleton />}>
				<TagManagementContent />
			</Suspense>
		</ErrorBoundary>
	);
}
