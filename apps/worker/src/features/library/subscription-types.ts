/**
 * Event types for the "library" channel.
 * These are published by Library DO and received by subscribed clients.
 */

export interface StoryPayload {
	id: string; // Global ID
	url: string;
	title: string;
	description: string | null;
	createdAt: string;
}

export interface TagPayload {
	id: string; // Global ID
	name: string;
	color: string;
	createdAt: string;
}

export type LibraryEvent =
	| {type: "story:create"; story: StoryPayload}
	| {type: "story:update"; story: StoryPayload}
	| {type: "story:delete"; deletedStoryId: string}
	| {type: "tag:create"; tag: TagPayload}
	| {type: "tag:update"; tag: TagPayload}
	| {type: "tag:delete"; deletedTagId: string}
	| {type: "story:tag"; storyId: string; tagIds: string[]}
	| {type: "story:untag"; storyId: string; tagIds: string[]}
	| {type: "library:change"; totalStories: number; totalTags: number};
