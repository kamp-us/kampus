import {LibraryRpcs} from "@kampus/library";
import * as Spellbook from "../../shared/Spellbook";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";
import {handlers} from "./handlers";
import {RepoLayer} from "./models";

export const Library = Spellbook.make({
	rpcs: LibraryRpcs,
	handlers,
	migrations,
	schema,
	// TODO: Remove once handlers migrated to Drizzle (ESD-100 to ESD-112)
	layers: RepoLayer,
});
