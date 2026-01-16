import {Model} from "@effect/sql";
import {Effect, Schema} from "effect";

/**
 * Story Model for @effect/sql repository pattern.
 * Maps to the `story` table with snake_case columns via SqlClient transforms.
 */
export class Story extends Model.Class<Story>("Story")({
	id: Model.GeneratedByApp(Schema.String),
	url: Schema.String,
	normalizedUrl: Schema.String,
	title: Schema.String,
	description: Model.FieldOption(Schema.String),
	createdAt: Model.DateTimeInsertFromNumber,
}) {}

/**
 * StoryRepo service providing CRUD operations for Story.
 */
export class StoryRepo extends Effect.Service<StoryRepo>()("StoryRepo", {
	effect: Model.makeRepository(Story, {
		tableName: "story",
		spanPrefix: "Story",
		idColumn: "id",
	}),
}) {}

/**
 * Combined repository layer for Library feature.
 */
export const RepoLayer = StoryRepo.Default;
