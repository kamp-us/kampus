import {LibraryRpcs} from "@kampus/library";
import * as Spellbook from "../../shared/Spellbook";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";
import {handlers} from "./handlers";

export const Library = Spellbook.make({
	rpcs: LibraryRpcs,
	handlers,
	migrations,
	schema,
});
