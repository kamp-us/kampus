import {LibraryRpcs} from "@kampus/library";
import * as Spellbook from "../../shared/Spellbook";
import migrations from "./drizzle/migrations/migrations";
import {handlers} from "./handlers";
import {RepoLayer} from "./models";

export const Library = Spellbook.make({
	rpcs: LibraryRpcs,
	handlers,
	migrations,
	layers: RepoLayer,
});
