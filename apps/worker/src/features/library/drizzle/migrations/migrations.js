import m0000 from "./0000_clear_barracuda.sql";
import m0001 from "./0001_skinny_mariko_yashida.sql";
import m0002 from "./0002_fix_story_columns.sql";
import m0003 from "./0003_closed_supernaut.sql";
import m0004 from "./0004_chunky_cobalt_man.sql";
import journal from "./meta/_journal.json";

export default {
	journal,
	migrations: {
		m0000,
		m0001,
		m0002,
		m0003,
		m0004,
	},
};
