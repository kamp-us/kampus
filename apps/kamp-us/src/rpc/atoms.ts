import {Atom} from "@effect-atom/atom";
import {LibraryRpc} from "./client";

// URL search param atoms
export const tagFilterAtom = Atom.searchParam("tag");

// Story queries - reactivityKeys allow mutations to invalidate these caches
export const storiesAtom = (options?: {first?: number; after?: string}) =>
	LibraryRpc.query("listStories", options ?? {}, {reactivityKeys: ["stories"]});

export const storiesByTagAtom = (tagId: string, options?: {first?: number; after?: string}) =>
	LibraryRpc.query("listStoriesByTag", {tagId, ...options}, {reactivityKeys: ["stories"]});

export const storyAtom = (id: string) =>
	LibraryRpc.query("getStory", {id}, {reactivityKeys: ["stories"]});

// Tag queries
export const tagsAtom = LibraryRpc.query("listTags", undefined, {reactivityKeys: ["tags"]});

export const storyTagsAtom = (storyId: string) =>
	LibraryRpc.query("getTagsForStory", {storyId}, {reactivityKeys: ["stories", "tags"]});

// Story mutations
export const createStoryMutation = LibraryRpc.mutation("createStory");
export const updateStoryMutation = LibraryRpc.mutation("updateStory");
export const deleteStoryMutation = LibraryRpc.mutation("deleteStory");

// Tag mutations
export const createTagMutation = LibraryRpc.mutation("createTag");
export const updateTagMutation = LibraryRpc.mutation("updateTag");
export const deleteTagMutation = LibraryRpc.mutation("deleteTag");

// Tag-Story mutations
export const setStoryTagsMutation = LibraryRpc.mutation("setStoryTags");

// URL metadata
export const fetchUrlMetadataMutation = LibraryRpc.mutation("fetchUrlMetadata");
