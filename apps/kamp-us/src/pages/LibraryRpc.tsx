import {Result} from "@effect-atom/atom";
import {useAtomSet, useAtomValue} from "@effect-atom/atom-react";
import {type FormEvent, useState} from "react";
import {Navigate} from "react-router";
import {useAuth} from "../auth/AuthContext";
import {Button} from "../design/Button";
import {Field} from "../design/Field";
import {Fieldset} from "../design/Fieldset";
import {Input} from "../design/Input";
import {TagChip} from "../design/TagChip";
import {Textarea} from "../design/Textarea";
import {
	createStoryMutation,
	createTagMutation,
	deleteStoryMutation,
	storiesAtom,
	tagsAtom,
} from "../rpc/atoms";
import styles from "./Library.module.css";
import pageStyles from "./LibraryRpc.module.css";

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
	return date.toLocaleDateString();
}

// Helper to extract domain from URL
function extractDomain(url: string) {
	try {
		return new URL(url).hostname.replace("www.", "");
	} catch {
		return url;
	}
}

type Story = {
	id: string;
	url: string;
	title: string;
	description: string | null;
	createdAt: string;
};

function TagsList() {
	const tagsResult = useAtomValue(tagsAtom);

	return Result.match(tagsResult, {
		onInitial: () => <div className={styles.loading}>Loading tags...</div>,
		onFailure: (failure) => <div className={styles.error}>Error: {String(failure.cause)}</div>,
		onSuccess: (success) => (
			<div className={styles.tagFilter}>
				<span className={styles.tagFilterLabel}>Tags ({success.value.length}):</span>
				<div className={styles.tagList}>
					{success.value.map((tag) => (
						<TagChip key={tag.id} name={tag.name} color={tag.color} />
					))}
				</div>
			</div>
		),
	});
}

function CreateTagForm() {
	const [name, setName] = useState("");
	const [color, setColor] = useState("3b82f6");
	const createTag = useAtomSet(createTagMutation);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		if (!name.trim()) return;

		setIsSubmitting(true);
		try {
			await createTag({
				payload: {name: name.trim(), color},
				reactivityKeys: ["tags"],
			});
			setName("");
		} catch (err) {
			console.error("Failed to create tag:", err);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className={styles.createTagForm}>
			<Input placeholder="Tag name" value={name} onChange={(e) => setName(e.target.value)} />
			<Input
				type="color"
				value={`#${color}`}
				onChange={(e) => setColor(e.target.value.replace("#", ""))}
			/>
			<Button type="submit" disabled={isSubmitting || !name.trim()}>
				{isSubmitting ? "Creating..." : "Add Tag"}
			</Button>
		</form>
	);
}

function CreateStoryForm() {
	const [url, setUrl] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const createStory = useAtomSet(createStoryMutation);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		if (!url.trim() || !title.trim()) return;

		setIsSubmitting(true);
		try {
			await createStory({
				payload: {
					url: url.trim(),
					title: title.trim(),
					description: description.trim() || undefined,
				},
				reactivityKeys: ["stories"],
			});
			setUrl("");
			setTitle("");
			setDescription("");
		} catch (err) {
			console.error("Failed to create story:", err);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className={pageStyles.createStoryForm}>
			<Fieldset.Root>
				<Fieldset.Legend>Add New Story</Fieldset.Legend>
				<Field
					label="URL"
					control={
						<Input
							placeholder="https://example.com/article"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
						/>
					}
				/>
				<Field
					label="Title"
					control={
						<Input
							placeholder="Article title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
					}
				/>
				<Field
					label="Description (optional)"
					control={
						<Textarea
							placeholder="Brief description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
						/>
					}
				/>
				<Button type="submit" disabled={isSubmitting || !url.trim() || !title.trim()}>
					{isSubmitting ? "Adding..." : "Add Story"}
				</Button>
			</Fieldset.Root>
		</form>
	);
}

function StoryRow({story}: {story: Story}) {
	const deleteStory = useAtomSet(deleteStoryMutation);
	const [isDeleting, setIsDeleting] = useState(false);

	const handleDelete = async () => {
		if (!confirm("Are you sure you want to delete this story?")) return;

		setIsDeleting(true);
		try {
			await deleteStory({
				payload: {id: story.id},
				reactivityKeys: ["stories"],
			});
		} catch (err) {
			console.error("Failed to delete story:", err);
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<article className={styles.storyRow}>
			<div className={styles.storyContent}>
				<a href={story.url} target="_blank" rel="noopener noreferrer" className={styles.storyTitle}>
					{story.title}
				</a>
				<span className={styles.storyDomain}>({extractDomain(story.url)})</span>
				{story.description && <p className={styles.storyDescription}>{story.description}</p>}
				<div className={styles.storyMeta}>
					<span>{formatRelativeDate(story.createdAt)}</span>
				</div>
			</div>
			<div className={styles.storyActions}>
				<Button variant="ghost" size="small" onClick={handleDelete} disabled={isDeleting}>
					{isDeleting ? "..." : "Delete"}
				</Button>
			</div>
		</article>
	);
}

function StoriesList() {
	const storiesResult = useAtomValue(storiesAtom());

	return Result.match(storiesResult, {
		onInitial: () => <div className={styles.loading}>Loading stories...</div>,
		onFailure: (failure) => <div className={styles.error}>Error: {String(failure.cause)}</div>,
		onSuccess: (success) => (
			<div className={styles.storiesList}>
				<p className={styles.storiesCount}>{success.value.totalCount} stories</p>
				{success.value.stories.map((story) => (
					<StoryRow key={story.id} story={story} />
				))}
				{success.value.hasNextPage && (
					<div className={styles.loadMore}>
						<Button variant="secondary">Load More</Button>
					</div>
				)}
			</div>
		),
	});
}

function LibraryRpcContent() {
	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<h1 className={styles.title}>Library (RPC)</h1>
				<p className={styles.subtitle}>This page uses Effect RPC instead of GraphQL/Relay</p>
			</header>

			<section className={styles.section}>
				<h2>Tags</h2>
				<TagsList />
				<CreateTagForm />
			</section>

			<section className={styles.section}>
				<h2>Stories</h2>
				<CreateStoryForm />
				<StoriesList />
			</section>
		</div>
	);
}

export function LibraryRpc() {
	const {isAuthenticated} = useAuth();

	if (!isAuthenticated) {
		return <Navigate to="/login" replace />;
	}

	return <LibraryRpcContent />;
}
