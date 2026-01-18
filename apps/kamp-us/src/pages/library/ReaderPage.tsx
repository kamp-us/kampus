import DOMPurify from "dompurify";
import {Suspense, useEffect, useMemo, useState} from "react";
import {graphql, useLazyLoadQuery} from "react-relay";
import {Link, Navigate, useParams} from "react-router";
import type {ReaderPageQuery as ReaderPageQueryType} from "../../__generated__/ReaderPageQuery.graphql";
import {useAuth} from "../../auth/AuthContext";
import {highlightHtmlCodeBlocks} from "../../utils/highlightCode";
import styles from "./ReaderPage.module.css";

const ReaderPageQuery = graphql`
	query ReaderPageQuery($storyId: ID!) {
		me {
			library {
				story(id: $storyId) {
					id
					url
					title
					readerContent {
						readable
						error
						content {
							title
							content
							byline
							siteName
							wordCount
							readingTimeMinutes
						}
					}
				}
			}
		}
	}
`;

function NotFound() {
	return (
		<div className={styles.error}>
			<h1>Story not found</h1>
			<p>This article isn't in your library.</p>
			<Link to="/me/library">← Back to Library</Link>
		</div>
	);
}

function NotReadable({url, error}: {url: string; error: string | null | undefined}) {
	return (
		<div className={styles.error}>
			<h1>Couldn't extract article</h1>
			<p>{error || "This page couldn't be parsed as an article."}</p>
			<Link to="/me/library">← Back to Library</Link>
			<a href={url} target="_blank" rel="noopener noreferrer">
				View original →
			</a>
		</div>
	);
}

function ReaderSkeleton() {
	return (
		<div className={styles.reader}>
			<div className={styles.skeleton}>
				<div className={styles.skeletonNav} />
				<div className={styles.skeletonTitle} />
				<div className={styles.skeletonMeta} />
				<div className={styles.skeletonParagraph} />
				<div className={styles.skeletonParagraph} />
				<div className={styles.skeletonParagraph} />
			</div>
		</div>
	);
}

function ReaderPageContentInner({storyId}: {storyId: string}) {
	const data = useLazyLoadQuery<ReaderPageQueryType>(ReaderPageQuery, {
		storyId,
	});

	const story = data.me?.library?.story;
	const content = story?.readerContent?.content?.content;

	// Sanitize raw content as fallback before highlighting completes
	const sanitizedContent = useMemo(() => (content ? DOMPurify.sanitize(content) : ""), [content]);

	const [highlightedContent, setHighlightedContent] = useState<string | null>(null);

	useEffect(() => {
		if (!content) return;
		let cancelled = false;
		highlightHtmlCodeBlocks(content).then((result) => {
			if (!cancelled) setHighlightedContent(result);
		});
		return () => {
			cancelled = true;
		};
	}, [content]);

	if (!story) return <NotFound />;

	const {readerContent} = story;
	if (!readerContent.readable) {
		return <NotReadable url={story.url} error={readerContent.error} />;
	}

	const c = readerContent.content;
	if (!c) return <NotReadable url={story.url} error="No content available" />;

	return (
		<article className={styles.reader}>
			<nav className={styles.nav}>
				<Link to="/me/library">← Library</Link>
			</nav>
			<header className={styles.header}>
				{c.siteName && <div className={styles.siteName}>{c.siteName}</div>}
				<h1 className={styles.title}>{c.title}</h1>
				<div className={styles.meta}>
					{c.byline && <span>{c.byline} · </span>}
					<span>{c.readingTimeMinutes} min read</span>
				</div>
			</header>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Content sanitized with DOMPurify */}
			<div className={styles.content} dangerouslySetInnerHTML={{__html: highlightedContent ?? sanitizedContent}} />
		</article>
	);
}

function ReaderPageContent() {
	const {storyId} = useParams<{storyId: string}>();

	if (!storyId) return <NotFound />;

	return <ReaderPageContentInner storyId={storyId} />;
}

function AuthenticatedReaderPage() {
	return (
		<Suspense fallback={<ReaderSkeleton />}>
			<ReaderPageContent />
		</Suspense>
	);
}

export function ReaderPage() {
	const {isAuthenticated} = useAuth();

	if (!isAuthenticated) {
		return <Navigate to="/login" replace />;
	}

	return <AuthenticatedReaderPage />;
}
