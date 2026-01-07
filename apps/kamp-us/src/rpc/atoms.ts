import {LibraryRpc} from "./client";

// Story queries
export const storiesAtom = (options?: {first?: number; after?: string}) =>
	LibraryRpc.query("listStories", options ?? {});

export const storyAtom = (id: string) => LibraryRpc.query("getStory", {id});

// Tag queries
export const tagsAtom = LibraryRpc.query("listTags", undefined);

export const storyTagsAtom = (storyId: string) => LibraryRpc.query("getTagsForStory", {storyId});

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
