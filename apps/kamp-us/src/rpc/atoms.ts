import {Atom} from "@effect-atom/atom";
import {LibraryRpc} from "./client";

// URL search param atoms
export const tagFilterAtom = Atom.searchParam("tag");

// Tag queries
export const tagsAtom = LibraryRpc.query("listTags", undefined, {reactivityKeys: ["tags"]});

// Tag mutations
export const updateTagMutation = LibraryRpc.mutation("updateTag");
export const deleteTagMutation = LibraryRpc.mutation("deleteTag");
