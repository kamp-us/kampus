# Reader Mode Frontend - Technical Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
├─────────────────────────────────────────────────────────────────┤
│  Library.tsx                    ReaderPage.tsx                  │
│  ┌──────────────┐              ┌──────────────────────────┐    │
│  │ StoryRow     │──Link──────▶│ useLazyLoadQuery         │    │
│  │ <Link to=..> │              │   ↓                      │    │
│  │ Menu:        │              │ story.readerContent      │    │
│  │  View orig   │              │   ↓                      │    │
│  └──────────────┘              │ Render article HTML      │    │
│                                └──────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                         GraphQL                                  │
├─────────────────────────────────────────────────────────────────┤
│  Story.readerContent ──resolver──▶ WebPageParserClient          │
│                                      .getReaderContent()        │
├─────────────────────────────────────────────────────────────────┤
│                         Backend DO                               │
├─────────────────────────────────────────────────────────────────┤
│  WebPageParser DO ──handlers.getReaderContent──▶ SQLite cache   │
└─────────────────────────────────────────────────────────────────┘
```

## GraphQL Schema Additions

### New Types

```graphql
type ReaderContent {
  title: String!
  content: String!
  byline: String
  siteName: String
  wordCount: Int!
  readingTimeMinutes: Int!
  excerpt: String
}

type ReaderResult {
  readable: Boolean!
  content: ReaderContent
  error: String
}
```

### Extended Story Type

```graphql
type Story {
  # ... existing fields ...
  readerContent: ReaderResult!
}
```

## Backend Changes

### File: `apps/worker/src/graphql/schema.ts`

Add GraphQL types:

```typescript
const ReaderContentType = new GraphQLObjectType({
  name: "ReaderContent",
  fields: {
    title: { type: new GraphQLNonNull(GraphQLString) },
    content: { type: new GraphQLNonNull(GraphQLString) },
    byline: { type: GraphQLString },
    siteName: { type: GraphQLString },
    wordCount: { type: new GraphQLNonNull(GraphQLInt) },
    readingTimeMinutes: { type: new GraphQLNonNull(GraphQLInt) },
    excerpt: { type: GraphQLString },
  },
});

const ReaderResultType = new GraphQLObjectType({
  name: "ReaderResult",
  fields: {
    readable: { type: new GraphQLNonNull(GraphQLBoolean) },
    content: { type: ReaderContentType },
    error: { type: GraphQLString },
  },
});
```

Add field to StoryType:

```typescript
readerContent: {
  type: new GraphQLNonNull(ReaderResultType),
  resolve: resolver(function* (story: { url: string }) {
    const env = yield* CloudflareEnv;
    const client = yield* WebPageParserClient.make(env, story.url);
    return yield* client.getReaderContent();
  }),
}
```

### File: `apps/worker/src/graphql/resolvers/WebPageParserClient.ts`

Add method:

```typescript
getReaderContent: (): Effect.Effect<ReaderResult> =>
  Effect.gen(function* () {
    return yield* client.getReaderContent({});
  }),
```

## Frontend Changes

### File Structure

```
apps/kamp-us/src/
├── pages/
│   ├── Library.tsx              # Modified: StoryRow links
│   └── library/
│       ├── ReaderPage.tsx       # New
│       └── ReaderPage.module.css # New
└── main.tsx                      # Modified: add route
```

### Route Addition

```typescript
// main.tsx
{
  path: "/me/library/:storyId",
  element: <ReaderPage />,
}
```

### ReaderPage Component

```typescript
// ReaderPage.tsx
import { Suspense } from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import { Link, useParams } from "react-router";
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

function ReaderPageContent() {
  const { storyId } = useParams<{ storyId: string }>();
  const data = useLazyLoadQuery(ReaderPageQuery, { storyId: storyId! });

  const story = data.me?.library?.story;
  if (!story) return <NotFound />;

  const { readerContent } = story;
  if (!readerContent.readable) {
    return <NotReadable url={story.url} error={readerContent.error} />;
  }

  const c = readerContent.content!;
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
      <div
        className={styles.content}
        dangerouslySetInnerHTML={{ __html: c.content }}
      />
    </article>
  );
}

export function ReaderPage() {
  return (
    <Suspense fallback={<ReaderSkeleton />}>
      <ReaderPageContent />
    </Suspense>
  );
}
```

### CSS Module

```css
/* ReaderPage.module.css */
.reader {
  max-width: 75ch;
  margin: 0 auto;
  padding: 5rem 1.5rem;
}

.nav {
  margin-bottom: 2rem;
}

.nav a {
  color: var(--gray-11);
  text-decoration: none;
}

.nav a:hover {
  color: var(--gray-12);
}

.header {
  margin-bottom: 2rem;
}

.siteName {
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gray-11);
  margin-bottom: 0.5rem;
}

.title {
  font-size: 2rem;
  font-weight: var(--font-weight-medium);
  line-height: 1.2;
  margin-bottom: 1rem;
}

.meta {
  font-size: 0.875rem;
  color: var(--gray-11);
}

.content {
  font-size: 1.125rem;
  line-height: 1.65;
  color: var(--gray-12);
}

.content :global(p) {
  margin-bottom: 1.5em;
}

.content :global(h2),
.content :global(h3) {
  margin-top: 2em;
  margin-bottom: 0.5em;
}

.content :global(img) {
  max-width: 100%;
  height: auto;
  margin: 1.5em 0;
}

.content :global(blockquote) {
  border-left: 3px solid var(--gray-6);
  padding-left: 1rem;
  margin: 1.5em 0;
  color: var(--gray-11);
}

.content :global(pre) {
  background: var(--gray-3);
  padding: 1rem;
  overflow-x: auto;
  border-radius: var(--radius-2);
}

.content :global(a) {
  color: var(--sky-11);
}
```

### StoryRow Modifications

```typescript
// In Library.tsx StoryRow component
// Change:
<a href={story.url} target="_blank" rel="noopener noreferrer" className={styles.storyTitle}>
  {story.title}
</a>

// To:
<Link to={`/me/library/${story.id}`} className={styles.storyTitle}>
  {story.title}
</Link>

// Add to Menu:
<Menu.Item onClick={() => window.open(story.url, '_blank')}>
  View original
</Menu.Item>
```

## Error Components

### NotFound

```typescript
function NotFound() {
  return (
    <div className={styles.error}>
      <h1>Story not found</h1>
      <p>This article isn't in your library.</p>
      <Link to="/me/library">← Back to Library</Link>
    </div>
  );
}
```

### NotReadable

```typescript
function NotReadable({ url, error }: { url: string; error: string | null }) {
  return (
    <div className={styles.error}>
      <h1>Couldn't extract article</h1>
      <p>{error || "This page couldn't be parsed as an article."}</p>
      <a href={url} target="_blank" rel="noopener noreferrer">
        View original →
      </a>
    </div>
  );
}
```

### ReaderSkeleton

```typescript
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
```

## Dependencies

No new npm dependencies required. Uses existing:
- `react-relay` for GraphQL
- `react-router` for routing
- CSS Modules for styling
