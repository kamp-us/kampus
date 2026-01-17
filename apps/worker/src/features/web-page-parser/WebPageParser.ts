import {WebPageParserRpcs} from "@kampus/web-page-parser";
import * as Spellbook from "../../shared/Spellbook";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";
import {handlers} from "./handlers";

export const WebPageParser = Spellbook.make({
	rpcs: WebPageParserRpcs,
	handlers,
	migrations,
	schema,
});
