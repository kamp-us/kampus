import {Result} from "@effect-atom/atom";
import {useAtomSet, useAtomValue} from "@effect-atom/atom-react";
import {Component, type ReactNode, useRef, useState} from "react";
import {Link, Navigate} from "react-router";
import {useAuth} from "../../auth/AuthContext";
import {AlertDialog} from "../../design/AlertDialog";
import {Button} from "../../design/Button";
import {ColorPicker} from "../../design/ColorPicker";
import {Input} from "../../design/Input";
import {MoreHorizontalIcon} from "../../design/icons/MoreHorizontalIcon";
import {Menu} from "../../design/Menu";
import {TagChip} from "../../design/TagChip";
import {deleteTagMutation, tagsAtom, updateTagMutation} from "../../rpc/atoms";
import styles from "./TagManagement.module.css";

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
	readonly storyCount: number;
};

function TagRow({tag}: {tag: TagData}) {
	const [state, setState] = useState<TagRowState>({mode: "view"});
	const [error, setError] = useState<string | null>(null);
	const [isUpdating, setIsUpdating] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const menuTriggerRef = useRef<HTMLButtonElement>(null);

	const updateTag = useAtomSet(updateTagMutation);
	const deleteTag = useAtomSet(deleteTagMutation);

	const handleRename = async (newName: string) => {
		const trimmed = newName.trim();
		if (!trimmed || trimmed === tag.name) {
			setState({mode: "view"});
			return;
		}

		setError(null);
		setIsUpdating(true);
		try {
			await updateTag({
				payload: {id: tag.id, name: trimmed},
				reactivityKeys: ["tags"],
			});
			setState({mode: "view"});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to rename tag");
		} finally {
			setIsUpdating(false);
		}
	};

	const handleColorChange = async (newColor: string) => {
		if (newColor.toLowerCase() === tag.color.toLowerCase()) {
			setState({mode: "view"});
			return;
		}

		setError(null);
		setIsUpdating(true);
		try {
			await updateTag({
				payload: {id: tag.id, color: newColor},
				reactivityKeys: ["tags"],
			});
			setState({mode: "view"});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update color");
			setState({mode: "view"});
		} finally {
			setIsUpdating(false);
		}
	};

	const handleDelete = async () => {
		setError(null);
		setIsDeleting(true);
		try {
			await deleteTag({
				payload: {id: tag.id},
				reactivityKeys: ["tags"],
			});
			setState({mode: "view"});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete tag");
			setState({mode: "view"});
		} finally {
			setIsDeleting(false);
		}
	};

	const storyLabel = tag.storyCount === 1 ? "story" : "stories";

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
								{tag.storyCount} {storyLabel}
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
							This will remove the tag from {tag.storyCount} {storyLabel}. The stories themselves
							will not be deleted.
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
	const tagsResult = useAtomValue(tagsAtom);

	return Result.builder(tagsResult)
		.onDefect((defect) => (
			<div className={styles.container}>
				<div className={styles.card}>
					<p>Failed to load tags: {String(defect)}</p>
				</div>
			</div>
		))
		.onSuccess((tags, {waiting}) => {
			const sortedTags = [...tags].sort((a, b) => a.name.localeCompare(b.name));
			const hasTags = sortedTags.length > 0;

			return (
				<div className={styles.container}>
					<header className={styles.header}>
						<div className={styles.headerLeft}>
							<Link to="/me/library" className={styles.backLink}>
								← Library
							</Link>
							<h1 className={styles.title}>Manage Tags</h1>
						</div>
						<span className={styles.tagCount}>
							{waiting ? "Refreshing..." : `${sortedTags.length} tags`}
						</span>
					</header>

					{hasTags ? (
						<div className={styles.tagList}>
							{sortedTags.map((tag) => (
								<TagRow key={tag.id} tag={tag} />
							))}
						</div>
					) : (
						<EmptyState />
					)}
				</div>
			);
		})
		.render();
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
			<TagManagementContent />
		</ErrorBoundary>
	);
}
