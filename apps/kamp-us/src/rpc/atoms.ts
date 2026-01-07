import {LibraryRpcClient} from "./client";

// Story queries
export const storiesAtom = (options?: {first?: number; after?: string}) =>
	LibraryRpcClient.query("listStories", options ?? {});

export const storyAtom = (id: string) => LibraryRpcClient.query("getStory", {id});

// Tag queries
export const tagsAtom = LibraryRpcClient.query("listTags", undefined);

export const storyTagsAtom = (storyId: string) =>
	LibraryRpcClient.query("getTagsForStory", {storyId});

// Story mutations
export const createStoryMutation = LibraryRpcClient.mutation("createStory");
export const updateStoryMutation = LibraryRpcClient.mutation("updateStory");
export const deleteStoryMutation = LibraryRpcClient.mutation("deleteStory");

// Tag mutations
export const createTagMutation = LibraryRpcClient.mutation("createTag");
export const updateTagMutation = LibraryRpcClient.mutation("updateTag");
export const deleteTagMutation = LibraryRpcClient.mutation("deleteTag");

// Tag-Story mutations
export const setStoryTagsMutation = LibraryRpcClient.mutation("setStoryTags");
