import {LibraryRpcs} from "@kampus/library";
import * as Spellbook from "../../shared/Spellbook";
import {handlers} from "./handlers";
import {migrations} from "./migrations";

export const Library = Spellbook.make({
	rpcs: LibraryRpcs,
	handlers,
	migrations: {loader: migrations, table: "_migrations"},
});
